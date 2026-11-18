import os
import uuid
from typing import Tuple, Optional
from app.storage.base import StorageProvider
from app.core.config import settings

class LocalStorageProvider(StorageProvider):
    def __init__(self, base_dir: str = settings.UPLOAD_DIR):
        self.base_dir = base_dir
        os.makedirs(self.base_dir, exist_ok=True)

    async def upload(self, file_bytes: bytes, filename: str, content_type: str = "image/jpeg", folder: str = "general") -> Tuple[str, str]:
        folder_path = os.path.join(self.base_dir, folder)
        os.makedirs(folder_path, exist_ok=True)
        
        ext = os.path.splitext(filename)[1] or ".jpg"
        unique_name = f"{uuid.uuid4().hex}{ext}"
        rel_key = f"{folder}/{unique_name}"
        full_path = os.path.join(self.base_dir, rel_key)
        
        with open(full_path, "wb") as f:
            f.write(file_bytes)
            
        url = f"/api/v1/uploads/{rel_key}"
        return rel_key, url

    async def delete(self, storage_key: str) -> bool:
        full_path = os.path.join(self.base_dir, storage_key)
        if os.path.exists(full_path):
            os.remove(full_path)
            return True
        return False

    def get_url(self, storage_key: str) -> Optional[str]:
        return f"/api/v1/uploads/{storage_key}"

storage_provider = LocalStorageProvider()
