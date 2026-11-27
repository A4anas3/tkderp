import os
import secrets

# Ensure tests run against the isolated test database so production/demo data is never polluted
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://brightloop_user:brightloop_password@localhost:5432/thakurdwara_erp_test",
)
os.environ.setdefault("SECRET_KEY", secrets.token_urlsafe(48))
