from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, desc, case
from datetime import date, timedelta
from typing import Optional
import uuid

from app.database.session import get_db
from app.modules.teachers.models import Teacher
from app.modules.teachers.schemas import (
    TeacherCreate, TeacherUpdate, TeacherResponse,
    TeacherEnrollmentItem, TeacherRosterMetrics, TeacherRosterResponse, TeacherSubjectOption
)
from app.modules.batches.models import Batch
from app.modules.subjects.models import Subject
from app.modules.admissions.models import Admission, AdmissionItem
from app.modules.students.models import Student
from app.core.dependencies import require_staff, require_admin
from app.common.pagination import PageResponse

router = APIRouter(prefix="/api/teachers", tags=["Teachers"])

@router.get("", response_model=PageResponse[TeacherResponse])
async def list_teachers(
    page: int = 1,
    page_size: int = 20,
    search: str = None,
    status: str = None,
    db: AsyncSession = Depends(get_db),
    user = Depends(require_staff)
):
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

    if status:
        query = query.where(Teacher.status == status)
        count_query = count_query.where(Teacher.status == status)

    total = (await db.execute(count_query)).scalar() or 0
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    query = query.order_by(Teacher.name.asc()).offset((page - 1) * page_size).limit(page_size)
    items = (await db.execute(query)).scalars().all()

    return PageResponse(
        items=[TeacherResponse.model_validate(t) for t in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )

@router.get("/{teacher_id}", response_model=TeacherResponse)
async def get_teacher(teacher_id: uuid.UUID, db: AsyncSession = Depends(get_db), user = Depends(require_staff)):
    teacher = (await db.execute(select(Teacher).where(Teacher.id == teacher_id))).scalar_one_or_none()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    return TeacherResponse.model_validate(teacher)

@router.post("", response_model=TeacherResponse, status_code=status.HTTP_201_CREATED)
async def create_teacher(
    req: TeacherCreate,
    db: AsyncSession = Depends(get_db),
    admin = Depends(require_admin)
):
    # Auto-generate teacher code
    count = (await db.execute(select(func.count(Teacher.id)))).scalar() or 0
    code = f"TCH{count + 1:03d}"

    new_teacher = Teacher(
        teacher_code=code,
        name=req.name.strip(),
        mobile=req.mobile.strip(),
        email=req.email.strip().lower() if req.email else None,
        qualification=req.qualification,
        specialization=req.specialization,
        photo_url=req.photo_url,
        joining_date=req.joining_date,
        status=req.status
    )
    db.add(new_teacher)
    await db.commit()
    await db.refresh(new_teacher)
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

    if req.name is not None: teacher.name = req.name.strip()
    if req.mobile is not None: teacher.mobile = req.mobile.strip()
    if req.email is not None: teacher.email = req.email.strip().lower() if req.email else None
    if req.qualification is not None: teacher.qualification = req.qualification
    if req.specialization is not None: teacher.specialization = req.specialization
    if req.photo_url is not None: teacher.photo_url = req.photo_url
    if req.joining_date is not None: teacher.joining_date = req.joining_date
    if req.status is not None: teacher.status = req.status

    await db.commit()
    await db.refresh(teacher)
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
    user = Depends(require_staff)
):
    """
    Returns complete assigned course enrollment cohort roster for a teacher with
    database-level search, status filtering (Active vs Inactive/Expired vs Cancelled),
    subject filtering, and pre-computed DB metrics.
    """
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

    today = date.today()
    start_col = func.coalesce(AdmissionItem.valid_from, Admission.valid_from, Admission.admission_date)
    end_col = func.coalesce(AdmissionItem.valid_to, Admission.valid_to, Admission.admission_date + 30)

    # 2. Pre-compute summary metrics across teacher's entire cohort directly at database level
    metrics_stmt = (
        select(
            func.count(AdmissionItem.id),
            func.count(case((and_(Admission.status == "ACTIVE", end_col >= today), 1), else_=None)),
            func.count(case((and_(Admission.status == "ACTIVE", end_col < today), 1), else_=None)),
            func.count(case((Admission.status.in_(["CANCELLED", "REVOKED"]), 1), else_=None)),
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
        status_cond = and_(Admission.status == "ACTIVE", end_col >= today)
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

    items = []
    for itm, adm, stu, bch, sub in rows:
        c_start = itm.valid_from or adm.valid_from or adm.admission_date
        c_end = itm.valid_to or adm.valid_to or (c_start + timedelta(days=30))

        if adm.status in ("CANCELLED", "REVOKED"):
            c_status = "CANCELLED"
            s_label = "Cancelled"
            badge_var = "danger"
            s_subtext = adm.revocation_reason or "Enrollment cancelled / dropped"
            days_rem = 0
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
            days_left = (c_end - today).days
            days_rem = days_left
            badge_var = "warning" if days_left <= 7 else "success"
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
            fee_collected=float(itm.amount_collected or 0),
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

    return TeacherRosterResponse(
        items=items,
        total=total_filtered,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        metrics=metrics,
        subjects=subjects_list
    )
