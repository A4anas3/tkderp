"""add_govt_regd_no_and_iso_certification_to_institute_settings

Revision ID: b8d4f1e2a304
Revises: a7c9e2b4d103
Create Date: 2026-11-25 02:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8d4f1e2a304'
down_revision: Union[str, Sequence[str], None] = 'a7c9e2b4d103'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add optional govt_regd_no and iso_certification columns to institute_settings."""
    op.add_column('institute_settings', sa.Column('govt_regd_no', sa.String(length=100), nullable=True))
    op.add_column('institute_settings', sa.Column('iso_certification', sa.String(length=150), nullable=True))


def downgrade() -> None:
    """Remove govt_regd_no and iso_certification columns from institute_settings."""
    op.drop_column('institute_settings', 'iso_certification')
    op.drop_column('institute_settings', 'govt_regd_no')
