"""add_fee_period_and_valid_dates_to_payments

Revision ID: 9202d45d9be1
Revises: fe3436c6ba91
Create Date: 2026-11-19 18:44:08.353873

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9202d45d9be1'
down_revision: Union[str, Sequence[str], None] = 'fe3436c6ba91'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('payments', sa.Column('valid_from', sa.Date(), nullable=True))
    op.add_column('payments', sa.Column('valid_to', sa.Date(), nullable=True))
    op.add_column('payments', sa.Column('fee_period', sa.String(100), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('payments', 'fee_period')
    op.drop_column('payments', 'valid_to')
    op.drop_column('payments', 'valid_from')
