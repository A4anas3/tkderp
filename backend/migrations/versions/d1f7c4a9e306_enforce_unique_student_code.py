"""enforce_unique_student_code

Revision ID: d1f7c4a9e306
Revises: c9e5a3b1f205
Create Date: 2026-11-25 17:35:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd1f7c4a9e306'
down_revision: Union[str, Sequence[str], None] = 'c9e5a3b1f205'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Enforce explicit UNIQUE constraint on students.student_code."""
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_students_student_code'
            ) THEN
                ALTER TABLE students ADD CONSTRAINT uq_students_student_code UNIQUE (student_code);
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    """Drop explicit UNIQUE constraint on students.student_code."""
    op.drop_constraint("uq_students_student_code", "students", type_="unique")
