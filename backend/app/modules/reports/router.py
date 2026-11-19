import uuid
import calendar
from decimal import Decimal
from typing import Optional, List, Dict, Any
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_

from app.database.session import get_db
from app.common.calculations import evaluate_student_rolling_cycle, compute_rolling_cycle_end
from app.core.dependencies import require_staff, require_admin
from app.database.models import (
    Admission, AdmissionItem, Subject, Batch, Teacher, PaymentAllocation, Payment,
    Expense, SalaryRecord, Refund, User, Student
)

router = APIRouter(prefix="/api/reports", tags=["Reports & Analytics"])


def _resolve_date_range(
    from_date: Optional[date],
    to_date: Optional[date],
    month: Optional[int],
    year: Optional[int]
) -> tuple[Optional[date], Optional[date]]:
    """Helper to resolve choosable start/end dates or month/year into a date window."""
    if month and year:
        _, last_day = calendar.monthrange(year, month)
        return date(year, month, 1), date(year, month, last_day)
    if year and not month and not from_date and not to_date:
        return date(year, 1, 1), date(year, 12, 31)
    
    if from_date and not to_date:
        to_date = date.today()
    elif to_date and not from_date:
        from_date = date(to_date.year, 1, 1)

    return from_date, to_date


def _evaluate_student_cycle(
    valid_from: Optional[date],
    valid_to: Optional[date],
    admission_date: date,
    balance_due: Decimal,
    net_price: Decimal,
    amount_collected: Decimal
) -> Dict[str, Any]:
    return evaluate_student_rolling_cycle(
        valid_from=valid_from,
        valid_to=valid_to,
        admission_date=admission_date,
        balance_due=balance_due,
        net_price=net_price,
        amount_collected=amount_collected
    )



@router.get("/subject-revenue")
async def get_subject_revenue_report(
    from_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Specific month (1-12)"),
    year: Optional[int] = Query(None, description="Specific year (e.g. 2026)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Returns revenue breakdown by subject with date-to-date and month-wise filtering:
    Total booked net price, total collected via allocations, balance due, and enrolled student breakdown
    with rolling date-to-date billing cycles and cycle renewal statuses.
    """
    f_date, t_date = _resolve_date_range(from_date, to_date, month, year)

    start_col = func.coalesce(AdmissionItem.valid_from, Admission.valid_from, Admission.admission_date)
    end_col = func.coalesce(AdmissionItem.valid_to, Admission.valid_to, Admission.admission_date + 30)

    date_conds = []
    if f_date:
        date_conds.append(end_col >= f_date)
    if t_date:
        date_conds.append(start_col <= t_date)

    subjects_res = await db.execute(select(Subject).order_by(Subject.name.asc()))
    subjects = subjects_res.scalars().all()

    report = []
    total_revenue_all = Decimal("0.00")
    total_collected_all = Decimal("0.00")

    for s in subjects:
        where_filter = [
            AdmissionItem.subject_id == s.id,
            Admission.status != "CANCELLED",
            *date_conds
        ]

        stmt = (
            select(
                func.coalesce(func.sum(AdmissionItem.original_price), Decimal("0.00")),
                func.coalesce(func.sum(AdmissionItem.discount_amount + AdmissionItem.overall_discount_share), Decimal("0.00")),
                func.coalesce(func.sum(AdmissionItem.net_price), Decimal("0.00")),
                func.coalesce(func.sum(AdmissionItem.amount_collected), Decimal("0.00")),
                func.coalesce(func.count(AdmissionItem.id), 0)
            )
            .join(Admission, AdmissionItem.admission_id == Admission.id)
            .where(and_(*where_filter))
        )
        res = await db.execute(stmt)
        orig_price, total_disc, booked, collected, student_count = res.one()

        balance = booked - collected
        total_revenue_all += booked
        total_collected_all += collected

        # Fetch enrolled students for this subject in the active period
        stu_stmt = (
            select(AdmissionItem, Admission, Student, Batch)
            .join(Admission, AdmissionItem.admission_id == Admission.id)
            .join(Student, Admission.student_id == Student.id)
            .outerjoin(Batch, AdmissionItem.batch_id == Batch.id)
            .where(and_(*where_filter))
            .order_by(start_col.desc(), Student.name.asc())
        )
        stu_rows = (await db.execute(stu_stmt)).all()
        subject_students = []
        for itm, adm, stu, bch in stu_rows:
            c_info = _evaluate_student_cycle(
                itm.valid_from, itm.valid_to, adm.admission_date,
                itm.balance_due, itm.net_price, itm.amount_collected
            )
            subject_students.append({
                "item_id": str(itm.id),
                "admission_id": str(adm.id),
                "admission_number": adm.admission_number,
                "admission_date": str(adm.admission_date),
                "student_id": str(stu.id),
                "student_code": stu.student_code,
                "student_name": stu.name,
                "mobile": stu.mobile or "",
                "father_name": stu.father_name or "",
                "photo_url": stu.photo_url,
                "batch_id": str(bch.id) if bch else None,
                "batch_name": bch.name if bch else (itm.item_name_snapshot or "Direct Subject"),
                "teacher_name": itm.teacher_name_snapshot or (bch.teacher_name_snapshot if bch else (s.teacher_name_snapshot if hasattr(s, 'teacher_name_snapshot') else "Faculty")),
                "hall_number": itm.hall_number_snapshot or (bch.hall_number if bch else (s.hall_number if s.hall_number else "Main")),
                **c_info
            })

        report.append({
            "subject_id": str(s.id),
            "subject_code": s.subject_code,
            "subject_name": s.name,
            "default_fee": float(s.default_fee),
            "enrolled_count": student_count,
            "original_billed": float(orig_price),
            "total_discounts": float(total_disc),
            "total_booked": float(booked),
            "total_collected": float(collected),
            "balance_due": float(balance),
            "students": subject_students
        })

    # Also handle Green Card / All Access items separately
    gc_filter = [
        AdmissionItem.item_type == "GREEN_CARD",
        Admission.status != "CANCELLED",
        *date_conds
    ]

    gc_stmt = (
        select(
            func.coalesce(func.sum(AdmissionItem.net_price), Decimal("0.00")),
            func.coalesce(func.sum(AdmissionItem.amount_collected), Decimal("0.00")),
            func.coalesce(func.count(AdmissionItem.id), 0)
        )
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .where(and_(*gc_filter))
    )
    gc_res = await db.execute(gc_stmt)
    gc_booked, gc_collected, gc_count = gc_res.one()
    if gc_count > 0:
        total_revenue_all += gc_booked
        total_collected_all += gc_collected

        gc_stu_stmt = (
            select(AdmissionItem, Admission, Student)
            .join(Admission, AdmissionItem.admission_id == Admission.id)
            .join(Student, Admission.student_id == Student.id)
            .where(and_(*gc_filter))
            .order_by(start_col.desc(), Student.name.asc())
        )
        gc_stu_rows = (await db.execute(gc_stu_stmt)).all()
        gc_students = []
        for itm, adm, stu in gc_stu_rows:
            c_info = _evaluate_student_cycle(
                itm.valid_from, itm.valid_to, adm.admission_date,
                itm.balance_due, itm.net_price, itm.amount_collected
            )
            gc_students.append({
                "item_id": str(itm.id),
                "admission_id": str(adm.id),
                "admission_number": adm.admission_number,
                "admission_date": str(adm.admission_date),
                "student_id": str(stu.id),
                "student_code": stu.student_code,
                "student_name": stu.name,
                "mobile": stu.mobile or "",
                "father_name": stu.father_name or "",
                "photo_url": stu.photo_url,
                "batch_id": None,
                "batch_name": "All-Access Pass (Green Card)",
                "teacher_name": "All Faculty",
                "hall_number": "All Halls",
                **c_info
            })

        report.append({
            "subject_id": "green-card-all-access",
            "subject_code": "GREEN-CARD",
            "subject_name": "Green Card (All-Access Pass)",
            "default_fee": 15000.0,
            "enrolled_count": gc_count,
            "original_billed": float(gc_booked),
            "total_discounts": 0.0,
            "total_booked": float(gc_booked),
            "total_collected": float(gc_collected),
            "balance_due": float(gc_booked - gc_collected),
            "students": gc_students
        })

    return {
        "filters": {
            "from_date": str(f_date) if f_date else None,
            "to_date": str(t_date) if t_date else None,
            "month": month,
            "year": year
        },
        "summary": {
            "total_booked_all": float(total_revenue_all),
            "total_collected_all": float(total_collected_all),
            "total_balance_all": float(total_revenue_all - total_collected_all)
        },
        "items": report
    }


@router.get("/batch-revenue")
async def get_batch_revenue_report(
    from_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Specific month (1-12)"),
    year: Optional[int] = Query(None, description="Specific year (e.g. 2026)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Returns revenue breakdown by batch with date-to-date and month-wise filtering and student roster.
    """
    f_date, t_date = _resolve_date_range(from_date, to_date, month, year)

    start_col = func.coalesce(AdmissionItem.valid_from, Admission.valid_from, Admission.admission_date)
    end_col = func.coalesce(AdmissionItem.valid_to, Admission.valid_to, Admission.admission_date + 30)

    date_conds = []
    if f_date:
        date_conds.append(end_col >= f_date)
    if t_date:
        date_conds.append(start_col <= t_date)

    batches_res = await db.execute(select(Batch).order_by(Batch.name.asc()))
    batches = batches_res.scalars().all()

    report = []
    total_booked_all = Decimal("0.00")
    total_collected_all = Decimal("0.00")

    for b in batches:
        where_filter = [
            AdmissionItem.batch_id == b.id,
            Admission.status != "CANCELLED",
            *date_conds
        ]

        stmt = (
            select(
                func.coalesce(func.sum(AdmissionItem.net_price), Decimal("0.00")),
                func.coalesce(func.sum(AdmissionItem.amount_collected), Decimal("0.00")),
                func.coalesce(func.count(AdmissionItem.id), 0)
            )
            .join(Admission, AdmissionItem.admission_id == Admission.id)
            .where(and_(*where_filter))
        )
        res = await db.execute(stmt)
        booked, collected, count = res.one()

        total_booked_all += booked
        total_collected_all += collected

        # Fetch enrolled students
        stu_stmt = (
            select(AdmissionItem, Admission, Student)
            .join(Admission, AdmissionItem.admission_id == Admission.id)
            .join(Student, Admission.student_id == Student.id)
            .where(and_(*where_filter))
            .order_by(start_col.desc(), Student.name.asc())
        )
        stu_rows = (await db.execute(stu_stmt)).all()
        batch_students = []
        for itm, adm, stu in stu_rows:
            c_info = _evaluate_student_cycle(
                itm.valid_from, itm.valid_to, adm.admission_date,
                itm.balance_due, itm.net_price, itm.amount_collected
            )
            batch_students.append({
                "item_id": str(itm.id),
                "admission_id": str(adm.id),
                "admission_number": adm.admission_number,
                "admission_date": str(adm.admission_date),
                "student_id": str(stu.id),
                "student_code": stu.student_code,
                "student_name": stu.name,
                "mobile": stu.mobile or "",
                "father_name": stu.father_name or "",
                "photo_url": stu.photo_url,
                "batch_id": str(b.id),
                "batch_name": b.name,
                "teacher_name": b.teacher_name_snapshot or "Faculty",
                "hall_number": b.hall_number or "Main",
                **c_info
            })

        report.append({
            "batch_id": str(b.id),
            "batch_code": b.batch_code,
            "batch_name": b.name,
            "teacher_name": b.teacher_name_snapshot,
            "hall_number": b.hall_number,
            "enrolled_count": count,
            "total_booked": float(booked),
            "total_collected": float(collected),
            "balance_due": float(booked - collected),
            "status": b.status,
            "students": batch_students
        })

    return report


@router.get("/teacher-revenue")
async def get_teacher_revenue_report(
    from_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Specific month (1-12)"),
    year: Optional[int] = Query(None, description="Specific year (e.g. 2026)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Teacher-wise associated subject and batch revenue report with date filtering
    and complete student roster with rolling date-to-date billing cycles.
    """
    f_date, t_date = _resolve_date_range(from_date, to_date, month, year)

    start_col = func.coalesce(AdmissionItem.valid_from, Admission.valid_from, Admission.admission_date)
    end_col = func.coalesce(AdmissionItem.valid_to, Admission.valid_to, Admission.admission_date + 30)

    date_conds = []
    if f_date:
        date_conds.append(end_col >= f_date)
    if t_date:
        date_conds.append(start_col <= t_date)

    teachers_res = await db.execute(select(Teacher).order_by(Teacher.name.asc()))
    teachers = teachers_res.scalars().all()

    report = []
    for t in teachers:
        b_res = await db.execute(select(Batch.id).where(Batch.teacher_id == t.id))
        b_ids = [b for b, in b_res.all()]
        s_res = await db.execute(select(Subject.id).where(Subject.teacher_id == t.id))
        s_ids = [s for s, in s_res.all()]

        # Match either AdmissionItem.teacher_id == t.id OR AdmissionItem.batch_id in batches OR AdmissionItem.subject_id in subjects
        where_cond = [AdmissionItem.teacher_id == t.id]
        if b_ids:
            where_cond.append(AdmissionItem.batch_id.in_(b_ids))
        if s_ids:
            where_cond.append(AdmissionItem.subject_id.in_(s_ids))

        teacher_filter = [
            or_(*where_cond),
            Admission.status != "CANCELLED",
            *date_conds
        ]

        stmt = (
            select(
                func.coalesce(func.sum(AdmissionItem.net_price), Decimal("0.00")),
                func.coalesce(func.sum(AdmissionItem.amount_collected), Decimal("0.00")),
                func.coalesce(func.count(AdmissionItem.id), 0)
            )
            .join(Admission, AdmissionItem.admission_id == Admission.id)
            .where(and_(*teacher_filter))
        )
        res = await db.execute(stmt)
        booked, collected, count = res.one()

        # Fetch enrolled students under this teacher
        t_stu_stmt = (
            select(AdmissionItem, Admission, Student, Batch, Subject)
            .join(Admission, AdmissionItem.admission_id == Admission.id)
            .join(Student, Admission.student_id == Student.id)
            .outerjoin(Batch, AdmissionItem.batch_id == Batch.id)
            .outerjoin(Subject, AdmissionItem.subject_id == Subject.id)
            .where(and_(*teacher_filter))
            .order_by(start_col.desc(), Student.name.asc())
        )
        t_stu_rows = (await db.execute(t_stu_stmt)).all()
        t_students = []
        for itm, adm, stu, bch, sub in t_stu_rows:
            c_info = _evaluate_student_cycle(
                itm.valid_from, itm.valid_to, adm.admission_date,
                itm.balance_due, itm.net_price, itm.amount_collected
            )
            t_students.append({
                "item_id": str(itm.id),
                "admission_id": str(adm.id),
                "admission_number": adm.admission_number,
                "admission_date": str(adm.admission_date),
                "student_id": str(stu.id),
                "student_code": stu.student_code,
                "student_name": stu.name,
                "mobile": stu.mobile or "",
                "father_name": stu.father_name or "",
                "photo_url": stu.photo_url,
                "subject_id": str(sub.id) if sub else (str(itm.subject_id) if itm.subject_id else None),
                "subject_name": sub.name if sub else (itm.item_name_snapshot or "Subject"),
                "subject_code": sub.subject_code if sub else "",
                "batch_id": str(bch.id) if bch else None,
                "batch_name": bch.name if bch else "Direct Subject",
                "hall_number": itm.hall_number_snapshot or (bch.hall_number if bch else (sub.hall_number if sub and sub.hall_number else "Main")),
                **c_info
            })

        report.append({
            "teacher_id": str(t.id),
            "teacher_name": t.name,
            "teacher_code": t.teacher_code,
            "specialization": t.specialization,
            "batches_count": len(b_ids),
            "enrolled_count": count,
            "total_booked": float(booked),
            "total_collected": float(collected),
            "balance_due": float(booked - collected),
            "students": t_students
        })

    return report

@router.get("/cash-movement")
async def get_cash_movement_report(
    from_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Specific month (1-12)"),
    year: Optional[int] = Query(None, description="Specific year (e.g. 2026)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Returns cash inflows (payments collected) vs outflows (daily expenses + salaries paid + fee refunds),
    with choosable date-to-date range, month selector, or annual view.
    """
    if not year and not from_date and not to_date and not month:
        year = date.today().year

    f_date, t_date = _resolve_date_range(from_date, to_date, month, year)

    # 1. Custom Date Range View or Single Month View
    if f_date and t_date:
        # Date window boundaries
        start_dt = datetime.combine(f_date, datetime.min.time()).replace(tzinfo=None)
        end_dt = datetime.combine(t_date + timedelta(days=1), datetime.min.time()).replace(tzinfo=None)

        # Inflows (Payments)
        p_res = await db.execute(
            select(func.coalesce(func.sum(Payment.amount), Decimal("0.00")))
            .where(Payment.payment_date >= start_dt, Payment.payment_date < end_dt)
        )
        total_inflow = p_res.scalar_one()

        # Outflow 1: Daily Expenses
        exp_res = await db.execute(
            select(func.coalesce(func.sum(Expense.amount), Decimal("0.00")))
            .where(Expense.expense_date >= f_date, Expense.expense_date <= t_date)
        )
        total_expenses = exp_res.scalar_one()

        # Outflow 2: Salaries
        sal_res = await db.execute(
            select(func.coalesce(func.sum(SalaryRecord.paid_amount), Decimal("0.00")))
            .where(SalaryRecord.payment_date >= f_date, SalaryRecord.payment_date <= t_date)
        )
        total_salaries = sal_res.scalar_one()

        # Outflow 3: Fee Refunds
        ref_res = await db.execute(
            select(func.coalesce(func.sum(Refund.amount), Decimal("0.00")))
            .where(Refund.refund_date >= start_dt, Refund.refund_date < end_dt)
        )
        total_refunds = ref_res.scalar_one()

        total_outflow = total_expenses + total_salaries + total_refunds
        net_cash = total_inflow - total_outflow

        # Breakdown: if <= 35 days, do daily breakdown; otherwise monthly breakdown
        days_span = (t_date - f_date).days + 1
        breakdown = []

        if days_span <= 35:
            # Daily breakdown
            cur = f_date
            while cur <= t_date:
                day_start_dt = datetime.combine(cur, datetime.min.time()).replace(tzinfo=None)
                day_end_dt = datetime.combine(cur + timedelta(days=1), datetime.min.time()).replace(tzinfo=None)

                d_pay = (await db.execute(
                    select(func.coalesce(func.sum(Payment.amount), Decimal("0.00")))
                    .where(Payment.payment_date >= day_start_dt, Payment.payment_date < day_end_dt)
                )).scalar_one()

                d_exp = (await db.execute(
                    select(func.coalesce(func.sum(Expense.amount), Decimal("0.00")))
                    .where(Expense.expense_date == cur)
                )).scalar_one()

                d_sal = (await db.execute(
                    select(func.coalesce(func.sum(SalaryRecord.paid_amount), Decimal("0.00")))
                    .where(SalaryRecord.payment_date == cur)
                )).scalar_one()

                d_ref = (await db.execute(
                    select(func.coalesce(func.sum(Refund.amount), Decimal("0.00")))
                    .where(Refund.refund_date >= day_start_dt, Refund.refund_date < day_end_dt)
                )).scalar_one()

                d_outflow = d_exp + d_sal + d_ref
                breakdown.append({
                    "period_key": str(cur),
                    "period_label": cur.strftime("%d %b %Y"),
                    "inflows": float(d_pay),
                    "daily_expenses": float(d_exp),
                    "salaries_paid": float(d_sal),
                    "fee_refunds": float(d_ref),
                    "total_outflows": float(d_outflow),
                    "net_cash_flow": float(d_pay - d_outflow)
                })
                cur += timedelta(days=1)
        else:
            # Month-by-month within the custom range
            cur_year = f_date.year
            cur_month = f_date.month
            end_year = t_date.year
            end_month = t_date.month

            while (cur_year < end_year) or (cur_year == end_year and cur_month <= end_month):
                m_start = date(cur_year, cur_month, 1)
                _, last_d = calendar.monthrange(cur_year, cur_month)
                m_end = date(cur_year, cur_month, last_d)

                # Clamp to f_date and t_date
                win_start = max(f_date, m_start)
                win_end = min(t_date, m_end)

                m_start_dt = datetime.combine(win_start, datetime.min.time()).replace(tzinfo=None)
                m_end_dt = datetime.combine(win_end + timedelta(days=1), datetime.min.time()).replace(tzinfo=None)

                m_pay = (await db.execute(
                    select(func.coalesce(func.sum(Payment.amount), Decimal("0.00")))
                    .where(Payment.payment_date >= m_start_dt, Payment.payment_date < m_end_dt)
                )).scalar_one()

                m_exp = (await db.execute(
                    select(func.coalesce(func.sum(Expense.amount), Decimal("0.00")))
                    .where(Expense.expense_date >= win_start, Expense.expense_date <= win_end)
                )).scalar_one()

                m_sal = (await db.execute(
                    select(func.coalesce(func.sum(SalaryRecord.paid_amount), Decimal("0.00")))
                    .where(SalaryRecord.payment_date >= win_start, SalaryRecord.payment_date <= win_end)
                )).scalar_one()

                m_ref = (await db.execute(
                    select(func.coalesce(func.sum(Refund.amount), Decimal("0.00")))
                    .where(Refund.refund_date >= m_start_dt, Refund.refund_date < m_end_dt)
                )).scalar_one()

                m_outflow = m_exp + m_sal + m_ref
                breakdown.append({
                    "period_key": f"{cur_year}-{cur_month:02d}",
                    "period_label": win_start.strftime("%b %Y"),
                    "inflows": float(m_pay),
                    "daily_expenses": float(m_exp),
                    "salaries_paid": float(m_sal),
                    "fee_refunds": float(m_ref),
                    "total_outflows": float(m_outflow),
                    "net_cash_flow": float(m_pay - m_outflow)
                })

                if cur_month == 12:
                    cur_month = 1
                    cur_year += 1
                else:
                    cur_month += 1

        return {
            "filters": {
                "from_date": str(f_date),
                "to_date": str(t_date),
                "month": month,
                "year": year
            },
            "total_inflows": float(total_inflow),
            "total_expenses": float(total_expenses),
            "total_salaries": float(total_salaries),
            "total_refunds": float(total_refunds),
            "total_outflows": float(total_outflow),
            "net_cash_position": float(net_cash),
            "breakdown": breakdown,
            "monthly_breakdown": breakdown
        }

    # 2. Standard 12-month Annual View
    target_year = year or 2026
    months_data = []

    for m in range(1, 13):
        m_str = f"{target_year}-{m:02d}"
        start_date = date(target_year, m, 1)
        if m == 12:
            end_date = date(target_year + 1, 1, 1)
        else:
            end_date = date(target_year, m + 1, 1)

        start_dt = datetime.combine(start_date, datetime.min.time()).replace(tzinfo=None)
        end_dt = datetime.combine(end_date, datetime.min.time()).replace(tzinfo=None)

        pay_stmt = (
            select(func.coalesce(func.sum(Payment.amount), Decimal("0.00")))
            .where(Payment.payment_date >= start_dt, Payment.payment_date < end_dt)
        )
        inflow = (await db.execute(pay_stmt)).scalar_one()

        exp_stmt = (
            select(func.coalesce(func.sum(Expense.amount), Decimal("0.00")))
            .where(Expense.expense_date >= start_date, Expense.expense_date < end_date)
        )
        daily_exp = (await db.execute(exp_stmt)).scalar_one()

        sal_stmt = (
            select(func.coalesce(func.sum(SalaryRecord.paid_amount), Decimal("0.00")))
            .where(SalaryRecord.payment_date >= start_date, SalaryRecord.payment_date < end_date)
        )
        sal_paid = (await db.execute(sal_stmt)).scalar_one()

        ref_stmt = (
            select(func.coalesce(func.sum(Refund.amount), Decimal("0.00")))
            .where(Refund.refund_date >= start_dt, Refund.refund_date < end_dt)
        )
        fee_ref = (await db.execute(ref_stmt)).scalar_one()

        total_outflow = daily_exp + sal_paid + fee_ref
        net_cash = inflow - total_outflow

        month_label = start_date.strftime("%b %Y")
        months_data.append({
            "period_key": m_str,
            "period_label": month_label,
            "inflows": float(inflow),
            "daily_expenses": float(daily_exp),
            "salaries_paid": float(sal_paid),
            "fee_refunds": float(fee_ref),
            "total_outflows": float(total_outflow),
            "net_cash_flow": float(net_cash)
        })

    total_inflows = sum(m["inflows"] for m in months_data)
    total_expenses = sum(m["daily_expenses"] for m in months_data)
    total_salaries = sum(m["salaries_paid"] for m in months_data)
    total_refunds = sum(m["fee_refunds"] for m in months_data)
    total_outflows = sum(m["total_outflows"] for m in months_data)

    return {
        "filters": {
            "from_date": None,
            "to_date": None,
            "month": None,
            "year": target_year
        },
        "year": target_year,
        "total_inflows": total_inflows,
        "total_expenses": total_expenses,
        "total_salaries": total_salaries,
        "total_refunds": total_refunds,
        "total_outflows": total_outflows,
        "net_cash_position": total_inflows - total_outflows,
        "breakdown": months_data,
        "monthly_breakdown": months_data
    }
