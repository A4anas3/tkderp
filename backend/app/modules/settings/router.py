from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from decimal import Decimal
import uuid

from app.database.session import get_db
from app.modules.users.models import User
from app.core.dependencies import require_staff, require_cashier_or_admin
from app.modules.settings.models import InstituteSetting
from app.modules.settings.schemas import InstituteSettingsResponse, InstituteSettingsUpdate

router = APIRouter(prefix="/api/settings", tags=["Institute Settings"])

DEFAULT_GSTIN = "09AAACT1234F1Z5"
DEFAULT_GST_RATE = Decimal("18.00")
DEFAULT_INSTITUTE_NAME = "THAKURDWARA COACHING INSTITUTE"
DEFAULT_ADDRESS = "Civil Lines Road, Thakurdwara, UP - 244601"
DEFAULT_PHONE = "+91 98765 43210"
DEFAULT_EMAIL = "accounts@thakurdwara.edu.in"

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

@router.get("/institute", response_model=InstituteSettingsResponse)
async def get_institute_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    """
    Get institute's saved profile and GST configuration (GSTIN, default GST rate).
    """
    setting = await _get_or_create_settings(db)
    return setting

@router.put("/institute", response_model=InstituteSettingsResponse)
@router.post("/institute", response_model=InstituteSettingsResponse)
async def update_institute_settings(
    payload: InstituteSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
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
    
    setting.updated_by = current_user.id
    db.add(setting)
    await db.commit()
    await db.refresh(setting)
    return setting
