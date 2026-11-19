"""Add admission batch revocation fields

Revision ID: f924c10f1e38
Revises: ebd9c86e5711
Create Date: 2026-11-19 15:42:41.269637

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f924c10f1e38'
down_revision: Union[str, Sequence[str], None] = 'ebd9c86e5711'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('admissions', sa.Column('revocation_reason', sa.Text(), nullable=True))
    op.add_column('admissions', sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('admissions', sa.Column('revoked_by', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_admissions_revoked_by', 'admissions', 'users', ['revoked_by'], ['id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_admissions_revoked_by', 'admissions', type_='foreignkey')
    op.drop_column('admissions', 'revoked_by')
    op.drop_column('admissions', 'revoked_at')
    op.drop_column('admissions', 'revocation_reason')
