"""add_base_salary_and_holidays_to_salary_records

Revision ID: 1df69f157f38
Revises: 126efdb86ae8
Create Date: 2026-11-24 02:45:45.983598

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1df69f157f38'
down_revision: Union[str, Sequence[str], None] = '126efdb86ae8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('salary_records', sa.Column('base_salary', sa.Numeric(12, 2), nullable=True))
    op.add_column('salary_records', sa.Column('holidays_count', sa.Integer(), nullable=True, server_default='0'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('salary_records', 'holidays_count')
    op.drop_column('salary_records', 'base_salary')
