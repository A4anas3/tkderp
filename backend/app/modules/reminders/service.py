import urllib.parse
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional, List, Tuple
import uuid
from fastapi import HTTPException
from sqlalchemy import select, func, or_, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Admission, AdmissionItem, Student, User, AuditLog
from app.modules.reminders.models import ReminderQueue
from app.modules.reminders.schemas import (
    ReminderItemResponse,
    ReminderCounts,
    ReminderListResponse,
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


def compose_reminder_message(
    student_name: str,
    course_name: str,
    due_amount: Decimal,
    is_expired: bool,
    admission_number: str,
) -> str:
    formatted_amt = format_currency_in(due_amount)
    if is_expired:
        return (
            f"Dear {student_name}, this is an important reminder from Thakurdwara Coaching Institute "
            f"that your course enrollment ({course_name}, Ref: {admission_number}) has an outstanding balance "
            f"of {formatted_amt} and the course validity period has expired. "
            f"Kindly visit the accounts desk to clear your pending dues at the earliest. Thank you!"
        )
    else:
        return (
            f"Dear {student_name}, this is a polite reminder from Thakurdwara Coaching Institute "
            f"regarding your outstanding fee due of {formatted_amt} for {course_name} (Ref: {admission_number}). "
            f"Please clear the due at the accounts desk at your convenience. Thank you!"
        )


async def build_due_reminders(db: AsyncSession, as_of_date: Optional[date] = None) -> int:
    """
    Scan all valid admissions with balance_due > 0 (including expired dues from F1)
    and queue reminders idempotently.
    """
    today = as_of_date or date.today()

    # Query admissions with unpaid or partial payment
    stmt = (
        select(Admission)
        .where(
            Admission.payment_status.in_(["UNPAID", "PARTIALLY_PAID"]),
            Admission.status.notin_(["REVOKED", "CANCELLED"]),
            Admission.document_status == "VALID",
            Admission.balance_due > Decimal("0.00"),
        )
        .order_by(Admission.created_at.desc())
    )
    res = await db.execute(stmt)
    admissions = res.scalars().all()

    # Fetch existing pending reminders to maintain idempotency
    existing_stmt = select(ReminderQueue.admission_id).where(
        ReminderQueue.status == "pending"
    )
    existing_pending_adm_ids = set((await db.execute(existing_stmt)).scalars().all())

    queued_count = 0
    for adm in admissions:
        if adm.balance_due <= Decimal("0.00"):
            continue

        student = adm.student
        if not student:
            continue

        # Check if expired or upcoming
        is_expired = False
        if adm.status == "EXPIRED" or (adm.valid_to and adm.valid_to < today):
            is_expired = True
        elif adm.items:
            for itm in adm.items:
                if (itm.access_status == "EXPIRED" or (itm.valid_to and itm.valid_to < today)) and itm.balance_due > Decimal("0.00"):
                    is_expired = True
                    break

        kind = "expired_due" if is_expired else "due"
        if not is_expired and adm.valid_to:
            if adm.valid_to == today:
                kind = "due_today"
            elif adm.valid_to <= today + timedelta(days=5):
                kind = "due_soon"

        # Determine course name from items
        course_names = []
        if adm.items:
            for itm in adm.items:
                if itm.item_name_snapshot and itm.item_name_snapshot not in course_names:
                    course_names.append(itm.item_name_snapshot)
        course_str = ", ".join(course_names) if course_names else "Coaching Course"

        msg = compose_reminder_message(
            student_name=student.name,
            course_name=course_str,
            due_amount=adm.balance_due,
            is_expired=is_expired,
            admission_number=adm.admission_number,
        )

        if adm.id in existing_pending_adm_ids:
            # Update the existing pending reminder message and due_amount to match latest balance
            update_stmt = (
                select(ReminderQueue)
                .where(ReminderQueue.admission_id == adm.id, ReminderQueue.status == "pending")
            )
            existing_rq = (await db.execute(update_stmt)).scalar_one_or_none()
            if existing_rq:
                existing_rq.due_amount = adm.balance_due
                existing_rq.message = msg
                existing_rq.kind = kind
                existing_rq.course_name = course_str
            continue

        reminder = ReminderQueue(
            id=uuid.uuid4(),
            student_id=student.id,
            admission_id=adm.id,
            kind=kind,
            course_name=course_str,
            due_amount=adm.balance_due,
            message=msg,
            status="pending",
        )
        db.add(reminder)
        existing_pending_adm_ids.add(adm.id)
        queued_count += 1

    if queued_count > 0:
        await db.commit()

    return queued_count


async def list_reminder_queue(
    db: AsyncSession,
    status_filter: Optional[str] = "pending",
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> ReminderListResponse:
    # Check if we should auto-populate
    check_cnt = (await db.execute(select(func.count(ReminderQueue.id)))).scalar() or 0
    if check_cnt == 0:
        await build_due_reminders(db)

    today = date.today()

    # Base query
    stmt = (
        select(ReminderQueue, Student, Admission, User)
        .join(Student, ReminderQueue.student_id == Student.id)
        .join(Admission, ReminderQueue.admission_id == Admission.id)
        .outerjoin(User, ReminderQueue.handled_by == User.id)
        .where(
            Admission.document_status == "VALID",
            Admission.status.notin_(["REVOKED", "CANCELLED"]),
        )
        .order_by(ReminderQueue.created_at.desc())
    )

    # Filter status
    if status_filter and status_filter.lower() != "all":
        st = status_filter.lower()
        stmt = stmt.where(ReminderQueue.status == st)
        if st == "pending":
            # Only show if admission balance_due is still outstanding
            stmt = stmt.where(Admission.balance_due > Decimal("0.00"))

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
            )
        )

    # Count
    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = (await db.execute(count_stmt)).scalar() or 0
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    # Pagination
    offset = (page - 1) * page_size
    rows = (await db.execute(stmt.offset(offset).limit(page_size))).all()

    # Overall metrics for top summary cards
    counts_query = await db.execute(
        select(
            func.count(ReminderQueue.id).filter(
                and_(ReminderQueue.status == "pending", Admission.balance_due > Decimal("0.00"))
            ),
            func.count(ReminderQueue.id).filter(ReminderQueue.status == "sent"),
            func.count(ReminderQueue.id).filter(
                and_(
                    ReminderQueue.status == "pending",
                    Admission.balance_due > Decimal("0.00"),
                    or_(
                        ReminderQueue.kind == "expired_due",
                        Admission.status == "EXPIRED",
                        Admission.valid_to < today,
                    ),
                )
            ),
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
            Admission.status.notin_(["REVOKED", "CANCELLED"]),
        )
    )
    p_cnt, s_cnt, exp_cnt, sum_due = counts_query.one()

    counts = ReminderCounts(
        pending=p_cnt or 0,
        sent=s_cnt or 0,
        expired_dues=exp_cnt or 0,
        total_due_amount=sum_due or Decimal("0.00"),
        formatted_total_due=format_currency_in(sum_due or Decimal("0.00")),
    )

    items = []
    for rq, st, adm, u in rows:
        # Use current live balance_due if pending
        current_due = adm.balance_due if rq.status == "pending" else rq.due_amount
        is_exp = (
            rq.kind == "expired_due"
            or adm.status == "EXPIRED"
            or (adm.valid_to and adm.valid_to < today)
        )

        # Dynamic WhatsApp URL with current due amount
        msg = compose_reminder_message(
            student_name=st.name,
            course_name=rq.course_name,
            due_amount=current_due,
            is_expired=is_exp,
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
                admission_id=adm.id,
                admission_number=adm.admission_number,
                course_name=rq.course_name,
                due_amount=current_due,
                formatted_due_amount=format_currency_in(current_due),
                kind="expired_due" if is_exp else rq.kind,
                is_expired=is_exp,
                message=msg,
                whatsapp_url=wa_url,
                has_mobile=bool(st.mobile and st.mobile.strip()),
                status=rq.status,
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

    # Record audit log
    audit = AuditLog(
        action="REMINDER_SENT_WHATSAPP",
        user_id=actor_id,
        entity_type="ReminderQueue",
        entity_id=reminder_id,
        details=f"Sent WhatsApp due reminder for admission {rq.admission_id}",
    )
    db.add(audit)
    await db.commit()

    # Re-fetch item to return
    res = await list_reminder_queue(db, status_filter="all", page=1, page_size=100)
    for it in res.items:
        if it.id == reminder_id:
            return it

    # Fallback response
    return ReminderItemResponse(
        id=rq.id,
        student_id=rq.student_id,
        student_name=rq.student.name if rq.student else "Student",
        student_code=rq.student.student_code if rq.student else "",
        student_mobile=rq.student.mobile if rq.student else None,
        admission_id=rq.admission_id,
        admission_number=rq.admission.admission_number if rq.admission else "",
        course_name=rq.course_name,
        due_amount=rq.due_amount,
        formatted_due_amount=format_currency_in(rq.due_amount),
        kind=rq.kind,
        is_expired=rq.kind == "expired_due",
        message=rq.message,
        whatsapp_url=build_whatsapp_link(rq.student.mobile if rq.student else None, rq.message),
        has_mobile=bool(rq.student and rq.student.mobile),
        status="sent",
        created_at=rq.created_at,
        handled_at=rq.handled_at,
    )


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
    await db.commit()

    res = await list_reminder_queue(db, status_filter="all", page=1, page_size=100)
    for it in res.items:
        if it.id == reminder_id:
            return it

    return ReminderItemResponse(
        id=rq.id,
        student_id=rq.student_id,
        student_name=rq.student.name if rq.student else "Student",
        student_code=rq.student.student_code if rq.student else "",
        student_mobile=rq.student.mobile if rq.student else None,
        admission_id=rq.admission_id,
        admission_number=rq.admission.admission_number if rq.admission else "",
        course_name=rq.course_name,
        due_amount=rq.due_amount,
        formatted_due_amount=format_currency_in(rq.due_amount),
        kind=rq.kind,
        is_expired=rq.kind == "expired_due",
        message=rq.message,
        whatsapp_url=build_whatsapp_link(rq.student.mobile if rq.student else None, rq.message),
        has_mobile=bool(rq.student and rq.student.mobile),
        status="pending",
        created_at=rq.created_at,
        handled_at=None,
    )
