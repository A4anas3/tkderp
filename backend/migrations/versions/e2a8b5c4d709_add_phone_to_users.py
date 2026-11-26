"""add_phone_to_users

Revision ID: e2a8b5c4d709
Revises: d1f7c4a9e306
Create Date: 2026-11-26 14:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2a8b5c4d709'
down_revision: Union[str, Sequence[str], None] = 'd1f7c4a9e306'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add nullable unique phone column to users table."""
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_phone ON users(phone);")


def downgrade() -> None:
    """Drop phone column and its unique index from users table."""
    op.execute("DROP INDEX IF EXISTS ix_users_phone;")
    op.drop_column('users', 'phone')
