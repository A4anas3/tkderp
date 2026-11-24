"""enforce_unique_student_mobile

Revision ID: a7c9e2b4d103
Revises: 1df69f157f38
Create Date: 2026-11-25 00:05:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a7c9e2b4d103'
down_revision: Union[str, Sequence[str], None] = '1df69f157f38'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Normalize student mobile numbers to last 10 digits and enforce UNIQUE constraint."""
    op.execute(
        """
        UPDATE students
        SET mobile = NULL
        WHERE mobile IS NOT NULL
          AND regexp_replace(mobile, '[^0-9]', '', 'g') = '';
        """
    )
    op.execute(
        """
        UPDATE students
        SET mobile = RIGHT(regexp_replace(mobile, '[^0-9]', '', 'g'), 10)
        WHERE mobile IS NOT NULL
          AND length(regexp_replace(mobile, '[^0-9]', '', 'g')) >= 10;
        """
    )
    op.create_unique_constraint("uq_students_mobile", "students", ["mobile"])


def downgrade() -> None:
    """Drop UNIQUE constraint on students.mobile."""
    op.drop_constraint("uq_students_mobile", "students", type_="unique")
