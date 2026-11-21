import uuid
import zoneinfo
from decimal import Decimal
from datetime import date, datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy import select, func, and_, or_, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    PaymentAllocation, AdmissionItem, Admission, Payment, Refund, User, Subject, Teacher, Batch, TeacherEarning
)

IST_TZ = zoneinfo.ZoneInfo("Asia/Kolkata")

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
        .where(and_(*date_conds))
        .group_by(AdmissionItem.subject_id)
    )
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
        .where(and_(*date_conds))
        .group_by(AdmissionItem.teacher_id)
    )
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
        .where(and_(*date_conds))
        .group_by(AdmissionItem.batch_id)
    )
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

    stmt = (
        select(
            PaymentAllocation.admission_item_id,
            func.coalesce(func.sum(PaymentAllocation.allocated_amount), Decimal("0.00"))
        )
        .outerjoin(Payment, PaymentAllocation.payment_id == Payment.id)
        .outerjoin(Refund, PaymentAllocation.refund_id == Refund.id)
        .where(
            PaymentAllocation.admission_item_id.in_(item_ids),
            and_(*date_conds)
        )
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
        .where(and_(*p_conds))
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
        .where(and_(*r_conds))
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

