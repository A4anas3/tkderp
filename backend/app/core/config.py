from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
import os

class Settings(BaseSettings):
    PROJECT_NAME: str = "Thakurdwara ERP - Coaching Institute Management"
    API_V1_STR: str = "/api/v1"
    # Environment ("production" disables public API docs; set "development" to enable them)
    ENV: str = "production"
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://brightloop_user:brightloop_password@localhost:5432/thakurdwara_erp"
    
    # Redis Cache
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_ENABLED: bool = True
    CACHE_DEFAULT_TTL: int = 180 # seconds (3 minutes safety-net TTL)

    # JWT & Auth
    SECRET_KEY: str = "ThakurdwaraErpSuperSecretKeyMustBeVeryStrongAndSecure2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8  # 8 hours
    
    # Firebase (Optional internal authentication provider)
    FIREBASE_CREDENTIALS_PATH: str = ""
    FIREBASE_PROJECT_ID: str = ""

    # Numbers & Financial Year
    USE_FINANCIAL_YEAR: bool = False
    ALLOW_PAY_WHEN_SUSPENDED: bool = False
    RENEWAL_GAP_RESET_DAYS: int = 30
    TEACHER_EARNING_BASIS: str = "CASH"
    GRACE_DAYS: int = 7
    PAYMENT_GRACE_DAYS: int = 7

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = ["*"]
    
    # Uploads & Storage Provider
    STORAGE_PROVIDER: str = "local" # local, cloudinary, oracle
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 10
    
    # Cloudinary Config (Optional)
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""

    # Oracle Object Storage Config (Optional)
    ORACLE_NAMESPACE: str = ""
    ORACLE_BUCKET_NAME: str = ""
    ORACLE_REGION: str = "us-ashburn-1"
    
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="allow"
    )

settings = Settings()
