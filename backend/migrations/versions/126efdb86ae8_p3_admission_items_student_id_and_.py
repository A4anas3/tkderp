"""p3_admission_items_student_id_and_indexes

Revision ID: 126efdb86ae8
Revises: b05e44a70d53
Create Date: 2026-11-21 05:20:37.996605

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '126efdb86ae8'
down_revision: Union[str, Sequence[str], None] = 'b05e44a70d53'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add column as nullable initially
    op.add_column('admission_items', sa.Column('student_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_admission_items_student_id_students',
        'admission_items', 'students',
        ['student_id'], ['id']
    )

    # 2. Backfill student_id from admissions
    op.execute(
        "UPDATE admission_items SET student_id = admissions.student_id "
        "FROM admissions WHERE admission_items.admission_id = admissions.id"
    )

    # 3. Set student_id to NOT NULL
    op.alter_column('admission_items', 'student_id', nullable=False)

    # 4. Create single-column index and composite indexes
    op.create_index('ix_admission_items_student_id', 'admission_items', ['student_id'], unique=False)
    op.create_index(
        'ix_admission_items_student_subject_access',
        'admission_items',
        ['student_id', 'subject_id', 'access_status'],
        unique=False
    )
    op.create_index(
        'ix_admission_items_subject_valid_to',
        'admission_items',
        ['subject_id', 'valid_to'],
        unique=False
    )
    op.create_index(
        'ix_admission_items_teacher_valid_to',
        'admission_items',
        ['teacher_id', 'valid_to'],
        unique=False
    )
    op.create_index(
        'ix_admission_items_batch_valid_to',
        'admission_items',
        ['batch_id', 'valid_to'],
        unique=False
    )
    op.create_index(
        'ix_admission_items_access_valid_to',
        'admission_items',
        ['access_status', 'valid_to'],
        unique=False
    )


def downgrade() -> None:
    op.drop_index('ix_admission_items_access_valid_to', table_name='admission_items')
    op.drop_index('ix_admission_items_batch_valid_to', table_name='admission_items')
    op.drop_index('ix_admission_items_teacher_valid_to', table_name='admission_items')
    op.drop_index('ix_admission_items_subject_valid_to', table_name='admission_items')
    op.drop_index('ix_admission_items_student_subject_access', table_name='admission_items')
    op.drop_index('ix_admission_items_student_id', table_name='admission_items')
    op.drop_constraint('fk_admission_items_student_id_students', 'admission_items', type_='foreignkey')
    op.drop_column('admission_items', 'student_id')
