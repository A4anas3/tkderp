import uuid
import calendar
import csv
import io
from collections import defaultdict
from decimal import Decimal
from typing import Optional, List, Dict, Any
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, case

from app.core.cache import TTL_MEDIUM, cache_get, cache_set, make_cache_key
from app.database.session import get_db
from app.common.calculations import evaluate_student_rolling_cycle, compute_rolling_cycle_end
from app.common.active_student import active_student_subject_filter, today_kolkata
from app.core.dependencies import require_admin
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
    ist_day_boundaries,
    get_dues_and_ageing,
    get_collections_detailed,
    get_waivers_detailed,
    get_refunds_detailed,
    get_expenses_detailed,
    get_admissions_conversion_detailed,
    get_summary_dashboard_detailed
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
    search: Optional[str] = Query(None, description="Search subject name or code"),
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=100, description="Items per page"),
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
    search_str = search if isinstance(search, str) else None
    page_int = page if isinstance(page, int) else None
    page_size_int = page_size if isinstance(page_size, int) else None
    format_str = format if isinstance(format, str) else None

    cache_key = make_cache_key(
        "reports", "subject_revenue",
        from_date=f_date, to_date=t_date, month=month, year=year,
        search=search_str, page=page_int, page_size=page_size_int, format=format_str,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached

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

        today = today_kolkata()
        stmt = (
            select(
                func.coalesce(func.sum(AdmissionItem.original_price), Decimal("0.00")),
                func.coalesce(func.sum(AdmissionItem.discount_amount + AdmissionItem.overall_discount_share), Decimal("0.00")),
                func.coalesce(func.sum(AdmissionItem.net_price), Decimal("0.00")),
                func.coalesce(func.count(AdmissionItem.id), 0),
                func.count(case((active_student_subject_filter(AdmissionItem, Admission, today), 1), else_=None)),
                func.count(case((and_(Admission.status == "ACTIVE", end_col < today), 1), else_=None)),
                func.count(func.distinct(Admission.student_id)),
                func.coalesce(func.sum(AdmissionItem.written_off_amount), Decimal("0.00"))
            )
            .join(Admission, AdmissionItem.admission_id == Admission.id)
            .where(and_(*where_filter))
        )
        res = await db.execute(stmt)
        orig_price, total_disc, booked, student_count, active_enr, inactive_enr, uniq_stu, total_waived = res.one()

        collected = ledger_subject_map.get(s.id, Decimal("0.00"))
        balance = max(Decimal("0.00"), booked - collected)
        total_revenue_all += booked
        total_collected_all += collected

        # Refund allocations for this subject
        ref_subj_stmt = (
            select(func.coalesce(func.sum(func.abs(PaymentAllocation.allocated_amount)), Decimal("0.00")))
            .join(AdmissionItem, PaymentAllocation.admission_item_id == AdmissionItem.id)
            .where(and_(AdmissionItem.subject_id == s.id, PaymentAllocation.allocated_amount < Decimal("0.00")))
        )
        subj_refunded = (await db.execute(ref_subj_stmt)).scalar_one()

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
            "fees_billed": float(booked),
            "total_collected": float(collected),
            "collected": float(collected),
            "balance_due": float(balance),
            "due": float(balance),
            "total_waived": float(total_waived),
            "waived": float(total_waived),
            "total_refunded": float(subj_refunded),
            "refunded": float(subj_refunded),
            "net_revenue": float(collected - subj_refunded),
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
            "fees_billed": float(gc_booked),
            "total_collected": float(gc_collected),
            "collected": float(gc_collected),
            "balance_due": float(max(Decimal("0.00"), gc_booked - gc_collected)),
            "due": float(max(Decimal("0.00"), gc_booked - gc_collected)),
            "total_waived": 0.0,
            "waived": 0.0,
            "total_refunded": 0.0,
            "refunded": 0.0,
            "net_revenue": float(gc_collected),
            "students": gc_students
        })

    search_str = search if isinstance(search, str) else None
    page_int = page if isinstance(page, int) else None
    page_size_int = page_size if isinstance(page_size, int) else None

    if search_str and search_str.strip():
        q = search_str.strip().lower()
        report = [s for s in report if q in s.get("subject_name", "").lower() or q in s.get("subject_code", "").lower()]

    if format == "csv":
        headers = ["Subject Code", "Subject Name", "Enrolled", "Total Booked (₹)", "Total Collected (₹)", "Balance Due (₹)"]
        rows = [
            [item["subject_code"], item["subject_name"], item["enrolled_count"], item["total_booked"], item["total_collected"], item["balance_due"]]
            for item in report
        ]
        csv_resp = generate_csv_response("subject_revenue_report.csv", headers, rows)
        await cache_set(cache_key, csv_resp, ttl=TTL_MEDIUM)
        return csv_resp

    total = len(report)
    if page_int is not None:
        effective_page_size = page_size_int or 15
        total_pages = max(1, (total + effective_page_size - 1) // effective_page_size) if total > 0 else 1
        start = (page_int - 1) * effective_page_size
        paged_items = report[start:start + effective_page_size]
        resp = {
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
            "total": total,
            "total_pages": total_pages,
            "page": page_int,
            "page_size": effective_page_size,
            "items": paged_items
        }
        await cache_set(cache_key, resp, ttl=TTL_MEDIUM)
        return resp

    resp = {
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
        "total": total,
        "total_pages": 1,
        "page": 1,
        "page_size": total or 15,
        "items": report
    }
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM)
    return resp


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
        search=None, page=None, page_size=None,
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
    format_str = format if isinstance(format, str) else None

    cache_key = make_cache_key(
        "reports", "batch_revenue",
        from_date=f_date, to_date=t_date, month=month, year=year, format=format_str,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached

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

    where_filter_all = [
        AdmissionItem.batch_id.is_not(None),
        Admission.status != "CANCELLED",
        *date_conds
    ]
    today = today_kolkata()

    # Bulk aggregates per batch
    agg_stmt = (
        select(
            AdmissionItem.batch_id,
            func.coalesce(func.sum(AdmissionItem.net_price), Decimal("0.00")),
            func.coalesce(func.count(AdmissionItem.id), 0),
            func.count(case((active_student_subject_filter(AdmissionItem, Admission, today), 1), else_=None)),
            func.count(case((and_(Admission.status == "ACTIVE", end_col < today), 1), else_=None)),
            func.count(func.distinct(Admission.student_id))
        )
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .where(and_(*where_filter_all))
        .group_by(AdmissionItem.batch_id)
    )
    agg_rows = (await db.execute(agg_stmt)).all()
    batch_metrics = {row[0]: (row[1], row[2], row[3], row[4], row[5]) for row in agg_rows}

    # Bulk fetch enrolled students for all matching batches
    stu_stmt = (
        select(AdmissionItem, Admission, Student)
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .join(Student, Admission.student_id == Student.id)
        .where(and_(*where_filter_all))
        .order_by(start_col.desc(), Student.name.asc())
    )
    stu_rows = (await db.execute(stu_stmt)).all()
    stu_item_ids = [itm.id for itm, adm, stu in stu_rows]
    stu_collected_map = await get_item_allocated_collected_map(db, stu_item_ids, f_date, t_date)

    batch_students_map = defaultdict(list)
    for itm, adm, stu in stu_rows:
        itm_coll = stu_collected_map.get(itm.id, Decimal("0.00"))
        c_info = _evaluate_student_cycle(
            itm.valid_from, itm.valid_to, adm.admission_date,
            itm.balance_due, itm.net_price, itm_coll
        )
        batch_students_map[itm.batch_id].append({
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
            "batch_id": str(itm.batch_id),
            "batch_name": "",
            "teacher_name": itm.teacher_name_snapshot or "Faculty",
            "hall_number": itm.hall_number_snapshot or "Main",
            **c_info
        })

    report = []
    for b in batches:
        booked, count, active_enr, inactive_enr, uniq_stu = batch_metrics.get(b.id, (Decimal("0.00"), 0, 0, 0, 0))
        collected = batch_collected_map.get(b.id, Decimal("0.00"))
        b_students = batch_students_map.get(b.id, [])
        for s in b_students:
            s["batch_name"] = b.name
            if not s["teacher_name"] or s["teacher_name"] == "Faculty":
                s["teacher_name"] = b.teacher_name_snapshot or "Faculty"
            if not s["hall_number"] or s["hall_number"] == "Main":
                s["hall_number"] = b.hall_number or "Main"

        report.append({
            "batch_id": str(b.id),
            "batch_code": b.batch_code,
            "batch_name": b.name,
            "teacher_name": b.teacher_name_snapshot,
            "hall_number": b.hall_number,
            "enrolled_count": count,
            "enrolments": count,
            "total_enrollments": count,
            "active_enrollments": active_enr or 0,
            "inactive_enrollments": inactive_enr or 0,
            "unique_students_count": uniq_stu or 0,
            "total_booked": float(booked),
            "fees_billed": float(booked),
            "total_collected": float(collected),
            "collections": float(collected),
            "balance_due": float(max(Decimal("0.00"), booked - collected)),
            "dues": float(max(Decimal("0.00"), booked - collected)),
            "status": b.status,
            "students": b_students
        })

    if format == "csv":
        headers = ["Batch Code", "Batch Name", "Teacher", "Hall", "Enrolled", "Total Booked (₹)", "Total Collected (₹)", "Balance Due (₹)"]
        rows = [
            [b["batch_code"], b["batch_name"], b["teacher_name"], b["hall_number"], b["enrolled_count"], b["total_booked"], b["total_collected"], b["balance_due"]]
            for b in report
        ]
        csv_resp = generate_csv_response("batch_revenue_report.csv", headers, rows)
        await cache_set(cache_key, csv_resp, ttl=TTL_MEDIUM)
        return csv_resp

    await cache_set(cache_key, report, ttl=TTL_MEDIUM)
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
    search: Optional[str] = Query(None, description="Search teacher name, code, specialization"),
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=100, description="Items per page"),
    format: Optional[str] = Query(None, description="Set to 'csv' for CSV export"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Teacher-wise associated subject and batch revenue report with date filtering
    and complete student roster. Collections derived strictly from PaymentAllocation ledger.
    """
    f_date, t_date = _resolve_date_range(from_date, to_date, month, year)
    search_str = search if isinstance(search, str) else None
    page_int = page if isinstance(page, int) else None
    page_size_int = page_size if isinstance(page_size, int) else None
    format_str = format if isinstance(format, str) else None

    cache_key = make_cache_key(
        "reports", "teacher_revenue",
        from_date=f_date, to_date=t_date, month=month, year=year,
        search=search_str, page=page_int, page_size=page_size_int, format=format_str,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached

    start_col = func.coalesce(AdmissionItem.valid_from, Admission.valid_from, Admission.admission_date)
    end_col = func.coalesce(AdmissionItem.valid_to, Admission.valid_to, Admission.admission_date + 30)

    date_conds = []
    if f_date:
        date_conds.append(end_col >= f_date)
    if t_date:
        date_conds.append(start_col <= t_date)

    teachers_res = await db.execute(select(Teacher).order_by(Teacher.name.asc()))
    teachers = teachers_res.scalars().all()

    # Preload batches and subjects associated with teachers
    b_res = await db.execute(select(Batch.id, Batch.teacher_id).where(Batch.teacher_id.is_not(None)))
    t_batch_ids_map = defaultdict(list)
    batch_to_teacher = {}
    for b_id, t_id in b_res.all():
        t_batch_ids_map[t_id].append(b_id)
        batch_to_teacher[b_id] = t_id

    s_res = await db.execute(select(Subject.id, Subject.teacher_id).where(Subject.teacher_id.is_not(None)))
    t_subj_ids_map = defaultdict(list)
    subj_to_teacher = {}
    for s_id, t_id in s_res.all():
        t_subj_ids_map[t_id].append(s_id)
        subj_to_teacher[s_id] = t_id

    # Ledger collected map for teachers
    teacher_collected_map = await get_teacher_revenue_from_ledger(db, f_date, t_date)

    # Bulk fetch all relevant student / admission items
    t_stu_stmt = (
        select(AdmissionItem, Admission, Student, Batch, Subject)
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .join(Student, Admission.student_id == Student.id)
        .outerjoin(Batch, AdmissionItem.batch_id == Batch.id)
        .outerjoin(Subject, AdmissionItem.subject_id == Subject.id)
        .where(and_(Admission.status != "CANCELLED", *date_conds))
        .order_by(start_col.desc(), Student.name.asc())
    )
    all_t_stu_rows = (await db.execute(t_stu_stmt)).all()
    all_item_ids = [itm.id for itm, adm, stu, bch, sub in all_t_stu_rows]
    all_t_collected_map = await get_item_allocated_collected_map(db, all_item_ids, f_date, t_date)

    # Group students and compute booked/count per teacher
    t_students_map = defaultdict(list)
    t_metrics = defaultdict(lambda: {"booked": Decimal("0.00"), "count": 0})

    for itm, adm, stu, bch, sub in all_t_stu_rows:
        matching_t_ids = set()
        if itm.teacher_id:
            matching_t_ids.add(itm.teacher_id)
        if bch and bch.teacher_id:
            matching_t_ids.add(bch.teacher_id)
        elif itm.batch_id in batch_to_teacher:
            matching_t_ids.add(batch_to_teacher[itm.batch_id])
        if sub and sub.teacher_id:
            matching_t_ids.add(sub.teacher_id)
        elif itm.subject_id in subj_to_teacher:
            matching_t_ids.add(subj_to_teacher[itm.subject_id])

        if not matching_t_ids:
            continue

        itm_coll = all_t_collected_map.get(itm.id, Decimal("0.00"))
        c_info = _evaluate_student_cycle(
            itm.valid_from, itm.valid_to, adm.admission_date,
            itm.balance_due, itm.net_price, itm_coll
        )

        stu_entry = {
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
        }

        for t_id in matching_t_ids:
            t_students_map[t_id].append(stu_entry)
            t_metrics[t_id]["booked"] += itm.net_price or Decimal("0.00")
            t_metrics[t_id]["count"] += 1

    report = []
    for t in teachers:
        b_ids = t_batch_ids_map.get(t.id, [])
        t_students = t_students_map.get(t.id, [])
        m = t_metrics[t.id]
        booked = m["booked"]
        count = m["count"]
        collected = teacher_collected_map.get(t.id, Decimal("0.00"))

        t_sub_names = sorted(list({s.get("subject_name") for s in t_students if s.get("subject_name")}))
        report.append({
            "teacher_id": str(t.id),
            "teacher_name": t.name,
            "teacher_code": t.teacher_code,
            "specialization": t.specialization,
            "batches_count": len(b_ids),
            "subjects": t_sub_names,
            "subjects_count": len(t_sub_names),
            "enrolled_count": count,
            "total_booked": float(booked),
            "fees_billed": float(booked),
            "total_collected": float(collected),
            "collections": float(collected),
            "balance_due": float(max(Decimal("0.00"), booked - collected)),
            "due": float(max(Decimal("0.00"), booked - collected)),
            "students": t_students
        })

    search_str = search if isinstance(search, str) else None
    page_int = page if isinstance(page, int) else None
    page_size_int = page_size if isinstance(page_size, int) else None

    if search_str and search_str.strip():
        q = search_str.strip().lower()
        report = [t for t in report if q in (t.get("teacher_name") or "").lower() or q in (t.get("teacher_code") or "").lower() or q in (t.get("specialization") or "").lower()]

    if format == "csv":
        headers = ["Teacher Code", "Teacher Name", "Specialization", "Batches", "Enrolled", "Total Booked (₹)", "Total Collected (₹)", "Balance Due (₹)"]
        rows = [
            [t["teacher_code"], t["teacher_name"], t["specialization"], t["batches_count"], t["enrolled_count"], t["total_booked"], t["total_collected"], t["balance_due"]]
            for t in report
        ]
        csv_resp = generate_csv_response("teacher_revenue_report.csv", headers, rows)
        await cache_set(cache_key, csv_resp, ttl=TTL_MEDIUM)
        return csv_resp

    total = len(report)
    summary = {
        "total_teachers": total,
        "total_billed": float(sum(t.get("fees_billed", 0) for t in report)),
        "total_collected": float(sum(t.get("collections", 0) for t in report)),
        "total_due": float(sum(t.get("due", 0) for t in report))
    }

    if page_int is not None:
        effective_page_size = page_size_int or 15
        total_pages = max(1, (total + effective_page_size - 1) // effective_page_size) if total > 0 else 1
        start = (page_int - 1) * effective_page_size
        paged_items = report[start:start + effective_page_size]
        resp = {
            "summary": summary,
            "items": paged_items,
            "total": total,
            "total_pages": total_pages,
            "page": page_int,
            "page_size": effective_page_size
        }
        await cache_set(cache_key, resp, ttl=TTL_MEDIUM)
        return resp

    await cache_set(cache_key, report, ttl=TTL_MEDIUM)
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
        search=None, page=None, page_size=None,
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
    cache_key = make_cache_key(
        "reports", "teacher_payable",
        from_date=f_date, to_date=t_date, month=month, year=year, format=format,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
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
        csv_resp = generate_csv_response("teacher_payable_report.csv", headers, rows)
        await cache_set(cache_key, csv_resp, ttl=TTL_MEDIUM)
        return csv_resp

    resp = {
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
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM)
    return resp


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
    cache_key = make_cache_key(
        "reports", "dues_by_subject",
        from_date=f_date, to_date=t_date, month=month, year=year, format=format,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
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
        csv_resp = generate_csv_response("dues_by_subject_report.csv", headers, rows)
        await cache_set(cache_key, csv_resp, ttl=TTL_MEDIUM)
        return csv_resp

    resp = {
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
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM)
    return resp


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
    cache_key = make_cache_key(
        "reports", "collection_by_cashier",
        from_date=f_date, to_date=t_date, month=month, year=year, format=format,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
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
        csv_resp = generate_csv_response("collection_by_cashier_report.csv", headers, rows)
        await cache_set(cache_key, csv_resp, ttl=TTL_MEDIUM)
        return csv_resp

    resp = {
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
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM)
    return resp


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
    cache_key = make_cache_key(
        "reports", "collection_by_mode",
        from_date=f_date, to_date=t_date, month=month, year=year, format=format,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
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
        csv_resp = generate_csv_response("collection_by_mode_report.csv", headers, rows)
        await cache_set(cache_key, csv_resp, ttl=TTL_MEDIUM)
        return csv_resp

    resp = {
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
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM)
    return resp


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
    cache_key = make_cache_key(
        "reports", "cash_movement",
        from_date=f_date, to_date=t_date, month=month, year=year,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached

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

        resp = {
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
        await cache_set(cache_key, resp, ttl=TTL_MEDIUM)
        return resp

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

    resp = {
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
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM)
    return resp


@router.get("/renewal-rate")
async def get_renewal_rate_report(
    from_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Specific month (1-12)"),
    year: Optional[int] = Query(None, description="Specific year (e.g. 2026)"),
    teacher_id: Optional[uuid.UUID] = Query(None, description="Filter by teacher"),
    subject_id: Optional[uuid.UUID] = Query(None, description="Filter by subject"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
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

    cache_key = make_cache_key(
        "reports", "renewal_rate",
        from_date=f_date, to_date=t_date, month=month, year=year,
        teacher_id=teacher_id, subject_id=subject_id,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached

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

    resp = {
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
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM)
    return resp


# =========================================================================
# Dedicated Reports Module Endpoints (10 Core Institute Reports)
# =========================================================================

@router.get("/collections")
async def get_collections_report(
    from_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    payment_mode: Optional[str] = Query(None, description="Filter by payment mode (CASH, UPI, etc.)"),
    cashier_id: Optional[uuid.UUID] = Query(None, description="Filter by cashier staff user"),
    search: Optional[str] = Query(None, description="Search student, receipt number, cashier, reference"),
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=100, description="Items per page"),
    format: Optional[str] = Query(None, description="Set to 'csv' for CSV export"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    (a) Collections report: Total collected by date range, broken down by payment mode and cashier.
    """
    cache_key = make_cache_key(
        "reports", "collections",
        from_date=from_date, to_date=to_date, payment_mode=payment_mode,
        cashier_id=cashier_id, search=search, page=page, page_size=page_size, format=format,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    lim = None if (format == "csv" or page is not None) else 500
    report = await get_collections_detailed(
        db, from_date=from_date, to_date=to_date,
        payment_mode=payment_mode, cashier_id=cashier_id, search=search,
        limit=lim,
        page=page if format != "csv" else None,
        page_size=page_size if format != "csv" else None
    )
    if format == "csv":
        headers = ["Payment Number", "Date", "Student Name", "Reg No", "Admission Number", "Amount (₹)", "Payment Mode", "Cashier", "Reference", "Notes"]
        rows = [
            [
                t["payment_number"], t["payment_date"][:10] if t["payment_date"] else "",
                t["student_name"], t["student_code"], t["admission_number"],
                t["amount"], t["payment_mode"], t["cashier_name"],
                t["transaction_reference"], t["notes"]
            ]
            for t in report["transactions"]
        ]
        csv_resp = generate_csv_response("collections_report.csv", headers, rows)
        await cache_set(cache_key, csv_resp, ttl=TTL_MEDIUM)
        return csv_resp
    await cache_set(cache_key, report, ttl=TTL_MEDIUM)
    return report


@router.get("/collections/csv")
async def get_collections_csv(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    payment_mode: Optional[str] = Query(None),
    cashier_id: Optional[uuid.UUID] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return await get_collections_report(
        from_date=from_date, to_date=to_date, payment_mode=payment_mode,
        cashier_id=cashier_id, search=search, format="csv", db=db, current_user=current_user
    )


@router.get("/dues-ageing")
async def get_dues_ageing_report(
    from_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    subject_id: Optional[uuid.UUID] = Query(None, description="Filter by subject"),
    batch_id: Optional[uuid.UUID] = Query(None, description="Filter by batch"),
    ageing_bucket: Optional[str] = Query(None, description="Ageing bucket: 0-30, 31-60, 61-90, 90+, or ALL"),
    search: Optional[str] = Query(None, description="Search student, code, mobile, admission"),
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=100, description="Items per page"),
    format: Optional[str] = Query(None, description="Set to 'csv' for CSV export"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    (b) Dues & ageing report: Outstanding dues by student, subject and batch, with ageing buckets.
    """
    cache_key = make_cache_key(
        "reports", "dues_ageing",
        from_date=from_date, to_date=to_date, subject_id=subject_id,
        batch_id=batch_id, ageing_bucket=ageing_bucket, search=search,
        page=page, page_size=page_size, format=format,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    lim = None if (format == "csv" or page is not None) else 500
    report = await get_dues_and_ageing(
        db, from_date=from_date, to_date=to_date,
        subject_id=subject_id, batch_id=batch_id, ageing_bucket=ageing_bucket, search=search,
        limit=lim,
        page=page if format != "csv" else None,
        page_size=page_size if format != "csv" else None
    )
    if format == "csv":
        headers = ["Student Name", "Reg No", "Mobile", "Admission Number", "Subject", "Batch", "Faculty", "Billed (₹)", "Paid (₹)", "Due (₹)", "Waived (₹)", "Days Overdue", "Ageing Bucket"]
        rows = [
            [
                i["student_name"], i["student_code"], i["mobile"], i["admission_number"],
                i["subject_name"], i["batch_name"], i["teacher_name"],
                i["net_price"], i["amount_collected"], i["balance_due"], i["written_off_amount"],
                i["age_days"], i["ageing_bucket"]
            ]
            for i in report["items"]
        ]
        csv_resp = generate_csv_response("dues_ageing_report.csv", headers, rows)
        await cache_set(cache_key, csv_resp, ttl=TTL_MEDIUM)
        return csv_resp
    await cache_set(cache_key, report, ttl=TTL_MEDIUM)
    return report


@router.get("/dues-ageing/csv")
async def get_dues_ageing_csv(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    subject_id: Optional[uuid.UUID] = Query(None),
    batch_id: Optional[uuid.UUID] = Query(None),
    ageing_bucket: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return await get_dues_ageing_report(
        from_date=from_date, to_date=to_date, subject_id=subject_id,
        batch_id=batch_id, ageing_bucket=ageing_bucket, search=search,
        format="csv", db=db, current_user=current_user
    )


@router.get("/subject-breakup")
async def get_subject_breakup_report(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    page: Optional[int] = Query(None, ge=1),
    page_size: Optional[int] = Query(None, ge=1, le=100),
    format: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    (c) Subject-wise breakup: per subject: students enrolled, fees billed, collected, due, waived, refunded and net revenue.
    """
    return await get_subject_revenue_report(
        from_date=from_date, to_date=to_date, month=month, year=year,
        search=search if isinstance(search, str) else None,
        page=page if isinstance(page, int) else None,
        page_size=page_size if isinstance(page_size, int) else None,
        format=format if isinstance(format, str) else None,
        db=db, current_user=current_user
    )


@router.get("/subject-breakup/csv")
async def get_subject_breakup_csv(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return await get_subject_breakup_report(
        from_date=from_date, to_date=to_date, month=month, year=year,
        search=search if isinstance(search, str) else None,
        format="csv", db=db, current_user=current_user
    )


@router.get("/teacher-breakup")
async def get_teacher_breakup_report(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    page: Optional[int] = Query(None, ge=1),
    page_size: Optional[int] = Query(None, ge=1, le=100),
    format: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    (d) Teacher-wise breakup: per teacher: subjects, students, collections.
    """
    return await get_teacher_revenue_report(
        from_date=from_date, to_date=to_date, month=month, year=year,
        search=search if isinstance(search, str) else None,
        page=page if isinstance(page, int) else None,
        page_size=page_size if isinstance(page_size, int) else None,
        format=format if isinstance(format, str) else None,
        db=db, current_user=current_user
    )


@router.get("/teacher-breakup/csv")
async def get_teacher_breakup_csv(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return await get_teacher_breakup_report(
        from_date=from_date, to_date=to_date, month=month, year=year,
        search=search if isinstance(search, str) else None,
        format="csv", db=db, current_user=current_user
    )


@router.get("/batch-breakup")
async def get_batch_breakup_report(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None),
    format: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    (e) Batch-wise report: per batch: enrolments, collections, dues.
    """
    return await get_batch_revenue_report(
        from_date=from_date, to_date=to_date, month=month, year=year,
        format=format, db=db, current_user=current_user
    )


@router.get("/batch-breakup/csv")
async def get_batch_breakup_csv(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return await get_batch_breakup_report(
        from_date=from_date, to_date=to_date, month=month, year=year,
        format="csv", db=db, current_user=current_user
    )


@router.get("/admissions-conversion")
async def get_admissions_conversion_api(
    from_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    subject_id: Optional[uuid.UUID] = Query(None),
    source: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=100, description="Items per page"),
    format: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    (f) Admissions & conversion report: enquiries received, converted to admissions, conversion rate, by subject and by source.
    """
    cache_key = make_cache_key(
        "reports", "admissions_conversion",
        from_date=from_date, to_date=to_date, subject_id=subject_id,
        source=source, search=search, page=page, page_size=page_size, format=format,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    report = await get_admissions_conversion_detailed(
        db, from_date=from_date, to_date=to_date,
        subject_id=subject_id, source=source, search=search,
        page=page if format != "csv" else None,
        page_size=page_size if format != "csv" else None
    )
    if format == "csv":
        headers = ["Enquiry Code", "Date", "Student Name", "Mobile", "Interested Subject", "Source", "Status", "Converted Student", "Admission Number"]
        rows = [
            [
                i["enquiry_code"], i["created_at"][:10] if i["created_at"] else "",
                i["student_name"], i["mobile"], i["interested_subject"],
                i["source"], i["status"], i["converted_student_name"] or "",
                i["admission_number"] or ""
            ]
            for i in report["items"]
        ]
        csv_resp = generate_csv_response("admissions_conversion_report.csv", headers, rows)
        await cache_set(cache_key, csv_resp, ttl=TTL_MEDIUM)
        return csv_resp
    await cache_set(cache_key, report, ttl=TTL_MEDIUM)
    return report


@router.get("/admissions-conversion/csv")
async def get_admissions_conversion_csv(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    subject_id: Optional[uuid.UUID] = Query(None),
    source: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return await get_admissions_conversion_api(
        from_date=from_date, to_date=to_date, subject_id=subject_id,
        source=source, search=search, format="csv", db=db, current_user=current_user
    )


@router.get("/waivers")
async def get_waivers_report_api(
    from_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    admin_id: Optional[uuid.UUID] = Query(None),
    search: Optional[str] = Query(None),
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=100, description="Items per page"),
    format: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    (g) Waivers report: all waived dues with admin, reason and audit reference.
    """
    cache_key = make_cache_key(
        "reports", "waivers",
        from_date=from_date, to_date=to_date, admin_id=admin_id,
        search=search, page=page, page_size=page_size, format=format,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    report = await get_waivers_detailed(
        db, from_date=from_date, to_date=to_date, admin_id=admin_id, search=search,
        page=page if format != "csv" else None,
        page_size=page_size if format != "csv" else None
    )
    if format == "csv":
        headers = ["Waiver Number", "Date", "Student Name", "Reg No", "Admission Number", "Waived Amount (₹)", "Approved By Admin", "Reason", "Audit Reference"]
        rows = [
            [
                w["waiver_number"], w["date"][:10] if w["date"] else "",
                w["student_name"], w["student_code"], w["admission_number"],
                w["waived_amount"], w["admin_name"], w["reason"], w["audit_reference"]
            ]
            for w in report["items"]
        ]
        csv_resp = generate_csv_response("waivers_report.csv", headers, rows)
        await cache_set(cache_key, csv_resp, ttl=TTL_MEDIUM)
        return csv_resp
    await cache_set(cache_key, report, ttl=TTL_MEDIUM)
    return report


@router.get("/waivers/csv")
async def get_waivers_csv(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    admin_id: Optional[uuid.UUID] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return await get_waivers_report_api(
        from_date=from_date, to_date=to_date, admin_id=admin_id,
        search=search, format="csv", db=db, current_user=current_user
    )


@router.get("/refunds")
async def get_refunds_report_api(
    from_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    refund_mode: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=100, description="Items per page"),
    format: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    (h) Refunds report: fee refunds with original payment, amount, deductions, mode, cashier, reason.
    """
    cache_key = make_cache_key(
        "reports", "refunds",
        from_date=from_date, to_date=to_date, refund_mode=refund_mode,
        search=search, page=page, page_size=page_size, format=format,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    report = await get_refunds_detailed(
        db, from_date=from_date, to_date=to_date, refund_mode=refund_mode, search=search,
        page=page if format != "csv" else None,
        page_size=page_size if format != "csv" else None
    )
    if format == "csv":
        headers = ["Refund Number", "Date", "Student Name", "Reg No", "Admission Number", "Payment Number", "Gross Requested (₹)", "Deduction (₹)", "Net Refunded (₹)", "Mode", "Processed By", "Reason"]
        rows = [
            [
                r["refund_number"], r["refund_date"][:10] if r["refund_date"] else "",
                r["student_name"], r["student_code"], r["admission_number"],
                r["payment_number"] or "", r["refund_amount_requested"],
                r["deduction_amount"], r["amount"], r["refund_mode"],
                r["processor_name"], r["reason"]
            ]
            for r in report["items"]
        ]
        csv_resp = generate_csv_response("refunds_report.csv", headers, rows)
        await cache_set(cache_key, csv_resp, ttl=TTL_MEDIUM)
        return csv_resp
    await cache_set(cache_key, report, ttl=TTL_MEDIUM)
    return report


@router.get("/refunds/csv")
async def get_refunds_csv(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    refund_mode: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return await get_refunds_report_api(
        from_date=from_date, to_date=to_date, refund_mode=refund_mode,
        search=search, format="csv", db=db, current_user=current_user
    )


@router.get("/expenses")
async def get_expenses_report_api(
    from_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    category_id: Optional[uuid.UUID] = Query(None),
    payment_mode: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=100, description="Items per page"),
    format: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    (i) Expenses report: operating expenses and staff/teacher salaries disbursed.
    """
    cache_key = make_cache_key(
        "reports", "expenses",
        from_date=from_date, to_date=to_date, category_id=category_id,
        payment_mode=payment_mode, search=search, page=page, page_size=page_size, format=format,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    report = await get_expenses_detailed(
        db, from_date=from_date, to_date=to_date,
        category_id=category_id, payment_mode=payment_mode, search=search,
        page=page if format != "csv" else None,
        page_size=page_size if format != "csv" else None
    )
    if format == "csv":
        headers = ["Date", "Type", "Title", "Category", "Amount (₹)", "Payment Mode", "Reference", "Added By", "Notes"]
        rows = [
            [
                i["date"], i["type"], i["title"], i["category_name"],
                i["amount"], i["payment_mode"], i["reference"],
                i["added_by_name"], i["notes"]
            ]
            for i in report["items"]
        ]
        csv_resp = generate_csv_response("expenses_report.csv", headers, rows)
        await cache_set(cache_key, csv_resp, ttl=TTL_MEDIUM)
        return csv_resp
    await cache_set(cache_key, report, ttl=TTL_MEDIUM)
    return report


@router.get("/expenses/csv")
async def get_expenses_csv(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    category_id: Optional[uuid.UUID] = Query(None),
    payment_mode: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return await get_expenses_report_api(
        from_date=from_date, to_date=to_date, category_id=category_id,
        payment_mode=payment_mode, search=search, format="csv", db=db, current_user=current_user
    )


@router.get("/summary-dashboard")
async def get_summary_dashboard_api(
    period: str = Query("daily", pattern="^(daily|monthly)$"),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None),
    format: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    (j) Daily / monthly summary dashboard (billed, collected, due, expenses, net cash).
    """
    cache_key = make_cache_key(
        "reports", "summary_dashboard",
        period=period, from_date=from_date, to_date=to_date,
        month=month, year=year, format=format,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    report = await get_summary_dashboard_detailed(
        db, period=period, from_date=from_date, to_date=to_date, month=month, year=year
    )
    if format == "csv":
        headers = ["Period", "Fees Billed (₹)", "Collected (₹)", "Due (₹)", "Expenses (₹)", "Refunds (₹)", "Net Cash (₹)"]
        rows = [
            [
                i["period_label"], i["billed"], i["collected"], i["due"],
                i["expenses"], i["refunds"], i["net_cash"]
            ]
            for i in report["intervals"]
        ]
        csv_resp = generate_csv_response("summary_dashboard.csv", headers, rows)
        await cache_set(cache_key, csv_resp, ttl=TTL_MEDIUM)
        return csv_resp
    await cache_set(cache_key, report, ttl=TTL_MEDIUM)
    return report


@router.get("/summary-dashboard/csv")
async def get_summary_dashboard_csv(
    period: str = Query("daily", pattern="^(daily|monthly)$"),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return await get_summary_dashboard_api(
        period=period, from_date=from_date, to_date=to_date,
        month=month, year=year, format="csv", db=db, current_user=current_user
    )

