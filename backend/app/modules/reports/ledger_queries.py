import uuid
import zoneinfo
import calendar
from decimal import Decimal
from datetime import date, datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy import select, func, and_, or_, case, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.models import (
    PaymentAllocation, AdmissionItem, Admission, Payment, Refund, User, Subject, Teacher, Batch, TeacherEarning,
    Student, Expense, ExpenseCategory, SalaryRecord, FinancialTransaction, Enquiry, EnquiryDemoItem
)
from app.common.active_student import today_kolkata

IST_TZ = zoneinfo.ZoneInfo("Asia/Kolkata")


def _paginate_slice(
    items: List[Any],
    page: Optional[int],
    page_size: Optional[int],
    default_page_size: int = 50,
) -> Tuple[List[Any], int, int, int, int]:
    """Slice a list for pagination and return (paged_items, total, total_pages, cur_page, effective_page_size)."""
    total = len(items)
    if page is not None:
        effective_page_size = page_size or default_page_size
        total_pages = max(1, (total + effective_page_size - 1) // effective_page_size) if total > 0 else 1
        start = (page - 1) * effective_page_size
        return items[start:start + effective_page_size], total, total_pages, page, effective_page_size
    effective_page_size = total or default_page_size
    return items, total, 1, 1, effective_page_size

def ist_day_boundaries(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None
) -> Tuple[Optional[datetime], Optional[datetime]]:
    """
    Converts from_date and to_date to IST datetime boundaries (start inclusive, end exclusive).
    Ensures date range filters adhere strictly to IST day boundaries.
    """
    start_dt = None
    end_dt = None
    if from_date:
        start_dt = datetime(from_date.year, from_date.month, from_date.day, 0, 0, 0, tzinfo=IST_TZ)
    if to_date:
        next_d = to_date + timedelta(days=1)
        end_dt = datetime(next_d.year, next_d.month, next_d.day, 0, 0, 0, tzinfo=IST_TZ)
    return start_dt, end_dt


def get_effective_date_col():
    """SQL expression returning the effective transaction date of an allocation."""
    return case(
        (PaymentAllocation.refund_id.isnot(None), Refund.refund_date),
        (PaymentAllocation.kind == "REVERSAL", PaymentAllocation.created_at),
        else_=func.coalesce(Payment.payment_date, PaymentAllocation.created_at)
    )


def build_date_conditions(from_date: Optional[date] = None, to_date: Optional[date] = None) -> List[Any]:
    start_dt, end_dt = ist_day_boundaries(from_date, to_date)
    eff_date = get_effective_date_col()
    conds = []
    if start_dt:
        conds.append(eff_date >= start_dt)
    if end_dt:
        conds.append(eff_date < end_dt)
    return conds


async def get_subject_revenue_from_ledger(
    db: AsyncSession,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    subject_id: Optional[uuid.UUID] = None
) -> Dict[uuid.UUID, Decimal]:
    """
    Returns net revenue collected per subject strictly from PaymentAllocation rows
    (payments positive, reversals/refunds negative) within IST day boundaries.
    """
    date_conds = build_date_conditions(from_date, to_date)
    
    stmt = (
        select(
            AdmissionItem.subject_id,
            func.coalesce(func.sum(PaymentAllocation.allocated_amount), Decimal("0.00"))
        )
        .join(AdmissionItem, PaymentAllocation.admission_item_id == AdmissionItem.id)
        .outerjoin(Payment, PaymentAllocation.payment_id == Payment.id)
        .outerjoin(Refund, PaymentAllocation.refund_id == Refund.id)
    )
    if date_conds:
        stmt = stmt.where(and_(*date_conds))
    stmt = stmt.group_by(AdmissionItem.subject_id)
    if subject_id:
        stmt = stmt.where(AdmissionItem.subject_id == subject_id)

    res = await db.execute(stmt)
    return {row[0]: Decimal(str(row[1])) for row in res.all() if row[0] is not None}


async def get_teacher_revenue_from_ledger(
    db: AsyncSession,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    teacher_id: Optional[uuid.UUID] = None
) -> Dict[uuid.UUID, Decimal]:
    """
    Returns net revenue collected per teacher strictly from PaymentAllocation rows
    within IST day boundaries.
    """
    date_conds = build_date_conditions(from_date, to_date)

    stmt = (
        select(
            AdmissionItem.teacher_id,
            func.coalesce(func.sum(PaymentAllocation.allocated_amount), Decimal("0.00"))
        )
        .join(AdmissionItem, PaymentAllocation.admission_item_id == AdmissionItem.id)
        .outerjoin(Payment, PaymentAllocation.payment_id == Payment.id)
        .outerjoin(Refund, PaymentAllocation.refund_id == Refund.id)
    )
    if date_conds:
        stmt = stmt.where(and_(*date_conds))
    stmt = stmt.group_by(AdmissionItem.teacher_id)
    if teacher_id:
        stmt = stmt.where(AdmissionItem.teacher_id == teacher_id)

    res = await db.execute(stmt)
    return {row[0]: Decimal(str(row[1])) for row in res.all() if row[0] is not None}


async def get_batch_revenue_from_ledger(
    db: AsyncSession,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    batch_id: Optional[uuid.UUID] = None
) -> Dict[uuid.UUID, Decimal]:
    """
    Returns net revenue collected per batch strictly from PaymentAllocation rows
    within IST day boundaries.
    """
    date_conds = build_date_conditions(from_date, to_date)

    stmt = (
        select(
            AdmissionItem.batch_id,
            func.coalesce(func.sum(PaymentAllocation.allocated_amount), Decimal("0.00"))
        )
        .join(AdmissionItem, PaymentAllocation.admission_item_id == AdmissionItem.id)
        .outerjoin(Payment, PaymentAllocation.payment_id == Payment.id)
        .outerjoin(Refund, PaymentAllocation.refund_id == Refund.id)
    )
    if date_conds:
        stmt = stmt.where(and_(*date_conds))
    stmt = stmt.group_by(AdmissionItem.batch_id)
    if batch_id:
        stmt = stmt.where(AdmissionItem.batch_id == batch_id)

    res = await db.execute(stmt)
    return {row[0]: Decimal(str(row[1])) for row in res.all() if row[0] is not None}


async def get_item_allocated_collected_map(
    db: AsyncSession,
    item_ids: List[uuid.UUID],
    from_date: Optional[date] = None,
    to_date: Optional[date] = None
) -> Dict[uuid.UUID, Decimal]:
    """
    Returns net allocated amount for a list of admission item IDs, optionally filtered by date.
    """
    if not item_ids:
        return {}

    date_conds = build_date_conditions(from_date, to_date)

    where_conds = [PaymentAllocation.admission_item_id.in_(item_ids)]
    if date_conds:
        where_conds.extend(date_conds)

    stmt = (
        select(
            PaymentAllocation.admission_item_id,
            func.coalesce(func.sum(PaymentAllocation.allocated_amount), Decimal("0.00"))
        )
        .outerjoin(Payment, PaymentAllocation.payment_id == Payment.id)
        .outerjoin(Refund, PaymentAllocation.refund_id == Refund.id)
        .where(and_(*where_conds))
        .group_by(PaymentAllocation.admission_item_id)
    )
    res = await db.execute(stmt)
    return {row[0]: Decimal(str(row[1])) for row in res.all()}


async def get_total_ledger_revenue(
    db: AsyncSession,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None
) -> Decimal:
    """
    Returns the grand total of all PaymentAllocation rows in the specified date range.
    Reconciles exactly with sum(payments) - sum(refunds).
    """
    date_conds = build_date_conditions(from_date, to_date)

    stmt = (
        select(func.coalesce(func.sum(PaymentAllocation.allocated_amount), Decimal("0.00")))
        .outerjoin(Payment, PaymentAllocation.payment_id == Payment.id)
        .outerjoin(Refund, PaymentAllocation.refund_id == Refund.id)
        .where(and_(*date_conds))
    )
    res = await db.execute(stmt)
    return Decimal(str(res.scalar_one()))


async def get_collections_by_mode(
    db: AsyncSession,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None
) -> List[Dict[str, Any]]:
    """
    Aggregates collections and refunds grouped by payment mode in IST day boundaries.
    """
    start_dt, end_dt = ist_day_boundaries(from_date, to_date)

    # Payments by mode
    p_conds = []
    if start_dt:
        p_conds.append(Payment.payment_date >= start_dt)
    if end_dt:
        p_conds.append(Payment.payment_date < end_dt)

    p_stmt = (
        select(
            Payment.payment_mode,
            func.count(Payment.id),
            func.coalesce(func.sum(Payment.amount), Decimal("0.00"))
        )
        .where(*p_conds)
        .group_by(Payment.payment_mode)
    )
    p_rows = (await db.execute(p_stmt)).all()

    # Refunds by mode
    r_conds = []
    if start_dt:
        r_conds.append(Refund.refund_date >= start_dt)
    if end_dt:
        r_conds.append(Refund.refund_date < end_dt)

    r_stmt = (
        select(
            Refund.refund_mode,
            func.count(Refund.id),
            func.coalesce(func.sum(Refund.amount), Decimal("0.00"))
        )
        .where(*r_conds)
        .group_by(Refund.refund_mode)
    )
    r_rows = (await db.execute(r_stmt)).all()

    modes_map: Dict[str, Dict[str, Any]] = {}
    for mode, count, amt in p_rows:
        m_key = mode.upper() if mode else "OTHER"
        modes_map[m_key] = {
            "mode": m_key,
            "payment_count": int(count),
            "gross_collected": Decimal(str(amt)),
            "refund_count": 0,
            "total_refunded": Decimal("0.00"),
            "net_collected": Decimal(str(amt))
        }

    for mode, count, amt in r_rows:
        m_key = mode.upper() if mode else "OTHER"
        if m_key not in modes_map:
            modes_map[m_key] = {
                "mode": m_key,
                "payment_count": 0,
                "gross_collected": Decimal("0.00"),
                "refund_count": int(count),
                "total_refunded": Decimal(str(amt)),
                "net_collected": -Decimal(str(amt))
            }
        else:
            modes_map[m_key]["refund_count"] = int(count)
            modes_map[m_key]["total_refunded"] = Decimal(str(amt))
            modes_map[m_key]["net_collected"] = modes_map[m_key]["gross_collected"] - Decimal(str(amt))

    # Standard sorting order
    all_modes = ["CASH", "UPI", "BANK_TRANSFER", "CARD", "CHEQUE", "OTHER"]
    sorted_modes = sorted(
        modes_map.values(),
        key=lambda x: all_modes.index(x["mode"]) if x["mode"] in all_modes else 99
    )
    return sorted_modes


async def get_collections_by_cashier(
    db: AsyncSession,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None
) -> List[Dict[str, Any]]:
    """
    Aggregates collections and refunds grouped by cashier / staff user in IST day boundaries.
    """
    start_dt, end_dt = ist_day_boundaries(from_date, to_date)

    p_conds = []
    if start_dt:
        p_conds.append(Payment.payment_date >= start_dt)
    if end_dt:
        p_conds.append(Payment.payment_date < end_dt)

    p_stmt = (
        select(
            Payment.collected_by,
            User.employee_id,
            User.full_name,
            func.count(Payment.id),
            func.coalesce(func.sum(Payment.amount), Decimal("0.00"))
        )
        .outerjoin(User, Payment.collected_by == User.id)
    )
    if p_conds:
        p_stmt = p_stmt.where(and_(*p_conds))
    p_stmt = p_stmt.group_by(Payment.collected_by, User.employee_id, User.full_name)
    p_rows = (await db.execute(p_stmt)).all()

    r_conds = []
    if start_dt:
        r_conds.append(Refund.refund_date >= start_dt)
    if end_dt:
        r_conds.append(Refund.refund_date < end_dt)

    r_stmt = (
        select(
            Refund.processed_by,
            func.count(Refund.id),
            func.coalesce(func.sum(Refund.amount), Decimal("0.00"))
        )
    )
    if r_conds:
        r_stmt = r_stmt.where(and_(*r_conds))
    r_stmt = r_stmt.group_by(Refund.processed_by)
    r_rows = (await db.execute(r_stmt)).all()
    r_map = {row[0]: (int(row[1]), Decimal(str(row[2]))) for row in r_rows}

    results = []
    for uid, emp_id, fname, p_count, p_amt in p_rows:
        ref_count, ref_amt = r_map.get(uid, (0, Decimal("0.00")))
        results.append({
            "user_id": str(uid) if uid else None,
            "username": emp_id or "Unknown",
            "cashier_name": fname or emp_id or "Staff",
            "payment_count": int(p_count),
            "gross_collected": Decimal(str(p_amt)),
            "refund_count": ref_count,
            "total_refunded": ref_amt,
            "net_collected": Decimal(str(p_amt)) - ref_amt
        })
    results.sort(key=lambda x: x["net_collected"], reverse=True)
    return results


async def get_teacher_payable_summary(
    db: AsyncSession,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    teacher_id: Optional[uuid.UUID] = None
) -> List[Dict[str, Any]]:
    """
    Returns payable status for teachers:
    earned, reversed, net_earned, paid, payable = earned - reversed - paid.
    Optionally filtered by IST day boundaries or specific teacher.
    """
    start_dt, end_dt = ist_day_boundaries(from_date, to_date)
    date_conds = []
    if start_dt:
        date_conds.append(TeacherEarning.earning_date >= start_dt)
    if end_dt:
        date_conds.append(TeacherEarning.earning_date < end_dt)

    # 1. Fetch teachers
    t_query = select(Teacher).order_by(Teacher.name.asc())
    if teacher_id:
        t_query = t_query.where(Teacher.id == teacher_id)
    t_rows = (await db.execute(t_query)).scalars().all()

    # 2. Aggregations from teacher_earnings
    stmt = (
        select(
            TeacherEarning.teacher_id,
            func.coalesce(func.sum(case((TeacherEarning.earning_type == "EARNED", TeacherEarning.amount), else_=Decimal("0.00"))), Decimal("0.00")),
            func.coalesce(func.sum(case((TeacherEarning.earning_type == "REVERSAL", TeacherEarning.amount), else_=Decimal("0.00"))), Decimal("0.00")),
            func.coalesce(func.sum(case((TeacherEarning.earning_type == "PAYOUT", TeacherEarning.amount), else_=Decimal("0.00"))), Decimal("0.00"))
        )
        .where(and_(*date_conds))
        .group_by(TeacherEarning.teacher_id)
    )
    if teacher_id:
        stmt = stmt.where(TeacherEarning.teacher_id == teacher_id)
    res = await db.execute(stmt)
    earnings_map = {
        row[0]: {
            "earned": Decimal(str(row[1])),
            "reversed": Decimal(str(row[2])),
            "paid": Decimal(str(row[3]))
        }
        for row in res.all()
    }

    report = []
    for t in t_rows:
        data = earnings_map.get(t.id, {"earned": Decimal("0.00"), "reversed": Decimal("0.00"), "paid": Decimal("0.00")})
        earned = data["earned"]
        reversed_amt = data["reversed"]
        paid = data["paid"]
        net_earned = earned - reversed_amt
        payable = earned - reversed_amt - paid
        report.append({
            "teacher_id": str(t.id),
            "teacher_code": t.teacher_code,
            "teacher_name": t.name,
            "share_type": t.share_type,
            "share_value": Decimal(str(t.share_value)),
            "total_earned": earned,
            "total_reversed": reversed_amt,
            "net_earned": net_earned,
            "total_paid": paid,
            "payable": payable,
            "status": t.status
        })

    return report


async def get_dues_by_subject(
    db: AsyncSession,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None
) -> List[Dict[str, Any]]:
    """
    Returns subject-wise dues and receivables report:
    enrolled_count, total_booked, total_collected (from ledger), total_balance_due, total_written_off.
    """
    subjects_res = await db.execute(select(Subject).order_by(Subject.name.asc()))
    subjects = subjects_res.scalars().all()

    ledger_collected_map = await get_subject_revenue_from_ledger(db, from_date, to_date)

    start_dt, end_dt = ist_day_boundaries(from_date, to_date)
    item_date_conds = []
    if from_date:
        item_date_conds.append(AdmissionItem.valid_from >= from_date)
    if to_date:
        item_date_conds.append(AdmissionItem.valid_to <= to_date)

    report = []
    for s in subjects:
        where_conds = [
            AdmissionItem.subject_id == s.id,
            Admission.status != "CANCELLED",
            *item_date_conds
        ]
        stmt = (
            select(
                func.count(AdmissionItem.id),
                func.coalesce(func.sum(AdmissionItem.net_price), Decimal("0.00")),
                func.coalesce(func.sum(AdmissionItem.balance_due), Decimal("0.00")),
                func.coalesce(func.sum(AdmissionItem.written_off_amount), Decimal("0.00"))
            )
            .join(Admission, AdmissionItem.admission_id == Admission.id)
            .where(and_(*where_conds))
        )
        res = await db.execute(stmt)
        count, booked, balance_due, written_off = res.one()

        collected = ledger_collected_map.get(s.id, Decimal("0.00"))

        report.append({
            "subject_id": str(s.id),
            "subject_code": s.subject_code,
            "subject_name": s.name,
            "enrolled_count": int(count or 0),
            "total_booked": Decimal(str(booked)),
            "total_collected": collected,
            "total_balance_due": Decimal(str(balance_due)),
            "total_written_off": Decimal(str(written_off))
        })

    return report


def resolve_enquiry_source(enq: Enquiry) -> str:
    s = getattr(enq, "source", None)
    if s and str(s).strip():
        return str(s).strip()
    txt = f"{enq.purpose or ''} {enq.notes or ''} {enq.school_college or ''}".lower()
    if "referral" in txt or "friend" in txt or "relative" in txt:
        return "Referral"
    if "school" in txt or "college" in txt or enq.school_college:
        return "School Visit"
    if "social" in txt or "instagram" in txt or "facebook" in txt or "online" in txt or "web" in txt:
        return "Social Media / Digital"
    if "phone" in txt or "tele" in txt or "call" in txt:
        return "Phone Enquiry"
    if "demo" in txt:
        return "Demo Pass"
    return "Direct Walk-in"


async def get_dues_and_ageing(
    db: AsyncSession,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    subject_id: Optional[uuid.UUID] = None,
    batch_id: Optional[uuid.UUID] = None,
    ageing_bucket: Optional[str] = None,
    search: Optional[str] = None,
    limit: Optional[int] = 500,
    page: Optional[int] = None,
    page_size: Optional[int] = None
) -> Dict[str, Any]:
    """
    Dues & Ageing Report:
    Outstanding dues by student, subject and batch, with ageing buckets:
    0-30 days, 31-60 days, 61-90 days, 90+ days.
    """
    today = today_kolkata()
    start_col = func.coalesce(AdmissionItem.valid_from, Admission.valid_from, Admission.admission_date)

    conds = [
        func.coalesce(AdmissionItem.balance_due, Decimal("0.00")) > Decimal("0.00"),
        Admission.status != "CANCELLED",
        Admission.document_status == "VALID"
    ]
    if from_date:
        conds.append(start_col >= from_date)
    if to_date:
        conds.append(start_col <= to_date)
    if subject_id:
        conds.append(AdmissionItem.subject_id == subject_id)
    if batch_id:
        conds.append(AdmissionItem.batch_id == batch_id)

    stmt = (
        select(
            AdmissionItem,
            Admission,
            Student,
            Subject,
            Batch,
            Teacher,
            func.coalesce(AdmissionItem.net_price, Decimal("0.00")).label("coalesced_net_price"),
            func.coalesce(AdmissionItem.amount_collected, Decimal("0.00")).label("coalesced_amount_collected"),
            func.coalesce(AdmissionItem.balance_due, Decimal("0.00")).label("coalesced_balance_due"),
            func.coalesce(AdmissionItem.written_off_amount, Decimal("0.00")).label("coalesced_written_off_amount"),
        )
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .join(Student, Admission.student_id == Student.id)
        .outerjoin(Subject, AdmissionItem.subject_id == Subject.id)
        .outerjoin(Batch, AdmissionItem.batch_id == Batch.id)
        .outerjoin(Teacher, AdmissionItem.teacher_id == Teacher.id)
        .where(*conds)
        .order_by(start_col.desc(), Student.name.asc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    bucket_counts = {"0-30": 0, "31-60": 0, "61-90": 0, "90+": 0}
    bucket_amounts = {"0-30": Decimal("0.00"), "31-60": Decimal("0.00"), "61-90": Decimal("0.00"), "90+": Decimal("0.00")}
    unique_students = set()
    total_due = Decimal("0.00")

    all_items = []
    for itm, adm, stu, sub, bch, tch, net_price_val, amount_collected_val, balance_due_val, written_off_val in rows:
        ref_d = itm.valid_from or adm.valid_from or adm.admission_date
        age_days = (today - ref_d).days if ref_d else 0
        if age_days < 0:
            age_days = 0

        if age_days <= 30:
            b_key = "0-30"
        elif age_days <= 60:
            b_key = "31-60"
        elif age_days <= 90:
            b_key = "61-90"
        else:
            b_key = "90+"

        due_val = balance_due_val if balance_due_val is not None else Decimal("0.00")
        bucket_counts[b_key] += 1
        bucket_amounts[b_key] += due_val
        total_due += due_val
        unique_students.add(stu.id)

        all_items.append({
            "item_id": str(itm.id),
            "admission_id": str(adm.id),
            "admission_number": adm.admission_number,
            "admission_date": str(adm.admission_date),
            "valid_from": str(itm.valid_from) if itm.valid_from else (str(adm.valid_from) if adm.valid_from else None),
            "valid_to": str(itm.valid_to) if itm.valid_to else (str(adm.valid_to) if adm.valid_to else None),
            "student_id": str(stu.id),
            "student_name": stu.name,
            "student_code": stu.student_code,
            "mobile": stu.mobile or "",
            "father_name": stu.father_name or "",
            "subject_id": str(sub.id) if sub else (str(itm.subject_id) if itm.subject_id else None),
            "subject_name": sub.name if sub else (itm.item_name_snapshot or "Subject"),
            "subject_code": sub.subject_code if sub else "",
            "batch_id": str(bch.id) if bch else (str(itm.batch_id) if itm.batch_id else None),
            "batch_name": bch.name if bch else (itm.item_name_snapshot or "Direct Subject"),
            "teacher_name": itm.teacher_name_snapshot or (tch.name if tch else (bch.teacher_name_snapshot if bch else "Faculty")),
            "net_price": float(net_price_val if net_price_val is not None else Decimal("0.00")),
            "amount_collected": float(amount_collected_val if amount_collected_val is not None else Decimal("0.00")),
            "balance_due": float(due_val),
            "written_off_amount": float(written_off_val if written_off_val is not None else Decimal("0.00")),
            "age_days": age_days,
            "ageing_bucket": b_key
        })

    filtered_items = all_items
    if ageing_bucket and ageing_bucket.upper() != "ALL":
        filtered_items = [i for i in filtered_items if i["ageing_bucket"] == ageing_bucket]
    if search and search.strip():
        q = search.strip().lower()
        filtered_items = [
            i for i in filtered_items
            if q in i["student_name"].lower()
            or q in i["student_code"].lower()
            or q in i["mobile"].lower()
            or q in i["admission_number"].lower()
            or q in i["subject_name"].lower()
            or q in i["batch_name"].lower()
        ]

    total = len(filtered_items)
    if page is not None:
        effective_page_size = page_size or 15
        total_pages = max(1, (total + effective_page_size - 1) // effective_page_size) if total > 0 else 1
        start = (page - 1) * effective_page_size
        paged_items = filtered_items[start:start + effective_page_size]
        cur_page = page
    else:
        effective_page_size = limit or len(filtered_items) or 15
        total_pages = 1
        paged_items = filtered_items[:limit] if limit else filtered_items
        cur_page = 1

    return {
        "summary": {
            "total_due": float(total_due),
            "total_students": len(unique_students),
            "total_records": len(all_items),
            "total_matching": total,
            "buckets": {
                "0-30": {"count": bucket_counts["0-30"], "amount": float(bucket_amounts["0-30"])},
                "31-60": {"count": bucket_counts["31-60"], "amount": float(bucket_amounts["31-60"])},
                "61-90": {"count": bucket_counts["61-90"], "amount": float(bucket_amounts["61-90"])},
                "90+": {"count": bucket_counts["90+"], "amount": float(bucket_amounts["90+"])}
            }
        },
        "total": total,
        "total_pages": total_pages,
        "page": cur_page,
        "page_size": effective_page_size,
        "items": paged_items
    }


async def get_collections_detailed(
    db: AsyncSession,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    payment_mode: Optional[str] = None,
    cashier_id: Optional[uuid.UUID] = None,
    search: Optional[str] = None,
    limit: Optional[int] = 500,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
    cashier_page: Optional[int] = None,
    cashier_page_size: Optional[int] = None,
    mode_page: Optional[int] = None,
    mode_page_size: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Collections Report:
    Total collected by date range, broken down by payment mode and cashier,
    with full transaction list from ledger.
    """
    start_dt, end_dt = ist_day_boundaries(from_date, to_date)
    by_mode = await get_collections_by_mode(db, from_date, to_date)
    by_cashier = await get_collections_by_cashier(db, from_date, to_date)

    conds = []
    if start_dt:
        conds.append(Payment.payment_date >= start_dt)
    if end_dt:
        conds.append(Payment.payment_date < end_dt)
    if payment_mode and payment_mode.upper() != "ALL":
        conds.append(Payment.payment_mode == payment_mode.upper())
    if cashier_id:
        conds.append(Payment.collected_by == cashier_id)

    if search and search.strip():
        pattern = f"%{search.strip()}%"
        cashier_expr = func.coalesce(User.full_name, Payment.collector_name_snapshot, "Staff")
        conds.append(
            or_(
                Payment.payment_number.ilike(pattern),
                Student.name.ilike(pattern),
                Student.student_code.ilike(pattern),
                func.coalesce(Student.mobile, "").ilike(pattern),
                Admission.admission_number.ilike(pattern),
                cashier_expr.ilike(pattern),
                func.coalesce(Payment.transaction_reference, "").ilike(pattern),
            )
        )

    stmt = (
        select(Payment, Student, Admission, User)
        .join(Student, Payment.student_id == Student.id)
        .join(Admission, Payment.admission_id == Admission.id)
        .outerjoin(User, Payment.collected_by == User.id)
        .where(*conds)
        .order_by(Payment.payment_date.desc())
    )

    if page is not None:
        effective_page_size = page_size or 15
        count_stmt = (
            select(func.count(Payment.id))
            .join(Student, Payment.student_id == Student.id)
            .join(Admission, Payment.admission_id == Admission.id)
            .outerjoin(User, Payment.collected_by == User.id)
            .where(*conds)
        )
        total = int((await db.execute(count_stmt)).scalar_one() or 0)
        total_pages = max(1, (total + effective_page_size - 1) // effective_page_size) if total > 0 else 1
        cur_page = page
        stmt = stmt.offset((page - 1) * effective_page_size).limit(effective_page_size)
        rows = (await db.execute(stmt)).all()
    else:
        if limit:
            stmt = stmt.limit(limit)
        rows = (await db.execute(stmt)).all()
        total = len(rows)
        effective_page_size = limit or total or 15
        total_pages = 1
        cur_page = 1

    paged_txns = []
    for p, stu, adm, usr in rows:
        c_name = usr.full_name if usr else (p.collector_name_snapshot or "Staff")
        paged_txns.append({
            "id": str(p.id),
            "payment_number": p.payment_number,
            "payment_date": p.payment_date.isoformat() if p.payment_date else None,
            "amount": float(p.amount or Decimal("0.00")),
            "payment_mode": p.payment_mode,
            "transaction_reference": p.transaction_reference or "",
            "cashier_id": str(p.collected_by) if p.collected_by else None,
            "cashier_name": c_name,
            "student_id": str(stu.id),
            "student_name": stu.name,
            "student_code": stu.student_code,
            "mobile": stu.mobile or "",
            "admission_id": str(adm.id),
            "admission_number": adm.admission_number,
            "fee_period": p.fee_period or "",
            "notes": p.notes or ""
        })

    gross = sum((m["gross_collected"] for m in by_mode), Decimal("0.00"))
    ref = sum((m["total_refunded"] for m in by_mode), Decimal("0.00"))
    net = gross - ref
    p_count = sum((m["payment_count"] for m in by_mode), 0)

    cashier_options = [
        {
            "user_id": c["user_id"],
            "cashier_name": c["cashier_name"],
            "username": c["username"],
        }
        for c in by_cashier
    ]
    paged_cashiers, c_total, c_total_pages, c_cur_page, c_page_size = _paginate_slice(
        by_cashier, cashier_page, cashier_page_size
    )
    paged_modes, m_total, m_total_pages, m_cur_page, m_page_size = _paginate_slice(
        by_mode, mode_page, mode_page_size
    )

    return {
        "summary": {
            "gross_collected": float(gross),
            "total_refunded": float(ref),
            "net_collected": float(net),
            "payment_count": p_count,
            "total_matching": total,
            "filtered_transactions_count": len(paged_txns)
        },
        "by_mode": [
            {
                "mode": m["mode"],
                "payment_count": m["payment_count"],
                "gross_collected": float(m["gross_collected"]),
                "refund_count": m["refund_count"],
                "total_refunded": float(m["total_refunded"]),
                "net_collected": float(m["net_collected"])
            }
            for m in paged_modes
        ],
        "mode_total": m_total,
        "mode_total_pages": m_total_pages,
        "mode_page": m_cur_page,
        "mode_page_size": m_page_size,
        "by_cashier": [
            {
                "user_id": c["user_id"],
                "cashier_name": c["cashier_name"],
                "username": c["username"],
                "payment_count": c["payment_count"],
                "gross_collected": float(c["gross_collected"]),
                "refund_count": c["refund_count"],
                "total_refunded": float(c["total_refunded"]),
                "net_collected": float(c["net_collected"])
            }
            for c in paged_cashiers
        ],
        "cashier_options": cashier_options,
        "cashier_total": c_total,
        "cashier_total_pages": c_total_pages,
        "cashier_page": c_cur_page,
        "cashier_page_size": c_page_size,
        "total": total,
        "total_pages": total_pages,
        "page": cur_page,
        "page_size": effective_page_size,
        "transactions": paged_txns
    }


async def get_waivers_detailed(
    db: AsyncSession,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    admin_id: Optional[uuid.UUID] = None,
    search: Optional[str] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None
) -> Dict[str, Any]:
    """
    Waivers Report:
    All waived dues with authorizing admin, reason and audit reference.
    """
    start_dt, end_dt = ist_day_boundaries(from_date, to_date)
    conds = [FinancialTransaction.txn_type == "WAIVER"]
    if start_dt:
        conds.append(FinancialTransaction.txn_at >= start_dt)
    if end_dt:
        conds.append(FinancialTransaction.txn_at < end_dt)
    if admin_id:
        conds.append(FinancialTransaction.created_by == admin_id)

    stmt = (
        select(FinancialTransaction, Student, Admission, User)
        .join(Student, FinancialTransaction.student_id == Student.id)
        .join(Admission, FinancialTransaction.admission_id == Admission.id)
        .outerjoin(User, FinancialTransaction.created_by == User.id)
        .where(*conds)
        .order_by(FinancialTransaction.txn_at.desc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    waivers = []
    seen_ids = set()
    seen_txn_numbers = set()
    total_amount = Decimal("0.00")
    unique_students = set()

    for tx, stu, adm, usr in rows:
        tx_id_str = str(tx.id)
        txn_number = tx.txn_number or f"TXN-{tx_id_str[:8]}"

        # Deduplicate waiver records if multiple join matches or duplicate transactions exist
        if tx_id_str in seen_ids or txn_number in seen_txn_numbers:
            continue
        seen_ids.add(tx_id_str)
        seen_txn_numbers.add(txn_number)

        amt = abs(tx.signed_amount) if tx.signed_amount is not None else Decimal("0.00")
        try:
            amt_num = float(amt)
        except (ValueError, TypeError):
            amt_num = 0.0

        total_amount += amt
        unique_students.add(stu.id)
        admin_name = usr.full_name if usr else (getattr(usr, "username", None) or "System Administrator")

        waivers.append({
            "id": tx_id_str,
            "waiver_number": txn_number,
            "date": tx.txn_at.isoformat() if tx.txn_at else None,
            "student_id": str(stu.id),
            "student_name": stu.name or "",
            "student_code": stu.student_code or "",
            "mobile": stu.mobile or "",
            "admission_id": str(adm.id),
            "admission_number": adm.admission_number or "",
            "waived_amount": amt_num,
            "amount": amt_num,
            "admin_id": str(tx.created_by) if tx.created_by else None,
            "admin_name": admin_name,
            "admin_role": usr.role if usr else "ADMIN",
            "reason": tx.reason or "Fee due waived by admin",
            "audit_reference": txn_number
        })

    if search and search.strip():
        q = search.strip().lower()
        waivers = [
            w for w in waivers
            if q in w["waiver_number"].lower()
            or q in w["student_name"].lower()
            or q in w["student_code"].lower()
            or q in w["mobile"].lower()
            or q in w["admission_number"].lower()
            or q in w["admin_name"].lower()
            or q in w["reason"].lower()
        ]
        total_amount = sum((Decimal(str(w["waived_amount"])) for w in waivers), Decimal("0.00"))
        unique_students = {w["student_id"] for w in waivers}

    total = len(waivers)
    if page is not None:
        effective_page_size = page_size or 15
        total_pages = max(1, (total + effective_page_size - 1) // effective_page_size) if total > 0 else 1
        start = (page - 1) * effective_page_size
        paged_waivers = waivers[start:start + effective_page_size]
        cur_page = page
    else:
        effective_page_size = len(waivers) or 15
        total_pages = 1
        paged_waivers = waivers
        cur_page = 1

    return {
        "summary": {
            "total_waived_amount": float(total_amount),
            "total_amount": float(total_amount),
            "waivers_count": total,
            "count": total,
            "unique_students_count": len(unique_students)
        },
        "total": total,
        "total_pages": total_pages,
        "page": cur_page,
        "page_size": effective_page_size,
        "items": paged_waivers
    }


async def get_refunds_detailed(
    db: AsyncSession,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    refund_mode: Optional[str] = None,
    search: Optional[str] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None
) -> Dict[str, Any]:
    """
    Refunds Report:
    All refunded fees with deductions, mode, reason, cashier and student info.
    """
    start_dt, end_dt = ist_day_boundaries(from_date, to_date)
    conds = []
    if start_dt:
        conds.append(Refund.refund_date >= start_dt)
    if end_dt:
        conds.append(Refund.refund_date < end_dt)
    if refund_mode and refund_mode.upper() != "ALL":
        conds.append(Refund.refund_mode == refund_mode.upper())

    stmt = (
        select(Refund, Student, Admission, User, Payment)
        .join(Student, Refund.student_id == Student.id)
        .join(Admission, Refund.admission_id == Admission.id)
        .outerjoin(User, Refund.processed_by == User.id)
        .outerjoin(Payment, Refund.payment_id == Payment.id)
        .where(*conds)
        .order_by(Refund.refund_date.desc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    total_net = Decimal("0.00")
    total_gross = Decimal("0.00")
    total_ded = Decimal("0.00")

    items = []
    for rf, stu, adm, usr, pay in rows:
        net_amt = rf.amount or Decimal("0.00")
        gross_amt = rf.refund_amount_requested or net_amt
        ded_amt = rf.deduction_amount or Decimal("0.00")
        total_net += net_amt
        total_gross += gross_amt
        total_ded += ded_amt

        proc_name = usr.full_name if usr else (rf.processor_name_snapshot or "Administrator")
        items.append({
            "id": str(rf.id),
            "refund_number": rf.refund_number,
            "refund_date": rf.refund_date.isoformat() if rf.refund_date else None,
            "student_id": str(stu.id),
            "student_name": stu.name,
            "student_code": stu.student_code,
            "mobile": stu.mobile or "",
            "admission_id": str(adm.id),
            "admission_number": adm.admission_number,
            "payment_number": pay.payment_number if pay else None,
            "amount": float(net_amt),
            "refund_amount_requested": float(gross_amt),
            "deduction_amount": float(ded_amt),
            "deduction_reason": rf.deduction_reason or "",
            "refund_mode": rf.refund_mode,
            "reason": rf.reason or "",
            "processor_id": str(rf.processed_by) if rf.processed_by else None,
            "processor_name": proc_name,
            "notes": rf.notes or ""
        })

    if search and search.strip():
        q = search.strip().lower()
        items = [
            r for r in items
            if q in r["refund_number"].lower()
            or q in r["student_name"].lower()
            or q in r["student_code"].lower()
            or q in r["mobile"].lower()
            or q in r["admission_number"].lower()
            or q in r["reason"].lower()
            or q in r["processor_name"].lower()
        ]

    total = len(items)
    if page is not None:
        effective_page_size = page_size or 15
        total_pages = max(1, (total + effective_page_size - 1) // effective_page_size) if total > 0 else 1
        start = (page - 1) * effective_page_size
        paged_items = items[start:start + effective_page_size]
        cur_page = page
    else:
        effective_page_size = len(items) or 15
        total_pages = 1
        paged_items = items
        cur_page = 1

    return {
        "summary": {
            "total_refunded_amount": float(total_net),
            "gross_requested_amount": float(total_gross),
            "total_deductions_amount": float(total_ded),
            "total_refunds_count": total
        },
        "total": total,
        "total_pages": total_pages,
        "page": cur_page,
        "page_size": effective_page_size,
        "items": paged_items
    }


async def get_expenses_detailed(
    db: AsyncSession,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    category_id: Optional[uuid.UUID] = None,
    payment_mode: Optional[str] = None,
    search: Optional[str] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
    category_page: Optional[int] = None,
    category_page_size: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Expenses Report:
    Daily operating expenses and salaries disbursed by category and payment mode.
    """
    exp_conds = []
    if from_date:
        exp_conds.append(Expense.expense_date >= from_date)
    if to_date:
        exp_conds.append(Expense.expense_date <= to_date)
    if category_id:
        exp_conds.append(Expense.category_id == category_id)
    if payment_mode and payment_mode.upper() != "ALL":
        exp_conds.append(Expense.payment_mode == payment_mode.upper())

    exp_stmt = (
        select(Expense, ExpenseCategory, User)
        .join(ExpenseCategory, Expense.category_id == ExpenseCategory.id)
        .outerjoin(User, Expense.added_by == User.id)
        .where(*exp_conds)
        .order_by(Expense.expense_date.desc())
    )
    exp_rows = (await db.execute(exp_stmt)).all()

    sal_conds = [SalaryRecord.status == "PAID", SalaryRecord.paid_amount > Decimal("0.00")]
    if from_date:
        sal_conds.append(SalaryRecord.payment_date >= from_date)
    if to_date:
        sal_conds.append(SalaryRecord.payment_date <= to_date)
    if payment_mode and payment_mode.upper() != "ALL":
        sal_conds.append(SalaryRecord.payment_mode == payment_mode.upper())

    sal_rows = []
    if not category_id:
        sal_stmt = (
            select(SalaryRecord)
            .where(*sal_conds)
            .order_by(SalaryRecord.payment_date.desc())
        )
        sal_rows = (await db.execute(sal_stmt)).scalars().all()

    total_operational = Decimal("0.00")
    total_salaries = Decimal("0.00")
    by_category_map: Dict[str, Dict[str, Any]] = {}
    by_mode_map: Dict[str, Dict[str, Any]] = {}
    items = []

    for exp, cat, usr in exp_rows:
        amt = exp.amount or Decimal("0.00")
        total_operational += amt
        cat_name = cat.name if cat else "General"
        mode_name = exp.payment_mode.upper() if exp.payment_mode else "CASH"

        by_category_map.setdefault(cat_name, {"category_name": cat_name, "count": 0, "amount": Decimal("0.00")})
        by_category_map[cat_name]["count"] += 1
        by_category_map[cat_name]["amount"] += amt

        by_mode_map.setdefault(mode_name, {"mode": mode_name, "count": 0, "amount": Decimal("0.00")})
        by_mode_map[mode_name]["count"] += 1
        by_mode_map[mode_name]["amount"] += amt

        items.append({
            "id": str(exp.id),
            "type": "EXPENSE",
            "date": str(exp.expense_date),
            "title": exp.title,
            "category_name": cat_name,
            "amount": float(amt),
            "payment_mode": mode_name,
            "reference": exp.transaction_reference or "",
            "added_by_name": usr.full_name if usr else "Staff",
            "notes": exp.notes or ""
        })

    for sal in sal_rows:
        amt = sal.paid_amount or Decimal("0.00")
        total_salaries += amt
        cat_name = f"Salary ({sal.employee_type.title()})"
        mode_name = sal.payment_mode.upper() if sal.payment_mode else "BANK_TRANSFER"

        by_category_map.setdefault(cat_name, {"category_name": cat_name, "count": 0, "amount": Decimal("0.00")})
        by_category_map[cat_name]["count"] += 1
        by_category_map[cat_name]["amount"] += amt

        by_mode_map.setdefault(mode_name, {"mode": mode_name, "count": 0, "amount": Decimal("0.00")})
        by_mode_map[mode_name]["count"] += 1
        by_mode_map[mode_name]["amount"] += amt

        items.append({
            "id": str(sal.id),
            "type": "SALARY",
            "date": str(sal.payment_date or sal.due_date),
            "title": f"Salary: {sal.employee_name_snapshot} ({sal.month_year})",
            "category_name": cat_name,
            "amount": float(amt),
            "payment_mode": mode_name,
            "reference": sal.month_year,
            "added_by_name": "Payroll Administrator",
            "notes": sal.notes or ""
        })

    if search and search.strip():
        q = search.strip().lower()
        items = [
            i for i in items
            if q in i["title"].lower()
            or q in i["category_name"].lower()
            or q in i["reference"].lower()
            or q in i["payment_mode"].lower()
            or q in i["added_by_name"].lower()
        ]

    items.sort(key=lambda x: x["date"], reverse=True)

    total = len(items)
    if page is not None:
        effective_page_size = page_size or 15
        total_pages = max(1, (total + effective_page_size - 1) // effective_page_size) if total > 0 else 1
        start = (page - 1) * effective_page_size
        paged_items = items[start:start + effective_page_size]
        cur_page = page
    else:
        effective_page_size = len(items) or 15
        total_pages = 1
        paged_items = items
        cur_page = 1

    by_category_all = [
        {"category_name": c["category_name"], "count": c["count"], "amount": float(c["amount"])}
        for c in by_category_map.values()
    ]
    paged_categories, cat_total, cat_total_pages, cat_cur_page, cat_page_size = _paginate_slice(
        by_category_all, category_page, category_page_size
    )

    return {
        "summary": {
            "total_expenses": float(total_operational + total_salaries),
            "total_operational_expenses": float(total_operational),
            "total_salaries_paid": float(total_salaries),
            "expense_count": total
        },
        "by_category": paged_categories,
        "by_category_total": cat_total,
        "by_category_total_pages": cat_total_pages,
        "by_category_page": cat_cur_page,
        "by_category_page_size": cat_page_size,
        "by_mode": [
            {"mode": m["mode"], "count": m["count"], "amount": float(m["amount"])}
            for m in by_mode_map.values()
        ],
        "total": total,
        "total_pages": total_pages,
        "page": cur_page,
        "page_size": effective_page_size,
        "items": paged_items
    }


def resolve_demo_conversion_subject(
    demo_item: EnquiryDemoItem,
    adm_item: AdmissionItem,
    subject_name_map: Optional[Dict[uuid.UUID, str]] = None,
) -> Dict[str, Any]:
    """Resolves demo subject -> enrolled subject mapping for a verified converted demo."""
    smap = subject_name_map or {}
    demo_subj = (
        demo_item.subject_name_snapshot
        or (smap.get(demo_item.subject_id) if demo_item.subject_id else None)
        or "General Demo"
    ).strip()
    enrolled_subj = (
        (adm_item.subject.name if adm_item.subject and adm_item.subject.name else None)
        or (smap.get(adm_item.subject_id) if adm_item.subject_id else None)
        or adm_item.item_name_snapshot
        or "Enrolled Course"
    ).strip()
    same_subject = (
        (
            demo_item.subject_id is not None
            and adm_item.subject_id is not None
            and demo_item.subject_id == adm_item.subject_id
        )
        or (demo_subj.lower() == enrolled_subj.lower())
    )
    label = enrolled_subj if same_subject else f"{demo_subj} -> {enrolled_subj}"
    return {
        "demo_subject": demo_subj,
        "enrolled_subject": enrolled_subj,
        "subject_changed": not same_subject,
        "label": label,
    }


async def get_admissions_conversion_detailed(
    db: AsyncSession,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    subject_id: Optional[uuid.UUID] = None,
    source: Optional[str] = None,
    search: Optional[str] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
    subject_page: Optional[int] = None,
    subject_page_size: Optional[int] = None,
    teacher_page: Optional[int] = None,
    teacher_page_size: Optional[int] = None,
    source_page: Optional[int] = None,
    source_page_size: Optional[int] = None,
) -> Dict[str, Any]:
    page_size: Optional[int] = None,
    subject_page: Optional[int] = None,
    subject_page_size: Optional[int] = None,
    teacher_page: Optional[int] = None,
    teacher_page_size: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Admissions & Conversion Report:
    Enquiries received, verified enrollments via demo reference number (source_demo_number),
    demo % enrolled (demos converted / demos given * 100), by subject, by source, and by teacher.
    """
    start_dt, end_dt = ist_day_boundaries(from_date, to_date)
    conds = []
    if start_dt:
        conds.append(Enquiry.created_at >= start_dt)
    if end_dt:
        conds.append(Enquiry.created_at < end_dt)
    if subject_id:
        sub_obj = await db.get(Subject, subject_id)
        if sub_obj:
            conds.append(
                or_(
                    Enquiry.interested_subject.ilike(f"%{sub_obj.name}%"),
                    Enquiry.demo_items.any(EnquiryDemoItem.subject_id == subject_id)
                )
            )

    stmt = (
        select(Enquiry, Student)
        .outerjoin(Student, Enquiry.converted_student_id == Student.id)
        .options(selectinload(Enquiry.demo_items))
        .where(*conds)
        .order_by(Enquiry.created_at.desc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    enq_ids = list({enq.id for enq, _ in rows})
    linked_enrollments_by_enq: Dict[uuid.UUID, List[Tuple[AdmissionItem, Admission, str]]] = {}
    linked_by_demo_id: Dict[uuid.UUID, Tuple[AdmissionItem, Admission, str]] = {}
    if enq_ids:
        link_stmt = (
            select(AdmissionItem, Admission, EnquiryDemoItem)
            .join(Admission, AdmissionItem.admission_id == Admission.id)
            .join(
                EnquiryDemoItem,
                EnquiryDemoItem.converted_admission_item_id == AdmissionItem.id,
            )
            .options(selectinload(AdmissionItem.demo_item))
            .where(
                EnquiryDemoItem.enquiry_id.in_(enq_ids),
                EnquiryDemoItem.demo_reference_number.isnot(None),
                Admission.status != "CANCELLED",
                Admission.document_status == "VALID",
            )
            .order_by(Admission.admission_date.desc(), Admission.created_at.desc())
        )
        link_res = await db.execute(link_stmt)
        for adm_item, adm, demo_itm in link_res.all():
            ref_no = adm_item.source_demo_number
            if ref_no:
                linked_enrollments_by_enq.setdefault(demo_itm.enquiry_id, []).append(
                    (adm_item, adm, ref_no)
                )
                if ref_no == demo_itm.demo_reference_number:
                    linked_by_demo_id[demo_itm.id] = (adm_item, adm, ref_no)

    teacher_ids = set()
    subject_ids = set()
    for enq, _ in rows:
        for d in (enq.demo_items or []):
            if d.teacher_id:
                teacher_ids.add(d.teacher_id)
            if d.subject_id:
                subject_ids.add(d.subject_id)
    for adm_item, _, _ in linked_by_demo_id.values():
        if adm_item.subject_id:
            subject_ids.add(adm_item.subject_id)

    teacher_map: Dict[uuid.UUID, Teacher] = {}
    if teacher_ids:
        t_res = await db.execute(select(Teacher).where(Teacher.id.in_(teacher_ids)))
        teacher_map = {t.id: t for t in t_res.scalars().all()}

    subject_name_map: Dict[uuid.UUID, str] = {}
    if subject_ids:
        s_res = await db.execute(select(Subject.id, Subject.name).where(Subject.id.in_(subject_ids)))
        subject_name_map = {sid: sname for sid, sname in s_res.all()}

    by_subject_map: Dict[str, Dict[str, Any]] = {}
    by_source_map: Dict[str, Dict[str, Any]] = {}
    by_teacher_map: Dict[Tuple[str, str], Dict[str, Any]] = {}
    items = []

    total_enquiries = 0
    total_converted = 0
    total_demos_given = 0
    total_demos_converted = 0
    seen_enq = set()

    for enq, stu in rows:
        if enq.id in seen_enq:
            continue
        seen_enq.add(enq.id)

        # Count an enquiry/demo as enrolled ONLY when a valid enrollment carries its demo reference number
        enq_demo_refs = {
            d.demo_reference_number
            for d in (enq.demo_items or [])
            if d.demo_reference_number
        }
        linked_entries = [
            (adm_item, adm, ref_no)
            for adm_item, adm, ref_no in linked_enrollments_by_enq.get(enq.id, [])
            if ref_no in enq_demo_refs
        ]
        is_conv = len(linked_entries) > 0
        linked_adm = linked_entries[0][1] if linked_entries else None
        linked_stu = stu or (linked_adm.student if linked_adm else None)

        total_enquiries += 1
        if is_conv:
            total_converted += 1

        subj_name = enq.interested_subject or "General Coaching"
        src_name = resolve_enquiry_source(enq)

        by_subject_map.setdefault(subj_name, {"subject_name": subj_name, "enquiries_count": 0, "converted_count": 0})
        by_subject_map[subj_name]["enquiries_count"] += 1
        if is_conv:
            by_subject_map[subj_name]["converted_count"] += 1

        by_source_map.setdefault(src_name, {"source_name": src_name, "enquiries_count": 0, "converted_count": 0})
        by_source_map[src_name]["enquiries_count"] += 1
        if is_conv:
            by_source_map[src_name]["converted_count"] += 1

        for d in (enq.demo_items or []):
            if d.teacher_id and d.teacher_id in teacher_map:
                t_obj = teacher_map[d.teacher_id]
                t_key = ("id", str(d.teacher_id))
                t_id_val = str(d.teacher_id)
                t_name = t_obj.name
                t_code = t_obj.teacher_code
            elif d.teacher_id:
                t_key = ("id", str(d.teacher_id))
                t_id_val = str(d.teacher_id)
                t_name = (d.teacher_name_snapshot or "Unknown Teacher").strip()
                t_code = None
            elif d.teacher_name_snapshot and d.teacher_name_snapshot.strip():
                clean_tname = d.teacher_name_snapshot.strip()
                t_key = ("name", clean_tname.lower())
                t_id_val = None
                t_name = clean_tname
                t_code = None
            else:
                t_key = ("unassigned", "")
                t_id_val = None
                t_name = "Unassigned"
                t_code = None

            t_entry = by_teacher_map.setdefault(
                t_key,
                {
                    "teacher_id": t_id_val,
                    "teacher_name": t_name,
                    "teacher_code": t_code,
                    "demos_given": 0,
                    "demos_converted": 0,
                    "_subject_details": {},
                },
            )
            t_entry["demos_given"] += 1
            total_demos_given += 1

            linked_demo = linked_by_demo_id.get(d.id) if d.demo_reference_number else None
            if linked_demo:
                adm_item, _adm, _ref_no = linked_demo
                t_entry["demos_converted"] += 1
                total_demos_converted += 1

                sub_info = resolve_demo_conversion_subject(d, adm_item, subject_name_map)
                same_subject = not sub_info["subject_changed"]
                sd_key = (
                    sub_info["demo_subject"].lower(),
                    sub_info["enrolled_subject"].lower(),
                    same_subject,
                )
                if sd_key not in t_entry["_subject_details"]:
                    t_entry["_subject_details"][sd_key] = {
                        **sub_info,
                        "count": 0,
                    }
                t_entry["_subject_details"][sd_key]["count"] += 1

        items.append({
            "id": str(enq.id),
            "enquiry_code": enq.enquiry_code,
            "student_name": enq.student_name,
            "mobile": enq.mobile or "",
            "father_name": enq.father_name or "",
            "school_college": enq.school_college or "",
            "purpose": enq.purpose or "",
            "interested_subject": subj_name,
            "source": src_name,
            "status": enq.status,
            "is_converted": is_conv,
            "source_demo_number": linked_entries[0][2] if linked_entries else None,
            "converted_student_id": str(linked_stu.id) if linked_stu else (str(enq.converted_student_id) if enq.converted_student_id else None),
            "converted_student_name": linked_stu.name if linked_stu else None,
            "converted_student_code": linked_stu.student_code if linked_stu else None,
            "admission_number": linked_adm.admission_number if linked_adm else None,
            "created_at": enq.created_at.isoformat() if enq.created_at else None
        })

    filtered_items = items
    if source and source.upper() != "ALL":
        filtered_items = [i for i in filtered_items if i["source"].lower() == source.lower()]
    if search and search.strip():
        q = search.strip().lower()
        filtered_items = [
            i for i in filtered_items
            if q in i["enquiry_code"].lower()
            or q in i["student_name"].lower()
            or q in i["mobile"].lower()
            or q in i["interested_subject"].lower()
            or q in i["source"].lower()
        ]

    demo_conversion_rate = (
        round((total_demos_converted / total_demos_given * 100), 1)
        if total_demos_given > 0
        else 0.0
    )

    by_subject = []
    for s in by_subject_map.values():
        cnt = s["enquiries_count"]
        conv = s["converted_count"]
        rate = round((conv / cnt * 100), 1) if cnt > 0 else 0.0
        by_subject.append({**s, "conversion_rate_pct": rate})
    by_subject.sort(key=lambda x: x["enquiries_count"], reverse=True)

    by_source = []
    for s in by_source_map.values():
        cnt = s["enquiries_count"]
        conv = s["converted_count"]
        rate = round((conv / cnt * 100), 1) if cnt > 0 else 0.0
        by_source.append({**s, "conversion_rate_pct": rate})
    by_source.sort(key=lambda x: x["enquiries_count"], reverse=True)

    by_teacher = []
    for t in by_teacher_map.values():
        given = t["demos_given"]
        conv = t["demos_converted"]
        rate = round((conv / given * 100), 1) if given > 0 else 0.0
        enrolled_subjects = sorted(
            t["_subject_details"].values(),
            key=lambda x: (-x["count"], x["label"].lower()),
        )
        by_teacher.append({
            "teacher_id": t["teacher_id"],
            "teacher_name": t["teacher_name"],
            "teacher_code": t["teacher_code"],
            "demos_given": given,
            "demos_converted": conv,
            "conversion_rate_pct": rate,
            "enrolled_subjects": enrolled_subjects,
        })
    by_teacher.sort(key=lambda x: (-x["demos_given"], -x["demos_converted"], x["teacher_name"].lower()))

    paged_items, total, total_pages, cur_page, effective_page_size = _paginate_slice(
        filtered_items, page, page_size
    )
    paged_subjects, subj_total, subj_total_pages, subj_cur_page, subj_page_size = _paginate_slice(
        by_subject, subject_page, subject_page_size
    )
    paged_teachers, tch_total, tch_total_pages, tch_cur_page, tch_page_size = _paginate_slice(
        by_teacher, teacher_page, teacher_page_size
    )
    paged_sources, src_total, src_total_pages, src_cur_page, src_page_size = _paginate_slice(
        by_source, source_page, source_page_size
    )

    return {
        "summary": {
            "total_enquiries": total_enquiries,
            "total_converted": total_converted,
            "total_demos_given": total_demos_given,
            "total_demos_converted": total_demos_converted,
            "demo_conversion_rate": demo_conversion_rate,
            "overall_conversion_rate": demo_conversion_rate
        },
        "by_subject": paged_subjects,
        "by_subject_total": subj_total,
        "by_subject_total_pages": subj_total_pages,
        "by_subject_page": subj_cur_page,
        "by_subject_page_size": subj_page_size,
        "by_source": paged_sources,
        "by_source_total": src_total,
        "by_source_total_pages": src_total_pages,
        "by_source_page": src_cur_page,
        "by_source_page_size": src_page_size,
        "by_teacher": paged_teachers,
        "by_teacher_total": tch_total,
        "by_teacher_total_pages": tch_total_pages,
        "by_teacher_page": tch_cur_page,
        "by_teacher_page_size": tch_page_size,
        "total": total,
        "total_pages": total_pages,
        "page": cur_page,
        "page_size": effective_page_size,
        "items": paged_items
    }


async def get_teacher_demo_conversion(
    db: AsyncSession,
    teacher_id: uuid.UUID,
) -> Dict[str, Any]:
    """
    Teacher-specific Demo Conversion metrics credited to this teacher as the demo giver,
    verified strictly by demo reference number (AdmissionItem.source_demo_number == EnquiryDemoItem.demo_reference_number)
    on valid non-cancelled admissions, matching the Reports teacher-wise demo conversion table.
    """
    demo_stmt = (
        select(EnquiryDemoItem, Enquiry)
        .join(Enquiry, EnquiryDemoItem.enquiry_id == Enquiry.id)
        .where(EnquiryDemoItem.teacher_id == teacher_id)
        .order_by(EnquiryDemoItem.demo_start_date.desc(), EnquiryDemoItem.created_at.desc())
    )
    demo_rows = (await db.execute(demo_stmt)).all()

    demo_ids = [d.id for d, _enq in demo_rows if d.demo_reference_number]
    linked_by_demo_id: Dict[uuid.UUID, Tuple[AdmissionItem, Admission, str]] = {}
    if demo_ids:
        link_stmt = (
            select(AdmissionItem, Admission, EnquiryDemoItem)
            .join(Admission, AdmissionItem.admission_id == Admission.id)
            .join(
                EnquiryDemoItem,
                EnquiryDemoItem.converted_admission_item_id == AdmissionItem.id,
            )
            .options(
                selectinload(AdmissionItem.demo_item),
                selectinload(Admission.student),
            )
            .where(
                EnquiryDemoItem.id.in_(demo_ids),
                EnquiryDemoItem.demo_reference_number.isnot(None),
                Admission.status != "CANCELLED",
                Admission.document_status == "VALID",
            )
            .order_by(Admission.admission_date.desc(), Admission.created_at.desc())
        )
        for adm_item, adm, demo_itm in (await db.execute(link_stmt)).all():
            ref_no = adm_item.source_demo_number
            if ref_no and ref_no == demo_itm.demo_reference_number:
                linked_by_demo_id[demo_itm.id] = (adm_item, adm, ref_no)

    subject_ids = set()
    for d, _enq in demo_rows:
        if d.subject_id:
            subject_ids.add(d.subject_id)
    for adm_item, _adm, _ref_no in linked_by_demo_id.values():
        if adm_item.subject_id:
            subject_ids.add(adm_item.subject_id)

    subject_name_map: Dict[uuid.UUID, str] = {}
    if subject_ids:
        s_res = await db.execute(select(Subject.id, Subject.name).where(Subject.id.in_(subject_ids)))
        subject_name_map = {sid: sname for sid, sname in s_res.all()}

    demos_given = 0
    demos_converted = 0
    subject_details_map: Dict[Tuple[str, str, bool], Dict[str, Any]] = {}
    converted_demos: List[Dict[str, Any]] = []

    for d, enq in demo_rows:
        demos_given += 1
        linked_demo = linked_by_demo_id.get(d.id) if d.demo_reference_number else None
        if not linked_demo:
            continue

        adm_item, adm, ref_no = linked_demo
        demos_converted += 1

        sub_info = resolve_demo_conversion_subject(d, adm_item, subject_name_map)
        same_subject = not sub_info["subject_changed"]
        sd_key = (
            sub_info["demo_subject"].lower(),
            sub_info["enrolled_subject"].lower(),
            same_subject,
        )
        if sd_key not in subject_details_map:
            subject_details_map[sd_key] = {
                **sub_info,
                "count": 0,
            }
        subject_details_map[sd_key]["count"] += 1

        stu = adm.student
        converted_demos.append({
            "demo_item_id": d.id,
            "enquiry_id": enq.id,
            "enquiry_code": enq.enquiry_code,
            "demo_reference_number": d.demo_reference_number,
            "source_demo_number": ref_no,
            "demo_start_date": d.demo_start_date,
            "demo_end_date": d.demo_end_date,
            "student_id": adm.student_id,
            "student_name": stu.name if stu else enq.student_name,
            "student_code": stu.student_code if stu else None,
            "admission_id": adm.id,
            "admission_number": adm.admission_number,
            "admission_date": adm.admission_date,
            "demo_subject": sub_info["demo_subject"],
            "enrolled_subject": sub_info["enrolled_subject"],
            "subject_changed": sub_info["subject_changed"],
            "subject_label": f"{sub_info['demo_subject']} -> {sub_info['enrolled_subject']}",
        })

    conversion_rate_pct = round((demos_converted / demos_given * 100), 1) if demos_given > 0 else 0.0
    enrolled_subjects = sorted(
        subject_details_map.values(),
        key=lambda x: (-x["count"], x["label"].lower()),
    )

    return {
        "demos_given": demos_given,
        "demos_converted": demos_converted,
        "conversion_rate_pct": conversion_rate_pct,
        "enrolled_subjects": enrolled_subjects,
        "converted_demos": converted_demos,
    }


async def get_summary_dashboard_detailed(
    db: AsyncSession,
    period: str = "daily",
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Daily / Monthly Summary Dashboard:
    Billed, collected, due, expenses, refunds, net cash with interval trends.
    """
    today = today_kolkata()
    if month and year:
        _, last_day = calendar.monthrange(year, month)
        f_date, t_date = date(year, month, 1), date(year, month, last_day)
    elif year and not month and not from_date and not to_date:
        f_date, t_date = date(year, 1, 1), date(year, 12, 31)
    else:
        if from_date and not to_date:
            to_date = today
        elif to_date and not from_date:
            from_date = date(to_date.year, 1, 1)
        f_date, t_date = from_date, to_date

    if not f_date and not t_date:
        if period == "daily":
            f_date = today - timedelta(days=29)
            t_date = today
        else:
            f_date = date(today.year, 1, 1)
            t_date = date(today.year, 12, 31)

    start_dt, end_dt = ist_day_boundaries(f_date, t_date)

    # 1. Total Inflows (Payments) in period
    pay_conds = []
    if start_dt:
        pay_conds.append(Payment.payment_date >= start_dt)
    if end_dt:
        pay_conds.append(Payment.payment_date < end_dt)
    tot_collected = (await db.execute(select(func.coalesce(func.sum(Payment.amount), Decimal("0.00"))).where(*pay_conds))).scalar_one()

    # 2. Total Billed & Due (Admissions booked in period)
    adm_conds = [Admission.status != "CANCELLED", Admission.document_status == "VALID"]
    if f_date:
        adm_conds.append(Admission.admission_date >= f_date)
    if t_date:
        adm_conds.append(Admission.admission_date <= t_date)
    tot_billed = (await db.execute(select(func.coalesce(func.sum(Admission.total_payable), Decimal("0.00"))).where(*adm_conds))).scalar_one()
    tot_due = (await db.execute(select(func.coalesce(func.sum(Admission.balance_due), Decimal("0.00"))).where(*adm_conds))).scalar_one()

    # 3. Total Expenses in period
    exp_conds = []
    if f_date:
        exp_conds.append(Expense.expense_date >= f_date)
    if t_date:
        exp_conds.append(Expense.expense_date <= t_date)
    tot_exp = (await db.execute(select(func.coalesce(func.sum(Expense.amount), Decimal("0.00"))).where(*exp_conds))).scalar_one()

    sal_conds = [SalaryRecord.status == "PAID"]
    if f_date:
        sal_conds.append(SalaryRecord.payment_date >= f_date)
    if t_date:
        sal_conds.append(SalaryRecord.payment_date <= t_date)
    tot_sal = (await db.execute(select(func.coalesce(func.sum(SalaryRecord.paid_amount), Decimal("0.00"))).where(*sal_conds))).scalar_one()

    # 4. Refunds in period
    ref_conds = []
    if start_dt:
        ref_conds.append(Refund.refund_date >= start_dt)
    if end_dt:
        ref_conds.append(Refund.refund_date < end_dt)
    tot_ref = (await db.execute(select(func.coalesce(func.sum(Refund.amount), Decimal("0.00"))).where(*ref_conds))).scalar_one()

    total_outflows = tot_exp + tot_sal + tot_ref
    net_cash = tot_collected - total_outflows

    intervals = []
    if period == "daily":
        cur = f_date
        while cur <= t_date:
            d_start_dt, d_end_dt = ist_day_boundaries(cur, cur)

            d_billed = (await db.execute(
                select(func.coalesce(func.sum(Admission.total_payable), Decimal("0.00")))
                .where(and_(Admission.admission_date == cur, Admission.status != "CANCELLED", Admission.document_status == "VALID"))
            )).scalar_one()

            d_due = (await db.execute(
                select(func.coalesce(func.sum(Admission.balance_due), Decimal("0.00")))
                .where(and_(Admission.admission_date == cur, Admission.status != "CANCELLED", Admission.document_status == "VALID"))
            )).scalar_one()

            d_coll = (await db.execute(
                select(func.coalesce(func.sum(Payment.amount), Decimal("0.00")))
                .where(and_(Payment.payment_date >= d_start_dt, Payment.payment_date < d_end_dt))
            )).scalar_one()

            d_exp = (await db.execute(
                select(func.coalesce(func.sum(Expense.amount), Decimal("0.00")))
                .where(Expense.expense_date == cur)
            )).scalar_one()

            d_sal = (await db.execute(
                select(func.coalesce(func.sum(SalaryRecord.paid_amount), Decimal("0.00")))
                .where(and_(SalaryRecord.status == "PAID", SalaryRecord.payment_date == cur))
            )).scalar_one()

            d_ref = (await db.execute(
                select(func.coalesce(func.sum(Refund.amount), Decimal("0.00")))
                .where(and_(Refund.refund_date >= d_start_dt, Refund.refund_date < d_end_dt))
            )).scalar_one()

            d_outflow = d_exp + d_sal + d_ref
            intervals.append({
                "period_key": str(cur),
                "period_label": cur.strftime("%d %b %Y"),
                "billed": float(d_billed),
                "collected": float(d_coll),
                "due": float(d_due),
                "expenses": float(d_exp + d_sal),
                "refunds": float(d_ref),
                "net_cash": float(d_coll - d_outflow)
            })
            cur += timedelta(days=1)
    else:
        cur_year = f_date.year
        cur_month = f_date.month
        end_year = t_date.year
        end_month = t_date.month
        while (cur_year < end_year) or (cur_year == end_year and cur_month <= end_month):
            _, last_d = calendar.monthrange(cur_year, cur_month)
            m_start = max(f_date, date(cur_year, cur_month, 1))
            m_end = min(t_date, date(cur_year, cur_month, last_d))
            m_start_dt, m_end_dt = ist_day_boundaries(m_start, m_end)

            m_billed = (await db.execute(
                select(func.coalesce(func.sum(Admission.total_payable), Decimal("0.00")))
                .where(and_(Admission.admission_date >= m_start, Admission.admission_date <= m_end, Admission.status != "CANCELLED", Admission.document_status == "VALID"))
            )).scalar_one()

            m_due = (await db.execute(
                select(func.coalesce(func.sum(Admission.balance_due), Decimal("0.00")))
                .where(and_(Admission.admission_date >= m_start, Admission.admission_date <= m_end, Admission.status != "CANCELLED", Admission.document_status == "VALID"))
            )).scalar_one()

            m_coll = (await db.execute(
                select(func.coalesce(func.sum(Payment.amount), Decimal("0.00")))
                .where(and_(Payment.payment_date >= m_start_dt, Payment.payment_date < m_end_dt))
            )).scalar_one()

            m_exp = (await db.execute(
                select(func.coalesce(func.sum(Expense.amount), Decimal("0.00")))
                .where(and_(Expense.expense_date >= m_start, Expense.expense_date <= m_end))
            )).scalar_one()

            m_sal = (await db.execute(
                select(func.coalesce(func.sum(SalaryRecord.paid_amount), Decimal("0.00")))
                .where(and_(SalaryRecord.status == "PAID", SalaryRecord.payment_date >= m_start, SalaryRecord.payment_date <= m_end))
            )).scalar_one()

            m_ref = (await db.execute(
                select(func.coalesce(func.sum(Refund.amount), Decimal("0.00")))
                .where(and_(Refund.refund_date >= m_start_dt, Refund.refund_date < m_end_dt))
            )).scalar_one()

            m_outflow = m_exp + m_sal + m_ref
            intervals.append({
                "period_key": f"{cur_year}-{cur_month:02d}",
                "period_label": date(cur_year, cur_month, 1).strftime("%b %Y"),
                "billed": float(m_billed),
                "collected": float(m_coll),
                "due": float(m_due),
                "expenses": float(m_exp + m_sal),
                "refunds": float(m_ref),
                "net_cash": float(m_coll - m_outflow)
            })
            if cur_month == 12:
                cur_month = 1
                cur_year += 1
            else:
                cur_month += 1

    paged_intervals, total, total_pages, cur_page, effective_page_size = _paginate_slice(
        intervals, page, page_size
    )

    return {
        "filters": {
            "from_date": str(f_date) if f_date else None,
            "to_date": str(t_date) if t_date else None,
            "period": period
        },
        "summary": {
            "total_billed": float(tot_billed),
            "total_collected": float(tot_collected),
            "total_due": float(tot_due),
            "total_expenses": float(tot_exp + tot_sal),
            "total_refunds": float(tot_ref),
            "net_cash": float(net_cash)
        },
        "total": total,
        "total_pages": total_pages,
        "page": cur_page,
        "page_size": effective_page_size,
        "chart_intervals": intervals,
        "intervals": paged_intervals
    }


