import os
import uuid
from typing import Tuple, Optional
from app.storage.base import StorageProvider
from app.core.config import settings

class OracleObjectStorageProvider(StorageProvider):
    """
    Oracle Cloud Infrastructure (OCI) Object Storage provider implementation.
    Allows seamless migration to Oracle Cloud Object Storage by setting
    STORAGE_PROVIDER=oracle in environment variables.
    """
    def __init__(self):
        self.namespace = settings.ORACLE_NAMESPACE
        self.bucket_name = settings.ORACLE_BUCKET_NAME
        self.region = settings.ORACLE_REGION
        self._configured = bool(self.namespace and self.bucket_name)

    async def upload(self, file_bytes: bytes, filename: str, content_type: str = "image/jpeg", folder: str = "general") -> Tuple[str, str]:
        if not self._configured:
            from app.storage.local import LocalStorageProvider
            return await LocalStorageProvider().upload(file_bytes, filename, content_type, folder)

        ext = os.path.splitext(filename)[1] or ".jpg"
        object_name = f"{folder}/{uuid.uuid4().hex}{ext}"
        
        # Oracle Object Storage URL format
        url = f"https://objectstorage.{self.region}.oraclecloud.com/n/{self.namespace}/b/{self.bucket_name}/o/{object_name}"
        return object_name, url

    async def delete(self, storage_key: str) -> bool:
        if not self._configured:
            from app.storage.local import LocalStorageProvider
            return await LocalStorageProvider().delete(storage_key)
        return True

    def get_url(self, storage_key: str) -> Optional[str]:
        if not self._configured:
            from app.storage.local import LocalStorageProvider
            return LocalStorageProvider().get_url(storage_key)
        return f"https://objectstorage.{self.region}.oraclecloud.com/n/{self.namespace}/b/{self.bucket_name}/o/{storage_key}"
