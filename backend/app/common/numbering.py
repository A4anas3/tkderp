from datetime import date
import secrets
from typing import Optional
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings

def get_sequence_year(d: Optional[date] = None) -> int:
    """
    Returns the calendar year or financial year (Apr 1 - Mar 31)
    depending on the USE_FINANCIAL_YEAR configuration.
    """
    if d is None:
        d = date.today()
    if getattr(settings, "USE_FINANCIAL_YEAR", False):
        return d.year if d.month >= 4 else d.year - 1
    return d.year

async def next_number(db: AsyncSession, seq_type: str, year: Optional[int] = None) -> str:
    """
    Atomically generates the next sequence number for ADM, PAY, REF, etc.
    Executes an atomic Postgres upsert:
    INSERT INTO number_sequences (name, year, last_value)
    VALUES (:name, :year, 1)
    ON CONFLICT (name, year)
    DO UPDATE SET last_value = number_sequences.last_value + 1
    RETURNING last_value;

    Formatted outputs:
      ADM: ADM-YYYY-0001
      PAY: PAYYYYY0001
      REF: REFYYYY0001
    """
    if year is None:
        year = get_sequence_year()

    stmt = text("""
        INSERT INTO number_sequences (name, year, last_value)
        VALUES (:name, :year, 1)
        ON CONFLICT (name, year)
        DO UPDATE SET last_value = number_sequences.last_value + 1
        RETURNING last_value;
    """)
    res = await db.execute(stmt, {"name": seq_type, "year": year})
    val = res.scalar_one()

    if seq_type == "ADM":
        return f"ADM-{year}-{val:04d}"
    elif seq_type == "PAY":
        return f"PAY{year}{val:04d}"
    elif seq_type == "REF":
        return f"REF{year}{val:04d}"
    elif seq_type == "TXN":
        return f"TXN{year}{val:04d}"
    elif seq_type == "RCPT":
        return f"RCPT{year}{val:04d}"
    else:
        return f"{seq_type}-{year}-{val:04d}"


async def generate_student_code(
    db: AsyncSession,
    year: Optional[int] = None,
    max_attempts: int = 25,
) -> str:
    """
    Generates a cryptographically random, unique student code in the style:
    STU{YYYY}{6 random digits} (13 characters total, e.g. STU2026841392).
    Checks the database for collisions before returning and regenerates if found.
    """
    from app.modules.students.models import Student

    target_year = year if year is not None else date.today().year
    for _ in range(max_attempts):
        random_digits = f"{secrets.randbelow(1_000_000):06d}"
        candidate_code = f"STU{target_year}{random_digits}"
        exists = (
            await db.execute(
                select(Student.id).where(Student.student_code == candidate_code).limit(1)
            )
        ).scalar_one_or_none()
        if not exists:
            return candidate_code
    raise RuntimeError("Failed to generate a unique student code after maximum attempts")


async def create_student_with_unique_code(
    db: AsyncSession,
    *,
    year: Optional[int] = None,
    max_attempts: int = 5,
    **student_fields,
):
    """
    Creates and flushes a Student with a cryptographically random unique student_code,
    retrying on a concurrent student_code collision while raising HTTP 400 on duplicate mobile.
    """
    from fastapi import HTTPException, status
    from sqlalchemy.exc import IntegrityError
    from app.modules.students.models import Student

    for attempt in range(max_attempts):
        code = await generate_student_code(db, year=year)
        candidate = Student(student_code=code, **student_fields)
        try:
            async with db.begin_nested():
                db.add(candidate)
                await db.flush()
            return candidate
        except IntegrityError as exc:
            err_msg = str(exc).lower()
            if "student_code" in err_msg and attempt < max_attempts - 1:
                continue
            await db.rollback()
            if "student_code" in err_msg:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Could not generate a unique student code",
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This phone number is already registered",
            )
