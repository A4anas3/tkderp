from datetime import date
from typing import Optional
from sqlalchemy import text
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
