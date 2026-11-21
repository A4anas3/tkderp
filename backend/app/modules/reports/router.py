import uuid
import calendar
import csv
import io
from decimal import Decimal
from typing import Optional, List, Dict, Any
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, case

from app.database.session import get_db
from app.common.calculations import evaluate_student_rolling_cycle, compute_rolling_cycle_end
from app.core.dependencies import require_staff, require_admin
from app.database.models import (
    Admission, AdmissionItem, Subject, Batch, Teacher, PaymentAllocation, Payment,
    Expense, SalaryRecord, Refund, User, Student
)
from app.modules.reports.ledger_queries import (
    get_subject_revenue_from_ledger,
    get_teacher_revenue_from_ledger,
    get_batch_revenue_from_ledger,
    get_item_allocated_collected_map,
    get_total_ledger_revenue,
    get_collections_by_mode,
    get_collections_by_cashier,
    get_teacher_payable_summary,
    get_dues_by_subject,
    ist_day_boundaries
)

router = APIRouter(prefix="/api/reports", tags=["Reports & Analytics"])


def generate_csv_response(filename: str, headers: List[str], rows: List[List[Any]]) -> Response:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    content = output.getvalue()
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


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
    format: Optional[str] = Query(None, description="Set to 'csv' for CSV export"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Returns revenue breakdown by subject with date-to-date and month-wise filtering:
    Total booked net price, total collected strictly via allocation ledger in IST boundaries,
    balance due, and enrolled student breakdown.
    Supports CSV export via ?format=csv.
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

    # Reconciled subject revenue strictly from PaymentAllocation ledger
    ledger_subject_map = await get_subject_revenue_from_ledger(db, f_date, t_date)

    report = []
    total_revenue_all = Decimal("0.00")
    total_collected_all = Decimal("0.00")

    for s in subjects:
        where_filter = [
            AdmissionItem.subject_id == s.id,
            Admission.status != "CANCELLED",
            *date_conds
        ]

        today = date.today()
        stmt = (
            select(
                func.coalesce(func.sum(AdmissionItem.original_price), Decimal("0.00")),
                func.coalesce(func.sum(AdmissionItem.discount_amount + AdmissionItem.overall_discount_share), Decimal("0.00")),
                func.coalesce(func.sum(AdmissionItem.net_price), Decimal("0.00")),
                func.coalesce(func.count(AdmissionItem.id), 0),
                func.count(case((and_(Admission.status == "ACTIVE", end_col >= today), 1), else_=None)),
                func.count(case((and_(Admission.status == "ACTIVE", end_col < today), 1), else_=None)),
                func.count(func.distinct(Admission.student_id))
            )
            .join(Admission, AdmissionItem.admission_id == Admission.id)
            .where(and_(*where_filter))
        )
        res = await db.execute(stmt)
        orig_price, total_disc, booked, student_count, active_enr, inactive_enr, uniq_stu = res.one()

        collected = ledger_subject_map.get(s.id, Decimal("0.00"))
        balance = max(Decimal("0.00"), booked - collected)
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
        stu_item_ids = [itm.id for itm, adm, stu, bch in stu_rows]
        stu_collected_map = await get_item_allocated_collected_map(db, stu_item_ids, f_date, t_date)

        subject_students = []
        for itm, adm, stu, bch in stu_rows:
            itm_coll = stu_collected_map.get(itm.id, Decimal("0.00"))
            c_info = _evaluate_student_cycle(
                itm.valid_from, itm.valid_to, adm.admission_date,
                itm.balance_due, itm.net_price, itm_coll
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
            "total_enrollments": student_count,
            "active_enrollments": active_enr or 0,
            "inactive_enrollments": inactive_enr or 0,
            "unique_students_count": uniq_stu or 0,
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
            func.coalesce(func.count(AdmissionItem.id), 0)
        )
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .where(and_(*gc_filter))
    )
    gc_res = await db.execute(gc_stmt)
    gc_booked, gc_count = gc_res.one()

    gc_stu_stmt = (
        select(AdmissionItem, Admission, Student)
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .join(Student, Admission.student_id == Student.id)
        .where(and_(*gc_filter))
        .order_by(start_col.desc(), Student.name.asc())
    )
    gc_stu_rows = (await db.execute(gc_stu_stmt)).all()
    gc_item_ids = [itm.id for itm, adm, stu in gc_stu_rows]
    gc_collected_map = await get_item_allocated_collected_map(db, gc_item_ids, f_date, t_date)
    gc_collected = sum(gc_collected_map.values(), Decimal("0.00"))

    if gc_count > 0 or gc_collected > Decimal("0.00"):
        total_revenue_all += gc_booked
        total_collected_all += gc_collected

        gc_students = []
        for itm, adm, stu in gc_stu_rows:
            itm_coll = gc_collected_map.get(itm.id, Decimal("0.00"))
            c_info = _evaluate_student_cycle(
                itm.valid_from, itm.valid_to, adm.admission_date,
                itm.balance_due, itm.net_price, itm_coll
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
            "total_enrollments": gc_count,
            "active_enrollments": gc_count,
            "inactive_enrollments": 0,
            "unique_students_count": gc_count,
            "original_billed": float(gc_booked),
            "total_discounts": 0.0,
            "total_booked": float(gc_booked),
            "total_collected": float(gc_collected),
            "balance_due": float(max(Decimal("0.00"), gc_booked - gc_collected)),
            "students": gc_students
        })

    if format == "csv":
        headers = ["Subject Code", "Subject Name", "Enrolled", "Total Booked (₹)", "Total Collected (₹)", "Balance Due (₹)"]
        rows = [
            [item["subject_code"], item["subject_name"], item["enrolled_count"], item["total_booked"], item["total_collected"], item["balance_due"]]
            for item in report
        ]
        return generate_csv_response("subject_revenue_report.csv", headers, rows)

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


@router.get("/subject-revenue/csv")
async def get_subject_revenue_csv(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return await get_subject_revenue_report(
        from_date=from_date, to_date=to_date, month=month, year=year,
        format="csv", db=db, current_user=current_user
    )


@router.get("/batch-revenue")
async def get_batch_revenue_report(
    from_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Specific month (1-12)"),
    year: Optional[int] = Query(None, description="Specific year (e.g. 2026)"),
    format: Optional[str] = Query(None, description="Set to 'csv' for CSV export"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Returns revenue breakdown by batch with date-to-date and month-wise filtering and student roster.
    Collections are derived strictly from PaymentAllocation ledger.
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

    # Ledger collected map for batches
    batch_collected_map = await get_batch_revenue_from_ledger(db, f_date, t_date)

    report = []
    for b in batches:
        where_filter = [
            AdmissionItem.batch_id == b.id,
            Admission.status != "CANCELLED",
            *date_conds
        ]

        today = date.today()
        stmt = (
            select(
                func.coalesce(func.sum(AdmissionItem.net_price), Decimal("0.00")),
                func.coalesce(func.count(AdmissionItem.id), 0),
                func.count(case((and_(Admission.status == "ACTIVE", end_col >= today), 1), else_=None)),
                func.count(case((and_(Admission.status == "ACTIVE", end_col < today), 1), else_=None)),
                func.count(func.distinct(Admission.student_id))
            )
            .join(Admission, AdmissionItem.admission_id == Admission.id)
            .where(and_(*where_filter))
        )
        res = await db.execute(stmt)
        booked, count, active_enr, inactive_enr, uniq_stu = res.one()

        collected = batch_collected_map.get(b.id, Decimal("0.00"))

        # Fetch enrolled students
        stu_stmt = (
            select(AdmissionItem, Admission, Student)
            .join(Admission, AdmissionItem.admission_id == Admission.id)
            .join(Student, Admission.student_id == Student.id)
            .where(and_(*where_filter))
            .order_by(start_col.desc(), Student.name.asc())
        )
        stu_rows = (await db.execute(stu_stmt)).all()
        stu_item_ids = [itm.id for itm, adm, stu in stu_rows]
        stu_collected_map = await get_item_allocated_collected_map(db, stu_item_ids, f_date, t_date)

        batch_students = []
        for itm, adm, stu in stu_rows:
            itm_coll = stu_collected_map.get(itm.id, Decimal("0.00"))
            c_info = _evaluate_student_cycle(
                itm.valid_from, itm.valid_to, adm.admission_date,
                itm.balance_due, itm.net_price, itm_coll
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
            "total_enrollments": count,
            "active_enrollments": active_enr or 0,
            "inactive_enrollments": inactive_enr or 0,
            "unique_students_count": uniq_stu or 0,
            "total_booked": float(booked),
            "total_collected": float(collected),
            "balance_due": float(max(Decimal("0.00"), booked - collected)),
            "status": b.status,
            "students": batch_students
        })

    if format == "csv":
        headers = ["Batch Code", "Batch Name", "Teacher", "Hall", "Enrolled", "Total Booked (₹)", "Total Collected (₹)", "Balance Due (₹)"]
        rows = [
            [b["batch_code"], b["batch_name"], b["teacher_name"], b["hall_number"], b["enrolled_count"], b["total_booked"], b["total_collected"], b["balance_due"]]
            for b in report
        ]
        return generate_csv_response("batch_revenue_report.csv", headers, rows)

    return report


@router.get("/batch-revenue/csv")
async def get_batch_revenue_csv(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return await get_batch_revenue_report(
        from_date=from_date, to_date=to_date, month=month, year=year,
        format="csv", db=db, current_user=current_user
    )


@router.get("/teacher-revenue")
async def get_teacher_revenue_report(
    from_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Specific month (1-12)"),
    year: Optional[int] = Query(None, description="Specific year (e.g. 2026)"),
    format: Optional[str] = Query(None, description="Set to 'csv' for CSV export"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Teacher-wise associated subject and batch revenue report with date filtering
    and complete student roster. Collections derived strictly from PaymentAllocation ledger.
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

    # Ledger collected map for teachers
    teacher_collected_map = await get_teacher_revenue_from_ledger(db, f_date, t_date)

    report = []
    for t in teachers:
        b_res = await db.execute(select(Batch.id).where(Batch.teacher_id == t.id))
        b_ids = [b for b, in b_res.all()]
        s_res = await db.execute(select(Subject.id).where(Subject.teacher_id == t.id))
        s_ids = [s for s, in s_res.all()]

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
                func.coalesce(func.count(AdmissionItem.id), 0)
            )
            .join(Admission, AdmissionItem.admission_id == Admission.id)
            .where(and_(*teacher_filter))
        )
        res = await db.execute(stmt)
        booked, count = res.one()

        collected = teacher_collected_map.get(t.id, Decimal("0.00"))

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
        t_item_ids = [itm.id for itm, adm, stu, bch, sub in t_stu_rows]
        t_collected_map = await get_item_allocated_collected_map(db, t_item_ids, f_date, t_date)

        t_students = []
        for itm, adm, stu, bch, sub in t_stu_rows:
            itm_coll = t_collected_map.get(itm.id, Decimal("0.00"))
            c_info = _evaluate_student_cycle(
                itm.valid_from, itm.valid_to, adm.admission_date,
                itm.balance_due, itm.net_price, itm_coll
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
            "balance_due": float(max(Decimal("0.00"), booked - collected)),
            "students": t_students
        })

    if format == "csv":
        headers = ["Teacher Code", "Teacher Name", "Specialization", "Batches", "Enrolled", "Total Booked (₹)", "Total Collected (₹)", "Balance Due (₹)"]
        rows = [
            [t["teacher_code"], t["teacher_name"], t["specialization"], t["batches_count"], t["enrolled_count"], t["total_booked"], t["total_collected"], t["balance_due"]]
            for t in report
        ]
        return generate_csv_response("teacher_revenue_report.csv", headers, rows)

    return report


@router.get("/teacher-revenue/csv")
async def get_teacher_revenue_csv(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return await get_teacher_revenue_report(
        from_date=from_date, to_date=to_date, month=month, year=year,
        format="csv", db=db, current_user=current_user
    )


# -------------------------------------------------------------------------
# New Financial & Operational Ledger Reports with CSV Export Support
# -------------------------------------------------------------------------

@router.get("/teacher-payable")
async def get_teacher_payable_report(
    from_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None),
    format: Optional[str] = Query(None, description="Set to 'csv' for CSV export"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Teacher Payable Report:
    earned, reversed, net_earned, paid, payable = earned - reversed - paid.
    Supports CSV export via ?format=csv.
    """
    f_date, t_date = _resolve_date_range(from_date, to_date, month, year)
    report = await get_teacher_payable_summary(db, f_date, t_date)

    if format == "csv":
        headers = ["Teacher Code", "Teacher Name", "Share Type", "Share Value", "Total Earned (₹)", "Total Reversed (₹)", "Net Earned (₹)", "Total Paid (₹)", "Payable (₹)", "Status"]
        rows = [
            [
                r["teacher_code"], r["teacher_name"], r["share_type"], r["share_value"],
                r["total_earned"], r["total_reversed"], r["net_earned"], r["total_paid"], r["payable"], r["status"]
            ]
            for r in report
        ]
        return generate_csv_response("teacher_payable_report.csv", headers, rows)

    return {
        "filters": {
            "from_date": str(f_date) if f_date else None,
            "to_date": str(t_date) if t_date else None
        },
        "summary": {
            "total_earned": float(sum((r["total_earned"] for r in report), Decimal("0.00"))),
            "total_reversed": float(sum((r["total_reversed"] for r in report), Decimal("0.00"))),
            "net_earned": float(sum((r["net_earned"] for r in report), Decimal("0.00"))),
            "total_paid": float(sum((r["total_paid"] for r in report), Decimal("0.00"))),
            "total_payable": float(sum((r["payable"] for r in report), Decimal("0.00")))
        },
        "items": report
    }


@router.get("/teacher-payable/csv")
async def get_teacher_payable_csv(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return await get_teacher_payable_report(
        from_date=from_date, to_date=to_date, month=month, year=year,
        format="csv", db=db, current_user=current_user
    )


@router.get("/dues-by-subject")
async def get_dues_by_subject_report(
    from_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None),
    format: Optional[str] = Query(None, description="Set to 'csv' for CSV export"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Dues By Subject Report:
    enrolled_count, total_booked, total_collected (from ledger), total_balance_due, total_written_off.
    Supports CSV export via ?format=csv.
    """
    f_date, t_date = _resolve_date_range(from_date, to_date, month, year)
    report = await get_dues_by_subject(db, f_date, t_date)

    if format == "csv":
        headers = ["Subject Code", "Subject Name", "Enrolled", "Total Booked (₹)", "Total Collected (₹)", "Balance Due (₹)", "Written Off (₹)"]
        rows = [
            [
                r["subject_code"], r["subject_name"], r["enrolled_count"],
                r["total_booked"], r["total_collected"], r["total_balance_due"], r["total_written_off"]
            ]
            for r in report
        ]
        return generate_csv_response("dues_by_subject_report.csv", headers, rows)

    return {
        "filters": {
            "from_date": str(f_date) if f_date else None,
            "to_date": str(t_date) if t_date else None
        },
        "summary": {
            "total_booked": float(sum((r["total_booked"] for r in report), Decimal("0.00"))),
            "total_collected": float(sum((r["total_collected"] for r in report), Decimal("0.00"))),
            "total_balance_due": float(sum((r["total_balance_due"] for r in report), Decimal("0.00"))),
            "total_written_off": float(sum((r["total_written_off"] for r in report), Decimal("0.00")))
        },
        "items": report
    }


@router.get("/dues-by-subject/csv")
async def get_dues_by_subject_csv(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return await get_dues_by_subject_report(
        from_date=from_date, to_date=to_date, month=month, year=year,
        format="csv", db=db, current_user=current_user
    )


@router.get("/collection-by-cashier")
async def get_collection_by_cashier_report(
    from_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None),
    format: Optional[str] = Query(None, description="Set to 'csv' for CSV export"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Collection By Cashier Report:
    Payment counts, gross collections, refunds, and net collections by cashier staff user.
    Supports CSV export via ?format=csv.
    """
    f_date, t_date = _resolve_date_range(from_date, to_date, month, year)
    report = await get_collections_by_cashier(db, f_date, t_date)

    if format == "csv":
        headers = ["Cashier Name", "Username", "Payments Count", "Gross Collected (₹)", "Refunds Count", "Total Refunded (₹)", "Net Collected (₹)"]
        rows = [
            [
                r["cashier_name"], r["username"], r["payment_count"],
                r["gross_collected"], r["refund_count"], r["total_refunded"], r["net_collected"]
            ]
            for r in report
        ]
        return generate_csv_response("collection_by_cashier_report.csv", headers, rows)

    return {
        "filters": {
            "from_date": str(f_date) if f_date else None,
            "to_date": str(t_date) if t_date else None
        },
        "summary": {
            "gross_collected": float(sum((r["gross_collected"] for r in report), Decimal("0.00"))),
            "total_refunded": float(sum((r["total_refunded"] for r in report), Decimal("0.00"))),
            "net_collected": float(sum((r["net_collected"] for r in report), Decimal("0.00")))
        },
        "items": report
    }


@router.get("/collection-by-cashier/csv")
async def get_collection_by_cashier_csv(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return await get_collection_by_cashier_report(
        from_date=from_date, to_date=to_date, month=month, year=year,
        format="csv", db=db, current_user=current_user
    )


@router.get("/collection-by-mode")
async def get_collection_by_mode_report(
    from_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None),
    format: Optional[str] = Query(None, description="Set to 'csv' for CSV export"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Collection By Payment Mode Report:
    Payment counts, gross collections, refunds, and net collections by mode (CASH, UPI, etc.).
    Supports CSV export via ?format=csv.
    """
    f_date, t_date = _resolve_date_range(from_date, to_date, month, year)
    report = await get_collections_by_mode(db, f_date, t_date)

    if format == "csv":
        headers = ["Payment Mode", "Payments Count", "Gross Collected (₹)", "Refunds Count", "Total Refunded (₹)", "Net Collected (₹)"]
        rows = [
            [
                r["mode"], r["payment_count"], r["gross_collected"],
                r["refund_count"], r["total_refunded"], r["net_collected"]
            ]
            for r in report
        ]
        return generate_csv_response("collection_by_mode_report.csv", headers, rows)

    return {
        "filters": {
            "from_date": str(f_date) if f_date else None,
            "to_date": str(t_date) if t_date else None
        },
        "summary": {
            "gross_collected": float(sum((r["gross_collected"] for r in report), Decimal("0.00"))),
            "total_refunded": float(sum((r["total_refunded"] for r in report), Decimal("0.00"))),
            "net_collected": float(sum((r["net_collected"] for r in report), Decimal("0.00")))
        },
        "items": report
    }


@router.get("/collection-by-mode/csv")
async def get_collection_by_mode_csv(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return await get_collection_by_mode_report(
        from_date=from_date, to_date=to_date, month=month, year=year,
        format="csv", db=db, current_user=current_user
    )

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


@router.get("/renewal-rate")
async def get_renewal_rate_report(
    from_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Specific month (1-12)"),
    year: Optional[int] = Query(None, description="Specific year (e.g. 2026)"),
    teacher_id: Optional[uuid.UUID] = Query(None, description="Filter by teacher"),
    subject_id: Optional[uuid.UUID] = Query(None, description="Filter by subject"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    """
    Renewal rate report:
    Renewal rate per subject / teacher = renewed items / items that expired in the period.
    """
    f_date, t_date = _resolve_date_range(from_date, to_date, month, year)
    if not f_date:
        today = date.today()
        f_date = date(today.year, today.month, 1)
        _, last_d = calendar.monthrange(today.year, today.month)
        t_date = date(today.year, today.month, last_d)
    elif not t_date:
        t_date = date.today()

    conds = [
        AdmissionItem.item_type == "BATCH_SUBJECT",
        AdmissionItem.status != "DISCONTINUED",
        Admission.document_status == "VALID",
        Admission.status != "CANCELLED",
        AdmissionItem.valid_to != None,
        AdmissionItem.valid_to >= f_date,
        AdmissionItem.valid_to <= t_date
    ]
    if teacher_id:
        conds.append(AdmissionItem.teacher_id == teacher_id)
    if subject_id:
        conds.append(AdmissionItem.subject_id == subject_id)

    stmt = (
        select(AdmissionItem)
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .where(and_(*conds))
    )
    res = await db.execute(stmt)
    expired_items = res.scalars().all()

    expired_ids = [i.id for i in expired_items]
    renewed_ids = set()
    if expired_ids:
        r_stmt = (
            select(AdmissionItem.renewed_from_item_id)
            .where(
                AdmissionItem.renewed_from_item_id.in_(expired_ids),
                AdmissionItem.status != "DISCONTINUED"
            )
        )
        r_res = await db.execute(r_stmt)
        renewed_ids = set(r_res.scalars().all())

    by_subject_map = {}
    by_teacher_map = {}

    for itm in expired_items:
        s_id = itm.subject_id
        s_name = itm.item_name_snapshot
        if s_id not in by_subject_map:
            by_subject_map[s_id] = {
                "subject_id": str(s_id) if s_id else None,
                "subject_name": s_name,
                "expired_count": 0,
                "renewed_count": 0
            }
        by_subject_map[s_id]["expired_count"] += 1
        if itm.id in renewed_ids:
            by_subject_map[s_id]["renewed_count"] += 1

        t_id = itm.teacher_id
        t_name = itm.teacher_name_snapshot or "Unknown Faculty"
        if t_id not in by_teacher_map:
            by_teacher_map[t_id] = {
                "teacher_id": str(t_id) if t_id else None,
                "teacher_name": t_name,
                "expired_count": 0,
                "renewed_count": 0
            }
        by_teacher_map[t_id]["expired_count"] += 1
        if itm.id in renewed_ids:
            by_teacher_map[t_id]["renewed_count"] += 1

    by_subject = []
    for s in by_subject_map.values():
        rate = round((s["renewed_count"] / s["expired_count"]) * 100, 2) if s["expired_count"] > 0 else 0.0
        by_subject.append({**s, "renewal_rate_pct": rate})

    by_teacher = []
    for t in by_teacher_map.values():
        rate = round((t["renewed_count"] / t["expired_count"]) * 100, 2) if t["expired_count"] > 0 else 0.0
        by_teacher.append({**t, "renewal_rate_pct": rate})

    total_expired = len(expired_items)
    total_renewed = len([i for i in expired_items if i.id in renewed_ids])
    overall_rate = round((total_renewed / total_expired) * 100, 2) if total_expired > 0 else 0.0

    return {
        "summary": {
            "from_date": str(f_date),
            "to_date": str(t_date),
            "total_expired": total_expired,
            "total_renewed": total_renewed,
            "overall_renewal_rate_pct": overall_rate
        },
        "by_subject": by_subject,
        "by_teacher": by_teacher
    }
