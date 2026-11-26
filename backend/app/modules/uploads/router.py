from pathlib import Path

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


async def _serve_protected_upload(file_path: str) -> Response:
    storage_key = _validate_file_path(file_path)

    # 1. Serve from local disk first (handles local storage mode and migrated/legacy files on disk)
    local_provider = LocalStorageProvider()
    local_result = await local_provider.download(storage_key)
    if local_result is not None:
        data_bytes, media_type = local_result
        return Response(
            content=data_bytes,
            media_type=media_type,
            headers={"Cache-Control": "private, max-age=3600"},
        )

    # 2. Fetch private asset from Cloudinary if configured
    cloudinary_provider = CloudinaryStorageProvider()
    if cloudinary_provider._configured:
        try:
            cloud_result = await cloudinary_provider.download(storage_key)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to retrieve image from storage: {str(exc)}",
            )
        if cloud_result is not None:
            data_bytes, media_type = cloud_result
            return Response(
                content=data_bytes,
                media_type=media_type,
                headers={"Cache-Control": "private, max-age=3600"},
            )

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")


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
