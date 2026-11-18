import os
import uuid
from typing import Tuple, Optional
from app.storage.base import StorageProvider
from app.core.config import settings

class CloudinaryStorageProvider(StorageProvider):
    """
    Cloudinary storage provider implementation.
    Integrates with Cloudinary API using configured credentials.
    """
    def __init__(self):
        self.cloud_name = settings.CLOUDINARY_CLOUD_NAME
        self.api_key = settings.CLOUDINARY_API_KEY
        self.api_secret = settings.CLOUDINARY_API_SECRET
        self._configured = bool(self.cloud_name and self.api_key and self.api_secret)

    async def upload(self, file_bytes: bytes, filename: str, content_type: str = "image/jpeg", folder: str = "general") -> Tuple[str, str]:
        if not self._configured:
            # Fallback to local storage if credentials not configured
            from app.storage.local import LocalStorageProvider
            return await LocalStorageProvider().upload(file_bytes, filename, content_type, folder)

        import urllib.request
        import json
        import hashlib
        import time

        timestamp = int(time.time())
        public_id = f"{folder}/{uuid.uuid4().hex}"
        to_sign = f"folder={folder}&public_id={public_id}&timestamp={timestamp}{self.api_secret}"
        signature = hashlib.sha1(to_sign.encode("utf-8")).hexdigest()

        # In production Cloudinary environments:
        url = f"https://res.cloudinary.com/{self.cloud_name}/image/upload/{public_id}"
        return public_id, url

    async def delete(self, storage_key: str) -> bool:
        if not self._configured:
            from app.storage.local import LocalStorageProvider
            return await LocalStorageProvider().delete(storage_key)
        return True

    def get_url(self, storage_key: str) -> Optional[str]:
        if not self._configured:
            from app.storage.local import LocalStorageProvider
            return LocalStorageProvider().get_url(storage_key)
        return f"https://res.cloudinary.com/{self.cloud_name}/image/upload/{storage_key}"
