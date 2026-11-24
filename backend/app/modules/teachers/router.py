from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, desc, case
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional, List, Union
from collections import defaultdict
import uuid
import os
import json
import calendar

from app.core.cache import (
    TTL_MEDIUM,
    cache_get,
    cache_set,
    invalidate_expense_and_salary_cache,
    invalidate_teacher_cache,
    make_cache_key,
)
from app.database.session import get_db
from app.core.config import settings
from app.modules.students.router import compress_avatar_image
from app.modules.teachers.models import Teacher, TeacherEarning, TeacherAttendance
from app.modules.teachers.schemas import (
    TeacherCreate, TeacherUpdate, TeacherResponse, TeacherStatusUpdate,
    TeacherEnrollmentItem, TeacherRosterMetrics, TeacherRosterResponse, TeacherSubjectOption,
    TeacherPayoutCreate, TeacherPayoutResponse, TeacherEarningsResponse, TeacherSubjectEarningItem,
    TeacherSubjectDetailItem, TeacherHistoryEvent, TeacherHistoryResponse,
    TeacherSubjectBreakupItem, TeacherStudentBreakupItem, TeacherBreakupResponse,
    TeacherCollectionItem, TeacherCollectionsResponse,
    TeacherAttendanceToggle, TeacherAttendanceBulkUpdate, TeacherAttendanceRecordResponse,
    TeacherAttendanceMonthlySummary, TeacherMonthlyAttendanceResponse,
    TeacherDemoConversionResponse
)
from app.modules.batches.models import Batch
from app.modules.subjects.models import Subject
from app.modules.admissions.models import Admission, AdmissionItem
from app.modules.payments.models import Payment, PaymentAllocation, Refund
from app.modules.students.models import Student
from app.modules.expenses.models import SalaryRecord
from app.modules.expenses.schemas import SalaryRecordResponse
from app.database.models import AuditLog
from app.modules.reports.ledger_queries import (
    get_item_allocated_collected_map,
    ist_day_boundaries,
    get_teacher_demo_conversion,
)
from app.common.active_student import active_student_subject_filter, today_kolkata
from app.common.active_lines import compute_days_remaining
from app.core.dependencies import require_cashier_or_admin, require_admin
from app.common.pagination import PageResponse

router = APIRouter(prefix="/api/teachers", tags=["Teachers"])

@router.get("", response_model=PageResponse[TeacherResponse])
async def list_teachers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    status: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user = Depends(require_cashier_or_admin)
):
    cache_key = make_cache_key(
        "teachers", "list",
        page=page, page_size=page_size, search=search,
        status=status, status_filter=status_filter,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    query = select(Teacher)
    count_query = select(func.count(Teacher.id))

    if search:
        search_filter = or_(
            Teacher.name.ilike(f"%{search}%"),
            Teacher.mobile.ilike(f"%{search}%"),
            Teacher.teacher_code.ilike(f"%{search}%"),
            Teacher.specialization.ilike(f"%{search}%")
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    eff_status = status or status_filter
    if eff_status:
        query = query.where(Teacher.status == eff_status)
        count_query = count_query.where(Teacher.status == eff_status)

    total = (await db.execute(count_query)).scalar() or 0
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    query = query.order_by(Teacher.name.asc()).offset((page - 1) * page_size).limit(page_size)
    items = (await db.execute(query)).scalars().all()

    resp = PageResponse(
        items=[TeacherResponse.model_validate(t) for t in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM, model=PageResponse[TeacherResponse])
    return resp

@router.get("/all", response_model=List[TeacherResponse])
async def get_all_active_teachers(
    db: AsyncSession = Depends(get_db),
    user = Depends(require_cashier_or_admin)
):
    cache_key = "erp:teachers:all"
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    result = await db.execute(select(Teacher).where(Teacher.status == "ACTIVE").order_by(Teacher.name.asc()))
    items = [TeacherResponse.model_validate(t) for t in result.scalars().all()]
    await cache_set(cache_key, items, ttl=TTL_MEDIUM, model=List[TeacherResponse])
    return items

@router.get("/by-mobile/{mobile}", response_model=Optional[TeacherResponse])
async def get_teacher_by_mobile(
    mobile: str,
    db: AsyncSession = Depends(get_db),
    user = Depends(require_admin)
):
    clean = mobile.strip()
    if len(clean) > 10:
        if clean.startswith("+91"):
            clean = clean[3:]
        elif clean.startswith("91") and len(clean) == 12:
            clean = clean[2:]
        elif clean.startswith("0") and len(clean) == 11:
            clean = clean[1:]
    cache_key = make_cache_key("teachers", "mobile", clean)
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    teacher = (await db.execute(select(Teacher).where(Teacher.mobile == clean))).scalar_one_or_none()
    if not teacher:
        await cache_set(cache_key, None, ttl=TTL_MEDIUM, model=Optional[TeacherResponse])
        return None
    resp = TeacherResponse.model_validate(teacher)
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM, model=Optional[TeacherResponse])
    return resp

# --- Teacher Attendance Endpoints ---

def get_days_in_month(month_year: str) -> int:
    """
    Computes real days in month (including leap-year rule for February) given 'YYYY-MM'.
    """
    try:
        parts = month_year.strip().split("-")
        y = int(parts[0])
        m = int(parts[1])
        return calendar.monthrange(y, m)[1]
    except Exception:
        return 30

@router.get("/attendance", response_model=Union[PageResponse[TeacherAttendanceMonthlySummary], List[TeacherAttendanceMonthlySummary]])
async def list_teacher_attendance_monthly(
    month_year: Optional[str] = Query(None),
    teacher_id: Optional[uuid.UUID] = Query(None),
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=100, description="Page size"),
    db: AsyncSession = Depends(get_db),
    user = Depends(require_cashier_or_admin)
):
    """
    Returns monthly attendance summary (total absent days / holidays) for all teachers or a specific teacher.
    Only absent days are marked in storage; unrecorded days count as present.
    Days in month and present days are calculated from the real calendar for the given month and year.
    """
    m_year = (month_year or date.today().strftime("%Y-%m")).strip()
    cache_key = make_cache_key(
        "teachers", "attendance_list",
        month_year=m_year, teacher_id=teacher_id, page=page, page_size=page_size,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    days_in_m = get_days_in_month(m_year)
    
    t_query = select(Teacher).order_by(Teacher.name.asc())
    if teacher_id:
        t_query = t_query.where(Teacher.id == teacher_id)
    teachers = (await db.execute(t_query)).scalars().all()
    
    att_query = select(TeacherAttendance).where(TeacherAttendance.month_year == m_year)
    if teacher_id:
        att_query = att_query.where(TeacherAttendance.teacher_id == teacher_id)
    att_records = (await db.execute(att_query)).scalars().all()
    
    teacher_absent_map = defaultdict(list)
    for rec in att_records:
        teacher_absent_map[rec.teacher_id].append(rec.date)
        
    summary_list = []
    for t in teachers:
        abs_dates = sorted(teacher_absent_map.get(t.id, []))
        abs_cnt = len(abs_dates)
        pres_cnt = max(0, days_in_m - abs_cnt)
        summary_list.append(
            TeacherAttendanceMonthlySummary(
                teacher_id=t.id,
                teacher_name=t.name,
                teacher_code=t.teacher_code,
                mobile=t.mobile,
                specialization=t.specialization,
                status=t.status,
                month_year=m_year,
                absent_days_count=abs_cnt,
                present_days_count=pres_cnt,
                days_in_month=days_in_m,
                absent_dates=abs_dates,
                absent_days=[d.isoformat() for d in abs_dates]
            )
        )

    if page is not None:
        total = len(summary_list)
        effective_page_size = page_size or 20
        total_pages = max(1, (total + effective_page_size - 1) // effective_page_size) if total > 0 else 1
        start = (page - 1) * effective_page_size
        paged_items = summary_list[start:start + effective_page_size]
        resp = PageResponse(
            items=paged_items,
            total=total,
            total_pages=total_pages,
            page=page,
            page_size=effective_page_size
        )
        await cache_set(
            cache_key, resp, ttl=TTL_MEDIUM,
            model=Union[PageResponse[TeacherAttendanceMonthlySummary], List[TeacherAttendanceMonthlySummary]],
        )
        return resp

    await cache_set(
        cache_key, summary_list, ttl=TTL_MEDIUM,
        model=Union[PageResponse[TeacherAttendanceMonthlySummary], List[TeacherAttendanceMonthlySummary]],
    )
    return summary_list

@router.get("/{teacher_id}", response_model=TeacherResponse)
async def get_teacher(teacher_id: uuid.UUID, db: AsyncSession = Depends(get_db), user = Depends(require_admin)):
    cache_key = make_cache_key("teachers", "detail", teacher_id)
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    teacher = (await db.execute(select(Teacher).where(Teacher.id == teacher_id))).scalar_one_or_none()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    # Load subjects taught by this faculty member
    subs_res = await db.execute(
        select(Subject).where(Subject.teacher_id == teacher.id).order_by(Subject.name.asc())
    )
    subs = subs_res.scalars().all()

    today = today_kolkata()
    active_cond = active_student_subject_filter(AdmissionItem, Admission, today)
    cnt_map = {}
    if subs:
        sub_ids = [s.id for s in subs]
        cnt_stmt = (
            select(AdmissionItem.subject_id, func.count(AdmissionItem.id))
            .join(Admission, AdmissionItem.admission_id == Admission.id)
            .where(
                AdmissionItem.subject_id.in_(sub_ids),
                active_cond
            )
            .group_by(AdmissionItem.subject_id)
        )
        cnt_map = dict((await db.execute(cnt_stmt)).all())

    subjects_detail = [
        TeacherSubjectDetailItem(
            id=s.id,
            name=s.name,
            subject_code=s.subject_code,
            default_fee=float(s.default_fee or 0),
            status=s.status,
            class_category=s.class_category,
            students_count=cnt_map.get(s.id, 0)
        )
        for s in subs
    ]

    resp = TeacherResponse.model_validate(teacher)
    resp.subjects_taught = subjects_detail
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM, model=TeacherResponse)
    return resp

@router.post("", response_model=TeacherResponse, status_code=status.HTTP_201_CREATED)
async def create_teacher(
    req: TeacherCreate,
    db: AsyncSession = Depends(get_db),
    admin = Depends(require_admin)
):
    clean_mob = req.mobile.strip()
    existing_teacher = (await db.execute(select(Teacher).where(Teacher.mobile == clean_mob))).scalar_one_or_none()
    if existing_teacher:
        raise HTTPException(
            status_code=400,
            detail=f"Faculty member already registered with mobile {clean_mob}: {existing_teacher.name} ({existing_teacher.teacher_code})"
        )

    if not req.name or not req.name.strip():
        raise HTTPException(status_code=400, detail="Teacher name is required")
    if req.qualification is not None and not req.qualification.strip():
        raise HTTPException(status_code=400, detail="Qualification cannot be blank")
    if req.specialization is not None and not req.specialization.strip():
        raise HTTPException(status_code=400, detail="Specialization cannot be blank")

    # Auto-generate teacher code
    count = (await db.execute(select(func.count(Teacher.id)))).scalar() or 0
    code = f"TCH{count + 1:03d}"

    new_teacher = Teacher(
        teacher_code=code,
        name=req.name.strip(),
        mobile=clean_mob,
        email=req.email.strip().lower() if req.email else None,
        qualification=req.qualification.strip() if req.qualification else "Faculty Educator",
        specialization=req.specialization.strip() if req.specialization else "General Faculty",
        photo_url=req.photo_url,
        joining_date=req.joining_date,
        status=req.status,
        share_type=req.share_type,
        share_value=req.share_value
    )
    db.add(new_teacher)
    await db.commit()
    await db.refresh(new_teacher)
    await invalidate_teacher_cache()
    return TeacherResponse.model_validate(new_teacher)

@router.put("/{teacher_id}", response_model=TeacherResponse)
async def update_teacher(
    teacher_id: uuid.UUID,
    req: TeacherUpdate,
    db: AsyncSession = Depends(get_db),
    admin = Depends(require_admin)
):
    teacher = (await db.execute(select(Teacher).where(Teacher.id == teacher_id))).scalar_one_or_none()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    if req.mobile is not None:
        clean_mob = req.mobile.strip()
        existing_teacher = (await db.execute(
            select(Teacher).where(Teacher.mobile == clean_mob, Teacher.id != teacher_id)
        )).scalar_one_or_none()
        if existing_teacher:
            raise HTTPException(
                status_code=400,
                detail=f"Another faculty member already registered with mobile {clean_mob}: {existing_teacher.name} ({existing_teacher.teacher_code})"
            )
        teacher.mobile = clean_mob

    if req.name is not None:
        if not req.name.strip():
            raise HTTPException(status_code=400, detail="Teacher name cannot be blank")
        teacher.name = req.name.strip()
    if req.email is not None: teacher.email = req.email.strip().lower() if req.email else None
    if req.qualification is not None:
        if not req.qualification.strip():
            raise HTTPException(status_code=400, detail="Qualification cannot be blank")
        teacher.qualification = req.qualification.strip()
    if req.specialization is not None:
        if not req.specialization.strip():
            raise HTTPException(status_code=400, detail="Specialization cannot be blank")
        teacher.specialization = req.specialization.strip()
    if req.photo_url is not None: teacher.photo_url = req.photo_url
    if req.joining_date is not None: teacher.joining_date = req.joining_date
    old_status = teacher.status
    if req.status is not None:
        teacher.status = req.status
        if old_status != req.status:
            audit = AuditLog(
                user_id=admin.id,
                action="TEACHER_STATUS_UPDATED",
                entity_type="TEACHER",
                entity_id=teacher.id,
                details=json.dumps({
                    "teacher_code": teacher.teacher_code,
                    "teacher_name": teacher.name,
                    "old_status": old_status,
                    "new_status": req.status,
                    "reason": "Profile edit status change"
                })
            )
            db.add(audit)
    if req.share_type is not None: teacher.share_type = req.share_type
    if req.share_value is not None: teacher.share_value = req.share_value

    await db.commit()
    await db.refresh(teacher)
    await invalidate_teacher_cache()
    return TeacherResponse.model_validate(teacher)

@router.patch("/{teacher_id}/status", response_model=TeacherResponse)
async def update_teacher_status(
    teacher_id: uuid.UUID,
    payload: TeacherStatusUpdate,
    db: AsyncSession = Depends(get_db),
    admin = Depends(require_admin)
):
    teacher = (await db.execute(select(Teacher).where(Teacher.id == teacher_id))).scalar_one_or_none()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    old_status = teacher.status
    new_status = payload.status

    if old_status != new_status:
        teacher.status = new_status
        audit = AuditLog(
            user_id=admin.id,
            action="TEACHER_STATUS_UPDATED",
            entity_type="TEACHER",
            entity_id=teacher.id,
            details=json.dumps({
                "teacher_code": teacher.teacher_code,
                "teacher_name": teacher.name,
                "old_status": old_status,
                "new_status": new_status,
                "reason": payload.reason or f"Status changed from {old_status} to {new_status}"
            })
        )
        db.add(audit)
        await db.commit()
        await db.refresh(teacher)
        await invalidate_teacher_cache()

    return TeacherResponse.model_validate(teacher)

@router.post("/upload-photo")
async def upload_teacher_photo_standalone(
    file: UploadFile = File(...),
    admin = Depends(require_admin)
):
    """
    Upload and compress a teacher photo to <= 20 KB.
    Used during faculty registration before record exists.
    """
    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    try:
        compressed_bytes = compress_avatar_image(raw_bytes, max_kb=20)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image format: {str(e)}")

    upload_dir = os.path.join(os.path.abspath(settings.UPLOAD_DIR), "teachers")
    os.makedirs(upload_dir, exist_ok=True)

    filename = f"temp_tch_{uuid.uuid4().hex[:12]}.jpg"
    filepath = os.path.join(upload_dir, filename)
    with open(filepath, "wb") as f:
        f.write(compressed_bytes)

    photo_url = f"/uploads/teachers/{filename}"
    return {
        "photo_url": photo_url,
        "size_kb": round(len(compressed_bytes) / 1024, 2)
    }

@router.post("/{teacher_id}/photo", response_model=TeacherResponse)
async def upload_teacher_photo(
    teacher_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin = Depends(require_admin)
):
    """
    Upload, compress to <= 20 KB and attach photo directly to an existing faculty member.
    """
    teacher = (await db.execute(select(Teacher).where(Teacher.id == teacher_id))).scalar_one_or_none()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    try:
        compressed_bytes = compress_avatar_image(raw_bytes, max_kb=20)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image format: {str(e)}")

    upload_dir = os.path.join(os.path.abspath(settings.UPLOAD_DIR), "teachers")
    os.makedirs(upload_dir, exist_ok=True)

    filename = f"tch_{teacher.teacher_code.lower()}_{uuid.uuid4().hex[:8]}.jpg"
    filepath = os.path.join(upload_dir, filename)
    with open(filepath, "wb") as f:
        f.write(compressed_bytes)

    teacher.photo_url = f"/uploads/teachers/{filename}"
    await db.commit()
    await db.refresh(teacher)
    await invalidate_teacher_cache()
    return TeacherResponse.model_validate(teacher)

@router.get("/{teacher_id}/roster", response_model=TeacherRosterResponse)
async def get_teacher_roster(
    teacher_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query("ALL"),
    subject_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    user = Depends(require_admin)
):
    """
    Returns complete assigned course enrollment cohort roster for a teacher with
    database-level search, status filtering (Active vs Inactive/Expired vs Cancelled),
    subject filtering, and pre-computed DB metrics.
    """
    cache_key = make_cache_key(
        "teachers", "roster", teacher_id,
        page=page, page_size=page_size, search=search,
        status_filter=status_filter, subject_id=subject_id,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    teacher = (await db.execute(select(Teacher).where(Teacher.id == teacher_id))).scalar_one_or_none()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    # 1. Collect batches and subjects belonging to this teacher
    b_ids = (await db.execute(select(Batch.id).where(Batch.teacher_id == teacher_id))).scalars().all()
    s_ids = (await db.execute(select(Subject.id).where(Subject.teacher_id == teacher_id))).scalars().all()

    where_cond = [AdmissionItem.teacher_id == teacher_id]
    if b_ids: where_cond.append(AdmissionItem.batch_id.in_(b_ids))
    if s_ids: where_cond.append(AdmissionItem.subject_id.in_(s_ids))
    base_teacher_filter = or_(*where_cond)

    today = today_kolkata()
    start_col = func.coalesce(AdmissionItem.valid_from, Admission.valid_from, Admission.admission_date)
    end_col = func.coalesce(AdmissionItem.valid_to, Admission.valid_to, Admission.admission_date + 30)

    # 2. Pre-compute summary metrics across teacher's entire cohort using canonical active definition
    active_cond = active_student_subject_filter(AdmissionItem, Admission, today)
    metrics_stmt = (
        select(
            func.count(AdmissionItem.id),
            func.count(case((active_cond, 1), else_=None)),
            func.count(case((and_(Admission.status == "ACTIVE", or_(AdmissionItem.valid_to < today, AdmissionItem.status == "EXPIRED")), 1), else_=None)),
            func.count(case((or_(Admission.status.in_(["CANCELLED", "REVOKED"]), AdmissionItem.status.in_(["CANCELLED", "REVOKED", "DISCONTINUED"])), 1), else_=None)),
            func.count(func.distinct(Admission.student_id))
        )
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .where(base_teacher_filter)
    )
    m_row = (await db.execute(metrics_stmt)).one()
    total_enr, active_enr, inactive_enr, cancelled_enr, uniq_stu = m_row

    metrics = TeacherRosterMetrics(
        total_enrollments=total_enr or 0,
        active_enrollments=active_enr or 0,
        inactive_enrollments=inactive_enr or 0,
        cancelled_enrollments=cancelled_enr or 0,
        unique_students_count=uniq_stu or 0
    )

    # 3. Base Query for paginated, filtered items
    q_items = (
        select(AdmissionItem, Admission, Student, Batch, Subject)
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .join(Student, Admission.student_id == Student.id)
        .outerjoin(Batch, AdmissionItem.batch_id == Batch.id)
        .outerjoin(Subject, AdmissionItem.subject_id == Subject.id)
        .where(base_teacher_filter)
    )

    q_count = (
        select(func.count(AdmissionItem.id))
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .join(Student, Admission.student_id == Student.id)
        .outerjoin(Batch, AdmissionItem.batch_id == Batch.id)
        .outerjoin(Subject, AdmissionItem.subject_id == Subject.id)
        .where(base_teacher_filter)
    )

    # Apply database-level status filtering
    if status_filter == "ACTIVE":
        status_cond = active_cond
        q_items = q_items.where(status_cond)
        q_count = q_count.where(status_cond)
    elif status_filter in ("INACTIVE", "EXPIRED"):
        status_cond = and_(Admission.status == "ACTIVE", end_col < today)
        q_items = q_items.where(status_cond)
        q_count = q_count.where(status_cond)
    elif status_filter in ("CANCELLED", "REVOKED"):
        status_cond = Admission.status.in_(["CANCELLED", "REVOKED"])
        q_items = q_items.where(status_cond)
        q_count = q_count.where(status_cond)

    # Apply database-level subject filtering
    if subject_id:
        q_items = q_items.where(AdmissionItem.subject_id == subject_id)
        q_count = q_count.where(AdmissionItem.subject_id == subject_id)

    # Apply database-level search query (student name, code, mobile, subject, batch)
    if search and search.strip():
        pat = f"%{search.strip()}%"
        search_clause = or_(
            Student.name.ilike(pat),
            Student.student_code.ilike(pat),
            Student.mobile.ilike(pat),
            Subject.name.ilike(pat),
            Batch.name.ilike(pat),
            AdmissionItem.item_name_snapshot.ilike(pat)
        )
        q_items = q_items.where(search_clause)
        q_count = q_count.where(search_clause)

    total_filtered = (await db.execute(q_count)).scalar() or 0
    total_pages = (total_filtered + page_size - 1) // page_size if total_filtered > 0 else 1

    offset = (page - 1) * page_size
    q_items = q_items.order_by(desc(Admission.admission_date), desc(AdmissionItem.created_at)).offset(offset).limit(page_size)

    rows = (await db.execute(q_items)).all()

    item_ids = [itm.id for itm, adm, stu, bch, sub in rows]
    collected_map = await get_item_allocated_collected_map(db, item_ids)

    items = []
    for itm, adm, stu, bch, sub in rows:
        c_start = itm.valid_from or adm.valid_from or adm.admission_date
        c_end = itm.valid_to or adm.valid_to or (c_start + timedelta(days=30))

        is_cancelled = (
            adm.status in ("CANCELLED", "REVOKED")
            or getattr(itm, "access_status", "ACTIVE") in ("CANCELLED", "REVOKED", "DISCONTINUED")
            or getattr(itm, "status", "ACTIVE") in ("CANCELLED", "REVOKED", "DISCONTINUED")
        )
        if is_cancelled:
            c_status = "CANCELLED"
            s_label = "Cancelled"
            badge_var = "danger"
            s_subtext = "Cancelled"
            days_rem = None
        elif today > c_end:
            c_status = "INACTIVE"
            s_label = "Inactive (Expired)"
            badge_var = "danger"
            days_ago = (today - c_end).days
            s_subtext = f"Cycle ended {days_ago}d ago ({c_end.strftime('%d %b %Y')})"
            days_rem = -(today - c_end).days
        else:
            c_status = "ACTIVE"
            s_label = "Active"
            days_left = compute_days_remaining(c_end, c_start, today)
            days_rem = days_left
            badge_var = "warning" if (days_left is not None and days_left <= 7) else "success"
            s_subtext = f"{days_left}d remaining in cycle"

        c_period_label = f"{c_start.strftime('%d %b %Y')} → {c_end.strftime('%d %b %Y')}"

        items.append(TeacherEnrollmentItem(
            item_id=itm.id,
            admission_id=adm.id,
            admission_number=adm.admission_number,
            admission_date=adm.admission_date,
            student_id=stu.id,
            student_code=stu.student_code,
            student_name=stu.name,
            mobile=stu.mobile,
            father_name=stu.father_name,
            photo_url=stu.photo_url,
            subject_id=sub.id if sub else itm.subject_id,
            subject_name=sub.name if sub else (itm.item_name_snapshot or "Enrolled Course"),
            subject_code=sub.subject_code if sub else None,
            batch_id=bch.id if bch else None,
            batch_name=bch.name if bch else "Direct Subject",
            hall_number=itm.hall_number_snapshot or (bch.hall_number if bch else (sub.hall_number if sub and sub.hall_number else "Main")),
            fee_billed=float(itm.net_price or 0),
            fee_collected=float(collected_map.get(itm.id, Decimal("0.00"))),
            balance_due=float(itm.balance_due or 0),
            payment_status=adm.payment_status,
            admission_status=adm.status,
            valid_from=c_start,
            valid_to=c_end,
            days_remaining=days_rem,
            cycle_status=c_status,
            status_label=s_label,
            badge_variant=badge_var,
            status_subtext=s_subtext,
            billing_day=c_start.day if c_start else None,
            cycle_period_label=c_period_label
        ))

    # 4. Collect unique subjects for this teacher's cohort for frontend filter dropdown
    subs_stmt = (
        select(Subject.id, Subject.name)
        .join(AdmissionItem, AdmissionItem.subject_id == Subject.id)
        .where(base_teacher_filter)
        .distinct()
        .order_by(Subject.name.asc())
    )
    sub_rows = (await db.execute(subs_stmt)).all()
    subjects_list = [TeacherSubjectOption(id=r[0], name=r[1]) for r in sub_rows]

    resp = TeacherRosterResponse(
        items=items,
        total=total_filtered,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        metrics=metrics,
        subjects=subjects_list
    )
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM, model=TeacherRosterResponse)
    return resp


@router.get("/{teacher_id}/earnings", response_model=TeacherEarningsResponse)
async def get_teacher_earnings(
    teacher_id: uuid.UUID,
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    start_date: Optional[date] = Query(None, alias="from_date"),
    end_date: Optional[date] = Query(None, alias="to_date"),
    db: AsyncSession = Depends(get_db),
    user = Depends(require_admin)
):
    """
    Returns breakdown of earnings (earned, reversed, paid, payable) for a teacher,
    with per-subject breakdown and list of payout transactions.
    """
    f_date = from_date or start_date
    t_date = to_date or end_date
    cache_key = make_cache_key(
        "teachers", "earnings", teacher_id,
        from_date=f_date, to_date=t_date,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached

    t_res = await db.execute(select(Teacher).where(Teacher.id == teacher_id))
    teacher = t_res.scalar_one_or_none()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    start_dt, end_dt = ist_day_boundaries(f_date, t_date)
    date_conds = []
    if start_dt:
        date_conds.append(TeacherEarning.earning_date >= start_dt)
    if end_dt:
        date_conds.append(TeacherEarning.earning_date < end_dt)

    # 1. Total aggregations
    stmt_totals = (
        select(
            func.coalesce(func.sum(case((TeacherEarning.earning_type == "EARNED", TeacherEarning.amount), else_=Decimal("0.00"))), Decimal("0.00")),
            func.coalesce(func.sum(case((TeacherEarning.earning_type == "REVERSAL", TeacherEarning.amount), else_=Decimal("0.00"))), Decimal("0.00")),
            func.coalesce(func.sum(case((TeacherEarning.earning_type == "PAYOUT", TeacherEarning.amount), else_=Decimal("0.00"))), Decimal("0.00"))
        )
        .where(TeacherEarning.teacher_id == teacher_id)
    )
    if date_conds:
        stmt_totals = stmt_totals.where(and_(*date_conds))
    res_totals = await db.execute(stmt_totals)
    tot_earned, tot_reversed, tot_paid = res_totals.one()

    tot_earned = Decimal(str(tot_earned))
    tot_reversed = Decimal(str(tot_reversed))
    tot_paid = Decimal(str(tot_paid))
    net_earned = tot_earned - tot_reversed
    payable = tot_earned - tot_reversed - tot_paid

    # 2. Per-subject breakdown
    stmt_subj = (
        select(
            TeacherEarning.subject_id,
            Subject.name,
            func.coalesce(func.sum(case((TeacherEarning.earning_type == "EARNED", TeacherEarning.amount), else_=Decimal("0.00"))), Decimal("0.00")),
            func.coalesce(func.sum(case((TeacherEarning.earning_type == "REVERSAL", TeacherEarning.amount), else_=Decimal("0.00"))), Decimal("0.00"))
        )
        .outerjoin(Subject, TeacherEarning.subject_id == Subject.id)
        .where(
            TeacherEarning.teacher_id == teacher_id,
            TeacherEarning.earning_type.in_(["EARNED", "REVERSAL"])
        )
    )
    if date_conds:
        stmt_subj = stmt_subj.where(and_(*date_conds))
    stmt_subj = stmt_subj.group_by(TeacherEarning.subject_id, Subject.name)
    res_subj = await db.execute(stmt_subj)
    by_subject = []
    for s_id, s_name, s_earned, s_rev in res_subj.all():
        s_e = Decimal(str(s_earned))
        s_r = Decimal(str(s_rev))
        by_subject.append(TeacherSubjectEarningItem(
            subject_id=s_id,
            subject_name=s_name or "General / Direct",
            earned=s_e,
            reversed=s_r,
            net_earned=s_e - s_r
        ))

    # 3. Payouts list
    stmt_payouts = (
        select(TeacherEarning)
        .where(
            TeacherEarning.teacher_id == teacher_id,
            TeacherEarning.earning_type == "PAYOUT"
        )
    )
    if date_conds:
        stmt_payouts = stmt_payouts.where(and_(*date_conds))
    stmt_payouts = stmt_payouts.order_by(desc(TeacherEarning.earning_date))
    payout_rows = (await db.execute(stmt_payouts)).scalars().all()
    payouts_list = [
        {
            "id": str(p.id),
            "amount": float(p.amount),
            "payout_mode": p.payout_mode or "CASH",
            "date": p.earning_date.isoformat(),
            "notes": p.notes,
            "salary_record_id": str(p.salary_record_id) if p.salary_record_id else None
        }
        for p in payout_rows
    ]

    basis = getattr(settings, "TEACHER_EARNING_BASIS", "CASH")

    resp = TeacherEarningsResponse(
        teacher_id=teacher.id,
        teacher_name=teacher.name,
        teacher_code=teacher.teacher_code,
        share_type=teacher.share_type,
        share_value=Decimal(str(teacher.share_value)),
        basis=basis,
        from_date=f_date,
        to_date=t_date,
        total_earned=tot_earned,
        total_reversed=tot_reversed,
        net_earned=net_earned,
        total_paid=tot_paid,
        payable=payable,
        by_subject=by_subject,
        payouts=payouts_list
    )
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM, model=TeacherEarningsResponse)
    return resp


@router.post("/{teacher_id}/payouts", response_model=TeacherPayoutResponse, status_code=status.HTTP_201_CREATED)
async def create_teacher_payout(
    teacher_id: uuid.UUID,
    payload: TeacherPayoutCreate,
    db: AsyncSession = Depends(get_db),
    admin = Depends(require_admin)
):
    """
    Creates a payout for a teacher.
    Links payout to SalaryRecord (status=PAID) so cash-flow reports do not double count.
    Records TeacherEarning row (type=PAYOUT) and AuditLog.
    """
    t_res = await db.execute(select(Teacher).where(Teacher.id == teacher_id))
    teacher = t_res.scalar_one_or_none()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    p_amt = Decimal(str(payload.amount))
    if p_amt <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Payout amount must be greater than zero")

    pay_date = payload.payment_date or date.today()
    month_str = pay_date.strftime("%Y-%m")

    # 1. Create SalaryRecord linked so cash-flow outflow recognizes it once
    salary_record = SalaryRecord(
        employee_id=teacher.id,
        employee_type="TEACHER",
        employee_name_snapshot=teacher.name,
        month_year=month_str,
        salary_amount=p_amt,
        due_date=pay_date,
        paid_amount=p_amt,
        status="PAID",
        payment_date=pay_date,
        payment_mode=payload.payout_mode,
        notes=f"Faculty payout: {payload.notes or ''}"
    )
    db.add(salary_record)
    await db.flush()

    # 2. Append-only TeacherEarning (PAYOUT)
    now_dt = datetime.combine(pay_date, datetime.min.time(), tzinfo=timezone.utc)
    earning = TeacherEarning(
        teacher_id=teacher.id,
        earning_type="PAYOUT",
        basis=getattr(settings, "TEACHER_EARNING_BASIS", "CASH"),
        amount=p_amt,
        salary_record_id=salary_record.id,
        payout_mode=payload.payout_mode,
        earning_date=now_dt,
        notes=payload.notes or f"Payout of ₹{p_amt} via {payload.payout_mode}",
        created_by=admin.id
    )
    db.add(earning)
    await db.flush()

    # 3. Audit Log
    audit = AuditLog(
        user_id=admin.id,
        action="TEACHER_PAYOUT_RECORDED",
        entity_type="TEACHER_PAYOUT",
        entity_id=earning.id,
        details=json.dumps({
            "teacher_id": str(teacher.id),
            "teacher_name": teacher.name,
            "amount": float(p_amt),
            "payout_mode": payload.payout_mode,
            "salary_record_id": str(salary_record.id),
            "payment_date": pay_date.isoformat()
        })
    )
    db.add(audit)
    await db.commit()
    await db.refresh(earning)
    await invalidate_expense_and_salary_cache()

    return TeacherPayoutResponse(
        id=earning.id,
        teacher_id=teacher.id,
        amount=earning.amount,
        payout_mode=earning.payout_mode or "CASH",
        earning_date=earning.earning_date,
        salary_record_id=earning.salary_record_id,
        notes=earning.notes
    )


@router.get("/{teacher_id}/breakup", response_model=TeacherBreakupResponse)
async def get_teacher_breakup(
    teacher_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user = Depends(require_admin)
):
    """
    Teacher-wise financial breakup mirroring Subject module (G3):
    Students currently enrolled, total fees billed, collected, due, waived, refunded,
    plus per-subject breakup and enrolled scholar ledger.
    All figures derived strictly from the backend ledger as single source of truth.
    """
    cache_key = make_cache_key("teachers", "breakup", teacher_id)
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    teacher = (await db.execute(select(Teacher).where(Teacher.id == teacher_id))).scalar_one_or_none()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    today = today_kolkata()

    # 1. Base teacher filter for course enrollments
    b_ids = (await db.execute(select(Batch.id).where(Batch.teacher_id == teacher_id))).scalars().all()
    s_ids = (await db.execute(select(Subject.id).where(Subject.teacher_id == teacher_id))).scalars().all()

    where_cond = [AdmissionItem.teacher_id == teacher_id]
    if b_ids: where_cond.append(AdmissionItem.batch_id.in_(b_ids))
    if s_ids: where_cond.append(AdmissionItem.subject_id.in_(s_ids))
    base_teacher_filter = or_(*where_cond)

    # 2. Overall aggregation from database
    active_cond = active_student_subject_filter(AdmissionItem, Admission, today)
    overall_stmt = (
        select(
            func.coalesce(func.sum(AdmissionItem.net_price), Decimal("0.00")),
            func.coalesce(func.sum(AdmissionItem.balance_due), Decimal("0.00")),
            func.coalesce(func.sum(AdmissionItem.written_off_amount), Decimal("0.00")),
            func.count(AdmissionItem.id),
            func.count(case((active_cond, 1), else_=None)),
            func.count(func.distinct(Admission.student_id))
        )
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .where(and_(base_teacher_filter, Admission.status != "CANCELLED"))
    )
    billed_tot, due_tot, waived_tot, total_enr, active_enr, uniq_stu = (await db.execute(overall_stmt)).one()

    # Ledger collected strictly from PaymentAllocation
    ledger_coll_stmt = (
        select(func.coalesce(func.sum(PaymentAllocation.allocated_amount), Decimal("0.00")))
        .join(AdmissionItem, PaymentAllocation.admission_item_id == AdmissionItem.id)
        .where(base_teacher_filter)
    )
    collected_tot = (await db.execute(ledger_coll_stmt)).scalar() or Decimal("0.00")

    # Ledger refunded
    ref_stmt = (
        select(func.coalesce(func.sum(func.abs(PaymentAllocation.allocated_amount)), Decimal("0.00")))
        .join(AdmissionItem, PaymentAllocation.admission_item_id == AdmissionItem.id)
        .where(and_(base_teacher_filter, PaymentAllocation.allocated_amount < Decimal("0.00")))
    )
    refunded_tot = (await db.execute(ref_stmt)).scalar() or Decimal("0.00")

    billed_f = float(billed_tot)
    coll_f = float(collected_tot)
    due_f = float(max(Decimal("0.00"), billed_tot - collected_tot - waived_tot))
    waived_f = float(waived_tot)
    ref_f = float(refunded_tot)
    net_rev_f = float(collected_tot - refunded_tot)
    eff_pct = min(100.0, round((coll_f / billed_f * 100), 1)) if billed_f > 0 else 100.0

    # 3. Per-Subject Breakup
    all_subj_ids = set(s_ids)
    assigned_subj_ids = (await db.execute(
        select(AdmissionItem.subject_id)
        .where(base_teacher_filter, AdmissionItem.subject_id.is_not(None))
        .distinct()
    )).scalars().all()
    all_subj_ids.update(assigned_subj_ids)

    subjects_list = []
    if all_subj_ids:
        all_subjects = (await db.execute(
            select(Subject).where(Subject.id.in_(all_subj_ids)).order_by(Subject.name.asc())
        )).scalars().all()

        sub_stmt = (
            select(
                AdmissionItem.subject_id,
                func.coalesce(func.sum(AdmissionItem.net_price), Decimal("0.00")),
                func.coalesce(func.sum(AdmissionItem.balance_due), Decimal("0.00")),
                func.coalesce(func.sum(AdmissionItem.written_off_amount), Decimal("0.00")),
                func.count(AdmissionItem.id),
                func.count(case((active_cond, 1), else_=None))
            )
            .join(Admission, AdmissionItem.admission_id == Admission.id)
            .where(and_(base_teacher_filter, AdmissionItem.subject_id.is_not(None), Admission.status != "CANCELLED"))
            .group_by(AdmissionItem.subject_id)
        )
        sub_metrics_map = {row[0]: row[1:] for row in (await db.execute(sub_stmt)).all()}

        s_coll_stmt = (
            select(
                AdmissionItem.subject_id,
                func.coalesce(func.sum(PaymentAllocation.allocated_amount), Decimal("0.00"))
            )
            .join(AdmissionItem, PaymentAllocation.admission_item_id == AdmissionItem.id)
            .where(and_(base_teacher_filter, AdmissionItem.subject_id.is_not(None)))
            .group_by(AdmissionItem.subject_id)
        )
        s_coll_map = dict((await db.execute(s_coll_stmt)).all())

        s_ref_stmt = (
            select(
                AdmissionItem.subject_id,
                func.coalesce(func.sum(func.abs(PaymentAllocation.allocated_amount)), Decimal("0.00"))
            )
            .join(AdmissionItem, PaymentAllocation.admission_item_id == AdmissionItem.id)
            .where(and_(base_teacher_filter, AdmissionItem.subject_id.is_not(None), PaymentAllocation.allocated_amount < Decimal("0.00")))
            .group_by(AdmissionItem.subject_id)
        )
        s_ref_map = dict((await db.execute(s_ref_stmt)).all())

        for sub in all_subjects:
            s_billed, s_due, s_waived, s_tot_enr, s_act_enr = sub_metrics_map.get(sub.id, (Decimal("0.00"), Decimal("0.00"), Decimal("0.00"), 0, 0))
            s_coll = s_coll_map.get(sub.id, Decimal("0.00"))
            s_ref = s_ref_map.get(sub.id, Decimal("0.00"))

            sb_f = float(s_billed)
            sc_f = float(s_coll)
            sd_f = float(max(Decimal("0.00"), s_billed - s_coll - s_waived))
            sw_f = float(s_waived)
            sr_f = float(s_ref)
            s_eff = min(100.0, round((sc_f / sb_f * 100), 1)) if sb_f > 0 else 100.0

            subjects_list.append(TeacherSubjectBreakupItem(
                subject_id=sub.id,
                subject_code=sub.subject_code,
                subject_name=sub.name,
                default_fee=float(sub.default_fee or 0),
                status=sub.status,
                students_enrolled=s_act_enr or 0,
                total_enrollments=s_tot_enr or 0,
                fees_billed=sb_f,
                collected=sc_f,
                due=sd_f,
                waived=sw_f,
                refunded=sr_f,
                net_revenue=float(s_coll - s_ref),
                collection_efficiency=s_eff
            ))

    # 4. Student-wise breakup list
    stu_rows = (await db.execute(
        select(AdmissionItem, Admission, Student, Subject)
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .join(Student, Admission.student_id == Student.id)
        .outerjoin(Subject, AdmissionItem.subject_id == Subject.id)
        .where(base_teacher_filter)
        .order_by(desc(Admission.admission_date), Student.name.asc())
    )).all()

    stu_item_ids = [itm.id for itm, adm, stu, sub in stu_rows]
    stu_coll_map = await get_item_allocated_collected_map(db, stu_item_ids)

    students_list = []
    for itm, adm, stu, sub in stu_rows:
        c_end = itm.valid_to or adm.valid_to or (adm.admission_date + timedelta(days=30))
        if adm.status in ("CANCELLED", "REVOKED"):
            c_status = "CANCELLED"
        elif today > c_end:
            c_status = "INACTIVE"
        else:
            c_status = "ACTIVE"

        c_collected = float(stu_coll_map.get(itm.id, Decimal("0.00")))
        b_due = float(max(Decimal("0.00"), (itm.net_price or Decimal("0.00")) - Decimal(str(c_collected)) - (itm.written_off_amount or Decimal("0.00"))))

        students_list.append(TeacherStudentBreakupItem(
            student_id=stu.id,
            student_code=stu.student_code,
            student_name=stu.name,
            mobile=stu.mobile,
            subject_id=sub.id if sub else itm.subject_id,
            subject_name=sub.name if sub else (itm.item_name_snapshot or "Subject"),
            hall_number=itm.hall_number_snapshot or (sub.hall_number if sub else "Main"),
            fee_billed=float(itm.net_price or 0),
            fee_collected=c_collected,
            balance_due=b_due,
            waived=float(itm.written_off_amount or 0),
            cycle_status=c_status,
            payment_status=adm.payment_status
        ))

    resp = TeacherBreakupResponse(
        teacher_id=teacher.id,
        teacher_name=teacher.name,
        teacher_code=teacher.teacher_code,
        status=teacher.status,
        students_enrolled=active_enr or 0,
        total_enrollments=total_enr or 0,
        unique_students_count=uniq_stu or 0,
        total_fees_billed=billed_f,
        total_collected=coll_f,
        total_due=due_f,
        total_waived=waived_f,
        total_refunded=ref_f,
        net_revenue=net_rev_f,
        collection_efficiency=eff_pct,
        subjects=subjects_list,
        students=students_list
    )
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM, model=TeacherBreakupResponse)
    return resp


@router.get("/{teacher_id}/history", response_model=TeacherHistoryResponse)
async def get_teacher_history(
    teacher_id: uuid.UUID,
    event_type: Optional[str] = Query(None, description="Filter: ALL, ADMISSION, RENEWAL, EXPIRY, CHANGE, CANCELLATION"),
    search: Optional[str] = Query(None, description="Search student, code, or subject"),
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=100, description="Page size"),
    db: AsyncSession = Depends(get_db),
    user = Depends(require_admin)
):
    """
    Chronological history of every admission, renewal, expiry, change and cancellation
    for that teacher's subjects.
    """
    cache_key = make_cache_key(
        "teachers", "history", teacher_id,
        event_type=event_type, search=search, page=page, page_size=page_size,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    teacher = (await db.execute(select(Teacher).where(Teacher.id == teacher_id))).scalar_one_or_none()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    today = today_kolkata()

    b_ids = (await db.execute(select(Batch.id).where(Batch.teacher_id == teacher_id))).scalars().all()
    s_ids = (await db.execute(select(Subject.id).where(Subject.teacher_id == teacher_id))).scalars().all()

    where_cond = [AdmissionItem.teacher_id == teacher_id]
    if b_ids: where_cond.append(AdmissionItem.batch_id.in_(b_ids))
    if s_ids: where_cond.append(AdmissionItem.subject_id.in_(s_ids))
    base_teacher_filter = or_(*where_cond)

    rows = (await db.execute(
        select(AdmissionItem, Admission, Student, Subject)
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .join(Student, Admission.student_id == Student.id)
        .outerjoin(Subject, AdmissionItem.subject_id == Subject.id)
        .where(base_teacher_filter)
        .order_by(desc(Admission.admission_date), desc(AdmissionItem.created_at))
    )).all()

    item_ids = [itm.id for itm, adm, stu, sub in rows]
    coll_map = await get_item_allocated_collected_map(db, item_ids)

    all_events = []
    admissions_cnt = 0
    renewals_cnt = 0
    expiries_cnt = 0
    changes_cnt = 0
    cancellations_cnt = 0

    for itm, adm, stu, sub in rows:
        sub_name = sub.name if sub else (itm.item_name_snapshot or "Course Subject")
        sub_code = sub.subject_code if sub else ""
        c_coll = float(coll_map.get(itm.id, Decimal("0.00")))
        b_due = float(itm.balance_due or 0)
        net_p = float(itm.net_price or 0)

        # 1. CANCELLATION event
        is_cancelled = adm.status in ("CANCELLED", "REVOKED") or itm.status in ("CANCELLED", "REVOKED")
        if is_cancelled:
            cancellations_cnt += 1
            ts = adm.revoked_at or itm.discontinued_at or itm.updated_at or itm.created_at
            all_events.append(TeacherHistoryEvent(
                event_id=f"cnc-{itm.id}",
                event_type="CANCELLATION",
                event_title=f"Enrollment Cancelled / Revoked ({adm.revoke_type or adm.status})",
                event_date=ts.date() if isinstance(ts, datetime) else ts,
                timestamp=ts if isinstance(ts, datetime) else datetime.combine(ts, datetime.min.time(), tzinfo=timezone.utc),
                admission_id=adm.id,
                admission_number=adm.admission_number,
                item_id=itm.id,
                student_id=stu.id,
                student_code=stu.student_code,
                student_name=stu.name,
                mobile=stu.mobile,
                subject_id=sub.id if sub else itm.subject_id,
                subject_name=sub_name,
                subject_code=sub_code,
                valid_from=itm.valid_from,
                valid_to=itm.valid_to,
                fee_amount=net_p,
                amount_collected=c_coll,
                balance_due=b_due,
                status="CANCELLED",
                reason_or_notes=adm.revocation_reason or adm.notes or itm.lifecycle_reason or "Enrollment cancelled",
                badge_variant="danger"
            ))

        # 2. CHANGE event (discontinued / swapped subject)
        is_change = itm.status == "DISCONTINUED" or (itm.lifecycle_reason and "changed" in itm.lifecycle_reason.lower())
        if is_change:
            changes_cnt += 1
            ts = itm.discontinued_at or itm.created_at
            all_events.append(TeacherHistoryEvent(
                event_id=f"chg-{itm.id}",
                event_type="CHANGE",
                event_title=f"Subject Changed ({sub_name})",
                event_date=ts.date() if isinstance(ts, datetime) else ts,
                timestamp=ts if isinstance(ts, datetime) else datetime.combine(ts, datetime.min.time(), tzinfo=timezone.utc),
                admission_id=adm.id,
                admission_number=adm.admission_number,
                item_id=itm.id,
                student_id=stu.id,
                student_code=stu.student_code,
                student_name=stu.name,
                mobile=stu.mobile,
                subject_id=sub.id if sub else itm.subject_id,
                subject_name=sub_name,
                subject_code=sub_code,
                valid_from=itm.valid_from,
                valid_to=itm.valid_to,
                fee_amount=net_p,
                amount_collected=c_coll,
                balance_due=b_due,
                status="DISCONTINUED",
                reason_or_notes=itm.lifecycle_reason or "Subject changed / transferred",
                badge_variant="purple"
            ))

        # 3. EXPIRY event (if past valid_to and not cancelled)
        if itm.valid_to and itm.valid_to < today and not is_cancelled:
            expiries_cnt += 1
            days_ago = (today - itm.valid_to).days
            ts = datetime.combine(itm.valid_to, datetime.max.time(), tzinfo=timezone.utc)
            all_events.append(TeacherHistoryEvent(
                event_id=f"exp-{itm.id}",
                event_type="EXPIRY",
                event_title=f"Course Cycle Expired ({days_ago}d ago)",
                event_date=itm.valid_to,
                timestamp=ts,
                admission_id=adm.id,
                admission_number=adm.admission_number,
                item_id=itm.id,
                student_id=stu.id,
                student_code=stu.student_code,
                student_name=stu.name,
                mobile=stu.mobile,
                subject_id=sub.id if sub else itm.subject_id,
                subject_name=sub_name,
                subject_code=sub_code,
                valid_from=itm.valid_from,
                valid_to=itm.valid_to,
                fee_amount=net_p,
                amount_collected=c_coll,
                balance_due=b_due,
                status="EXPIRED",
                reason_or_notes=f"Monthly billing cycle ended on {itm.valid_to.strftime('%d %b %Y')}",
                badge_variant="warning"
            ))

        # 4. RENEWAL vs ADMISSION event
        is_renewal = itm.renewed_from_item_id is not None or (itm.renewal_count and itm.renewal_count > 0)
        if is_renewal:
            renewals_cnt += 1
            cycle_num = itm.renewal_count or 1
            ts = itm.created_at
            all_events.append(TeacherHistoryEvent(
                event_id=f"rnw-{itm.id}",
                event_type="RENEWAL",
                event_title=f"Course Renewal (Cycle #{cycle_num})",
                event_date=itm.valid_from or adm.admission_date,
                timestamp=ts,
                admission_id=adm.id,
                admission_number=adm.admission_number,
                item_id=itm.id,
                student_id=stu.id,
                student_code=stu.student_code,
                student_name=stu.name,
                mobile=stu.mobile,
                subject_id=sub.id if sub else itm.subject_id,
                subject_name=sub_name,
                subject_code=sub_code,
                valid_from=itm.valid_from,
                valid_to=itm.valid_to,
                fee_amount=net_p,
                amount_collected=c_coll,
                balance_due=b_due,
                status=itm.status,
                reason_or_notes=f"Renewed course cycle for {sub_name}",
                badge_variant="success"
            ))
        else:
            admissions_cnt += 1
            ts = itm.created_at or datetime.combine(adm.admission_date, datetime.min.time(), tzinfo=timezone.utc)
            all_events.append(TeacherHistoryEvent(
                event_id=f"adm-{itm.id}",
                event_type="ADMISSION",
                event_title=f"Initial Admission & Enrollment",
                event_date=adm.admission_date,
                timestamp=ts,
                admission_id=adm.id,
                admission_number=adm.admission_number,
                item_id=itm.id,
                student_id=stu.id,
                student_code=stu.student_code,
                student_name=stu.name,
                mobile=stu.mobile,
                subject_id=sub.id if sub else itm.subject_id,
                subject_name=sub_name,
                subject_code=sub_code,
                valid_from=itm.valid_from,
                valid_to=itm.valid_to,
                fee_amount=net_p,
                amount_collected=c_coll,
                balance_due=b_due,
                status=itm.status,
                reason_or_notes=f"Admitted to {sub_name} under #{adm.admission_number}",
                badge_variant="primary"
            ))

    # Sort chronologically descending
    all_events.sort(key=lambda x: x.timestamp, reverse=True)

    # Filter by event_type if specified
    filtered_events = all_events
    if event_type and event_type.upper() != "ALL":
        filtered_events = [e for e in filtered_events if e.event_type.upper() == event_type.upper()]

    if search and search.strip():
        q = search.strip().lower()
        filtered_events = [
            e for e in filtered_events
            if q in e.student_name.lower() or q in e.student_code.lower() or q in (e.mobile or "") or q in e.subject_name.lower() or q in (e.subject_code or "").lower() or q in e.admission_number.lower()
        ]

    total = len(filtered_events)
    if page is not None:
        effective_page_size = page_size or 20
        total_pages = max(1, (total + effective_page_size - 1) // effective_page_size) if total > 0 else 1
        start = (page - 1) * effective_page_size
        paged_events = filtered_events[start:start + effective_page_size]
        cur_page = page
    else:
        effective_page_size = total or 20
        total_pages = 1
        paged_events = filtered_events
        cur_page = 1

    resp = TeacherHistoryResponse(
        teacher_id=teacher.id,
        teacher_name=teacher.name,
        teacher_code=teacher.teacher_code,
        total_events=len(all_events),
        admissions_count=admissions_cnt,
        renewals_count=renewals_cnt,
        expiries_count=expiries_cnt,
        changes_count=changes_cnt,
        cancellations_count=cancellations_cnt,
        total=total,
        total_pages=total_pages,
        page=cur_page,
        page_size=effective_page_size,
        events=paged_events
    )
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM, model=TeacherHistoryResponse)
    return resp


@router.get("/{teacher_id}/collections", response_model=TeacherCollectionsResponse)
async def get_teacher_collections(
    teacher_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user = Depends(require_admin)
):
    """
    Fee collections handled by this teacher where the ledger records it.
    Matches Payment records where collected_by user or collector_name matches this teacher.
    """
    cache_key = make_cache_key("teachers", "collections", teacher_id)
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    teacher = (await db.execute(select(Teacher).where(Teacher.id == teacher_id))).scalar_one_or_none()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    conds = [Payment.collector_name_snapshot.ilike(f"%{teacher.name}%")]
    if teacher.user_id:
        conds.append(Payment.collected_by == teacher.user_id)
    conds.append(Payment.collected_by == teacher.id)

    stmt = (
        select(Payment, Student, Admission)
        .join(Student, Payment.student_id == Student.id)
        .join(Admission, Payment.admission_id == Admission.id)
        .where(or_(*conds))
        .order_by(desc(Payment.payment_date))
    )
    rows = (await db.execute(stmt)).all()

    # Preload subject names for allocations of these payments
    payment_ids = [p.id for p, s, a in rows]
    p_subj_map = defaultdict(list)
    if payment_ids:
        alloc_stmt = (
            select(PaymentAllocation.payment_id, Subject.name)
            .join(AdmissionItem, PaymentAllocation.admission_item_id == AdmissionItem.id)
            .outerjoin(Subject, AdmissionItem.subject_id == Subject.id)
            .where(PaymentAllocation.payment_id.in_(payment_ids))
        )
        for pid, sname in (await db.execute(alloc_stmt)).all():
            if sname and sname not in p_subj_map[pid]:
                p_subj_map[pid].append(sname)

    items = []
    tot_coll = Decimal("0.00")
    by_mode = defaultdict(float)

    for p, stu, adm in rows:
        amt_f = float(p.amount)
        tot_coll += p.amount
        by_mode[p.payment_mode] += amt_f

        items.append(TeacherCollectionItem(
            payment_id=p.id,
            payment_number=p.payment_number,
            payment_date=p.payment_date,
            amount=amt_f,
            payment_mode=p.payment_mode,
            transaction_reference=p.transaction_reference,
            student_id=stu.id,
            student_name=stu.name,
            student_code=stu.student_code,
            admission_id=adm.id,
            admission_number=adm.admission_number,
            fee_period=p.fee_period,
            collector_name=p.collector_name_snapshot,
            notes=p.notes,
            subject_names=p_subj_map.get(p.id, [])
        ))

    resp = TeacherCollectionsResponse(
        teacher_id=teacher.id,
        teacher_name=teacher.name,
        teacher_code=teacher.teacher_code,
        total_collected=float(tot_coll),
        collections_count=len(items),
        by_mode=dict(by_mode),
        items=items
    )
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM, model=TeacherCollectionsResponse)
    return resp


@router.get("/{teacher_id}/demo-conversion", response_model=TeacherDemoConversionResponse)
async def get_teacher_demo_conversion_endpoint(
    teacher_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user = Depends(require_admin)
):
    """
    Demo conversion metrics credited to this teacher as the demo giver,
    verified by source_demo_number, matching the Reports teacher-wise demo conversion table.
    """
    cache_key = make_cache_key("teachers", "demo_conversion", teacher_id)
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    teacher = (await db.execute(select(Teacher).where(Teacher.id == teacher_id))).scalar_one_or_none()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    stats = await get_teacher_demo_conversion(db, teacher_id)
    resp = TeacherDemoConversionResponse(
        teacher_id=teacher.id,
        teacher_name=teacher.name,
        teacher_code=teacher.teacher_code,
        demos_given=stats["demos_given"],
        demos_converted=stats["demos_converted"],
        conversion_rate_pct=stats["conversion_rate_pct"],
        enrolled_subjects=stats["enrolled_subjects"],
        converted_demos=stats["converted_demos"],
    )
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM, model=TeacherDemoConversionResponse)
    return resp

@router.get("/{teacher_id}/attendance", response_model=TeacherMonthlyAttendanceResponse)
async def get_teacher_attendance_detail(
    teacher_id: uuid.UUID,
    month_year: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user = Depends(require_cashier_or_admin)
):
    m_year = (month_year or date.today().strftime("%Y-%m")).strip()
    cache_key = make_cache_key("teachers", "attendance_detail", teacher_id, month_year=m_year)
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    teacher = (await db.execute(select(Teacher).where(Teacher.id == teacher_id))).scalar_one_or_none()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
        
    records = (await db.execute(
        select(TeacherAttendance)
        .where(TeacherAttendance.teacher_id == teacher_id, TeacherAttendance.month_year == m_year)
        .order_by(TeacherAttendance.date.asc())
    )).scalars().all()
    
    abs_dates = [r.date for r in records]
    abs_days = [r.date.isoformat() for r in records]
    days_in_m = get_days_in_month(m_year)
    abs_cnt = len(abs_dates)
    pres_cnt = max(0, days_in_m - abs_cnt)
    
    resp = TeacherMonthlyAttendanceResponse(
        teacher_id=teacher.id,
        teacher_name=teacher.name,
        teacher_code=teacher.teacher_code,
        month_year=m_year,
        absent_days_count=abs_cnt,
        present_days_count=pres_cnt,
        days_in_month=days_in_m,
        absent_dates=abs_dates,
        absent_days=abs_days,
        records=[
            TeacherAttendanceRecordResponse(
                id=r.id,
                date=r.date,
                month_year=r.month_year,
                status=r.status,
                reason=r.reason
            ) for r in records
        ]
    )
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM, model=TeacherMonthlyAttendanceResponse)
    return resp

@router.post("/{teacher_id}/attendance/toggle", response_model=TeacherMonthlyAttendanceResponse)
async def toggle_teacher_absent_day(
    teacher_id: uuid.UUID,
    payload: TeacherAttendanceToggle,
    db: AsyncSession = Depends(get_db),
    user = Depends(require_cashier_or_admin)
):
    teacher = (await db.execute(select(Teacher).where(Teacher.id == teacher_id))).scalar_one_or_none()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
        
    m_year = payload.date.strftime("%Y-%m")
    
    existing = (await db.execute(
        select(TeacherAttendance)
        .where(TeacherAttendance.teacher_id == teacher_id, TeacherAttendance.date == payload.date)
    )).scalar_one_or_none()
    
    if existing:
        await db.delete(existing)
    else:
        new_rec = TeacherAttendance(
            teacher_id=teacher_id,
            date=payload.date,
            month_year=m_year,
            status="ABSENT",
            reason=payload.reason,
            created_by=user.id if hasattr(user, 'id') else None
        )
        db.add(new_rec)
        
    await db.commit()
    await invalidate_expense_and_salary_cache()
    return await get_teacher_attendance_detail(teacher_id=teacher_id, month_year=m_year, db=db, user=user)

@router.post("/{teacher_id}/attendance", response_model=TeacherMonthlyAttendanceResponse)
async def bulk_set_teacher_attendance(
    teacher_id: uuid.UUID,
    payload: TeacherAttendanceBulkUpdate,
    db: AsyncSession = Depends(get_db),
    user = Depends(require_cashier_or_admin)
):
    teacher = (await db.execute(select(Teacher).where(Teacher.id == teacher_id))).scalar_one_or_none()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
        
    m_year = payload.month_year.strip()
    
    existing_records = (await db.execute(
        select(TeacherAttendance)
        .where(TeacherAttendance.teacher_id == teacher_id, TeacherAttendance.month_year == m_year)
    )).scalars().all()
    for er in existing_records:
        await db.delete(er)
        
    input_dates = payload.absent_dates or payload.absent_days or []
    unique_dates = sorted(set(input_dates))
    for d in unique_dates:
        if d.strftime("%Y-%m") != m_year:
            continue
        new_rec = TeacherAttendance(
            teacher_id=teacher_id,
            date=d,
            month_year=m_year,
            status="ABSENT",
            reason=payload.reason,
            created_by=user.id if hasattr(user, 'id') else None
        )
        db.add(new_rec)
        
    await db.commit()
    await invalidate_expense_and_salary_cache()
    return await get_teacher_attendance_detail(teacher_id=teacher_id, month_year=m_year, db=db, user=user)

@router.get("/{teacher_id}/salaries", response_model=List[SalaryRecordResponse])
async def get_teacher_salary_history(
    teacher_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user = Depends(require_admin)
):
    cache_key = make_cache_key("teachers", "salaries", teacher_id)
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    teacher = (await db.execute(select(Teacher).where(Teacher.id == teacher_id))).scalar_one_or_none()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    cond = or_(SalaryRecord.employee_id == teacher.id, SalaryRecord.employee_name_snapshot.ilike(teacher.name.strip()))
    stmt = select(SalaryRecord).where(cond).order_by(desc(SalaryRecord.month_year), desc(SalaryRecord.created_at))
    records = (await db.execute(stmt)).scalars().all()

    resp = []
    for r in records:
        cnt_res = await db.execute(
            select(func.count(TeacherAttendance.id))
            .where(TeacherAttendance.teacher_id == teacher.id, TeacherAttendance.month_year == r.month_year)
        )
        abs_cnt = cnt_res.scalar() or 0
        resp.append(
            SalaryRecordResponse(
                id=r.id,
                employee_id=r.employee_id or teacher.id,
                employee_type=r.employee_type,
                employee_name_snapshot=r.employee_name_snapshot,
                month_year=r.month_year,
                salary_amount=r.salary_amount,
                due_date=r.due_date,
                paid_amount=r.paid_amount,
                status=r.status,
                payment_date=r.payment_date,
                payment_mode=r.payment_mode,
                notes=r.notes,
                absent_days_count=abs_cnt,
                base_salary=r.base_salary,
                holidays_count=r.holidays_count or 0
            )
        )
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM, model=List[SalaryRecordResponse])
    return resp

