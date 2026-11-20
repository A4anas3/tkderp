import json
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.responses import JSONResponse
from app.common.models import IdempotencyRecord

async def get_idempotency_record(
    db: AsyncSession,
    key: str,
    endpoint: str
) -> Optional[IdempotencyRecord]:
    """
    Retrieves a cached response by idempotency key and endpoint name.
    """
    res = await db.execute(
        select(IdempotencyRecord).where(
            IdempotencyRecord.key == key,
            IdempotencyRecord.endpoint == endpoint
        )
    )
    return res.scalar_one_or_none()

async def save_idempotency_record(
    db: AsyncSession,
    key: str,
    endpoint: str,
    response_code: int,
    response_body: Dict[str, Any]
) -> None:
    """
    Stores the completed response for an idempotency key.
    """
    stmt = text("""
        INSERT INTO idempotency_records (key, endpoint, response_code, response_body, created_at)
        VALUES (:key, :endpoint, :response_code, CAST(:response_body AS json), :created_at)
        ON CONFLICT (key, endpoint) DO NOTHING;
    """)
    await db.execute(
        stmt,
        {
            "key": key,
            "endpoint": endpoint,
            "response_code": response_code,
            "response_body": json.dumps(response_body),
            "created_at": datetime.now(timezone.utc)
        }
    )

def build_idempotent_response(record: IdempotencyRecord) -> JSONResponse:
    """
    Builds a JSONResponse from a cached IdempotencyRecord.
    """
    return JSONResponse(
        status_code=record.response_code,
        content=record.response_body
    )
