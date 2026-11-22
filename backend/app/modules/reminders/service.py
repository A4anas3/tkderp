import urllib.parse
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional, List, Tuple
import uuid
from fastapi import HTTPException
from sqlalchemy import select, func, or_, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Admission, AdmissionItem, Student, User, AuditLog, Subject, Batch
from app.modules.reminders.models import ReminderQueue
from app.modules.reminders.schemas import (
    ReminderItemResponse,
    ReminderCounts,
    ReminderListResponse,
    ReminderSendStudentResponse,
)


def build_whatsapp_link(phone: Optional[str], message: str) -> str:
    """Format clean WhatsApp click-to-chat URL: https://wa.me/{phone}?text={encoded}."""
    if not phone:
        return ""
    digits = "".join(filter(str.isdigit, str(phone)))
    if not digits:
        return ""
    # If standard 10 digit Indian number, prepend 91
    if len(digits) == 10:
        digits = "91" + digits
    encoded = urllib.parse.quote(message)
    return f"https://wa.me/{digits}?text={encoded}"


def format_currency_in(amount: Decimal) -> str:
    """Format decimal as INR currency string."""
    try:
        val = float(amount)
        return f"₹{val:,.2f}"
    except Exception:
        return f"₹{amount}"


def format_date_in(d: Optional[date]) -> Optional[str]:
    """Format date as DD MMM YYYY."""
    if not d:
        return None
    try:
        return d.strftime("%d %b %Y")
    except Exception:
        return str(d)


def determine_kind(due_date: Optional[date], today: date) -> str:
    """Determine due kind matching the hostel ERP standard."""
    if not due_date:
        return "due"
    if due_date == today:
        return "due_today"
    elif due_date > today:
        if due_date <= today + timedelta(days=5):
            return "due_soon"
        return "due"
    else:
        days_overdue = (today - due_date).days
        if days_overdue >= 7:
            return "overdue_7"
        elif days_overdue >= 3:
            return "overdue_3"
        return "due"


def determine_ageing_bucket(due_date: Optional[date], today: date) -> Tuple[int, str]:
    """Calculate age in days and assign ageing bucket: 0-30, 31-60, 61-90, 90+."""
    if not due_date:
        return 0, "0-30"
    age_days = (today - due_date).days
    if age_days < 0:
        age_days = 0
    if age_days <= 30:
        bucket = "0-30"
    elif age_days <= 60:
        bucket = "31-60"
    elif age_days <= 90:
        bucket = "61-90"
    else:
        bucket = "90+"
    return age_days, bucket


def compose_reminder_message(
    student_name: str,
    subject_name: str,
    due_amount: Decimal,
    due_date: Optional[date] = None,
    admission_number: Optional[str] = None,
) -> str:
    formatted_amt = format_currency_in(due_amount)
    due_str = f" due on {due_date.strftime('%d-%m-%Y')}" if due_date else ""
    ref_str = f" (Ref: {admission_number})" if admission_number else ""
    return (
        f"Dear {student_name}, this is a polite reminder from Thakurdwara Coaching Institute "
        f"regarding your outstanding fee due of {formatted_amt} for {subject_name}{ref_str}{due_str}. "
        f"Kindly clear the pending balance at the accounts desk at your convenience. Thank you!"
    )


async def build_due_reminders(db: AsyncSession, as_of_date: Optional[date] = None) -> int:
    """
    Scan admissions with real outstanding dues.
    Rule: Reminders must ONLY be created for real outstanding dues (never for expired/waived/cancelled items).
    """
    today = as_of_date or date.today()

    # 1. Clean up any stale reminders for expired, waived, cancelled, or settled items
    cleanup_stmt = select(ReminderQueue).where(
        or_(
            ReminderQueue.kind == "expired_due",
            ReminderQueue.status == "pending",
        )
    )
    cleanup_res = await db.execute(cleanup_stmt)
    pending_reminders = cleanup_res.scalars().all()
    for rem in pending_reminders:
        if rem.kind == "expired_due":
            await db.delete(rem)
            continue
        adm = rem.admission
        if not adm or adm.document_status != "VALID" or adm.status in ("REVOKED", "CANCELLED", "EXPIRED") or adm.balance_due <= Decimal("0.00") or (adm.valid_to and adm.valid_to < today):
            await db.delete(rem)

    # 2. Query valid admissions with active balance_due > 0
    stmt = (
        select(Admission)
        .where(
            Admission.document_status == "VALID",
            Admission.status.notin_(["REVOKED", "CANCELLED", "EXPIRED"]),
            Admission.access_status.notin_(["REVOKED", "EXPIRED"]),
            Admission.balance_due > Decimal("0.00"),
            or_(Admission.valid_to.is_(None), Admission.valid_to >= today),
        )
        .order_by(Admission.created_at.desc())
    )
    res = await db.execute(stmt)
    admissions = res.scalars().all()

    # Fetch existing pending reminders to maintain idempotency
    existing_stmt = select(ReminderQueue).where(ReminderQueue.status == "pending")
    existing_pending_map = {rq.admission_id: rq for rq in (await db.execute(existing_stmt)).scalars().all()}

    queued_count = 0
    for adm in admissions:
        if adm.balance_due <= Decimal("0.00"):
            continue

        student = adm.student
        if not student:
            continue

        # Check items for real active dues (never expired/cancelled/discontinued)
        target_item = None
        target_subject_id = None
        target_batch_id = None
        target_due_date = None
        subject_names = []

        if adm.items:
            for itm in adm.items:
                # Skip expired, cancelled, revoked, discontinued, or zero balance items
                is_itm_expired = itm.status == "EXPIRED" or itm.access_status == "EXPIRED" or (itm.valid_to and itm.valid_to < today)
                is_itm_cancelled = itm.status in ("CANCELLED", "REVOKED", "DISCONTINUED") or itm.access_status in ("REVOKED",)
                if is_itm_expired or is_itm_cancelled:
                    continue
                if itm.balance_due <= Decimal("0.00"):
                    continue

                if not target_item:
                    target_item = itm
                    target_subject_id = itm.subject_id
                    target_batch_id = itm.batch_id
                    target_due_date = itm.valid_from or adm.valid_from or adm.admission_date

                s_name = itm.item_name_snapshot
                if s_name and s_name not in subject_names:
                    subject_names.append(s_name)

        # If all items were expired/cancelled, skip this admission
        if adm.items and not target_item:
            continue

        course_str = ", ".join(subject_names) if subject_names else "Coaching Course"
        due_d = target_due_date or adm.valid_from or adm.admission_date
        kind = determine_kind(due_d, today)

        msg = compose_reminder_message(
            student_name=student.name,
            subject_name=course_str,
            due_amount=adm.balance_due,
            due_date=due_d,
            admission_number=adm.admission_number,
        )

        if adm.id in existing_pending_map:
            existing_rq = existing_pending_map[adm.id]
            existing_rq.due_amount = adm.balance_due
            existing_rq.due_date = due_d
            existing_rq.message = msg
            existing_rq.kind = kind
            existing_rq.course_name = course_str
            existing_rq.subject_id = target_subject_id
            existing_rq.batch_id = target_batch_id
            if target_item:
                existing_rq.admission_item_id = target_item.id
            continue

        reminder = ReminderQueue(
            id=uuid.uuid4(),
            student_id=student.id,
            admission_id=adm.id,
            admission_item_id=target_item.id if target_item else None,
            subject_id=target_subject_id,
            batch_id=target_batch_id,
            kind=kind,
            course_name=course_str,
            due_date=due_d,
            due_amount=adm.balance_due,
            message=msg,
            status="pending",
        )
        db.add(reminder)
        existing_pending_map[adm.id] = reminder
        queued_count += 1

    if queued_count > 0:
        await db.commit()

    return queued_count


async def list_reminder_queue(
    db: AsyncSession,
    status_filter: Optional[str] = "pending",
    subject_id: Optional[uuid.UUID] = None,
    batch_id: Optional[uuid.UUID] = None,
    due_age: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> ReminderListResponse:
    today = date.today()

    # Base query joining Student, Admission, Subject, Batch, User
    stmt = (
        select(ReminderQueue, Student, Admission, User, Subject, Batch)
        .join(Student, ReminderQueue.student_id == Student.id)
        .join(Admission, ReminderQueue.admission_id == Admission.id)
        .outerjoin(User, ReminderQueue.handled_by == User.id)
        .outerjoin(Subject, ReminderQueue.subject_id == Subject.id)
        .outerjoin(Batch, ReminderQueue.batch_id == Batch.id)
        .where(
            Admission.document_status == "VALID",
            Admission.status.notin_(["REVOKED", "CANCELLED", "EXPIRED"]),
            Admission.access_status.notin_(["REVOKED", "EXPIRED"]),
            or_(Admission.valid_to.is_(None), Admission.valid_to >= today),
            ReminderQueue.kind != "expired_due",
        )
        .order_by(ReminderQueue.created_at.desc())
    )

    # Filter status
    if status_filter and status_filter.lower() != "all":
        st = status_filter.lower()
        stmt = stmt.where(ReminderQueue.status == st)
        if st == "pending":
            stmt = stmt.where(Admission.balance_due > Decimal("0.00"))

    # Filter subject
    if subject_id:
        stmt = stmt.where(
            or_(
                ReminderQueue.subject_id == subject_id,
                Admission.items.any(AdmissionItem.subject_id == subject_id),
            )
        )

    # Filter batch
    if batch_id:
        stmt = stmt.where(
            or_(
                ReminderQueue.batch_id == batch_id,
                Admission.items.any(AdmissionItem.batch_id == batch_id),
            )
        )

    # Filter due-age
    if due_age and due_age.lower() != "all":
        da = due_age.strip().replace(" ", "+").lower()
        ref_col = func.coalesce(ReminderQueue.due_date, Admission.valid_from, Admission.admission_date)
        if da in ("0-30", "0_30"):
            stmt = stmt.where(ref_col >= today - timedelta(days=30))
        elif da in ("31-60", "31_60"):
            stmt = stmt.where(
                ref_col < today - timedelta(days=30),
                ref_col >= today - timedelta(days=60),
            )
        elif da in ("61-90", "61_90"):
            stmt = stmt.where(
                ref_col < today - timedelta(days=60),
                ref_col >= today - timedelta(days=90),
            )
        elif da in ("90+", "90plus", "90", ">90"):
            stmt = stmt.where(ref_col < today - timedelta(days=90))

    # Search filter
    if search and search.strip():
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Student.name.ilike(term),
                Student.student_code.ilike(term),
                Student.mobile.ilike(term),
                ReminderQueue.course_name.ilike(term),
                Admission.admission_number.ilike(term),
                Subject.name.ilike(term),
                Batch.name.ilike(term),
            )
        )

    # Count
    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = (await db.execute(count_stmt)).scalar() or 0
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    # Pagination
    offset = (page - 1) * page_size
    rows = (await db.execute(stmt.offset(offset).limit(page_size))).all()

    # Overall metrics for KPI summary cards
    counts_query = await db.execute(
        select(
            func.count(ReminderQueue.id).filter(
                and_(ReminderQueue.status == "pending", Admission.balance_due > Decimal("0.00"))
            ),
            func.count(ReminderQueue.id).filter(ReminderQueue.status == "sent"),
            func.count(ReminderQueue.id).filter(ReminderQueue.status == "failed"),
            func.coalesce(
                func.sum(Admission.balance_due).filter(
                    and_(ReminderQueue.status == "pending", Admission.balance_due > Decimal("0.00"))
                ),
                Decimal("0.00"),
            ),
        )
        .join(Admission, ReminderQueue.admission_id == Admission.id)
        .where(
            Admission.document_status == "VALID",
            Admission.status.notin_(["REVOKED", "CANCELLED", "EXPIRED"]),
            Admission.access_status.notin_(["REVOKED", "EXPIRED"]),
            or_(Admission.valid_to.is_(None), Admission.valid_to >= today),
            ReminderQueue.kind != "expired_due",
        )
    )
    p_cnt, s_cnt, f_cnt, sum_due = counts_query.one()

    counts = ReminderCounts(
        pending=p_cnt or 0,
        sent=s_cnt or 0,
        failed=f_cnt or 0,
        expired_dues=0,
        total_due_amount=sum_due or Decimal("0.00"),
        formatted_total_due=format_currency_in(sum_due or Decimal("0.00")),
    )

    items = []
    for rq, st, adm, u, sub, bch in rows:
        current_due = adm.balance_due if rq.status == "pending" else rq.due_amount
        eff_due_date = rq.due_date or adm.valid_from or adm.admission_date
        age_days, age_bucket = determine_ageing_bucket(eff_due_date, today)

        subject_display = sub.name if sub else rq.course_name
        batch_display = bch.name if bch else None

        msg = compose_reminder_message(
            student_name=st.name,
            subject_name=subject_display,
            due_amount=current_due,
            due_date=eff_due_date,
            admission_number=adm.admission_number,
        )
        wa_url = build_whatsapp_link(st.mobile, msg)

        items.append(
            ReminderItemResponse(
                id=rq.id,
                student_id=st.id,
                student_name=st.name,
                student_code=st.student_code,
                student_mobile=st.mobile,
                father_name=st.father_name,
                admission_id=adm.id,
                admission_number=adm.admission_number,
                admission_item_id=rq.admission_item_id,
                subject_id=sub.id if sub else rq.subject_id,
                subject_name=subject_display,
                subject_code=sub.subject_code if sub else None,
                batch_id=bch.id if bch else rq.batch_id,
                batch_name=batch_display,
                course_name=rq.course_name,
                due_amount=current_due,
                formatted_due_amount=format_currency_in(current_due),
                due_date=eff_due_date,
                formatted_due_date=format_date_in(eff_due_date),
                due_age_days=age_days,
                ageing_bucket=age_bucket,
                kind=determine_kind(eff_due_date, today) if rq.status == "pending" else rq.kind,
                is_expired=False,
                message=msg,
                whatsapp_url=wa_url,
                has_mobile=bool(st.mobile and st.mobile.strip()),
                status=rq.status,
                error_reason=rq.error_reason,
                created_at=rq.created_at,
                handled_at=rq.handled_at,
                handled_by_name=u.full_name if u else None,
            )
        )

    return ReminderListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        counts=counts,
    )


async def get_reminder_item_response(db: AsyncSession, reminder_id: uuid.UUID) -> ReminderItemResponse:
    today = date.today()
    stmt = (
        select(ReminderQueue, Student, Admission, User, Subject, Batch)
        .join(Student, ReminderQueue.student_id == Student.id)
        .join(Admission, ReminderQueue.admission_id == Admission.id)
        .outerjoin(User, ReminderQueue.handled_by == User.id)
        .outerjoin(Subject, ReminderQueue.subject_id == Subject.id)
        .outerjoin(Batch, ReminderQueue.batch_id == Batch.id)
        .where(ReminderQueue.id == reminder_id)
    )
    row = (await db.execute(stmt)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Reminder queue item not found")

    rq, st, adm, u, sub, bch = row
    current_due = adm.balance_due if rq.status == "pending" else rq.due_amount
    eff_due_date = rq.due_date or adm.valid_from or adm.admission_date
    age_days, age_bucket = determine_ageing_bucket(eff_due_date, today)
    subject_display = sub.name if sub else rq.course_name

    msg = compose_reminder_message(
        student_name=st.name,
        subject_name=subject_display,
        due_amount=current_due,
        due_date=eff_due_date,
        admission_number=adm.admission_number,
    )

    return ReminderItemResponse(
        id=rq.id,
        student_id=st.id,
        student_name=st.name,
        student_code=st.student_code,
        student_mobile=st.mobile,
        father_name=st.father_name,
        admission_id=adm.id,
        admission_number=adm.admission_number,
        admission_item_id=rq.admission_item_id,
        subject_id=sub.id if sub else rq.subject_id,
        subject_name=subject_display,
        subject_code=sub.subject_code if sub else None,
        batch_id=bch.id if bch else rq.batch_id,
        batch_name=bch.name if bch else None,
        course_name=rq.course_name,
        due_amount=current_due,
        formatted_due_amount=format_currency_in(current_due),
        due_date=eff_due_date,
        formatted_due_date=format_date_in(eff_due_date),
        due_age_days=age_days,
        ageing_bucket=age_bucket,
        kind=determine_kind(eff_due_date, today) if rq.status == "pending" else rq.kind,
        is_expired=False,
        message=msg,
        whatsapp_url=build_whatsapp_link(st.mobile, msg),
        has_mobile=bool(st.mobile and st.mobile.strip()),
        status=rq.status,
        error_reason=rq.error_reason,
        created_at=rq.created_at,
        handled_at=rq.handled_at,
        handled_by_name=u.full_name if u else None,
    )


async def mark_reminder_sent(
    db: AsyncSession, reminder_id: uuid.UUID, actor_id: uuid.UUID
) -> ReminderItemResponse:
    stmt = select(ReminderQueue).where(ReminderQueue.id == reminder_id)
    rq = (await db.execute(stmt)).scalar_one_or_none()
    if not rq:
        raise HTTPException(status_code=404, detail="Reminder queue item not found")

    rq.status = "sent"
    rq.handled_by = actor_id
    rq.handled_at = datetime.now(timezone.utc)
    rq.error_reason = None

    audit = AuditLog(
        action="REMINDER_SENT_WHATSAPP",
        user_id=actor_id,
        entity_type="ReminderQueue",
        entity_id=reminder_id,
        details=f"Sent WhatsApp due reminder for admission {rq.admission_id}",
    )
    db.add(audit)
    await db.commit()

    return await get_reminder_item_response(db, reminder_id)


async def mark_reminder_failed(
    db: AsyncSession, reminder_id: uuid.UUID, actor_id: uuid.UUID, reason: Optional[str] = None
) -> ReminderItemResponse:
    stmt = select(ReminderQueue).where(ReminderQueue.id == reminder_id)
    rq = (await db.execute(stmt)).scalar_one_or_none()
    if not rq:
        raise HTTPException(status_code=404, detail="Reminder queue item not found")

    rq.status = "failed"
    rq.handled_by = actor_id
    rq.handled_at = datetime.now(timezone.utc)
    rq.error_reason = reason or "WhatsApp send failed / unreachable"

    audit = AuditLog(
        action="REMINDER_FAILED_WHATSAPP",
        user_id=actor_id,
        entity_type="ReminderQueue",
        entity_id=reminder_id,
        details=f"Failed WhatsApp reminder for admission {rq.admission_id}: {rq.error_reason}",
    )
    db.add(audit)
    await db.commit()

    return await get_reminder_item_response(db, reminder_id)


async def reset_reminder_pending(
    db: AsyncSession, reminder_id: uuid.UUID, actor_id: uuid.UUID
) -> ReminderItemResponse:
    stmt = select(ReminderQueue).where(ReminderQueue.id == reminder_id)
    rq = (await db.execute(stmt)).scalar_one_or_none()
    if not rq:
        raise HTTPException(status_code=404, detail="Reminder queue item not found")

    rq.status = "pending"
    rq.handled_by = None
    rq.handled_at = None
    rq.error_reason = None

    audit = AuditLog(
        action="REMINDER_RESET_PENDING",
        user_id=actor_id,
        entity_type="ReminderQueue",
        entity_id=reminder_id,
        details=f"Reset reminder status back to pending for admission {rq.admission_id}",
    )
    db.add(audit)
    await db.commit()

    return await get_reminder_item_response(db, reminder_id)


async def send_student_due_reminder(
    db: AsyncSession, student_id: uuid.UUID, actor_id: uuid.UUID
) -> ReminderSendStudentResponse:
    """One-click 'send due reminder' from student profile."""
    today = date.today()

    # Find student's active admission with balance_due > 0
    stmt = (
        select(Admission)
        .where(
            Admission.student_id == student_id,
            Admission.document_status == "VALID",
            Admission.status.notin_(["REVOKED", "CANCELLED", "EXPIRED"]),
            Admission.access_status.notin_(["REVOKED", "EXPIRED"]),
            Admission.balance_due > Decimal("0.00"),
            or_(Admission.valid_to.is_(None), Admission.valid_to >= today),
        )
        .order_by(Admission.created_at.desc())
    )
    adm = (await db.execute(stmt)).scalars().first()
    if not adm:
        raise HTTPException(status_code=400, detail="Student has no active outstanding dues to remind")

    student = adm.student
    target_item = None
    target_subject_id = None
    target_batch_id = None
    target_due_date = None
    subject_names = []

    if adm.items:
        for itm in adm.items:
            is_itm_expired = itm.status == "EXPIRED" or itm.access_status == "EXPIRED" or (itm.valid_to and itm.valid_to < today)
            is_itm_cancelled = itm.status in ("CANCELLED", "REVOKED", "DISCONTINUED") or itm.access_status in ("REVOKED",)
            if is_itm_expired or is_itm_cancelled or itm.balance_due <= Decimal("0.00"):
                continue
            if not target_item:
                target_item = itm
                target_subject_id = itm.subject_id
                target_batch_id = itm.batch_id
                target_due_date = itm.valid_from or adm.valid_from or adm.admission_date
            if itm.item_name_snapshot and itm.item_name_snapshot not in subject_names:
                subject_names.append(itm.item_name_snapshot)

    course_str = ", ".join(subject_names) if subject_names else "Coaching Course"
    due_d = target_due_date or adm.valid_from or adm.admission_date
    kind = determine_kind(due_d, today)

    msg = compose_reminder_message(
        student_name=student.name,
        subject_name=course_str,
        due_amount=adm.balance_due,
        due_date=due_d,
        admission_number=adm.admission_number,
    )
    wa_url = build_whatsapp_link(student.mobile, msg)

    # Check if a pending reminder already exists
    rq_stmt = select(ReminderQueue).where(ReminderQueue.admission_id == adm.id)
    rq = (await db.execute(rq_stmt)).scalars().first()
    if not rq:
        rq = ReminderQueue(
            id=uuid.uuid4(),
            student_id=student.id,
            admission_id=adm.id,
            admission_item_id=target_item.id if target_item else None,
            subject_id=target_subject_id,
            batch_id=target_batch_id,
            kind=kind,
            course_name=course_str,
            due_date=due_d,
            due_amount=adm.balance_due,
            message=msg,
            status="pending",
        )
        db.add(rq)
    else:
        rq.due_amount = adm.balance_due
        rq.due_date = due_d
        rq.message = msg
        rq.kind = kind
        rq.course_name = course_str
        rq.subject_id = target_subject_id
        rq.batch_id = target_batch_id

    audit = AuditLog(
        action="REMINDER_TRIGGERED_STUDENT",
        user_id=actor_id,
        entity_type="Student",
        entity_id=student_id,
        details=f"Prepared WhatsApp due reminder for {student.name} ({format_currency_in(adm.balance_due)})",
    )
    db.add(audit)
    await db.commit()

    item_res = await get_reminder_item_response(db, rq.id)
    return ReminderSendStudentResponse(
        reminder=item_res,
        whatsapp_url=wa_url,
        message=f"WhatsApp reminder ready for {student.name} ({format_currency_in(adm.balance_due)})",
    )


async def send_subject_due_reminders(
    db: AsyncSession, subject_id: uuid.UUID, actor_id: uuid.UUID
) -> int:
    """One-click 'send due reminder' from subject."""
    today = date.today()
    subject = await db.get(Subject, subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    # Build/refresh reminders for active dues
    await build_due_reminders(db)

    # Count all pending reminders for this subject
    stmt = (
        select(func.count(ReminderQueue.id))
        .join(Admission, ReminderQueue.admission_id == Admission.id)
        .where(
            ReminderQueue.status == "pending",
            Admission.balance_due > Decimal("0.00"),
            Admission.document_status == "VALID",
            Admission.status.notin_(["REVOKED", "CANCELLED", "EXPIRED"]),
            Admission.access_status.notin_(["REVOKED", "EXPIRED"]),
            or_(Admission.valid_to.is_(None), Admission.valid_to >= today),
            ReminderQueue.kind != "expired_due",
            or_(
                ReminderQueue.subject_id == subject_id,
                Admission.items.any(AdmissionItem.subject_id == subject_id),
            ),
        )
    )
    subject_due_count = (await db.execute(stmt)).scalar() or 0

    audit = AuditLog(
        action="REMINDER_TRIGGERED_SUBJECT",
        user_id=actor_id,
        entity_type="Subject",
        entity_id=subject_id,
        details=f"Triggered due reminders for subject {subject.name}: {subject_due_count} active pending reminder(s)",
    )
    db.add(audit)
    await db.commit()

    return subject_due_count
