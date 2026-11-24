import hashlib
import json
import logging
import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Dict, Optional, Tuple

from fastapi.encoders import jsonable_encoder
from fastapi.responses import Response
from pydantic import TypeAdapter

from app.core.config import settings
from app.core.redis import delete_cache, delete_cache_pattern, get_redis_client

logger = logging.getLogger("app.cache")

# Short safety-net TTLs (a few minutes) so a missed eviction still self-corrects
TTL_SHORT = 120   # 2 minutes (dashboards, reminders, audit)
TTL_MEDIUM = 180  # 3 minutes (students, admissions, payments, reports, enquiries, teachers, assessments)
TTL_LONG = 300    # 5 minutes (settings, subjects, batches, green_card, users)

_TYPE_ADAPTERS: Dict[Any, TypeAdapter] = {}


def _get_adapter(model: Any) -> TypeAdapter:
    adapter = _TYPE_ADAPTERS.get(model)
    if adapter is None:
        adapter = TypeAdapter(model)
        _TYPE_ADAPTERS[model] = adapter
    return adapter


def _normalize_value(val: Any) -> Any:
    if isinstance(val, uuid.UUID):
        return str(val)
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, Decimal):
        return str(val)
    if isinstance(val, Enum):
        return val.value
    if isinstance(val, (list, tuple)):
        return [_normalize_value(v) for v in val]
    if isinstance(val, dict):
        return {str(k): _normalize_value(v) for k, v in sorted(val.items())}
    return val


def user_scope(current_user: Any) -> str:
    """
    Build a role/user scope string for cache keys.
    Teachers are always isolated per user ID; other roles are isolated by role name.
    """
    if current_user is None:
        return "PUBLIC"
    role = (getattr(current_user, "role", "") or "STAFF").strip().upper()
    if role == "TEACHER":
        return f"TEACHER:{getattr(current_user, 'id', 'unknown')}"
    return role


def make_cache_key(namespace: str, *parts: Any, **params: Any) -> str:
    """Build a deterministic, namespaced Redis cache key."""
    segments = ["erp", namespace]
    for part in parts:
        if part is None:
            segments.append("_")
        else:
            segments.append(str(_normalize_value(part)).strip())
    if params:
        norm_params = {str(k): _normalize_value(v) for k, v in sorted(params.items())}
        raw = json.dumps(norm_params, sort_keys=True, separators=(",", ":"))
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
        segments.append(digest)
    return ":".join(segments)


async def cache_get(key: str) -> Tuple[bool, Any]:
    """
    Fetch a cached response from Redis.
    Returns (True, value) on cache hit (preserving cached None and CSV Responses),
    or (False, None) on miss or Redis error.
    """
    client = get_redis_client()
    if not client:
        return False, None
    try:
        raw = await client.get(key)
        if raw is None:
            return False, None
        envelope = json.loads(raw)
        if not isinstance(envelope, dict) or "_v" not in envelope:
            return False, None
        kind = envelope.get("kind")
        if kind == "csv":
            return True, Response(
                content=envelope["body"],
                media_type=envelope.get("media_type") or "text/csv",
                headers=envelope.get("headers") or {},
            )
        return True, envelope.get("data")
    except Exception as e:
        logger.debug(f"cache_get failed for key '{key}': {e}")
        return False, None


async def cache_set(
    key: str,
    value: Any,
    ttl: int = settings.CACHE_DEFAULT_TTL,
    model: Any = None,
    student_id: Optional[uuid.UUID] = None,
) -> bool:
    """
    Serialize and store a response in Redis with a short TTL.
    When `model` is provided, Pydantic TypeAdapter serializes ORM/Pydantic objects
    without touching unloaded SQLAlchemy relationships.
    When `student_id` is provided, tracks the key for targeted student/ID-card eviction.
    """
    client = get_redis_client()
    if not client:
        return False
    try:
        if isinstance(value, Response):
            envelope = {
                "_v": 1,
                "kind": "csv",
                "body": value.body.decode("utf-8") if isinstance(value.body, (bytes, bytearray)) else str(value.body),
                "media_type": value.media_type,
                "headers": dict(value.headers),
            }
        elif model is not None:
            adapter = _get_adapter(model)
            validated = adapter.validate_python(value)
            data = adapter.dump_python(validated, mode="json")
            envelope = {"_v": 1, "kind": "json", "data": data}
        else:
            envelope = {"_v": 1, "kind": "json", "data": jsonable_encoder(value)}

        serialized = json.dumps(envelope)
        await client.set(key, serialized, ex=ttl)

        if student_id is not None:
            tag_key = f"erp:stu_cards:{student_id}"
            await client.sadd(tag_key, key)
            await client.expire(tag_key, max(ttl, 360))

        return True
    except Exception as e:
        logger.debug(f"cache_set failed for key '{key}': {e}")
        return False


async def invalidate_patterns(*patterns: str) -> None:
    """Delete all keys matching any of the given Redis glob patterns."""
    if not get_redis_client():
        return
    for pattern in patterns:
        await delete_cache_pattern(pattern)


async def _evict_student_card_keys(student_id: uuid.UUID) -> None:
    client = get_redis_client()
    if not client:
        return
    tag_key = f"erp:stu_cards:{student_id}"
    try:
        keys = await client.smembers(tag_key)
        if keys:
            await client.delete(*list(keys))
        await client.delete(tag_key)
    except Exception as e:
        logger.debug(f"Failed to evict student card keys for {student_id}: {e}")


# ---------------------------------------------------------------------------
# Semantic Domain Eviction Helpers
# ---------------------------------------------------------------------------

async def invalidate_settings_cache() -> None:
    await invalidate_patterns(
        "erp:settings:*",
        "erp:verify:*",
        "erp:idcard:*",
    )


async def invalidate_student_cache(student_id: Optional[uuid.UUID] = None) -> None:
    patterns = [
        "erp:students:list:*",
        "erp:students:mobile:*",
        "erp:enquiries:*",
        "erp:audit:*",
        "erp:dashboard:*",
        "erp:reports:*",
        "erp:teachers:roster:*",
        "erp:teachers:breakup:*",
        "erp:teachers:history:*",
        "erp:teachers:collections:*",
        "erp:subjects:roster:*",
        "erp:enrollments:*",
        "erp:renewals:*",
        "erp:admissions:*",
        "erp:payments:*",
    ]
    if student_id is not None:
        patterns.extend([
            f"erp:students:profile:{student_id}:*",
            f"erp:students:demos:{student_id}:*",
            f"erp:students:fee_period:{student_id}:*",
            f"erp:students:renewals_due:{student_id}:*",
            f"erp:students:active_enr:{student_id}:*",
            f"erp:assessments:student_history:{student_id}:*",
        ])
        await _evict_student_card_keys(student_id)
    else:
        patterns.extend([
            "erp:students:*",
            "erp:verify:*",
            "erp:idcard:*",
            "erp:assessments:student_history:*",
        ])
    await invalidate_patterns(*patterns)


async def invalidate_enrollment_and_admission_cache(
    student_id: Optional[uuid.UUID] = None,
    admission_id: Optional[uuid.UUID] = None,
) -> None:
    await invalidate_student_cache(student_id)
    patterns = [
        "erp:admissions:list:*",
        "erp:admissions:renewals_due:*",
        "erp:payments:list:*",
        "erp:payments:txns:*",
        "erp:enrollments:*",
        "erp:renewals:*",
        "erp:subjects:roster:*",
        "erp:batches:active_summary*",
        "erp:batches:list:*",
        "erp:batches:all*",
        "erp:batches:detail:*",
        "erp:teachers:detail:*",
        "erp:teachers:roster:*",
        "erp:teachers:breakup:*",
        "erp:teachers:history:*",
        "erp:teachers:earnings:*",
        "erp:teachers:collections:*",
        "erp:teachers:demo_conversion:*",
        "erp:demos:*",
        "erp:enquiries:*",
        "erp:dashboard:*",
        "erp:reports:*",
        "erp:reminders:*",
        "erp:audit:*",
    ]
    if admission_id is not None:
        patterns.extend([
            f"erp:admissions:detail:{admission_id}*",
            f"erp:admissions:slips:{admission_id}*",
        ])
    else:
        patterns.append("erp:admissions:*")
    await invalidate_patterns(*patterns)


async def invalidate_payment_and_refund_cache(
    student_id: Optional[uuid.UUID] = None,
    admission_id: Optional[uuid.UUID] = None,
    payment_id: Optional[uuid.UUID] = None,
    refund_id: Optional[uuid.UUID] = None,
) -> None:
    await invalidate_student_cache(student_id)
    patterns = [
        "erp:payments:list:*",
        "erp:payments:txns:*",
        "erp:payments:refunds:*",
        "erp:admissions:list:*",
        "erp:admissions:renewals_due:*",
        "erp:enrollments:*",
        "erp:renewals:*",
        "erp:subjects:roster:*",
        "erp:batches:active_summary*",
        "erp:teachers:earnings:*",
        "erp:teachers:breakup:*",
        "erp:teachers:collections:*",
        "erp:teachers:history:*",
        "erp:teachers:roster:*",
        "erp:dashboard:*",
        "erp:reports:*",
        "erp:reminders:*",
        "erp:audit:*",
    ]
    if admission_id is not None:
        patterns.extend([
            f"erp:admissions:detail:{admission_id}*",
            f"erp:admissions:slips:{admission_id}*",
        ])
    else:
        patterns.append("erp:admissions:*")
    if payment_id is not None:
        patterns.append(f"erp:payments:receipt:{payment_id}*")
    else:
        patterns.append("erp:payments:receipt:*")
    if refund_id is not None:
        patterns.append(f"erp:payments:refund_receipt:{refund_id}*")
    else:
        patterns.append("erp:payments:refund_receipt:*")
    await invalidate_patterns(*patterns)


async def invalidate_demo_and_enquiry_cache(
    student_id: Optional[uuid.UUID] = None,
) -> None:
    await invalidate_student_cache(student_id)
    patterns = [
        "erp:enquiries:*",
        "erp:demos:*",
        "erp:teachers:demo_conversion:*",
        "erp:dashboard:*",
        "erp:reports:*",
        "erp:audit:*",
    ]
    if student_id is None:
        # Demo status/create/convert may affect student profile & public ID card
        patterns.extend([
            "erp:students:profile:*",
            "erp:students:demos:*",
            "erp:students:active_enr:*",
            "erp:verify:*",
            "erp:idcard:*",
        ])
    await invalidate_patterns(*patterns)


async def invalidate_subject_cache() -> None:
    await invalidate_patterns(
        "erp:subjects:*",
        "erp:batches:*",
        "erp:teachers:detail:*",
        "erp:teachers:roster:*",
        "erp:teachers:breakup:*",
        "erp:teachers:history:*",
        "erp:teachers:earnings:*",
        "erp:students:*",
        "erp:verify:*",
        "erp:idcard:*",
        "erp:dashboard:*",
        "erp:reports:*",
        "erp:assessments:*",
        "erp:demos:*",
        "erp:enquiries:*",
    )


async def invalidate_batch_cache() -> None:
    await invalidate_patterns(
        "erp:batches:*",
        "erp:students:*",
        "erp:enrollments:*",
        "erp:renewals:*",
        "erp:teachers:roster:*",
        "erp:teachers:history:*",
        "erp:dashboard:*",
        "erp:reports:*",
        "erp:assessments:*",
        "erp:reminders:*",
        "erp:verify:*",
        "erp:idcard:*",
    )


async def invalidate_teacher_cache() -> None:
    await invalidate_patterns(
        "erp:teachers:*",
        "erp:subjects:*",
        "erp:batches:*",
        "erp:expenses:salary_filters*",
        "erp:expenses:salaries*",
        "erp:dashboard:*",
        "erp:reports:*",
        "erp:demos:*",
        "erp:enquiries:*",
        "erp:assessments:*",
        "erp:students:*",
        "erp:verify:*",
        "erp:idcard:*",
        "erp:audit:*",
    )


async def invalidate_expense_and_salary_cache() -> None:
    await invalidate_patterns(
        "erp:expenses:*",
        "erp:teachers:salaries:*",
        "erp:teachers:earnings:*",
        "erp:teachers:attendance*",
        "erp:dashboard:*",
        "erp:reports:*",
        "erp:audit:*",
    )


async def invalidate_assessment_cache() -> None:
    await invalidate_patterns("erp:assessments:*")


async def invalidate_green_card_cache() -> None:
    await invalidate_patterns("erp:green_card:*")


async def invalidate_user_cache() -> None:
    await invalidate_patterns(
        "erp:users:*",
        "erp:audit:*",
        "erp:dashboard:*",
        "erp:teachers:*",
        "erp:subjects:*",
        "erp:students:*",
    )


async def invalidate_reminder_cache() -> None:
    await invalidate_patterns(
        "erp:reminders:*",
        "erp:audit:*",
    )


async def invalidate_all_caches() -> None:
    await invalidate_patterns("erp:*")
