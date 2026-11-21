import logging
import json
from datetime import date, timedelta
from typing import Dict, Any, Optional
from decimal import Decimal
from sqlalchemy import select, or_, and_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import AsyncSessionLocal
from app.database.models import AdmissionItem, Admission, Batch, AuditLog
from app.common.active_student import today_kolkata
from app.core.config import settings

logger = logging.getLogger(__name__)

async def refresh_statuses(
    today: Optional[date] = None,
    db: Optional[AsyncSession] = None
) -> Dict[str, Any]:
    """
    Derives and refreshes statuses across AdmissionItems and Batches.
    Runs daily at 00:05 IST and via CLI / service call:
    - AdmissionItem:
        * ACTIVE / ON_HOLD -> EXPIRED when valid_to < today
        * UPCOMING -> ACTIVE when valid_from <= today and valid_to >= today
        * ACTIVE -> ON_HOLD when balance_due > 0 and today > (valid_from + GRACE_DAYS)
        * ON_HOLD -> ACTIVE when balance_due <= 0 and valid_to >= today
    - Batch:
        * UPCOMING -> ACTIVE on start_date
        * ACTIVE / UPCOMING -> COMPLETED after end_date
    Idempotent and logged to AuditLog.
    """
    t = today or today_kolkata()
    logger.info(f"Running refresh_statuses for date: {t}")

    if db is None:
        async with AsyncSessionLocal() as session:
            res = await _execute_refresh_statuses(session, t)
            await session.commit()
            return res
    else:
        res = await _execute_refresh_statuses(db, t)
        await db.commit()
        return res

async def _execute_refresh_statuses(db: AsyncSession, today: date) -> Dict[str, Any]:
    # 1. AdmissionItem transitions
    stmt = (
        select(AdmissionItem)
        .options(selectinload(AdmissionItem.admission))
        .where(
            AdmissionItem.status.notin_(["DISCONTINUED", "REVOKED", "CANCELLED"])
        )
    )
    items_res = await db.execute(stmt)
    all_items = items_res.scalars().all()

    items_expired = []
    items_activated = []
    items_put_on_hold = []
    items_restored_from_hold = []
    affected_admission_ids = set()

    grace_days = getattr(settings, "GRACE_DAYS", 7)

    for itm in all_items:
        affected_admission_ids.add(itm.admission_id)
        
        # A. Expired check: valid_to < today
        if itm.valid_to is not None and itm.valid_to < today:
            if itm.status != "EXPIRED":
                itm.status = "EXPIRED"
                itm.access_status = "EXPIRED"
                itm.is_on_hold = False
                items_expired.append(str(itm.id))
            continue

        # B. Upcoming -> Active check: valid_from <= today and (valid_to is None or valid_to >= today)
        if itm.status == "UPCOMING":
            if itm.valid_from is None or itm.valid_from <= today:
                itm.status = "ACTIVE"
                itm.access_status = "ACTIVE"
                itm.is_on_hold = False
                items_activated.append(str(itm.id))

        # C. Grace days & ON_HOLD check
        # A student with unpaid balance stays ACTIVE for N grace days, then item becomes ON_HOLD
        start_dt = itm.valid_from or (itm.admission.admission_date if itm.admission else today)
        grace_deadline = start_dt + timedelta(days=grace_days)

        if itm.status == "ACTIVE":
            if itm.balance_due > Decimal("0.00") and today > grace_deadline:
                itm.status = "ON_HOLD"
                itm.is_on_hold = True
                itm.lifecycle_reason = f"Unpaid balance ₹{itm.balance_due} exceeded {grace_days} grace days"
                items_put_on_hold.append(str(itm.id))
        elif itm.status == "ON_HOLD":
            if itm.balance_due <= Decimal("0.00"):
                itm.status = "ACTIVE"
                itm.is_on_hold = False
                items_restored_from_hold.append(str(itm.id))

    # 2. Check affected admissions: synchronize status
    admissions_expired = []
    admissions_activated = []
    if affected_admission_ids:
        adms_stmt = (
            select(Admission)
            .options(selectinload(Admission.items))
            .where(
                Admission.id.in_(affected_admission_ids),
                Admission.status.notin_(["REVOKED", "CANCELLED"])
            )
        )
        adms_res = await db.execute(adms_stmt)
        for adm in adms_res.scalars().all():
            non_revoked = [i for i in adm.items if i.status not in ("REVOKED", "CANCELLED", "DISCONTINUED")]
            if non_revoked:
                if all(i.status == "EXPIRED" for i in non_revoked):
                    if adm.status != "EXPIRED":
                        adm.status = "EXPIRED"
                        adm.access_status = "EXPIRED"
                        admissions_expired.append(str(adm.id))
                elif any(i.status == "ACTIVE" for i in non_revoked):
                    if adm.status in ("EXPIRED", "UPCOMING"):
                        adm.status = "ACTIVE"
                        adm.access_status = "ACTIVE"
                        admissions_activated.append(str(adm.id))

    # 3. Batch transitions
    # - UPCOMING -> ACTIVE on start_date
    # - ACTIVE / UPCOMING -> COMPLETED after end_date
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
        "expired_items_count": len(items_expired),
        "items_expired_count": len(items_expired),
        "items_activated_count": len(items_activated),
        "items_put_on_hold_count": len(items_put_on_hold),
        "items_restored_from_hold_count": len(items_restored_from_hold),
        "expired_admissions_count": len(admissions_expired),
        "admissions_expired_count": len(admissions_expired),
        "admissions_activated_count": len(admissions_activated),
        "batches_activated_count": len(batches_activated),
        "batches_completed_count": len(batches_completed),
    }

    # Log to AuditLog for persistence and traceability
    audit = AuditLog(
        action="REFRESH_STATUSES_JOB_RUN",
        entity_type="SYSTEM",
        details=json.dumps(summary)
    )
    db.add(audit)

    logger.info(f"refresh_statuses completed: {summary}")
    return summary

async def run_daily_expiration_job(db: AsyncSession, run_date: Optional[date] = None) -> Dict[str, Any]:
    """
    Backward-compatible alias for refresh_statuses.
    """
    res = await _execute_refresh_statuses(db, run_date or today_kolkata())
    await db.commit()
    return res
