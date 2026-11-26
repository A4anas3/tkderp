from abc import ABC, abstractmethod
from typing import Tuple, Optional

class StorageProvider(ABC):
    @abstractmethod
    async def upload(self, file_bytes: bytes, filename: str, content_type: str = "image/jpeg", folder: str = "general") -> Tuple[str, str]:
        """
        Uploads file and returns (storage_key, public_or_local_url)
        """
        pass

    @abstractmethod
    async def delete(self, storage_key: str) -> bool:
        """
        Deletes file by key
        """
        pass

    @abstractmethod
    def get_url(self, storage_key: str) -> Optional[str]:
        """
        Returns backend-served URL for storage key
        """
        pass

    async def download(self, storage_key: str) -> Optional[Tuple[bytes, str]]:
        """
        Retrieves file bytes and MIME content type for storage_key, or None if not found.
        """
        return None

def get_storage_provider() -> StorageProvider:
    from app.core.config import settings
    provider_type = (settings.STORAGE_PROVIDER or "local").lower()
    
    if provider_type == "cloudinary":
        from app.storage.cloudinary import CloudinaryStorageProvider
        return CloudinaryStorageProvider()
    elif provider_type == "oracle":
        from app.storage.oracle import OracleObjectStorageProvider
        return OracleObjectStorageProvider()
    else:
        from app.storage.local import LocalStorageProvider
        return LocalStorageProvider()
