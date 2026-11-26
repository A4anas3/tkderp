import mimetypes
import os
import re
import uuid
from pathlib import Path
from typing import Optional, Tuple

from app.core.config import settings
from app.storage.base import StorageProvider


def _safe_stem(filename: str) -> str:
    stem = os.path.splitext(os.path.basename(filename or ""))[0]
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "_", stem).strip("_")
    return cleaned[:40]


class LocalStorageProvider(StorageProvider):
    def __init__(self, base_dir: Optional[str] = None):
        resolved_dir = base_dir if base_dir is not None else settings.UPLOAD_DIR
        self.base_dir = os.path.abspath(resolved_dir)
        os.makedirs(self.base_dir, exist_ok=True)

    def _resolve_safe_path(self, storage_key: str) -> Optional[str]:
        clean_key = (storage_key or "").strip().lstrip("/")
        if not clean_key or "\\" in clean_key:
            return None
        parts = Path(clean_key).parts
        if any(part in ("", ".", "..") for part in parts):
            return None
        base_real = os.path.realpath(self.base_dir)
        candidate = os.path.realpath(os.path.join(base_real, clean_key))
        if not candidate.startswith(base_real + os.sep):
            return None
        return candidate

    async def upload(
        self,
        file_bytes: bytes,
        filename: str,
        content_type: str = "image/jpeg",
        folder: str = "general",
    ) -> Tuple[str, str]:
        safe_folder = folder.strip("/") or "general"
        folder_path = os.path.join(self.base_dir, safe_folder)
        os.makedirs(folder_path, exist_ok=True)

        ext = os.path.splitext(filename)[1] or ".jpg"
        stem = _safe_stem(filename)
        unique_name = f"{stem}_{uuid.uuid4().hex[:8]}{ext}" if stem else f"{uuid.uuid4().hex}{ext}"
        rel_key = f"{safe_folder}/{unique_name}"
        full_path = os.path.join(self.base_dir, rel_key)

        with open(full_path, "wb") as f:
            f.write(file_bytes)

        return rel_key, self.get_url(rel_key)

    async def delete(self, storage_key: str) -> bool:
        full_path = self._resolve_safe_path(storage_key)
        if full_path and os.path.isfile(full_path):
            os.remove(full_path)
            return True
        return False

    async def download(self, storage_key: str) -> Optional[Tuple[bytes, str]]:
        full_path = self._resolve_safe_path(storage_key)
        if not full_path or not os.path.isfile(full_path):
            return None
        with open(full_path, "rb") as f:
            data = f.read()
        mime_type, _ = mimetypes.guess_type(full_path)
        return data, (mime_type or "application/octet-stream")

    def get_url(self, storage_key: str) -> Optional[str]:
        clean_key = (storage_key or "").strip().lstrip("/")
        if not clean_key:
            return None
        return f"/api/v1/uploads/{clean_key}"


storage_provider = LocalStorageProvider()
