"""add_monthly_salary_to_teachers

Revision ID: c3f8a1b2e904
Revises: e2a8b5c4d709
Create Date: 2026-11-28 02:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3f8a1b2e904'
down_revision: Union[str, Sequence[str], None] = 'e2a8b5c4d709'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add nullable monthly_salary column to teachers table."""
    op.add_column('teachers', sa.Column('monthly_salary', sa.Numeric(precision=12, scale=2), nullable=True))


def downgrade() -> None:
    """Drop monthly_salary column from teachers table."""
    op.drop_column('teachers', 'monthly_salary')
