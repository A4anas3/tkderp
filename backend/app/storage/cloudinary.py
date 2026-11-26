import hashlib
import os
import re
import time
import uuid
from typing import Dict, Optional, Tuple

import httpx

from app.core.config import settings
from app.storage.base import StorageProvider


def _safe_stem(filename: str) -> str:
    stem = os.path.splitext(os.path.basename(filename or ""))[0]
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "_", stem).strip("_")
    return cleaned[:40] or "img"


def _normalize_storage_key(storage_key: str) -> str:
    key = (storage_key or "").strip().lstrip("/")
    for prefix in ("api/v1/uploads/", "uploads/"):
        if key.startswith(prefix):
            key = key[len(prefix):]
    return key


class CloudinaryStorageProvider(StorageProvider):
    """
    Cloudinary storage provider implementation using signed REST API calls.
    All assets are uploaded as type='private' and are never exposed via direct
    res.cloudinary.com URLs; they are retrieved server-side by the backend only.
    """

    def __init__(self):
        self.cloud_name = (settings.CLOUDINARY_CLOUD_NAME or "").strip()
        self.api_key = (settings.CLOUDINARY_API_KEY or "").strip()
        self.api_secret = (settings.CLOUDINARY_API_SECRET or "").strip()
        self._configured = bool(self.cloud_name and self.api_key and self.api_secret)

    def _require_configured(self) -> None:
        if not self._configured:
            raise RuntimeError(
                "Cloudinary credentials are not configured "
                "(CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)"
            )

    def _sign_params(self, params: Dict[str, str]) -> str:
        """Compute Cloudinary SHA-1 signature for sorted request parameters."""
        to_sign = "&".join(f"{k}={params[k]}" for k in sorted(params)) + self.api_secret
        return hashlib.sha1(to_sign.encode("utf-8")).hexdigest()

    async def upload(
        self,
        file_bytes: bytes,
        filename: str,
        content_type: str = "image/jpeg",
        folder: str = "general",
    ) -> Tuple[str, str]:
        self._require_configured()

        safe_folder = folder.strip("/") or "general"
        stem = _safe_stem(filename)
        public_id = f"{safe_folder}/{stem}_{uuid.uuid4().hex[:8]}"
        timestamp = str(int(time.time()))

        sign_params = {
            "public_id": public_id,
            "timestamp": timestamp,
            "type": "private",
        }
        signature = self._sign_params(sign_params)

        upload_url = f"https://api.cloudinary.com/v1_1/{self.cloud_name}/image/upload"
        form_data = {
            **sign_params,
            "api_key": self.api_key,
            "signature": signature,
        }
        files = {
            "file": (
                os.path.basename(filename or "upload.jpg"),
                file_bytes,
                content_type or "application/octet-stream",
            )
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(upload_url, data=form_data, files=files)

        if resp.status_code != 200:
            raise RuntimeError(f"Cloudinary upload failed ({resp.status_code}): {resp.text[:300]}")

        payload = resp.json()
        stored_public_id = payload.get("public_id")
        if not stored_public_id:
            raise RuntimeError("Cloudinary upload response missing public_id")

        return stored_public_id, self.get_url(stored_public_id)

    async def delete(self, storage_key: str) -> bool:
        self._require_configured()

        public_id = _normalize_storage_key(storage_key)
        if not public_id:
            return False

        timestamp = str(int(time.time()))
        sign_params = {
            "public_id": public_id,
            "timestamp": timestamp,
            "type": "private",
        }
        signature = self._sign_params(sign_params)

        destroy_url = f"https://api.cloudinary.com/v1_1/{self.cloud_name}/image/destroy"
        form_data = {
            **sign_params,
            "api_key": self.api_key,
            "signature": signature,
        }

        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(destroy_url, data=form_data)

        if resp.status_code != 200:
            return False

        payload = resp.json()
        return payload.get("result") == "ok"

    async def download(self, storage_key: str) -> Optional[Tuple[bytes, str]]:
        """Fetch a private asset from Cloudinary using authenticated backend credentials."""
        if not self._configured:
            return None

        public_id = _normalize_storage_key(storage_key)
        if not public_id:
            return None

        candidates = [public_id]
        stem, ext = os.path.splitext(public_id)
        if ext.lower() in (".jpg", ".jpeg", ".png", ".webp", ".gif") and stem:
            candidates.append(stem)

        download_url = f"https://api.cloudinary.com/v1_1/{self.cloud_name}/image/download"

        async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
            for candidate_id in candidates:
                timestamp = str(int(time.time()))
                sign_params = {
                    "public_id": candidate_id,
                    "timestamp": timestamp,
                    "type": "private",
                }
                signature = self._sign_params(sign_params)
                query_params = {
                    **sign_params,
                    "api_key": self.api_key,
                    "signature": signature,
                }
                resp = await client.get(download_url, params=query_params)
                if resp.status_code == 200:
                    mime_type = resp.headers.get("content-type", "image/jpeg").split(";")[0].strip()
                    return resp.content, mime_type
                if resp.status_code != 404:
                    raise RuntimeError(
                        f"Cloudinary download failed ({resp.status_code}): {resp.text[:200]}"
                    )

        return None

    def get_url(self, storage_key: str) -> Optional[str]:
        """Always return a backend-served protected URL, never a direct Cloudinary URL."""
        clean_key = _normalize_storage_key(storage_key)
        if not clean_key:
            return None
        return f"/api/v1/uploads/{clean_key}"
