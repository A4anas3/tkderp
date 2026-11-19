"""add_valid_from_and_valid_to_to_admissions_and_items

Revision ID: fe3436c6ba91
Revises: f924c10f1e38
Create Date: 2026-11-19 16:27:08.741792

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fe3436c6ba91'
down_revision: Union[str, Sequence[str], None] = 'f924c10f1e38'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('admissions', sa.Column('valid_from', sa.Date(), nullable=True))
    op.add_column('admissions', sa.Column('valid_to', sa.Date(), nullable=True))
    op.add_column('admission_items', sa.Column('valid_from', sa.Date(), nullable=True))
    op.add_column('admission_items', sa.Column('valid_to', sa.Date(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('admission_items', 'valid_to')
    op.drop_column('admission_items', 'valid_from')
    op.drop_column('admissions', 'valid_to')
    op.drop_column('admissions', 'valid_from')
