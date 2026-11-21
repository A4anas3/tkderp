import logging
import json
from datetime import date
from typing import Dict, Any, Optional
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import AdmissionItem, Admission, Batch, AuditLog
from app.common.active_lines import today_kolkata

logger = logging.getLogger(__name__)

async def run_daily_expiration_job(db: AsyncSession, run_date: Optional[date] = None) -> Dict[str, Any]:
    """
    Daily expiration job running at 00:05 IST:
    1. AdmissionItem: ACTIVE -> EXPIRED when valid_to < today.
    2. Admission: ACTIVE -> EXPIRED when all non-revoked items of the admission are expired.
    3. Batches:
       - UPCOMING -> ACTIVE if start_date <= today and (end_date is None or end_date >= today)
       - ACTIVE / UPCOMING -> COMPLETED if end_date is not None and end_date < today
    Idempotent and logged.
    """
    today = run_date or today_kolkata()
    logger.info(f"Running daily expiration job for date: {today}")

    # 1. Flip AdmissionItem ACTIVE -> EXPIRED where valid_to < today
    items_stmt = (
        select(AdmissionItem)
        .where(
            or_(AdmissionItem.access_status == "ACTIVE", AdmissionItem.status == "ACTIVE"),
            AdmissionItem.status.notin_(["DISCONTINUED", "REVOKED", "CANCELLED"]),
            AdmissionItem.valid_to != None,
            AdmissionItem.valid_to < today
        )
    )
    items_res = await db.execute(items_stmt)
    expired_items = items_res.scalars().all()

    expired_item_ids = []
    affected_admission_ids = set()
    for itm in expired_items:
        itm.access_status = "EXPIRED"
        itm.status = "EXPIRED"
        expired_item_ids.append(str(itm.id))
        affected_admission_ids.add(itm.admission_id)

    # 2. Check affected admissions: if all items are EXPIRED/REVOKED, flip admission access_status to EXPIRED
    expired_admission_ids = []
    if affected_admission_ids:
        adms_stmt = (
            select(Admission)
            .options(selectinload(Admission.items))
            .where(
                Admission.id.in_(affected_admission_ids),
                Admission.access_status == "ACTIVE"
            )
        )
        adms_res = await db.execute(adms_stmt)
        for adm in adms_res.scalars().all():
            non_revoked = [i for i in adm.items if i.access_status != "REVOKED"]
            if non_revoked and all(i.access_status == "EXPIRED" for i in non_revoked):
                adm.access_status = "EXPIRED"
                adm.status = "EXPIRED"
                expired_admission_ids.append(str(adm.id))

    # 3. Batches status transitions
    batch_stmt = select(Batch).where(Batch.status.in_(["UPCOMING", "ACTIVE"]))
    batch_res = await db.execute(batch_stmt)
    batches = batch_res.scalars().all()

    batches_activated = []
    batches_completed = []
    for b in batches:
        if b.end_date is not None and b.end_date < today:
            if b.status != "COMPLETED":
                b.status = "COMPLETED"
                batches_completed.append(str(b.id))
        elif b.start_date <= today:
            if b.status == "UPCOMING":
                b.status = "ACTIVE"
                batches_activated.append(str(b.id))

    summary = {
        "run_date": str(today),
        "expired_items_count": len(expired_item_ids),
        "expired_admissions_count": len(expired_admission_ids),
        "batches_activated_count": len(batches_activated),
        "batches_completed_count": len(batches_completed),
    }

    # Log to AuditLog for persistence
    audit = AuditLog(
        action="DAILY_EXPIRATION_JOB_RUN",
        entity_type="SYSTEM",
        details=json.dumps(summary)
    )
    db.add(audit)
    await db.commit()

    logger.info(f"Daily expiration job completed: {summary}")
    return summary
