import uuid
import json
import calendar
import re
from datetime import date, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, desc, case
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.core.cache import (
    TTL_MEDIUM,
    cache_get,
    cache_set,
    invalidate_demo_and_enquiry_cache,
    invalidate_student_cache,
    make_cache_key,
    user_scope,
)
from app.database.session import get_db
from app.core.dependencies import require_staff, require_cashier_or_admin, require_admin
from app.common.active_student import today_kolkata
from app.common.numbering import create_student_with_unique_code
from app.common.teacher_scope import (
    is_teacher_user,
    resolve_teacher_for_user,
    get_teacher_subject_ids,
    teacher_demo_ownership_filter,
    active_demo_filter,
)
from app.database.models import Enquiry, EnquiryDemoItem, Student, User, Teacher, Subject, Batch, Admission, AdmissionItem, AuditLog
from app.modules.enquiries.models import resolve_demo_timing_and_hall
from app.modules.enquiries.schemas import (
    EnquiryCreate, EnquiryUpdate, EnquiryResponse, ConvertEnquiryRequest,
    EnquiryDemoItemResponse, EnquiryDemoItemStatusUpdate, EnquiryDemoRegisterItem,
    DemoAnalyticsResponse, DemoAnalyticsSummary, TeacherDemoMetric, SubjectDemoMetric,
    RegisterStudentFromEnquiryRequest, RegisterStudentStandaloneRequest,
    StudentMatchItem, StudentMobileCheckResponse, RegisterStudentResponse
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


def extract_last_10_mobile(mobile_str: Optional[str]) -> Optional[str]:
    """Strips spaces, country codes, and non-digit characters, and extracts the last 10 digits."""
    if not mobile_str:
        return None
    digits = re.sub(r"\D", "", str(mobile_str).strip())
    if len(digits) >= 10:
        return digits[-10:]
    return None


async def _find_matching_students_by_mobile(db: AsyncSession, last_10_mobile: str) -> List[Student]:
    """
    Find existing students matching on the normalised mobile number ONLY (last 10 digits).
    Does NOT use the name in the match at all.
    """
    try:
        stmt = (
            select(Student)
            .where(
                Student.mobile.isnot(None),
                func.right(func.regexp_replace(Student.mobile, r'[^0-9]', '', 'g'), 10) == last_10_mobile
            )
            .order_by(Student.registration_date.asc(), Student.created_at.asc())
        )
        candidates = (await db.execute(stmt)).scalars().all()
    except Exception:
        stmt = select(Student).where(Student.mobile.isnot(None)).order_by(Student.registration_date.asc(), Student.created_at.asc())
        candidates = (await db.execute(stmt)).scalars().all()

    return [s for s in candidates if extract_last_10_mobile(s.mobile) == last_10_mobile]


async def _create_student_record(
    db: AsyncSession,
    name: str,
    mobile: Optional[str],
    current_user_id: Optional[uuid.UUID] = None,
    father_name: Optional[str] = None,
    school_college: Optional[str] = None,
    email: Optional[str] = None,
    address: Optional[str] = None,
    dob: Optional[date] = None,
    photo_url: Optional[str] = None,
    notes: Optional[str] = None,
    audit_action: str = "STUDENT_CREATED",
    extra_audit_details: Optional[dict] = None,
    commit: bool = True
) -> Student:
    """
    Shared helper to create a Student record with validated name, normalised 10-digit mobile,
    sequential STU code, and audit log entry.
    """
    clean_name = (name or "").strip()
    if len(clean_name) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student name must be at least 2 characters long"
        )

    norm_mob = extract_last_10_mobile(mobile)
    if mobile and not norm_mob:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mobile number must be exactly 10 numeric digits"
        )

    if norm_mob:
        existing_matches = await _find_matching_students_by_mobile(db, norm_mob)
        if existing_matches:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This phone number is already registered"
            )

    notes_parts = []
    if school_college and school_college.strip():
        notes_parts.append(f"School/College: {school_college.strip()}")
    if notes and notes.strip():
        notes_parts.append(notes.strip())
    combined_notes = " • ".join(notes_parts) if notes_parts else None

    student = await create_student_with_unique_code(
        db,
        name=clean_name,
        father_name=(father_name or "").strip() or None,
        mobile=norm_mob,
        email=(email.strip().lower() if email else None),
        photo_url=photo_url,
        address=(address.strip() if address else None),
        dob=dob,
        registration_date=date.today(),
        status="ACTIVE",
        notes=combined_notes,
    )

    details = {
        "student_id": str(student.id),
        "student_code": student.student_code,
        "name": student.name,
        "mobile": student.mobile,
    }
    if extra_audit_details:
        details.update(extra_audit_details)

    audit = AuditLog(
        user_id=current_user_id,
        action=audit_action,
        entity_type="STUDENT",
        entity_id=student.id,
        details=json.dumps(details)
    )
    db.add(audit)

    if commit:
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This phone number is already registered"
            )
        await db.refresh(student)

    return student


async def _create_student_from_enquiry(
    db: AsyncSession,
    enquiry: Enquiry,
    current_user_id: Optional[uuid.UUID] = None,
    father_name: Optional[str] = None,
    email: Optional[str] = None,
    address: Optional[str] = None,
    commit: bool = True
) -> Student:
    """
    Creates student pre-filled from enquiry (student_name, mobile, father_name, school_college)
    with the same validation as normal student creation.
    """
    return await _create_student_record(
        db=db,
        name=enquiry.student_name or "",
        mobile=enquiry.mobile,
        current_user_id=current_user_id,
        father_name=father_name or enquiry.father_name,
        school_college=enquiry.school_college,
        email=email,
        address=address,
        notes=enquiry.notes,
        audit_action="STUDENT_CREATED_FROM_ENQUIRY",
        extra_audit_details={
            "enquiry_id": str(enquiry.id),
            "enquiry_code": enquiry.enquiry_code
        },
        commit=commit
    )


def _format_demo_item_response(
    itm: EnquiryDemoItem,
    today: date,
    subject: Optional[Subject] = None,
    batch: Optional[Batch] = None,
) -> EnquiryDemoItemResponse:
    rem = (itm.demo_end_date - today).days
    if itm.status == "CONVERTED":
        lbl, var = "Enrolled", "success"
    elif itm.status == "ATTENDED":
        lbl, var = "Attended", "info"
    elif itm.status == "DROPPED":
        lbl, var = "Dropped", "danger"
    elif itm.status == "EXPIRED" or (itm.status == "SCHEDULED" and rem < 0):
        lbl, var = "Expired", "danger"
    else:
        lbl, var = "Active Demo", "warning" if rem <= 1 else "success"

    c_course = None
    c_adm_no = None
    c_adm_id = None
    adm_item = itm.__dict__.get("admission_item")
    if adm_item:
        c_course = getattr(adm_item, "item_name_snapshot", None)
        c_adm_id = getattr(adm_item, "admission_id", None)
        adm_parent = adm_item.__dict__.get("admission")
        if adm_parent:
            c_adm_no = getattr(adm_parent, "admission_number", None)
            if not c_adm_id:
                c_adm_id = getattr(adm_parent, "id", None)

    timing, hall_no = resolve_demo_timing_and_hall(itm, subject=subject, batch=batch)

    return EnquiryDemoItemResponse(
        id=itm.id,
        enquiry_id=itm.enquiry_id,
        demo_reference_number=itm.demo_reference_number,
        subject_id=itm.subject_id,
        batch_id=itm.batch_id,
        teacher_id=itm.teacher_id,
        subject_name_snapshot=itm.subject_name_snapshot,
        teacher_name_snapshot=itm.teacher_name_snapshot,
        hall_number_snapshot=hall_no,
        timing=timing,
        demo_start_date=itm.demo_start_date,
        demo_end_date=itm.demo_end_date,
        demo_duration_days=itm.demo_duration_days,
        status=itm.status,
        drop_reason=itm.drop_reason,
        notes=itm.notes,
        converted_admission_item_id=itm.converted_admission_item_id,
        converted_admission_id=c_adm_id,
        converted_course_name=c_course,
        converted_admission_number=c_adm_no,
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
    current_user: User = Depends(require_cashier_or_admin)
):
    """
    Returns list of enquiries with database-level search, status filtering,
    month-wise filtering, and populated child demo items.
    """
    cache_key = make_cache_key(
        "enquiries", "list",
        page=page, page_size=page_size, search=search,
        status_filter=status_filter, status=status,
        month=month, year=year, from_date=from_date, to_date=to_date,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    query = select(Enquiry)
    count_query = select(func.count(Enquiry.id))

    # Search filter
    if search:
        search_pattern = f"%{search.strip()}%"
        filter_clause = or_(
            Enquiry.student_name.ilike(search_pattern),
            Enquiry.enquiry_code.ilike(search_pattern),
            Enquiry.mobile.ilike(search_pattern),
            Enquiry.interested_subject.ilike(search_pattern),
            Enquiry.demo_items.any(EnquiryDemoItem.demo_reference_number.ilike(search_pattern))
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

    # Batch resolve student admission & course enrollment metadata
    student_ids = [item.converted_student_id for item in items if item.converted_student_id]
    mobiles = [item.mobile for item in items if item.mobile and not item.converted_student_id]

    student_map_by_id = {}
    if student_ids:
        s_res = await db.execute(select(Student).where(Student.id.in_(student_ids)))
        for s in s_res.scalars().all():
            student_map_by_id[s.id] = s

    student_map_by_mobile = {}
    if mobiles:
        norm_mobiles = list({extract_last_10_mobile(m) for m in mobiles if extract_last_10_mobile(m)})
        if norm_mobiles:
            s_res2 = await db.execute(select(Student).where(or_(Student.mobile.in_(mobiles), Student.mobile.in_(norm_mobiles))))
            for s in s_res2.scalars().all():
                s_norm = extract_last_10_mobile(s.mobile)
                if s.mobile and s.mobile not in student_map_by_mobile:
                    student_map_by_mobile[s.mobile] = s
                if s_norm and s_norm not in student_map_by_mobile:
                    student_map_by_mobile[s_norm] = s

    all_found_student_ids = set(student_map_by_id.keys())
    for s in student_map_by_mobile.values():
        all_found_student_ids.add(s.id)

    admissions_map_by_student_id = {}
    if all_found_student_ids:
        adm_res = await db.execute(
            select(Admission)
            .where(
                Admission.student_id.in_(list(all_found_student_ids)),
                Admission.status != "CANCELLED"
            )
            .order_by(desc(Admission.created_at))
        )
        for adm in adm_res.scalars().all():
            if adm.student_id not in admissions_map_by_student_id:
                admissions_map_by_student_id[adm.student_id] = []
            admissions_map_by_student_id[adm.student_id].append(adm)

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

        matched_student = student_map_by_id.get(item.converted_student_id)
        if not matched_student and item.mobile:
            matched_student = student_map_by_mobile.get(item.mobile) or student_map_by_mobile.get(extract_last_10_mobile(item.mobile))

        effective_student_id = item.converted_student_id or (matched_student.id if matched_student else None)
        effective_student_code = matched_student.student_code if matched_student else None
        has_student = matched_student is not None or bool(item.converted_student_id)

        student_admissions = admissions_map_by_student_id.get(effective_student_id, []) if effective_student_id else []
        has_course = len(student_admissions) > 0
        latest_adm = student_admissions[0] if student_admissions else None

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
            converted_student_id=effective_student_id,
            converted_student_code=effective_student_code,
            has_student_admission=has_student,
            has_course_purchase=has_course,
            course_admission_id=latest_adm.id if latest_adm else None,
            course_admission_number=latest_adm.admission_number if latest_adm else None,
            course_items_count=len(student_admissions),
            created_by=item.created_by,
            demo_items=formatted_demo_items
        )
        response_items.append(resp)

    resp = PageResponse.create(items=response_items, total=total, params=PaginationParams(page=page, page_size=page_size))
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM, model=PageResponse[EnquiryResponse])
    return resp


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
    cache_key = make_cache_key(
        "demos", "list", user_scope(current_user),
        page=page, page_size=page_size, search=search, status_filter=status_filter,
        teacher_id=teacher_id, subject_id=subject_id,
        month=month, year=year, from_date=from_date, to_date=to_date,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    query = (
        select(EnquiryDemoItem, Enquiry)
        .join(Enquiry, EnquiryDemoItem.enquiry_id == Enquiry.id)
        .options(
            selectinload(EnquiryDemoItem.admission_item).selectinload(AdmissionItem.admission)
        )
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
            cond = and_(
                EnquiryDemoItem.demo_end_date >= today,
                EnquiryDemoItem.status.notin_(["CONVERTED", "DROPPED", "EXPIRED"]),
                or_(
                    EnquiryDemoItem.status.in_(["SCHEDULED", "ATTENDED"]),
                    Enquiry.status == "ACTIVE_DEMO"
                )
            )
        elif status_filter == "EXPIRED":
            cond = or_(
                EnquiryDemoItem.status == "EXPIRED",
                and_(
                    EnquiryDemoItem.status.in_(["SCHEDULED", "ATTENDED"]),
                    EnquiryDemoItem.demo_end_date < today
                )
            )
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

    # Teacher role: strictly restricted to his own currently active demos
    if is_teacher_user(current_user):
        teacher = await resolve_teacher_for_user(db, current_user)
        if not teacher:
            resp = PageResponse.create(items=[], total=0, params=PaginationParams(page=page, page_size=page_size))
            await cache_set(cache_key, resp, ttl=TTL_MEDIUM, model=PageResponse[EnquiryDemoRegisterItem])
            return resp
        teacher_sub_ids = await get_teacher_subject_ids(db, teacher.id)
        teacher_demo_cond = and_(
            teacher_demo_ownership_filter(teacher.id, teacher_sub_ids),
            active_demo_filter(today_kolkata()),
        )
        query = query.where(teacher_demo_cond)
        count_query = count_query.where(teacher_demo_cond)

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
    # Batch resolve student codes for enquiries if converted_student_id exists
    student_ids = [enq.converted_student_id for _, enq in rows if enq.converted_student_id]
    student_code_map = {}
    if student_ids:
        s_res = await db.execute(select(Student.id, Student.student_code).where(Student.id.in_(student_ids)))
        for sid, scode in s_res.all():
            student_code_map[sid] = scode

    items = []
    for ditm, enq in rows:
        rem = (ditm.demo_end_date - today).days
        if ditm.status == "CONVERTED":
            lbl, var = "Enrolled", "success"
        elif ditm.status == "ATTENDED":
            lbl, var = "Attended", "info"
        elif ditm.status == "DROPPED":
            lbl, var = "Dropped", "danger"
        elif ditm.status == "EXPIRED" or (ditm.status == "SCHEDULED" and rem < 0):
            lbl, var = "Expired", "danger"
        else:
            lbl, var = "Active Demo", "warning" if rem <= 1 else "success"

        c_course_name = None
        c_adm_no = None
        c_adm_id = None
        if ditm.admission_item:
            c_course_name = ditm.admission_item.item_name_snapshot
            c_adm_id = ditm.admission_item.admission_id
            if ditm.admission_item.admission:
                c_adm_no = ditm.admission_item.admission.admission_number

        timing, hall_no = resolve_demo_timing_and_hall(ditm)

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
            hall_number=hall_no,
            timing=timing,
            demo_start_date=ditm.demo_start_date,
            demo_end_date=ditm.demo_end_date,
            demo_duration_days=ditm.demo_duration_days,
            days_remaining=rem,
            status=ditm.status,
            status_label=lbl,
            badge_variant=var,
            drop_reason=ditm.drop_reason,
            notes=ditm.notes,
            converted_admission_item_id=ditm.converted_admission_item_id,
            converted_admission_id=c_adm_id,
            converted_student_id=enq.converted_student_id,
            converted_student_code=student_code_map.get(enq.converted_student_id) if enq.converted_student_id else None,
            converted_course_name=c_course_name,
            converted_admission_number=c_adm_no
        ))

    resp = PageResponse.create(items=items, total=total, params=PaginationParams(page=page, page_size=page_size))
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM, model=PageResponse[EnquiryDemoRegisterItem])
    return resp


@router.get("/analytics", response_model=DemoAnalyticsResponse)
async def get_demo_analytics(
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2020),
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    teacher_id: Optional[uuid.UUID] = None,
    subject_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Returns pre-computed database-level demo analytics:
    Teacher-wise conversion metrics, subject-wise demo breakdown, and overall conversion summary.
    """
    today = date.today()
    f_date, t_date = _resolve_month_date_range(from_date, to_date, month, year)
    cache_key = make_cache_key(
        "demos", "analytics",
        month=month, year=year, from_date=f_date, to_date=t_date,
        teacher_id=teacher_id, subject_id=subject_id,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached

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

    resp = DemoAnalyticsResponse(
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
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM, model=DemoAnalyticsResponse)
    return resp


@router.get("/summary")
async def get_enquiry_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    cache_key = "erp:enquiries:summary"
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    stmt = select(Enquiry.status, func.count(Enquiry.id)).group_by(Enquiry.status)
    res = await db.execute(stmt)
    status_counts = dict(res.all())
    
    total = sum(status_counts.values())
    resp = {
        "total": total,
        "ACTIVE_DEMO": status_counts.get("ACTIVE_DEMO", 0),
        "INTERESTED": status_counts.get("INTERESTED", 0),
        "PENDING": status_counts.get("PENDING", 0),
        "CONVERTED": status_counts.get("CONVERTED", 0),
        "EXPIRED": status_counts.get("EXPIRED", 0),
        "NOT_INTERESTED": status_counts.get("NOT_INTERESTED", 0),
    }
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM)
    return resp


@router.get("/upcoming-deadlines", response_model=list[EnquiryResponse])
async def get_upcoming_demo_deadlines(
    days_ahead: int = Query(7, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    cache_key = make_cache_key("enquiries", "upcoming", days_ahead=days_ahead)
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
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
    await cache_set(cache_key, response_items, ttl=TTL_MEDIUM, model=list[EnquiryResponse])
    return response_items


@router.get("/check-student", response_model=StudentMobileCheckResponse)
async def check_student_by_mobile_for_demo(
    mobile: str = Query(..., description="Mobile number to normalize (last 10 digits) and match against registered students"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    """
    Phone-only lookup (last 10 digits) before giving a demo.
    Uses the exact same duplicate-matching rule as L1 (_find_matching_students_by_mobile).
    """
    norm_mob = extract_last_10_mobile(mobile)
    if not norm_mob:
        return StudentMobileCheckResponse(
            valid=False,
            exists=False,
            multiple_matches=False,
            normalized_mobile=None,
            student=None,
            matches=[],
            message="Mobile number must contain at least 10 numeric digits"
        )

    cache_key = make_cache_key("enquiries", "check_student", norm_mob)
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached

    matches = await _find_matching_students_by_mobile(db, norm_mob)
    match_items = [StudentMatchItem.model_validate(m) for m in matches]

    if len(match_items) > 1:
        resp = StudentMobileCheckResponse(
            valid=True,
            exists=True,
            multiple_matches=True,
            normalized_mobile=norm_mob,
            student=None,
            matches=match_items,
            message=f"Multiple students ({len(match_items)}) found with mobile number ending in {norm_mob}."
        )
        await cache_set(cache_key, resp, ttl=TTL_MEDIUM, model=StudentMobileCheckResponse)
        return resp
    if len(match_items) == 1:
        resp = StudentMobileCheckResponse(
            valid=True,
            exists=True,
            multiple_matches=False,
            normalized_mobile=norm_mob,
            student=match_items[0],
            matches=match_items,
            message=f"Already registered with student code {match_items[0].student_code}"
        )
        await cache_set(cache_key, resp, ttl=TTL_MEDIUM, model=StudentMobileCheckResponse)
        return resp
    resp = StudentMobileCheckResponse(
        valid=True,
        exists=False,
        multiple_matches=False,
        normalized_mobile=norm_mob,
        student=None,
        matches=[],
        message="No registered student found for this mobile number"
    )
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM, model=StudentMobileCheckResponse)
    return resp


@router.post("/register-student", response_model=RegisterStudentResponse, status_code=status.HTTP_200_OK)
async def register_student_before_demo(
    payload: RegisterStudentStandaloneRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Register-first endpoint used before creating a demo when the student is not yet registered.
    Enforces the L1 duplicate rule (phone-only match on last 10 digits):
    - If selected_student_id is provided, returns that existing student.
    - If 1 existing student matches the normalised 10-digit phone (and not force_create),
      returns already_registered=True without creating a duplicate student.
    - If multiple students match (and not force_create), returns multiple_matches=True.
    - Otherwise creates the new student record in DB and returns it.
    """
    if payload.selected_student_id:
        stu_res = await db.execute(select(Student).where(Student.id == payload.selected_student_id))
        selected_student = stu_res.scalar_one_or_none()
        if not selected_student:
            raise HTTPException(status_code=404, detail="Selected student profile not found")
        return RegisterStudentResponse(
            success=True,
            already_registered=True,
            multiple_matches=False,
            student_id=selected_student.id,
            student_code=selected_student.student_code,
            student_name=selected_student.name,
            mobile=selected_student.mobile,
            message=f"Already registered with student code {selected_student.student_code}"
        )

    norm_mob = extract_last_10_mobile(payload.mobile)
    if not norm_mob:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A valid 10-digit mobile number is required to register student"
        )

    matches = await _find_matching_students_by_mobile(db, norm_mob)

    if matches:
        if payload.force_create:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This phone number is already registered"
            )
        matched = matches[0]
        return RegisterStudentResponse(
            success=True,
            already_registered=True,
            multiple_matches=False,
            student_id=matched.id,
            student_code=matched.student_code,
            student_name=matched.name,
            mobile=matched.mobile,
            message=f"This phone number is already registered ({matched.student_code})"
        )

    student = await _create_student_record(
        db=db,
        name=payload.name,
        mobile=norm_mob,
        current_user_id=current_user.id,
        father_name=payload.father_name,
        school_college=payload.school_college,
        email=payload.email,
        address=payload.address,
        dob=payload.dob,
        photo_url=payload.photo_url,
        notes=payload.notes,
        audit_action="STUDENT_CREATED_BEFORE_DEMO",
        commit=True
    )
    await invalidate_student_cache(student.id)

    return RegisterStudentResponse(
        success=True,
        already_registered=False,
        multiple_matches=False,
        student_id=student.id,
        student_code=student.student_code,
        student_name=student.name,
        mobile=student.mobile,
        message=f"Student {student.name} ({student.student_code}) registered successfully"
    )


async def create_enquiry_with_demos(
    db: AsyncSession,
    current_user: User,
    linked_student: Optional[Student],
    student_name: str,
    mobile: Optional[str],
    father_name: Optional[str] = None,
    school_college: Optional[str] = None,
    purpose: Optional[str] = "Admission Enquiry",
    source: Optional[str] = "Direct Walk-in",
    interested_subject: Optional[str] = None,
    demo_start_date: Optional[date] = None,
    demo_duration_days: int = 3,
    notes: Optional[str] = None,
    enquiry_status: str = "PENDING",
    demo_items: Optional[List] = None,
    is_demo_request: bool = True,
    audit_action: Optional[str] = None,
) -> EnquiryResponse:
    """
    Shared helper to create an Enquiry and its individual EnquiryDemoItem records
    with sequential DEM-YYYY-NNNN reference numbers.
    """
    year_str = date.today().strftime("%Y")
    cnt_res = await db.execute(select(func.count(Enquiry.id)))
    seq = (cnt_res.scalar_one() or 0) + 1
    while True:
        candidate_enq_code = f"ENQ{year_str}{seq:04d}"
        exists = (await db.execute(select(Enquiry.id).where(Enquiry.enquiry_code == candidate_enq_code).limit(1))).scalar_one_or_none()
        if not exists:
            enquiry_code = candidate_enq_code
            break
        seq += 1

    demo_start = (demo_start_date or date.today()) if is_demo_request else None
    demo_duration = demo_duration_days or 3
    deadline = (demo_start + timedelta(days=demo_duration)) if demo_start else None

    if demo_items and len(demo_items) > 0:
        first_itm = demo_items[0]
        if first_itm.demo_start_date:
            demo_start = first_itm.demo_start_date
        if first_itm.demo_end_date and demo_start:
            if first_itm.demo_end_date < demo_start:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Demo end date cannot be before demo start date"
                )
            deadline = first_itm.demo_end_date
            demo_duration = max(1, (deadline - demo_start).days)
        elif demo_start:
            demo_duration = first_itm.demo_duration_days or demo_duration
            deadline = demo_start + timedelta(days=demo_duration)

    # Determine summary interested subject string
    summary_subject = interested_subject or ""
    if demo_items and len(demo_items) > 0:
        names = []
        for ditm in demo_items:
            if ditm.subject_name:
                names.append(ditm.subject_name)
            elif ditm.subject_name_snapshot:
                names.append(ditm.subject_name_snapshot)
            elif ditm.subject_id:
                sub = (await db.execute(select(Subject).where(Subject.id == ditm.subject_id))).scalar_one_or_none()
                if sub:
                    names.append(sub.name)
        if names:
            summary_subject = ", ".join(names)

    enquiry = Enquiry(
        enquiry_code=enquiry_code,
        student_name=student_name,
        mobile=mobile,
        father_name=father_name,
        school_college=school_college,
        purpose=purpose or "Admission Enquiry",
        source=source or "Direct Walk-in",
        interested_subject=summary_subject or "General Course Demo",
        demo_start_date=demo_start,
        demo_duration_days=demo_duration,
        demo_deadline=deadline,
        notes=notes,
        status="ACTIVE_DEMO" if (demo_items or demo_start_date or is_demo_request) else enquiry_status,
        converted_student_id=linked_student.id if linked_student else None,
        created_by=current_user.id
    )
    db.add(enquiry)
    await db.flush()

    # Create child EnquiryDemoItem records (only when creating a demo)
    child_items = []
    created_relations = {}
    if is_demo_request:
        if demo_items and len(demo_items) > 0:
            for idx, itm in enumerate(demo_items):
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

                itm_start = itm.demo_start_date or demo_start or date.today()
                if itm.demo_end_date is not None:
                    if itm.demo_end_date < itm_start:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Demo end date cannot be before demo start date"
                        )
                    itm_end = itm.demo_end_date
                    itm_duration = max(1, (itm_end - itm_start).days)
                else:
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
                created_relations[id(demo_item)] = (sub, bch)
        else:
            # Create 1 default demo item so that every demo receives a verifiable demo slip
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
                notes=notes
            )
            db.add(demo_item)
            child_items.append(demo_item)

    if audit_action:
        demo_refs = [d.demo_reference_number for d in child_items if d.demo_reference_number]
        demo_subjects = [d.subject_name_snapshot for d in child_items if d.subject_name_snapshot]
        demo_teachers = [d.teacher_name_snapshot for d in child_items if d.teacher_name_snapshot]
        unique_teachers = list(dict.fromkeys(demo_teachers))
        resolved_name = linked_student.name if linked_student else student_name
        audit = AuditLog(
            user_id=current_user.id,
            action=audit_action,
            entity_type="STUDENT" if linked_student else "ENQUIRY",
            entity_id=linked_student.id if linked_student else enquiry.id,
            details=json.dumps({
                "student_id": str(linked_student.id) if linked_student else None,
                "student_code": linked_student.student_code if linked_student else None,
                "name": resolved_name,
                "student_name": resolved_name,
                "enquiry_id": str(enquiry.id),
                "enquiry_code": enquiry.enquiry_code,
                "demo_reference_number": ", ".join(demo_refs) if demo_refs else None,
                "demo_reference_numbers": demo_refs,
                "subject": ", ".join(demo_subjects) if demo_subjects else None,
                "subjects": demo_subjects,
                "teacher": ", ".join(unique_teachers) if unique_teachers else None,
                "teachers": demo_teachers,
            })
        )
        db.add(audit)

    await db.commit()
    await db.refresh(enquiry)
    await invalidate_demo_and_enquiry_cache(
        student_id=linked_student.id if linked_student else None
    )

    today = date.today()
    formatted_children = [
        _format_demo_item_response(
            d,
            today,
            subject=created_relations.get(id(d), (None, None))[0],
            batch=created_relations.get(id(d), (None, None))[1],
        )
        for d in child_items
    ]
    return await _resolve_single_enquiry_response(db, enquiry, formatted_children, today)


@router.post("", response_model=EnquiryResponse, status_code=status.HTTP_201_CREATED)
async def create_enquiry(
    payload: EnquiryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Creates master enquiry ticket and automatically creates individual child
    EnquiryDemoItem records with unique DEM-YYYY-NNNN reference numbers for each subject.
    Register-first rule: a demo is NEVER created for an unregistered student.
    """
    is_demo_request = (
        bool(payload.demo_items and len(payload.demo_items) > 0)
        or payload.status == "ACTIVE_DEMO"
        or payload.demo_start_date is not None
    )

    # Resolve registered student (by explicit student_id or phone-only last-10-digit match)
    linked_student: Optional[Student] = None
    if payload.student_id:
        stu_res = await db.execute(select(Student).where(Student.id == payload.student_id))
        linked_student = stu_res.scalar_one_or_none()
        if not linked_student:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Registered student not found"
            )
    elif payload.mobile:
        norm_mob = extract_last_10_mobile(payload.mobile)
        if norm_mob:
            matches = await _find_matching_students_by_mobile(db, norm_mob)
            if len(matches) == 1:
                linked_student = matches[0]
            elif len(matches) > 1 and is_demo_request:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Multiple registered students match this mobile number. Please select the student first."
                )

    if is_demo_request and linked_student is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student must be registered before creating a demo. Please register the student profile first."
        )

    resolved_student_name = (payload.student_name or (linked_student.name if linked_student else "")).strip()
    if len(resolved_student_name) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Student name must be at least 2 characters long"
        )
    resolved_mobile = payload.mobile or (linked_student.mobile if linked_student else None)
    resolved_father_name = payload.father_name or (linked_student.father_name if linked_student else None)

    return await create_enquiry_with_demos(
        db=db,
        current_user=current_user,
        linked_student=linked_student,
        student_name=resolved_student_name,
        mobile=resolved_mobile,
        father_name=resolved_father_name,
        school_college=payload.school_college,
        purpose=payload.purpose,
        source=payload.source,
        interested_subject=payload.interested_subject,
        demo_start_date=payload.demo_start_date,
        demo_duration_days=payload.demo_duration_days,
        notes=payload.notes,
        enquiry_status=payload.status,
        demo_items=payload.demo_items,
        is_demo_request=is_demo_request,
        audit_action="DEMO_CREATED" if is_demo_request else None,
    )


async def _resolve_single_enquiry_response(
    db: AsyncSession,
    enquiry: Enquiry,
    formatted_demo_items: list,
    today: date,
    include_billing_info: bool = True,
) -> EnquiryResponse:
    matched_student = None
    if enquiry.converted_student_id:
        s_res = await db.execute(select(Student).where(Student.id == enquiry.converted_student_id))
        matched_student = s_res.scalar_one_or_none()
    elif enquiry.mobile:
        norm_m = extract_last_10_mobile(enquiry.mobile)
        if norm_m:
            matched_list = await _find_matching_students_by_mobile(db, norm_m)
            matched_student = matched_list[0] if matched_list else None

    effective_student_id = enquiry.converted_student_id or (matched_student.id if matched_student else None)
    effective_student_code = matched_student.student_code if matched_student else None
    has_student = matched_student is not None or bool(enquiry.converted_student_id)

    student_admissions = []
    if include_billing_info and effective_student_id:
        adm_res = await db.execute(
            select(Admission)
            .where(Admission.student_id == effective_student_id, Admission.status != "CANCELLED")
            .order_by(desc(Admission.created_at))
        )
        student_admissions = adm_res.scalars().all()

    has_course = len(student_admissions) > 0 if include_billing_info else False
    latest_adm = student_admissions[0] if (include_billing_info and student_admissions) else None
    rem_days = (enquiry.demo_deadline - today).days if enquiry.demo_deadline else None

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
        converted_student_id=effective_student_id,
        converted_student_code=effective_student_code,
        has_student_admission=has_student,
        has_course_purchase=has_course,
        course_admission_id=latest_adm.id if latest_adm else None,
        course_admission_number=latest_adm.admission_number if latest_adm else None,
        course_items_count=len(student_admissions) if include_billing_info else 0,
        created_by=enquiry.created_by,
        demo_items=formatted_demo_items
    )


@router.get("/{enquiry_id}", response_model=EnquiryResponse)
async def get_enquiry(
    enquiry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    cache_key = make_cache_key("enquiries", "detail", enquiry_id, user_scope(current_user))
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    res = await db.execute(select(Enquiry).where(Enquiry.id == enquiry_id))
    enquiry = res.scalar_one_or_none()
    if not enquiry:
        raise HTTPException(status_code=404, detail="Enquiry not found")

    today = today_kolkata()
    d_stmt = (
        select(EnquiryDemoItem)
        .join(Enquiry, EnquiryDemoItem.enquiry_id == Enquiry.id)
        .options(selectinload(EnquiryDemoItem.admission_item).selectinload(AdmissionItem.admission))
        .where(EnquiryDemoItem.enquiry_id == enquiry.id)
        .order_by(EnquiryDemoItem.demo_start_date.asc())
    )
    if is_teacher_user(current_user):
        teacher = await resolve_teacher_for_user(db, current_user)
        if not teacher:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        teacher_sub_ids = await get_teacher_subject_ids(db, teacher.id)
        d_stmt = d_stmt.where(
            teacher_demo_ownership_filter(teacher.id, teacher_sub_ids),
            active_demo_filter(today),
        )
    d_res = await db.execute(d_stmt)
    d_items = d_res.scalars().all()
    if is_teacher_user(current_user) and not d_items:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: you can only view your own active demos",
        )
    formatted_demo_items = [_format_demo_item_response(d, today) for d in d_items]

    resp = await _resolve_single_enquiry_response(
        db, enquiry, formatted_demo_items, today,
        include_billing_info=not is_teacher_user(current_user),
    )
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM, model=EnquiryResponse)
    return resp


@router.put("/demos/{demo_item_id}/status", response_model=EnquiryDemoItemResponse)
async def update_demo_item_status(
    demo_item_id: uuid.UUID,
    payload: EnquiryDemoItemStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
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
    await invalidate_demo_and_enquiry_cache(
        student_id=parent_enq.converted_student_id if parent_enq else None
    )
    return _format_demo_item_response(item, date.today())


@router.put("/{enquiry_id}", response_model=EnquiryResponse)
async def update_enquiry(
    enquiry_id: uuid.UUID,
    payload: EnquiryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
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
    await invalidate_demo_and_enquiry_cache(student_id=enquiry.converted_student_id)

    today = date.today()
    d_res = await db.execute(
        select(EnquiryDemoItem)
        .options(selectinload(EnquiryDemoItem.admission_item).selectinload(AdmissionItem.admission))
        .where(EnquiryDemoItem.enquiry_id == enquiry.id)
        .order_by(EnquiryDemoItem.demo_start_date.asc())
    )
    d_items = d_res.scalars().all()
    formatted_demo_items = [_format_demo_item_response(d, today) for d in d_items]

    return await _resolve_single_enquiry_response(
        db, enquiry, formatted_demo_items, today,
        include_billing_info=not is_teacher_user(current_user),
    )


@router.post("/{enquiry_id}/register-student", response_model=RegisterStudentResponse, status_code=status.HTTP_200_OK)
async def register_student_from_enquiry(
    enquiry_id: uuid.UUID,
    payload: Optional[RegisterStudentFromEnquiryRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Registers a student from enquiry at demo time, before any course purchase,
    with duplicate check on normalised mobile number ONLY.
    - If exact 1 match found: links to existing student, does NOT create new student.
    - If multiple matches found: returns matches so staff can select.
    - If selected_student_id provided: links to that student.
    - If no match found: creates student pre-filled from enquiry and links converted_student_id.
    - Registration alone does NOT change enquiry status and does NOT mark it CONVERTED.
    """
    res = await db.execute(select(Enquiry).where(Enquiry.id == enquiry_id))
    enquiry = res.scalar_one_or_none()
    if not enquiry:
        raise HTTPException(status_code=404, detail="Enquiry not found")

    req = payload or RegisterStudentFromEnquiryRequest()

    # 1. If already linked to a student profile, return existing profile info
    if enquiry.converted_student_id and not req.selected_student_id:
        stu_res = await db.execute(select(Student).where(Student.id == enquiry.converted_student_id))
        existing_student = stu_res.scalar_one_or_none()
        if existing_student:
            return RegisterStudentResponse(
                success=True,
                already_registered=True,
                multiple_matches=False,
                student_id=existing_student.id,
                student_code=existing_student.student_code,
                student_name=existing_student.name,
                mobile=existing_student.mobile,
                message=f"Already registered with student code {existing_student.student_code}"
            )

    # 2. If user explicitly selected a student from multiple matches
    if req.selected_student_id:
        stu_res = await db.execute(select(Student).where(Student.id == req.selected_student_id))
        selected_student = stu_res.scalar_one_or_none()
        if not selected_student:
            raise HTTPException(status_code=404, detail="Selected student profile not found")

        enquiry.converted_student_id = selected_student.id
        audit = AuditLog(
            user_id=current_user.id,
            action="STUDENT_LINKED_FROM_ENQUIRY",
            entity_type="STUDENT",
            entity_id=selected_student.id,
            details=json.dumps({
                "student_id": str(selected_student.id),
                "student_code": selected_student.student_code,
                "name": selected_student.name,
                "enquiry_id": str(enquiry.id),
                "enquiry_code": enquiry.enquiry_code,
                "reason": "Manually selected from multiple mobile matches"
            })
        )
        db.add(audit)
        await db.commit()
        await db.refresh(enquiry)
        await invalidate_demo_and_enquiry_cache(student_id=selected_student.id)

        return RegisterStudentResponse(
            success=True,
            already_registered=True,
            multiple_matches=False,
            student_id=selected_student.id,
            student_code=selected_student.student_code,
            student_name=selected_student.name,
            mobile=selected_student.mobile,
            message=f"Already registered with student code {selected_student.student_code}"
        )

    # 3. Duplicate check FIRST on normalised mobile number ONLY (last 10 digits)
    norm_mob = extract_last_10_mobile(enquiry.mobile)
    if not norm_mob:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A valid 10-digit mobile number is required to register student"
        )

    matches = await _find_matching_students_by_mobile(db, norm_mob)

    # 3a/3b. Existing student found -> link to single registered student (never create a second student with same phone)
    if matches:
        if req.force_create:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This phone number is already registered"
            )
        matched = matches[0]
        enquiry.converted_student_id = matched.id
        audit = AuditLog(
            user_id=current_user.id,
            action="STUDENT_LINKED_FROM_ENQUIRY",
            entity_type="STUDENT",
            entity_id=matched.id,
            details=json.dumps({
                "student_id": str(matched.id),
                "student_code": matched.student_code,
                "name": matched.name,
                "mobile": matched.mobile,
                "enquiry_id": str(enquiry.id),
                "enquiry_code": enquiry.enquiry_code,
                "reason": "Existing student matched by normalised mobile"
            })
        )
        db.add(audit)
        await db.commit()
        await db.refresh(enquiry)
        await invalidate_demo_and_enquiry_cache(student_id=matched.id)

        return RegisterStudentResponse(
            success=True,
            already_registered=True,
            multiple_matches=False,
            student_id=matched.id,
            student_code=matched.student_code,
            student_name=matched.name,
            mobile=matched.mobile,
            message=f"This phone number is already registered ({matched.student_code})"
        )

    # 3c. No match -> create new student pre-filled from enquiry
    student = await _create_student_from_enquiry(
        db=db,
        enquiry=enquiry,
        current_user_id=current_user.id,
        commit=False
    )
    enquiry.converted_student_id = student.id
    # Note: Registration alone must NOT change enquiry demo status and must NOT mark it CONVERTED!
    await db.commit()
    await db.refresh(enquiry)
    await db.refresh(student)
    await invalidate_demo_and_enquiry_cache(student_id=student.id)

    return RegisterStudentResponse(
        success=True,
        already_registered=False,
        multiple_matches=False,
        student_id=student.id,
        student_code=student.student_code,
        student_name=student.name,
        mobile=student.mobile,
        message=f"Student {student.name} ({student.student_code}) registered successfully"
    )


@router.post("/{enquiry_id}/convert", status_code=status.HTTP_200_OK)
async def convert_enquiry_to_student(
    enquiry_id: uuid.UUID,
    payload: Optional[ConvertEnquiryRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Converts enquiry to student profile and updates child demo items to CONVERTED.
    Supports selective conversion of specific demo subjects.
    Reuses existing converted_student_id if student was already registered at demo time.
    """
    req = payload or ConvertEnquiryRequest()
    res = await db.execute(select(Enquiry).where(Enquiry.id == enquiry_id))
    enquiry = res.scalar_one_or_none()
    if not enquiry:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    if enquiry.status == "CONVERTED" and enquiry.converted_student_id and not req.admission_id and not req.demo_item_ids:
        raise HTTPException(status_code=400, detail="Enquiry has already been converted to a student")

    # If student is already registered (from demo time or duplicate check), reuse that student!
    student = None
    if enquiry.converted_student_id:
        stu_res = await db.execute(select(Student).where(Student.id == enquiry.converted_student_id))
        student = stu_res.scalar_one_or_none()

    if not student:
        # Check duplicate first on normalised mobile
        norm_mob = extract_last_10_mobile(enquiry.mobile)
        if norm_mob:
            matches = await _find_matching_students_by_mobile(db, norm_mob)
            if matches:
                student = matches[0]

    if not student:
        student = await _create_student_from_enquiry(
            db=db,
            enquiry=enquiry,
            current_user_id=current_user.id,
            father_name=req.father_name,
            email=req.email,
            address=req.address,
            commit=False
        )

    enquiry.converted_student_id = student.id

    # Update demo items and link admission items
    d_stmt = select(EnquiryDemoItem).where(EnquiryDemoItem.enquiry_id == enquiry.id)
    all_demos = list((await db.execute(d_stmt)).scalars().all())

    if req.admission_id:
        adm_res = await db.execute(
            select(Admission).options(selectinload(Admission.items)).where(Admission.id == req.admission_id)
        )
        admission = adm_res.scalar_one_or_none()
        if admission:
            for adm_item in admission.items:
                matched_d = None
                for d in all_demos:
                    if d.converted_admission_item_id is None and d.status != "CONVERTED":
                        if adm_item.subject_id and d.subject_id == adm_item.subject_id:
                            matched_d = d
                            break
                        elif not adm_item.subject_id and d.subject_name_snapshot.lower() in adm_item.item_name_snapshot.lower():
                            matched_d = d
                            break
                if matched_d:
                    matched_d.converted_admission_item_id = adm_item.id
                    matched_d.status = "CONVERTED"
    elif req.demo_item_ids and len(req.demo_item_ids) > 0:
        for d in all_demos:
            if d.id in req.demo_item_ids:
                d.status = "CONVERTED"
    else:
        # Check recent admissions of student to link matching items
        stu_adm_res = await db.execute(
            select(Admission).options(selectinload(Admission.items))
            .where(Admission.student_id == student.id)
            .order_by(desc(Admission.admission_date), desc(Admission.created_at))
        )
        recent_admissions = stu_adm_res.scalars().all()
        matched_any = False
        if recent_admissions:
            for adm in recent_admissions:
                for adm_item in adm.items:
                    for d in all_demos:
                        if d.converted_admission_item_id is None and d.status != "CONVERTED":
                            if (adm_item.subject_id and d.subject_id == adm_item.subject_id) or (d.subject_name_snapshot.lower() in adm_item.item_name_snapshot.lower()):
                                d.converted_admission_item_id = adm_item.id
                                d.status = "CONVERTED"
                                matched_any = True
                                break
        if not matched_any:
            for d in all_demos:
                d.status = "CONVERTED"

    if all_demos and all(d.status == "CONVERTED" for d in all_demos):
        enquiry.status = "CONVERTED"
    elif not all_demos:
        enquiry.status = "CONVERTED"

    audit = AuditLog(
        user_id=current_user.id,
        action="ENQUIRY_CONVERTED_TO_ADMISSION",
        entity_type="STUDENT",
        entity_id=student.id,
        details=json.dumps({
            "student_id": str(student.id),
            "student_code": student.student_code,
            "name": student.name,
            "mobile": student.mobile,
            "enquiry_id": str(enquiry.id),
            "enquiry_code": enquiry.enquiry_code
        })
    )
    db.add(audit)

    await db.commit()
    await invalidate_demo_and_enquiry_cache(student_id=student.id)

    return {
        "message": f"Successfully converted enquiry to student {student.student_code}",
        "student_id": str(student.id),
        "student_code": student.student_code,
        "name": student.name,
        "status": "CONVERTED"
    }
