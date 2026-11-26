import io
import os
import uuid
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings as app_settings
from app.core.cache import TTL_LONG, cache_get, cache_set, invalidate_settings_cache
from app.database.session import get_db
from app.modules.users.models import User
from app.core.dependencies import require_cashier_or_admin, require_admin
from app.modules.uploads.router import extract_storage_key, serve_storage_file
from app.storage.base import get_storage_provider
from app.modules.settings.models import InstituteSetting
from app.modules.settings.schemas import (
    InstituteSettingsResponse,
    InstituteSettingsUpdate,
    PublicInstituteProfileResponse,
)

router = APIRouter(prefix="/api/settings", tags=["Institute Settings"])
public_router = APIRouter(tags=["Institute Settings"])

DEFAULT_GSTIN = "09AAACT1234F1Z5"
DEFAULT_GST_RATE = Decimal("18.00")
DEFAULT_INSTITUTE_NAME = "THAKURDWARA COACHING INSTITUTE"
DEFAULT_ADDRESS = "Civil Lines Road, Thakurdwara, UP - 244601"
DEFAULT_PHONE = "+91 98765 43210"
DEFAULT_EMAIL = "accounts@thakurdwara.edu.in"


def _process_institute_logo(file_bytes: bytes) -> tuple[bytes, str]:
    """
    Validate and optimize an uploaded institute logo while preserving crisp quality
    and optional PNG transparency.
    """
    img = Image.open(io.BytesIO(file_bytes))
    img.load()
    img.thumbnail((800, 800), Image.Resampling.LANCZOS)

    has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    buf = io.BytesIO()
    if has_alpha:
        if img.mode != "RGBA":
            img = img.convert("RGBA")
        img.save(buf, format="PNG", optimize=True)
        return buf.getvalue(), "png"

    if img.mode != "RGB":
        img = img.convert("RGB")
    img.save(buf, format="JPEG", quality=90, optimize=True)
    return buf.getvalue(), "jpg"


async def _get_or_create_settings(db: AsyncSession) -> InstituteSetting:
    stmt = select(InstituteSetting).where(InstituteSetting.key == "institute_profile")
    res = await db.execute(stmt)
    setting = res.scalar_one_or_none()
    if not setting:
        setting = InstituteSetting(
            key="institute_profile",
            gstin=DEFAULT_GSTIN,
            gst_rate=DEFAULT_GST_RATE,
            institute_name=DEFAULT_INSTITUTE_NAME,
            address=DEFAULT_ADDRESS,
            phone=DEFAULT_PHONE,
            email=DEFAULT_EMAIL
        )
        db.add(setting)
        await db.commit()
        await db.refresh(setting)
    return setting


@public_router.get("/api/public/institute", response_model=PublicInstituteProfileResponse)
@router.get("/institute/public", response_model=PublicInstituteProfileResponse)
async def get_public_institute_profile(db: AsyncSession = Depends(get_db)):
    """
    Publicly accessible non-sensitive institute branding profile (name, logo, address, contact).
    Used on login, public verification, and public ID card pages.
    """
    cache_key = "erp:settings:public"
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    setting = await _get_or_create_settings(db)
    await cache_set(cache_key, setting, ttl=TTL_LONG, model=PublicInstituteProfileResponse)
    return setting


@public_router.get("/api/public/institute-logo")
async def get_public_institute_logo(db: AsyncSession = Depends(get_db)):
    """
    Publicly accessible endpoint serving ONLY the currently configured institute logo.
    Accepts no path, key, or filename from the request.
    """
    setting = await _get_or_create_settings(db)
    raw_logo_url = (setting.logo_url or "").strip()
    if not raw_logo_url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Institute logo not configured",
        )

    lower_url = raw_logo_url.lower()
    if lower_url.startswith(("http://", "https://", "data:", "blob:", "//")):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Institute logo not available",
        )

    try:
        storage_key = extract_storage_key(raw_logo_url)
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Institute logo not found",
        )

    if not storage_key.startswith("institute/"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Institute logo not found",
        )

    return await serve_storage_file(storage_key, cache_control="public, max-age=60")


@router.get("/institute", response_model=InstituteSettingsResponse)
async def get_institute_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    """
    Get institute's saved profile and GST configuration (GSTIN, default GST rate, logo).
    Restricted to Cashier and Admin.
    """
    cache_key = "erp:settings:institute"
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    setting = await _get_or_create_settings(db)
    await cache_set(cache_key, setting, ttl=TTL_LONG, model=InstituteSettingsResponse)
    return setting


@router.put("/institute", response_model=InstituteSettingsResponse)
@router.post("/institute", response_model=InstituteSettingsResponse)
async def update_institute_settings(
    payload: InstituteSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Save or update institute's GST number, GST rate, and profile details.
    Stored persistently in database so they can be reused across all fee slips & invoices.
    """
    setting = await _get_or_create_settings(db)

    if payload.gstin is not None:
        setting.gstin = payload.gstin.strip().upper()
    if payload.gst_rate is not None:
        setting.gst_rate = payload.gst_rate
    if payload.institute_name is not None:
        setting.institute_name = payload.institute_name.strip()
    if payload.address is not None:
        setting.address = payload.address.strip()
    if payload.phone is not None:
        setting.phone = payload.phone.strip()
    if payload.email is not None:
        setting.email = payload.email.strip()
    if payload.logo_url is not None:
        setting.logo_url = payload.logo_url.strip() or None
    if "govt_regd_no" in payload.model_fields_set:
        setting.govt_regd_no = (payload.govt_regd_no or "").strip() or None
    if "iso_certification" in payload.model_fields_set:
        setting.iso_certification = (payload.iso_certification or "").strip() or None

    setting.updated_by = current_user.id
    db.add(setting)
    await db.commit()
    await db.refresh(setting)
    await invalidate_settings_cache()
    return setting


@router.post("/institute/logo", response_model=InstituteSettingsResponse)
async def upload_institute_logo(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Upload and save the institute logo (Admin only).
    """
    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file uploaded")

    max_bytes = app_settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(raw_bytes) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum allowed size is {app_settings.MAX_UPLOAD_SIZE_MB} MB.",
        )

    try:
        processed_bytes, ext = _process_institute_logo(raw_bytes)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid image format: {str(exc)}",
        )

    content_type = "image/png" if ext == "png" else "image/jpeg"
    filename = f"institute_logo_{uuid.uuid4().hex[:12]}.{ext}"
    provider = get_storage_provider()
    try:
        _, logo_url = await provider.upload(
            processed_bytes,
            filename,
            content_type=content_type,
            folder="institute",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to store institute logo: {str(exc)}",
        )

    setting = await _get_or_create_settings(db)
    setting.logo_url = logo_url
    setting.updated_by = current_user.id
    db.add(setting)
    await db.commit()
    await db.refresh(setting)
    await invalidate_settings_cache()
    return setting


@router.delete("/institute/logo", response_model=InstituteSettingsResponse)
async def delete_institute_logo(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Remove the custom institute logo (Admin only).
    """
    setting = await _get_or_create_settings(db)
    setting.logo_url = None
    setting.updated_by = current_user.id
    db.add(setting)
    await db.commit()
    await db.refresh(setting)
    await invalidate_settings_cache()
    return setting
