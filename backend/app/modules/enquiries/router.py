import uuid
import calendar
from datetime import date, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, desc, case

from app.database.session import get_db
from app.core.dependencies import require_staff, require_cashier_or_admin
from app.database.models import Enquiry, EnquiryDemoItem, Student, User, Teacher, Subject, Batch
from app.modules.enquiries.schemas import (
    EnquiryCreate, EnquiryUpdate, EnquiryResponse, ConvertEnquiryRequest,
    EnquiryDemoItemResponse, EnquiryDemoItemStatusUpdate, EnquiryDemoRegisterItem,
    DemoAnalyticsResponse, DemoAnalyticsSummary, TeacherDemoMetric, SubjectDemoMetric
)
from app.common.pagination import PaginationParams, PageResponse

router = APIRouter(prefix="/api/enquiries", tags=["Enquiries"])


def _resolve_month_date_range(
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


async def _generate_demo_reference_number(db: AsyncSession, offset: int = 0) -> str:
    """Generate sequential unique demo reference number: DEM-YYYY-NNNN."""
    year_str = date.today().strftime("%Y")
    prefix = f"DEM-{year_str}-"
    query = select(EnquiryDemoItem.demo_reference_number).where(
        EnquiryDemoItem.demo_reference_number.like(f"{prefix}%")
    ).order_by(desc(EnquiryDemoItem.demo_reference_number)).limit(1)
    res = await db.execute(query)
    last_ref = res.scalar_one_or_none()
    if last_ref:
        try:
            last_seq = int(last_ref.split("-")[-1])
        except Exception:
            last_seq = 0
    else:
        count_res = await db.execute(select(func.count(EnquiryDemoItem.id)))
        last_seq = count_res.scalar_one() or 0
    
    cnt = last_seq + 1 + offset
    return f"DEM-{year_str}-{cnt:04d}"


def _format_demo_item_response(itm: EnquiryDemoItem, today: date) -> EnquiryDemoItemResponse:
    rem = (itm.demo_end_date - today).days
    if itm.status == "CONVERTED":
        lbl, var = "Admitted", "success"
    elif itm.status == "ATTENDED":
        lbl, var = "Attended", "info"
    elif itm.status == "DROPPED":
        lbl, var = "Dropped", "danger"
    elif itm.status == "EXPIRED" or (itm.status == "SCHEDULED" and rem < 0):
        lbl, var = "Expired", "danger"
    else:
        lbl, var = "Active Demo", "warning" if rem <= 1 else "success"

    return EnquiryDemoItemResponse(
        id=itm.id,
        enquiry_id=itm.enquiry_id,
        demo_reference_number=itm.demo_reference_number,
        subject_id=itm.subject_id,
        batch_id=itm.batch_id,
        teacher_id=itm.teacher_id,
        subject_name_snapshot=itm.subject_name_snapshot,
        teacher_name_snapshot=itm.teacher_name_snapshot,
        hall_number_snapshot=itm.hall_number_snapshot,
        demo_start_date=itm.demo_start_date,
        demo_end_date=itm.demo_end_date,
        demo_duration_days=itm.demo_duration_days,
        status=itm.status,
        drop_reason=itm.drop_reason,
        notes=itm.notes,
        converted_admission_item_id=itm.converted_admission_item_id,
        days_remaining=rem,
        status_label=lbl,
        badge_variant=var
    )


@router.get("", response_model=PageResponse[EnquiryResponse])
async def list_enquiries(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
    status: Optional[str] = None,
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2020),
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    """
    Returns list of enquiries with database-level search, status filtering,
    month-wise filtering, and populated child demo items.
    """
    query = select(Enquiry)
    count_query = select(func.count(Enquiry.id))

    # Search filter
    if search:
        search_pattern = f"%{search.strip()}%"
        filter_clause = or_(
            Enquiry.student_name.ilike(search_pattern),
            Enquiry.enquiry_code.ilike(search_pattern),
            Enquiry.mobile.ilike(search_pattern),
            Enquiry.interested_subject.ilike(search_pattern)
        )
        query = query.where(filter_clause)
        count_query = count_query.where(filter_clause)

    # Status filter
    effective_status = status_filter or status
    if effective_status:
        query = query.where(Enquiry.status == effective_status)
        count_query = count_query.where(Enquiry.status == effective_status)

    # Month / Date range filtering
    f_date, t_date = _resolve_month_date_range(from_date, to_date, month, year)
    if f_date:
        query = query.where(func.date(Enquiry.created_at) >= f_date)
        count_query = count_query.where(func.date(Enquiry.created_at) >= f_date)
    if t_date:
        query = query.where(func.date(Enquiry.created_at) <= t_date)
        count_query = count_query.where(func.date(Enquiry.created_at) <= t_date)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(desc(Enquiry.created_at)).offset(offset).limit(page_size)
    items_result = await db.execute(query)
    items = items_result.scalars().all()

    today = date.today()
    response_items = []
    for item in items:
        rem_days = None
        if item.demo_deadline:
            rem_days = (item.demo_deadline - today).days

        # Format child demo items
        formatted_demo_items = []
        if hasattr(item, 'demo_items') and item.demo_items:
            formatted_demo_items = [_format_demo_item_response(d, today) for d in item.demo_items]

        resp = EnquiryResponse(
            id=item.id,
            enquiry_code=item.enquiry_code,
            student_name=item.student_name,
            mobile=item.mobile,
            father_name=item.father_name,
            school_college=item.school_college,
            purpose=item.purpose,
            interested_subject=item.interested_subject,
            demo_start_date=item.demo_start_date,
            demo_duration_days=item.demo_duration_days,
            demo_deadline=item.demo_deadline,
            notes=item.notes,
            status=item.status,
            remaining_days=rem_days,
            converted_student_id=item.converted_student_id,
            created_by=item.created_by,
            demo_items=formatted_demo_items
        )
        response_items.append(resp)

    return PageResponse.create(items=response_items, total=total, params=PaginationParams(page=page, page_size=page_size))


@router.get("/demos", response_model=PageResponse[EnquiryDemoRegisterItem])
async def list_individual_demo_items(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
    teacher_id: Optional[uuid.UUID] = None,
    subject_id: Optional[uuid.UUID] = None,
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2020),
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    """
    Returns individual demo ticket records (passes) with database-level search,
    status filtering, teacher filtering, subject filtering, and month-wise date filtering.
    """
    query = (
        select(EnquiryDemoItem, Enquiry)
        .join(Enquiry, EnquiryDemoItem.enquiry_id == Enquiry.id)
    )
    count_query = (
        select(func.count(EnquiryDemoItem.id))
        .join(Enquiry, EnquiryDemoItem.enquiry_id == Enquiry.id)
    )

    # Search filter
    if search and search.strip():
        pat = f"%{search.strip()}%"
        filter_clause = or_(
            EnquiryDemoItem.demo_reference_number.ilike(pat),
            Enquiry.student_name.ilike(pat),
            Enquiry.mobile.ilike(pat),
            EnquiryDemoItem.teacher_name_snapshot.ilike(pat),
            EnquiryDemoItem.subject_name_snapshot.ilike(pat)
        )
        query = query.where(filter_clause)
        count_query = count_query.where(filter_clause)

    # Status filter
    if status_filter and status_filter != "ALL":
        today = date.today()
        if status_filter == "ACTIVE":
            cond = and_(EnquiryDemoItem.status == "SCHEDULED", EnquiryDemoItem.demo_end_date >= today)
        elif status_filter == "EXPIRED":
            cond = or_(EnquiryDemoItem.status == "EXPIRED", and_(EnquiryDemoItem.status == "SCHEDULED", EnquiryDemoItem.demo_end_date < today))
        else:
            cond = (EnquiryDemoItem.status == status_filter)
        query = query.where(cond)
        count_query = count_query.where(cond)

    # Teacher filter
    if teacher_id:
        query = query.where(EnquiryDemoItem.teacher_id == teacher_id)
        count_query = count_query.where(EnquiryDemoItem.teacher_id == teacher_id)

    # Subject filter
    if subject_id:
        query = query.where(EnquiryDemoItem.subject_id == subject_id)
        count_query = count_query.where(EnquiryDemoItem.subject_id == subject_id)

    # Month / Date range filtering
    f_date, t_date = _resolve_month_date_range(from_date, to_date, month, year)
    if f_date:
        query = query.where(EnquiryDemoItem.demo_start_date >= f_date)
        count_query = count_query.where(EnquiryDemoItem.demo_start_date >= f_date)
    if t_date:
        query = query.where(EnquiryDemoItem.demo_start_date <= t_date)
        count_query = count_query.where(EnquiryDemoItem.demo_start_date <= t_date)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(desc(EnquiryDemoItem.demo_start_date), desc(EnquiryDemoItem.created_at)).offset(offset).limit(page_size)
    rows = (await db.execute(query)).all()

    today = date.today()
    items = []
    for ditm, enq in rows:
        rem = (ditm.demo_end_date - today).days
        if ditm.status == "CONVERTED":
            lbl, var = "Admitted", "success"
        elif ditm.status == "ATTENDED":
            lbl, var = "Attended", "info"
        elif ditm.status == "DROPPED":
            lbl, var = "Dropped", "danger"
        elif ditm.status == "EXPIRED" or (ditm.status == "SCHEDULED" and rem < 0):
            lbl, var = "Expired", "danger"
        else:
            lbl, var = "Active Demo", "warning" if rem <= 1 else "success"

        items.append(EnquiryDemoRegisterItem(
            demo_item_id=ditm.id,
            enquiry_id=enq.id,
            enquiry_code=enq.enquiry_code,
            demo_reference_number=ditm.demo_reference_number,
            student_name=enq.student_name,
            mobile=enq.mobile,
            father_name=enq.father_name,
            school_college=enq.school_college,
            subject_id=ditm.subject_id,
            subject_name=ditm.subject_name_snapshot,
            batch_id=ditm.batch_id,
            batch_name=None,
            teacher_id=ditm.teacher_id,
            teacher_name=ditm.teacher_name_snapshot,
            hall_number=ditm.hall_number_snapshot,
            demo_start_date=ditm.demo_start_date,
            demo_end_date=ditm.demo_end_date,
            demo_duration_days=ditm.demo_duration_days,
            days_remaining=rem,
            status=ditm.status,
            status_label=lbl,
            badge_variant=var,
            drop_reason=ditm.drop_reason,
            notes=ditm.notes,
            converted_admission_item_id=ditm.converted_admission_item_id
        ))

    return PageResponse.create(items=items, total=total, params=PaginationParams(page=page, page_size=page_size))


@router.get("/analytics", response_model=DemoAnalyticsResponse)
async def get_demo_analytics(
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2020),
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    teacher_id: Optional[uuid.UUID] = None,
    subject_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    """
    Returns pre-computed database-level demo analytics:
    Teacher-wise conversion metrics, subject-wise demo breakdown, and overall conversion summary.
    """
    today = date.today()
    f_date, t_date = _resolve_month_date_range(from_date, to_date, month, year)

    where_filter = []
    if f_date:
        where_filter.append(EnquiryDemoItem.demo_start_date >= f_date)
    if t_date:
        where_filter.append(EnquiryDemoItem.demo_start_date <= t_date)
    if teacher_id:
        where_filter.append(EnquiryDemoItem.teacher_id == teacher_id)
    if subject_id:
        where_filter.append(EnquiryDemoItem.subject_id == subject_id)

    filter_clause = and_(*where_filter) if where_filter else True

    # 1. Overall Summary Metrics
    summary_stmt = (
        select(
            func.count(EnquiryDemoItem.id),
            func.count(case((and_(EnquiryDemoItem.status == "SCHEDULED", EnquiryDemoItem.demo_end_date >= today), 1), else_=None)),
            func.count(case((EnquiryDemoItem.status == "ATTENDED", 1), else_=None)),
            func.count(case((EnquiryDemoItem.status == "CONVERTED", 1), else_=None)),
            func.count(case((EnquiryDemoItem.status == "DROPPED", 1), else_=None))
        )
        .where(filter_clause)
    )
    s_row = (await db.execute(summary_stmt)).one()
    tot_d, act_d, att_d, conv_d, drop_d = s_row
    tot_d = tot_d or 0
    conv_d = conv_d or 0
    drop_d = drop_d or 0
    overall_rate = round((conv_d / (conv_d + drop_d) * 100), 1) if (conv_d + drop_d) > 0 else (round((conv_d / tot_d * 100), 1) if tot_d > 0 else 0.0)

    summary = DemoAnalyticsSummary(
        total_demos=tot_d,
        active_demos=act_d or 0,
        attended_demos=att_d or 0,
        converted_admissions=conv_d,
        dropped_demos=drop_d,
        overall_conversion_rate=overall_rate
    )

    # 2. Teacher-wise Demo Performance & Conversion Rate
    t_stmt = (
        select(
            EnquiryDemoItem.teacher_id,
            func.coalesce(EnquiryDemoItem.teacher_name_snapshot, "General Faculty"),
            func.count(EnquiryDemoItem.id),
            func.count(case((and_(EnquiryDemoItem.status == "SCHEDULED", EnquiryDemoItem.demo_end_date >= today), 1), else_=None)),
            func.count(case((EnquiryDemoItem.status == "ATTENDED", 1), else_=None)),
            func.count(case((EnquiryDemoItem.status == "CONVERTED", 1), else_=None)),
            func.count(case((EnquiryDemoItem.status == "DROPPED", 1), else_=None)),
            func.count(case((or_(EnquiryDemoItem.status == "EXPIRED", and_(EnquiryDemoItem.status == "SCHEDULED", EnquiryDemoItem.demo_end_date < today)), 1), else_=None))
        )
        .where(filter_clause)
        .group_by(EnquiryDemoItem.teacher_id, EnquiryDemoItem.teacher_name_snapshot)
        .order_by(desc(func.count(EnquiryDemoItem.id)))
    )
    t_rows = (await db.execute(t_stmt)).all()
    by_teacher = []
    for tid, tname, t_tot, t_act, t_att, t_conv, t_drop, t_exp in t_rows:
        t_conv = t_conv or 0
        t_drop = t_drop or 0
        t_tot = t_tot or 0
        rate = round((t_conv / (t_conv + t_drop) * 100), 1) if (t_conv + t_drop) > 0 else (round((t_conv / t_tot * 100), 1) if t_tot > 0 else 0.0)
        by_teacher.append(TeacherDemoMetric(
            teacher_id=tid,
            teacher_name=tname,
            total_demos=t_tot,
            active_demos=t_act or 0,
            attended_demos=t_att or 0,
            converted_admissions=t_conv,
            dropped_demos=t_drop,
            expired_demos=t_exp or 0,
            conversion_rate_percentage=rate
        ))

    # 3. Subject-wise Demo Demand & Conversion
    sub_stmt = (
        select(
            EnquiryDemoItem.subject_id,
            EnquiryDemoItem.subject_name_snapshot,
            func.count(EnquiryDemoItem.id),
            func.count(case((and_(EnquiryDemoItem.status == "SCHEDULED", EnquiryDemoItem.demo_end_date >= today), 1), else_=None)),
            func.count(case((EnquiryDemoItem.status == "CONVERTED", 1), else_=None)),
            func.count(case((EnquiryDemoItem.status == "DROPPED", 1), else_=None))
        )
        .where(filter_clause)
        .group_by(EnquiryDemoItem.subject_id, EnquiryDemoItem.subject_name_snapshot)
        .order_by(desc(func.count(EnquiryDemoItem.id)))
    )
    sub_rows = (await db.execute(sub_stmt)).all()
    by_subject = []
    for sid, sname, s_tot, s_act, s_conv, s_drop in sub_rows:
        s_conv = s_conv or 0
        s_drop = s_drop or 0
        s_tot = s_tot or 0
        rate = round((s_conv / (s_conv + s_drop) * 100), 1) if (s_conv + s_drop) > 0 else (round((s_conv / s_tot * 100), 1) if s_tot > 0 else 0.0)
        by_subject.append(SubjectDemoMetric(
            subject_id=sid,
            subject_name=sname,
            total_demos=s_tot,
            active_demos=s_act or 0,
            converted_admissions=s_conv,
            dropped_demos=s_drop,
            conversion_rate_percentage=rate
        ))

    return DemoAnalyticsResponse(
        summary=summary,
        by_teacher=by_teacher,
        by_subject=by_subject,
        filters={
            "month": month,
            "year": year,
            "from_date": str(f_date) if f_date else None,
            "to_date": str(t_date) if t_date else None,
        }
    )


@router.get("/summary")
async def get_enquiry_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    stmt = select(Enquiry.status, func.count(Enquiry.id)).group_by(Enquiry.status)
    res = await db.execute(stmt)
    status_counts = dict(res.all())
    
    total = sum(status_counts.values())
    return {
        "total": total,
        "ACTIVE_DEMO": status_counts.get("ACTIVE_DEMO", 0),
        "INTERESTED": status_counts.get("INTERESTED", 0),
        "PENDING": status_counts.get("PENDING", 0),
        "CONVERTED": status_counts.get("CONVERTED", 0),
        "EXPIRED": status_counts.get("EXPIRED", 0),
        "NOT_INTERESTED": status_counts.get("NOT_INTERESTED", 0),
    }


@router.get("/upcoming-deadlines", response_model=list[EnquiryResponse])
async def get_upcoming_demo_deadlines(
    days_ahead: int = Query(7, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    today = date.today()
    max_date = today + timedelta(days=days_ahead)
    
    query = select(Enquiry).where(
        Enquiry.status.in_(["PENDING", "ACTIVE_DEMO", "INTERESTED"]),
        Enquiry.demo_deadline.isnot(None),
        Enquiry.demo_deadline <= max_date
    ).order_by(Enquiry.demo_deadline.asc())

    result = await db.execute(query)
    items = result.scalars().all()

    response_items = []
    for item in items:
        rem_days = (item.demo_deadline - today).days if item.demo_deadline else None
        formatted_demo_items = []
        if hasattr(item, 'demo_items') and item.demo_items:
            formatted_demo_items = [_format_demo_item_response(d, today) for d in item.demo_items]

        response_items.append(
            EnquiryResponse(
                id=item.id,
                enquiry_code=item.enquiry_code,
                student_name=item.student_name,
                mobile=item.mobile,
                father_name=item.father_name,
                school_college=item.school_college,
                purpose=item.purpose,
                interested_subject=item.interested_subject,
                demo_start_date=item.demo_start_date,
                demo_duration_days=item.demo_duration_days,
                demo_deadline=item.demo_deadline,
                notes=item.notes,
                status=item.status,
                remaining_days=rem_days,
                converted_student_id=item.converted_student_id,
                created_by=item.created_by,
                demo_items=formatted_demo_items
            )
        )
    return response_items


@router.post("", response_model=EnquiryResponse, status_code=status.HTTP_201_CREATED)
async def create_enquiry(
    payload: EnquiryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    """
    Creates master enquiry ticket and automatically creates individual child
    EnquiryDemoItem records with unique DEM-YYYY-NNNN reference numbers for each subject.
    """
    year_str = date.today().strftime("%Y")
    count_query = select(func.count(Enquiry.id))
    cnt_res = await db.execute(count_query)
    seq = (cnt_res.scalar_one() or 0) + 1
    enquiry_code = f"ENQ{year_str}{seq:04d}"

    demo_start = payload.demo_start_date or date.today()
    demo_duration = payload.demo_duration_days or 3
    deadline = demo_start + timedelta(days=demo_duration)

    # Determine summary interested subject string
    summary_subject = payload.interested_subject or ""
    if payload.demo_items and len(payload.demo_items) > 0:
        names = []
        for ditm in payload.demo_items:
            if ditm.subject_name:
                names.append(ditm.subject_name)
            elif ditm.subject_id:
                sub = (await db.execute(select(Subject).where(Subject.id == ditm.subject_id))).scalar_one_or_none()
                if sub: names.append(sub.name)
        if names:
            summary_subject = ", ".join(names)

    enquiry = Enquiry(
        enquiry_code=enquiry_code,
        student_name=payload.student_name,
        mobile=payload.mobile,
        father_name=payload.father_name,
        school_college=payload.school_college,
        purpose=payload.purpose or "Admission Enquiry",
        interested_subject=summary_subject or "General Course Demo",
        demo_start_date=demo_start,
        demo_duration_days=demo_duration,
        demo_deadline=deadline,
        notes=payload.notes,
        status="ACTIVE_DEMO" if (payload.demo_items or payload.demo_start_date) else payload.status,
        created_by=current_user.id
    )
    db.add(enquiry)
    await db.flush()

    # Create child EnquiryDemoItem records
    child_items = []
    if payload.demo_items and len(payload.demo_items) > 0:
        for idx, itm in enumerate(payload.demo_items):
            sub = None
            if itm.subject_id:
                sub = (await db.execute(select(Subject).where(Subject.id == itm.subject_id))).scalar_one_or_none()
            
            bch = None
            if itm.batch_id:
                bch = (await db.execute(select(Batch).where(Batch.id == itm.batch_id))).scalar_one_or_none()

            tch = None
            if itm.teacher_id:
                tch = (await db.execute(select(Teacher).where(Teacher.id == itm.teacher_id))).scalar_one_or_none()
            elif sub and sub.teacher_id:
                tch = (await db.execute(select(Teacher).where(Teacher.id == sub.teacher_id))).scalar_one_or_none()
            elif bch and bch.teacher_id:
                tch = (await db.execute(select(Teacher).where(Teacher.id == bch.teacher_id))).scalar_one_or_none()

            s_name = itm.subject_name or itm.subject_name_snapshot or (sub.name if sub else (bch.name if bch else "General Demo"))
            t_name = itm.teacher_name_snapshot or (tch.name if tch else (sub.teacher_name_snapshot if sub else (bch.teacher_name_snapshot if bch else None)))
            h_no = itm.hall_number_snapshot or (bch.hall_number if bch else (sub.hall_number if sub else "Main Hall"))
            
            itm_start = itm.demo_start_date or demo_start
            itm_duration = itm.demo_duration_days or demo_duration
            itm_end = itm_start + timedelta(days=itm_duration)
            ref_no = await _generate_demo_reference_number(db, offset=idx)

            demo_item = EnquiryDemoItem(
                enquiry_id=enquiry.id,
                demo_reference_number=ref_no,
                subject_id=itm.subject_id,
                batch_id=itm.batch_id,
                teacher_id=tch.id if tch else None,
                subject_name_snapshot=s_name,
                teacher_name_snapshot=t_name,
                hall_number_snapshot=h_no,
                demo_start_date=itm_start,
                demo_end_date=itm_end,
                demo_duration_days=itm_duration,
                status="SCHEDULED",
                notes=itm.notes
            )
            db.add(demo_item)
            child_items.append(demo_item)
    else:
        # Create 1 default demo item so that every enquiry receives a verifiable demo slip
        ref_no = await _generate_demo_reference_number(db)
        demo_item = EnquiryDemoItem(
            enquiry_id=enquiry.id,
            demo_reference_number=ref_no,
            subject_id=None,
            batch_id=None,
            teacher_id=None,
            subject_name_snapshot=enquiry.interested_subject or "General Course Demo",
            teacher_name_snapshot=None,
            hall_number_snapshot="Main Campus",
            demo_start_date=demo_start,
            demo_end_date=deadline,
            demo_duration_days=demo_duration,
            status="SCHEDULED",
            notes=payload.notes
        )
        db.add(demo_item)
        child_items.append(demo_item)

    await db.commit()
    await db.refresh(enquiry)

    today = date.today()
    rem_days = (enquiry.demo_deadline - today).days if enquiry.demo_deadline else None
    formatted_children = [_format_demo_item_response(d, today) for d in child_items]

    return EnquiryResponse(
        id=enquiry.id,
        enquiry_code=enquiry.enquiry_code,
        student_name=enquiry.student_name,
        mobile=enquiry.mobile,
        father_name=enquiry.father_name,
        school_college=enquiry.school_college,
        purpose=enquiry.purpose,
        interested_subject=enquiry.interested_subject,
        demo_start_date=enquiry.demo_start_date,
        demo_duration_days=enquiry.demo_duration_days,
        demo_deadline=enquiry.demo_deadline,
        notes=enquiry.notes,
        status=enquiry.status,
        remaining_days=rem_days,
        converted_student_id=enquiry.converted_student_id,
        created_by=enquiry.created_by,
        demo_items=formatted_children
    )


@router.get("/{enquiry_id}", response_model=EnquiryResponse)
async def get_enquiry(
    enquiry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    res = await db.execute(select(Enquiry).where(Enquiry.id == enquiry_id))
    enquiry = res.scalar_one_or_none()
    if not enquiry:
        raise HTTPException(status_code=404, detail="Enquiry not found")

    today = date.today()
    rem_days = (enquiry.demo_deadline - today).days if enquiry.demo_deadline else None

    # Load child demo items
    d_res = await db.execute(select(EnquiryDemoItem).where(EnquiryDemoItem.enquiry_id == enquiry.id).order_by(EnquiryDemoItem.demo_start_date.asc()))
    d_items = d_res.scalars().all()
    formatted_demo_items = [_format_demo_item_response(d, today) for d in d_items]

    return EnquiryResponse(
        id=enquiry.id,
        enquiry_code=enquiry.enquiry_code,
        student_name=enquiry.student_name,
        mobile=enquiry.mobile,
        father_name=enquiry.father_name,
        school_college=enquiry.school_college,
        purpose=enquiry.purpose,
        interested_subject=enquiry.interested_subject,
        demo_start_date=enquiry.demo_start_date,
        demo_duration_days=enquiry.demo_duration_days,
        demo_deadline=enquiry.demo_deadline,
        notes=enquiry.notes,
        status=enquiry.status,
        remaining_days=rem_days,
        converted_student_id=enquiry.converted_student_id,
        created_by=enquiry.created_by,
        demo_items=formatted_demo_items
    )


@router.put("/demos/{demo_item_id}/status", response_model=EnquiryDemoItemResponse)
async def update_demo_item_status(
    demo_item_id: uuid.UUID,
    payload: EnquiryDemoItemStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    """Update status of individual subject demo item (e.g. ATTENDED, DROPPED with reason)."""
    d_res = await db.execute(select(EnquiryDemoItem).where(EnquiryDemoItem.id == demo_item_id))
    item = d_res.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Demo item not found")

    item.status = payload.status
    if payload.drop_reason:
        item.drop_reason = payload.drop_reason
    if payload.notes:
        item.notes = payload.notes

    # Sync parent enquiry status if all child demos are converted or dropped
    enq_res = await db.execute(select(Enquiry).where(Enquiry.id == item.enquiry_id))
    parent_enq = enq_res.scalar_one_or_none()
    if parent_enq:
        all_child_res = await db.execute(select(EnquiryDemoItem.status).where(EnquiryDemoItem.enquiry_id == item.enquiry_id))
        child_statuses = all_child_res.scalars().all()
        if all(s == "CONVERTED" for s in child_statuses):
            parent_enq.status = "CONVERTED"
        elif all(s == "DROPPED" for s in child_statuses):
            parent_enq.status = "NOT_INTERESTED"
        elif any(s == "ATTENDED" for s in child_statuses):
            parent_enq.status = "INTERESTED"

    await db.commit()
    await db.refresh(item)
    return _format_demo_item_response(item, date.today())


@router.put("/{enquiry_id}", response_model=EnquiryResponse)
async def update_enquiry(
    enquiry_id: uuid.UUID,
    payload: EnquiryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    res = await db.execute(select(Enquiry).where(Enquiry.id == enquiry_id))
    enquiry = res.scalar_one_or_none()
    if not enquiry:
        raise HTTPException(status_code=404, detail="Enquiry not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(enquiry, field, val)

    if "demo_start_date" in update_data or "demo_duration_days" in update_data:
        if enquiry.demo_start_date:
            enquiry.demo_deadline = enquiry.demo_start_date + timedelta(days=enquiry.demo_duration_days)
        else:
            enquiry.demo_deadline = None

    await db.commit()
    await db.refresh(enquiry)

    today = date.today()
    rem_days = (enquiry.demo_deadline - today).days if enquiry.demo_deadline else None
    d_res = await db.execute(select(EnquiryDemoItem).where(EnquiryDemoItem.enquiry_id == enquiry.id).order_by(EnquiryDemoItem.demo_start_date.asc()))
    d_items = d_res.scalars().all()
    formatted_demo_items = [_format_demo_item_response(d, today) for d in d_items]

    return EnquiryResponse(
        id=enquiry.id,
        enquiry_code=enquiry.enquiry_code,
        student_name=enquiry.student_name,
        mobile=enquiry.mobile,
        father_name=enquiry.father_name,
        school_college=enquiry.school_college,
        purpose=enquiry.purpose,
        interested_subject=enquiry.interested_subject,
        demo_start_date=enquiry.demo_start_date,
        demo_duration_days=enquiry.demo_duration_days,
        demo_deadline=enquiry.demo_deadline,
        notes=enquiry.notes,
        status=enquiry.status,
        remaining_days=rem_days,
        converted_student_id=enquiry.converted_student_id,
        created_by=enquiry.created_by,
        demo_items=formatted_demo_items
    )


@router.post("/{enquiry_id}/convert", status_code=status.HTTP_200_OK)
async def convert_enquiry_to_student(
    enquiry_id: uuid.UUID,
    payload: Optional[ConvertEnquiryRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    """
    Converts enquiry to student profile and updates child demo items to CONVERTED.
    Supports selective conversion of specific demo subjects.
    """
    req = payload or ConvertEnquiryRequest()
    res = await db.execute(select(Enquiry).where(Enquiry.id == enquiry_id))
    enquiry = res.scalar_one_or_none()
    if not enquiry:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    if enquiry.status == "CONVERTED" and enquiry.converted_student_id:
        raise HTTPException(status_code=400, detail="Enquiry has already been converted to a student")

    # Generate student registration code
    year_str = date.today().strftime("%Y")
    cnt_res = await db.execute(select(func.count(Student.id)))
    seq = (cnt_res.scalar_one() or 0) + 1
    reg_no = f"STU{year_str}{seq:04d}"

    student = Student(
        student_code=reg_no,
        name=enquiry.student_name,
        father_name=req.father_name or enquiry.father_name,
        mobile=enquiry.mobile,
        email=req.email,
        address=req.address,
        status="ACTIVE"
    )
    db.add(student)
    await db.flush()

    enquiry.status = "CONVERTED"
    enquiry.converted_student_id = student.id

    # Update demo items to CONVERTED
    d_stmt = select(EnquiryDemoItem).where(EnquiryDemoItem.enquiry_id == enquiry.id)
    if req.demo_item_ids and len(req.demo_item_ids) > 0:
        d_stmt = d_stmt.where(EnquiryDemoItem.id.in_(req.demo_item_ids))
    
    d_rows = (await db.execute(d_stmt)).scalars().all()
    for d_itm in d_rows:
        d_itm.status = "CONVERTED"

    await db.commit()

    return {
        "message": f"Successfully converted enquiry to student {student.student_code}",
        "student_id": str(student.id),
        "student_code": student.student_code,
        "name": student.name,
        "status": "CONVERTED"
    }
