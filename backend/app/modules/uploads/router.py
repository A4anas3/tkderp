from pathlib import Path
from typing import Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.modules.users.models import User
from app.storage.cloudinary import CloudinaryStorageProvider
from app.storage.local import LocalStorageProvider

router = APIRouter(tags=["Uploads"])


def _validate_file_path(file_path: str) -> str:
    clean = (file_path or "").strip().lstrip("/")
    if not clean or "\\" in clean:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file path")
    parts = Path(clean).parts
    if any(part in ("", ".", "..") for part in parts):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file path")
    return clean


def extract_storage_key(raw_path: str) -> str:
    """Normalize a stored upload URL or relative path into a validated storage key."""
    clean = (raw_path or "").strip()
    for prefix in ("/api/v1/uploads/", "api/v1/uploads/", "/uploads/", "uploads/"):
        if clean.startswith(prefix):
            clean = clean[len(prefix):]
            break
    return _validate_file_path(clean)


async def _download_from_local(storage_key: str) -> Optional[Tuple[bytes, str]]:
    local_provider = LocalStorageProvider()
    return await local_provider.download(storage_key)


async def _download_from_cloudinary(storage_key: str) -> Optional[Tuple[bytes, str]]:
    cloudinary_provider = CloudinaryStorageProvider()
    if not cloudinary_provider._configured:
        return None
    try:
        return await cloudinary_provider.download(storage_key)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to retrieve image from storage: {str(exc)}",
        )


async def serve_storage_file(
    file_path: str,
    cache_control: str = "private, max-age=3600",
) -> Response:
    """
    Retrieve an uploaded image from storage and return it as an HTTP Response.
    Checks Cloudinary first when STORAGE_PROVIDER is 'cloudinary' (with local disk fallback),
    or local disk first otherwise (with Cloudinary fallback).
    """
    storage_key = extract_storage_key(file_path)

    if (settings.STORAGE_PROVIDER or "").strip().lower() == "cloudinary":
        providers = (_download_from_cloudinary, _download_from_local)
    else:
        providers = (_download_from_local, _download_from_cloudinary)

    for downloader in providers:
        result = await downloader(storage_key)
        if result is not None:
            data_bytes, media_type = result
            return Response(
                content=data_bytes,
                media_type=media_type,
                headers={"Cache-Control": cache_control},
            )

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")


async def _serve_protected_upload(file_path: str) -> Response:
    return await serve_storage_file(file_path, cache_control="private, max-age=3600")


@router.get("/api/v1/uploads/{file_path:path}")
@router.get("/uploads/{file_path:path}")
async def get_uploaded_file(
    file_path: str,
    current_user: User = Depends(get_current_user),
):
    """
    Serve private uploaded images exclusively to authenticated users.
    Checks local disk fallback first, then retrieves private assets from Cloudinary server-side.
    """
    return await _serve_protected_upload(file_path)
