import uuid
import urllib.parse
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional, List, Set, Tuple
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, desc, asc

from app.database.session import get_db
from app.core.dependencies import require_cashier_or_admin
from app.modules.users.models import User
from app.database.models import Admission, AdmissionItem, Student, Batch, Subject
from app.common.active_lines import today_kolkata, compute_days_remaining
from app.modules.renewals.schemas import (
    RenewalItemResponse,
    RenewalCounts,
    RenewalsSummaryResponse,
)

router = APIRouter(prefix="/api/renewals", tags=["Renewals"])


def build_whatsapp_link(phone: Optional[str], message: str) -> str:
    """Format clean WhatsApp click-to-chat URL: https://wa.me/{phone}?text={encoded}."""
    if not phone:
        return ""
    digits = "".join(filter(str.isdigit, str(phone)))
    if not digits:
        return ""
    if len(digits) == 10:
        digits = "91" + digits
    encoded = urllib.parse.quote(message)
    return f"https://wa.me/{digits}?text={encoded}"


def compose_renewal_message(
    student_name: str,
    subject_name: str,
    valid_to: date,
    category: str,
    status_label: str,
    admission_number: Optional[str] = None,
) -> str:
    formatted_date = valid_to.strftime("%d %b %Y")
    ref_str = f" (Ref: #{admission_number})" if admission_number else ""
    if category == "EXPIRING":
        return (
            f"🎓 *THAKURDWARA COACHING INSTITUTE*\n"
            f"*Course Renewal Reminder*\n\n"
            f"Dear *{student_name}*,\n"
            f"This is a gentle reminder that your course *{subject_name}*{ref_str} is scheduled to expire on *{formatted_date}* ({status_label}).\n\n"
            f"To maintain uninterrupted class access and retain your seat, kindly visit the accounts/cashier desk to renew your admission.\n\n"
            f"Thank you!\n"
            f"_Thakurdwara Coaching Institute • Civil Lines, Thakurdwara_"
        )
    else:
        return (
            f"🎓 *THAKURDWARA COACHING INSTITUTE*\n"
            f"*Course Renewal Notice*\n\n"
            f"Dear *{student_name}*,\n"
            f"Your enrollment for *{subject_name}*{ref_str} concluded on *{formatted_date}* ({status_label}).\n\n"
            f"To resume classes and reactivate your student access, kindly visit the cashier desk to complete your course renewal.\n\n"
            f"Thank you!\n"
            f"_Thakurdwara Coaching Institute • Civil Lines, Thakurdwara_"
        )


@router.get("", response_model=RenewalsSummaryResponse)
@router.get("/summary", response_model=RenewalsSummaryResponse)
async def get_renewals_summary(
    search: Optional[str] = Query(None, description="Search by student name, code, phone, or course"),
    subject_id: Optional[uuid.UUID] = Query(None, description="Filter by subject ID"),
    window_days: int = Query(5, ge=1, le=30, description="Window in days (default 5)"),
    category: Optional[str] = Query(None, description="Filter: ALL | EXPIRING | EXPIRED"),
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin),
):
    """
    Returns LIVE course renewals data split into TWO lists:
    1) 'Expiring in 1-5 days' (validity ends in the next 1-5 days or today)
    2) 'Recently Expired (1-5 days ago)' (validity ended in the last 1-5 days)
    
    A renewed student automatically disappears from both lists because their
    expiry date has moved out or they are superseded by the new cycle.
    Only CASHIER and ADMIN roles are permitted.
    """
    today = today_kolkata()
    start_expired = today - timedelta(days=window_days)
    end_expiring = today + timedelta(days=window_days)

    effective_valid_to = func.coalesce(AdmissionItem.valid_to, Admission.valid_to)

    # Base conditions for candidate admission items
    conds = [
        or_(
            AdmissionItem.item_type.in_(["BATCH_SUBJECT", "SUBJECT", "COURSE"]),
            AdmissionItem.subject_id.isnot(None)
        ),
        AdmissionItem.status.notin_(["DISCONTINUED", "REVOKED", "CANCELLED"]),
        AdmissionItem.access_status.notin_(["REVOKED", "CANCELLED", "DISCONTINUED"]),
        Admission.document_status == "VALID",
        Admission.status.notin_(["CANCELLED", "REVOKED", "DISCONTINUED"]),
        Admission.access_status.notin_(["REVOKED", "CANCELLED", "DISCONTINUED"]),
        effective_valid_to != None,
        effective_valid_to >= start_expired,
        effective_valid_to <= end_expiring,
    ]

    if subject_id:
        conds.append(AdmissionItem.subject_id == subject_id)

    if search and search.strip():
        s = f"%{search.strip()}%"
        conds.append(
            or_(
                Student.name.ilike(s),
                Student.student_code.ilike(s),
                Student.mobile.ilike(s),
                Admission.admission_number.ilike(s),
                AdmissionItem.item_name_snapshot.ilike(s),
            )
        )

    stmt = (
        select(AdmissionItem, Admission, Student, Batch.name.label("batch_name"))
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .join(Student, Admission.student_id == Student.id)
        .outerjoin(Batch, AdmissionItem.batch_id == Batch.id)
        .where(and_(*conds))
        .order_by(effective_valid_to.asc(), Student.name.asc())
    )

    res = await db.execute(stmt)
    rows = res.all()

    if not rows:
        return RenewalsSummaryResponse(
            as_of_date=today,
            expiring=[],
            recently_expired=[],
            counts=RenewalCounts(expiring_count=0, recently_expired_count=0, total_count=0),
        )

    candidate_item_ids = [itm.id for itm, adm, stu, b_name in rows]
    candidate_student_ids = {stu.id for itm, adm, stu, b_name in rows}

    # 1. Check which items have been directly renewed (renewed_from_item_id pointing to them)
    renewed_ids: Set[uuid.UUID] = set()
    if candidate_item_ids:
        r_stmt = select(AdmissionItem.renewed_from_item_id).where(
            AdmissionItem.renewed_from_item_id.in_(candidate_item_ids),
            AdmissionItem.status.notin_(["DISCONTINUED", "REVOKED", "CANCELLED"]),
            AdmissionItem.access_status.notin_(["REVOKED", "CANCELLED", "DISCONTINUED"]),
        )
        r_res = await db.execute(r_stmt)
        renewed_ids = set(r_res.scalars().all())

    # 2. Check if a student has another later active cycle for the same subject
    # (e.g. they renewed via new admission or extended cycle)
    later_active_stmt = (
        select(
            AdmissionItem.student_id,
            AdmissionItem.subject_id,
            func.max(func.coalesce(AdmissionItem.valid_to, Admission.valid_to)).label("max_valid_to"),
        )
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .where(
            AdmissionItem.student_id.in_(candidate_student_ids),
            AdmissionItem.status.notin_(["DISCONTINUED", "REVOKED", "CANCELLED"]),
            AdmissionItem.access_status.notin_(["REVOKED", "CANCELLED", "DISCONTINUED"]),
            Admission.document_status == "VALID",
            Admission.status.notin_(["CANCELLED", "REVOKED", "DISCONTINUED"]),
            Admission.access_status.notin_(["REVOKED", "CANCELLED", "DISCONTINUED"]),
            func.coalesce(AdmissionItem.valid_to, Admission.valid_to) >= today,
        )
        .group_by(AdmissionItem.student_id, AdmissionItem.subject_id)
    )
    later_res = await db.execute(later_active_stmt)
    # Map of (student_id, subject_id) -> max_valid_to
    latest_subject_validity: dict = {
        (r[0], r[1]): r[2] for r in later_res.all() if r[0] and r[1]
    }

    expiring_items: List[RenewalItemResponse] = []
    recently_expired_items: List[RenewalItemResponse] = []

    for itm, adm, stu, b_name in rows:
        # A renewed item never shows on these lists
        if itm.id in renewed_ids:
            continue

        item_valid_from: Optional[date] = itm.valid_from or adm.valid_from
        item_valid_to: date = itm.valid_to or adm.valid_to
        if not item_valid_to:
            continue

        # If the student has another active/future cycle for this same subject with later expiry date,
        # then the course has already been renewed!
        latest_end = latest_subject_validity.get((stu.id, itm.subject_id))
        if latest_end and latest_end > item_valid_to:
            continue

        days_diff = (item_valid_to - today).days

        # Partition into Expiring vs Recently Expired
        if item_valid_to >= today:
            # Expiring in 1-5 days (including today)
            if days_diff < 0 or days_diff > window_days:
                continue
            category = "EXPIRING"
            days_remaining = compute_days_remaining(item_valid_to, item_valid_from, today)
            days_ago = None
            if days_remaining == 0:
                status_label = "Expires today"
            elif days_remaining == 1:
                status_label = "Expires in 1 day"
            else:
                status_label = f"Expires in {days_remaining} days"
        else:
            # Recently Expired (1-5 days ago)
            days_ago = (today - item_valid_to).days
            if days_ago < 1 or days_ago > window_days:
                continue
            category = "EXPIRED"
            days_remaining = None
            if days_ago == 1:
                status_label = "Expired 1 day ago"
            else:
                status_label = f"Expired {days_ago} days ago"

        wa_msg = compose_renewal_message(
            student_name=stu.name,
            subject_name=itm.item_name_snapshot,
            valid_to=item_valid_to,
            category=category,
            status_label=status_label,
            admission_number=adm.admission_number,
        )
        wa_url = build_whatsapp_link(stu.mobile, wa_msg)

        item_resp = RenewalItemResponse(
            item_id=itm.id,
            admission_id=adm.id,
            admission_number=adm.admission_number,
            student_id=stu.id,
            student_name=stu.name,
            student_code=stu.student_code,
            student_mobile=stu.mobile,
            father_name=stu.father_name,
            subject_id=itm.subject_id,
            subject_name=itm.item_name_snapshot,
            teacher_id=itm.teacher_id,
            teacher_name=itm.teacher_name_snapshot,
            batch_id=itm.batch_id,
            batch_name=b_name or itm.item_name_snapshot,
            hall_number=itm.hall_number_snapshot,
            valid_from=itm.valid_from or adm.valid_from,
            valid_to=item_valid_to,
            days_diff=days_diff,
            days_remaining=days_remaining,
            days_ago=days_ago,
            status_label=status_label,
            category=category,
            whatsapp_url=wa_url,
            whatsapp_message=wa_msg,
            balance_due=itm.balance_due or Decimal("0.00"),
            net_price=itm.net_price or Decimal("0.00"),
            amount_collected=itm.amount_collected or Decimal("0.00"),
            payment_status=adm.payment_status,
            status=itm.status,
        )

        if category == "EXPIRING":
            expiring_items.append(item_resp)
        else:
            recently_expired_items.append(item_resp)

    # Sort expiring: soonest to expire first (asc by valid_to)
    expiring_items.sort(key=lambda x: x.valid_to)
    # Sort recently expired: most recently expired first (desc by valid_to)
    recently_expired_items.sort(key=lambda x: x.valid_to, reverse=True)

    counts = RenewalCounts(
        expiring_count=len(expiring_items),
        recently_expired_count=len(recently_expired_items),
        total_count=len(expiring_items) + len(recently_expired_items),
    )

    if page is not None:
        effective_page_size = page_size or 20
        cat_upper = category.upper() if category else "ALL"
        if cat_upper == "EXPIRING":
            target_list = expiring_items
            total = len(target_list)
            total_pages = max(1, (total + effective_page_size - 1) // effective_page_size) if total > 0 else 1
            start = (page - 1) * effective_page_size
            paged_expiring = target_list[start:start + effective_page_size]
            paged_expired = []
        elif cat_upper == "EXPIRED":
            target_list = recently_expired_items
            total = len(target_list)
            total_pages = max(1, (total + effective_page_size - 1) // effective_page_size) if total > 0 else 1
            start = (page - 1) * effective_page_size
            paged_expiring = []
            paged_expired = target_list[start:start + effective_page_size]
        else:
            all_target = expiring_items + recently_expired_items
            total = len(all_target)
            total_pages = max(1, (total + effective_page_size - 1) // effective_page_size) if total > 0 else 1
            start = (page - 1) * effective_page_size
            paged = all_target[start:start + effective_page_size]
            paged_expiring = [x for x in paged if x.category == "EXPIRING"]
            paged_expired = [x for x in paged if x.category == "EXPIRED"]

        return RenewalsSummaryResponse(
            as_of_date=today,
            expiring=paged_expiring,
            recently_expired=paged_expired,
            counts=counts,
            total=total,
            total_pages=total_pages,
            page=page,
            page_size=effective_page_size,
        )

    total = len(expiring_items) + len(recently_expired_items)
    return RenewalsSummaryResponse(
        as_of_date=today,
        expiring=expiring_items,
        recently_expired=recently_expired_items,
        counts=counts,
        total=total,
        total_pages=1,
        page=1,
        page_size=total or 20,
    )
