import uuid
import random
import re
from typing import Optional, Any, Dict
from decimal import Decimal
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, desc, case

from app.database.session import get_db
from app.core.dependencies import require_staff, require_admin, require_teacher_or_admin
from app.database.models import Subject, User, Teacher, Batch
from app.modules.admissions.models import Admission, AdmissionItem
from app.modules.students.models import Student
from app.common.active_student import today_kolkata, active_student_subject_filter
from app.common.teacher_scope import (
    is_teacher_user,
    resolve_teacher_for_user,
    active_teacher_student_item_filter,
)
from app.modules.reports.ledger_queries import get_item_allocated_collected_map
from app.common.calculations import evaluate_student_rolling_cycle
from app.modules.subjects.schemas import SubjectCreate, SubjectUpdate, SubjectResponse
from app.common.pagination import PaginationParams, PageResponse

router = APIRouter(prefix="/api/subjects", tags=["Subjects"])

@router.get("", response_model=PageResponse[SubjectResponse])
async def list_subjects(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    query = select(Subject)
    count_query = select(func.count(Subject.id))

    if search:
        search_pattern = f"%{search.strip()}%"
        filter_clause = or_(
            Subject.name.ilike(search_pattern),
            Subject.subject_code.ilike(search_pattern),
            Subject.class_category.ilike(search_pattern),
            Subject.teacher_name_snapshot.ilike(search_pattern),
            Subject.hall_number.ilike(search_pattern)
        )
        query = query.where(filter_clause)
        count_query = count_query.where(filter_clause)

    if status_filter:
        query = query.where(Subject.status == status_filter)
        count_query = count_query.where(Subject.status == status_filter)

    if is_teacher_user(current_user):
        teacher = await resolve_teacher_for_user(db, current_user)
        if not teacher:
            return PageResponse.create(items=[], total=0, params=PaginationParams(page=page, page_size=page_size))
        query = query.where(Subject.teacher_id == teacher.id)
        count_query = count_query.where(Subject.teacher_id == teacher.id)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(Subject.name.asc()).offset(offset).limit(page_size)
    items_result = await db.execute(query)
    items = items_result.scalars().all()

    return PageResponse.create(items=items, total=total, params=PaginationParams(page=page, page_size=page_size))

@router.get("/all", response_model=list[SubjectResponse])
async def get_all_active_subjects(
    all_institute: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    query = select(Subject).where(Subject.status == "ACTIVE")
    if is_teacher_user(current_user):
        teacher = await resolve_teacher_for_user(db, current_user)
        if not teacher:
            return []
        query = query.where(Subject.teacher_id == teacher.id)

    result = await db.execute(query.order_by(Subject.name.asc()))
    return result.scalars().all()

async def generate_unique_subject_code(name: str, db: AsyncSession) -> str:
    """
    Generate an internal unique subject code from the first 4 characters
    of the subject name + random digits (e.g. MATH-4821 or CHEM-7193).
    """
    clean = re.sub(r"[^A-Za-z0-9]", "", name).upper()
    prefix = clean[:4] if len(clean) >= 4 else (clean + "SUBJ")[:4]

    for _ in range(100):
        rand_num = random.randint(1000, 9999)
        candidate = f"{prefix}-{rand_num}"
        existing = await db.execute(select(Subject).where(Subject.subject_code == candidate))
        if not existing.scalar_one_or_none():
            return candidate

    return f"{prefix}-{uuid.uuid4().hex[:6].upper()}"

@router.post("", response_model=SubjectResponse, status_code=status.HTTP_201_CREATED)
async def create_subject(
    payload: SubjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    req_code = payload.subject_code or payload.code
    if req_code and req_code.strip():
        code = req_code.strip().upper()
        existing = await db.execute(select(Subject).where(Subject.subject_code == code))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Subject code already exists")
    else:
        code = await generate_unique_subject_code(payload.name, db)

    teacher_name = payload.teacher_name_snapshot
    teacher_id = payload.teacher_id
    if teacher_id:
        t_res = await db.execute(select(Teacher).where(Teacher.id == teacher_id))
        t = t_res.scalar_one_or_none()
        if not t:
            raise HTTPException(status_code=400, detail="Teacher not found")
        if t.status != "ACTIVE":
            raise HTTPException(status_code=400, detail="Cannot assign an inactive teacher to a subject")
        teacher_name = t.name
    elif payload.teacher_name_snapshot or payload.teacher_name or payload.teacher:
        req_name = payload.teacher_name_snapshot or payload.teacher_name or payload.teacher
        t_res = await db.execute(select(Teacher).where(Teacher.name == req_name))
        t = t_res.scalar_one_or_none()
        if t:
            teacher_id = t.id
            teacher_name = t.name
        else:
            teacher_name = req_name
    else:
        # Auto-assign active teacher so subject always has an assigned faculty
        t_res = await db.execute(select(Teacher).where(Teacher.status == "ACTIVE").limit(1))
        t = t_res.scalar_one_or_none()
        if t:
            teacher_id = t.id
            teacher_name = t.name

    subject = Subject(
        subject_code=code,
        name=payload.name,
        description=payload.description,
        default_fee=payload.default_fee,
        teacher_id=teacher_id,
        teacher_name_snapshot=teacher_name,
        hall_number=payload.hall_number or "Main Hall",
        schedule=payload.schedule or payload.timing,
        class_category=payload.class_category or "General",
        default_discount_percentage=payload.default_discount_percentage if payload.default_discount_percentage is not None else Decimal("10.00"),
        status=payload.status
    )
    db.add(subject)
    await db.commit()
    await db.refresh(subject)
    return subject

@router.get("/{subject_id}/roster")
async def get_subject_roster(
    subject_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query("ALL"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher_or_admin)
):
    today = today_kolkata()
    is_green_card = subject_id.upper() in ("GREEN-CARD", "GREEN-CARD-ALL-ACCESS", "GREEN_CARD")
    teacher_mode = is_teacher_user(current_user)

    if is_green_card:
        if teacher_mode:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: you are not assigned to this subject",
            )
        base_filter = and_(AdmissionItem.item_type == "GREEN_CARD", Admission.status != "CANCELLED")
    else:
        try:
            s_uuid = uuid.UUID(subject_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid subject ID")
        if teacher_mode:
            subj = (await db.execute(select(Subject).where(Subject.id == s_uuid))).scalar_one_or_none()
            if not subj:
                raise HTTPException(status_code=404, detail="Subject not found")
            teacher = await resolve_teacher_for_user(db, current_user)
            if not teacher or subj.teacher_id != teacher.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: you are not assigned to this subject",
                )
        base_filter = and_(AdmissionItem.subject_id == s_uuid, Admission.status != "CANCELLED")

    if teacher_mode:
        base_filter = and_(base_filter, Student.status == "ACTIVE", active_teacher_student_item_filter(today))

    active_cond = active_student_subject_filter(AdmissionItem, Admission, today)
    end_col = func.coalesce(AdmissionItem.valid_to, Admission.valid_to, Admission.admission_date + 30)
    start_col = func.coalesce(AdmissionItem.valid_from, Admission.valid_from, Admission.admission_date)

    # 1. Cohort metrics
    metrics_stmt = (
        select(
            func.count(AdmissionItem.id),
            func.count(case((active_cond, 1), else_=None)),
            func.count(case((and_(Admission.status == "ACTIVE", or_(AdmissionItem.valid_to < today, AdmissionItem.status == "EXPIRED")), 1), else_=None)),
            func.count(case((or_(Admission.status.in_(["CANCELLED", "REVOKED"]), AdmissionItem.status.in_(["CANCELLED", "REVOKED", "DISCONTINUED"])), 1), else_=None)),
            func.count(func.distinct(Admission.student_id))
        )
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .join(Student, Admission.student_id == Student.id)
        .where(base_filter)
    )
    m_row = (await db.execute(metrics_stmt)).one()
    total_enr, active_enr, inactive_enr, cancelled_enr, uniq_stu = m_row

    # 2. Base query
    q_items = (
        select(AdmissionItem, Admission, Student, Batch)
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .join(Student, Admission.student_id == Student.id)
        .outerjoin(Batch, AdmissionItem.batch_id == Batch.id)
        .where(base_filter)
    )
    q_count = (
        select(func.count(AdmissionItem.id))
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .join(Student, Admission.student_id == Student.id)
        .outerjoin(Batch, AdmissionItem.batch_id == Batch.id)
        .where(base_filter)
    )

    if status_filter == "ACTIVE":
        q_items = q_items.where(active_cond)
        q_count = q_count.where(active_cond)
    elif status_filter in ("INACTIVE", "EXPIRED"):
        status_cond = and_(Admission.status == "ACTIVE", end_col < today)
        q_items = q_items.where(status_cond)
        q_count = q_count.where(status_cond)
    elif status_filter in ("CANCELLED", "REVOKED"):
        status_cond = Admission.status.in_(["CANCELLED", "REVOKED"])
        q_items = q_items.where(status_cond)
        q_count = q_count.where(status_cond)

    if search and search.strip():
        pat = f"%{search.strip()}%"
        search_clause = or_(
            Student.name.ilike(pat),
            Student.student_code.ilike(pat),
            Student.mobile.ilike(pat),
            AdmissionItem.teacher_name_snapshot.ilike(pat),
            Admission.admission_number.ilike(pat),
        )
        q_items = q_items.where(search_clause)
        q_count = q_count.where(search_clause)

    total_filtered = (await db.execute(q_count)).scalar() or 0
    total_pages = max(1, (total_filtered + page_size - 1) // page_size) if total_filtered > 0 else 1

    offset = (page - 1) * page_size
    q_items = q_items.order_by(start_col.desc(), desc(AdmissionItem.created_at)).offset(offset).limit(page_size)
    rows = (await db.execute(q_items)).all()

    item_ids = [itm.id for itm, adm, stu, bch in rows]
    collected_map = {} if teacher_mode else await get_item_allocated_collected_map(db, item_ids)

    items = []
    for itm, adm, stu, bch in rows:
        itm_coll = collected_map.get(itm.id, Decimal("0.00"))
        is_line_cancelled = (
            adm.status in ("CANCELLED", "REVOKED", "DISCONTINUED")
            or getattr(adm, "document_status", "VALID") == "VOID"
            or getattr(itm, "status", "ACTIVE") in ("CANCELLED", "REVOKED", "DISCONTINUED")
            or getattr(itm, "access_status", "ACTIVE") in ("CANCELLED", "REVOKED", "DISCONTINUED")
        )
        c_info = evaluate_student_rolling_cycle(
            valid_from=itm.valid_from,
            valid_to=itm.valid_to,
            admission_date=adm.admission_date,
            balance_due=Decimal("0.00") if teacher_mode else itm.balance_due,
            net_price=Decimal("0.00") if teacher_mode else itm.net_price,
            amount_collected=Decimal("0.00") if teacher_mode else itm_coll,
            is_cancelled=is_line_cancelled,
        )
        if teacher_mode:
            c_info["payment_status"] = "HIDDEN"
        items.append({
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
            "teacher_id": str(itm.teacher_id) if itm.teacher_id else (str(bch.teacher_id) if bch and bch.teacher_id else None),
            "teacher_name": itm.teacher_name_snapshot or (bch.teacher_name_snapshot if bch else "Faculty"),
            "hall_number": itm.hall_number_snapshot or (bch.hall_number if bch else "Main"),
            **c_info
        })

    return {
        "items": items,
        "total": total_filtered,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "metrics": {
            "total_enrollments": total_enr or 0,
            "active_enrollments": active_enr or 0,
            "inactive_enrollments": inactive_enr or 0,
            "cancelled_enrollments": cancelled_enr or 0,
            "unique_students_count": uniq_stu or 0
        }
    }

@router.get("/{subject_id}", response_model=SubjectResponse)
async def get_subject(
    subject_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher_or_admin)
):
    res = await db.execute(select(Subject).where(Subject.id == subject_id))
    subject = res.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    if is_teacher_user(current_user):
        teacher = await resolve_teacher_for_user(db, current_user)
        if not teacher or subject.teacher_id != teacher.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: you are not assigned to this subject",
            )
    return subject

@router.put("/{subject_id}", response_model=SubjectResponse)
async def update_subject(
    subject_id: uuid.UUID,
    payload: SubjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    res = await db.execute(select(Subject).where(Subject.id == subject_id))
    subject = res.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "code" in update_data and "subject_code" not in update_data:
        update_data["subject_code"] = update_data.pop("code")
    elif "code" in update_data:
        update_data.pop("code")

    if "timing" in update_data and "schedule" not in update_data:
        update_data["schedule"] = update_data.pop("timing")
    elif "timing" in update_data:
        update_data.pop("timing")

    if "teacher" in update_data and "teacher_name_snapshot" not in update_data:
        update_data["teacher_name_snapshot"] = update_data.pop("teacher")
    elif "teacher" in update_data:
        update_data.pop("teacher")

    if "teacher_name" in update_data and "teacher_name_snapshot" not in update_data:
        update_data["teacher_name_snapshot"] = update_data.pop("teacher_name")
    elif "teacher_name" in update_data:
        update_data.pop("teacher_name")

    if "teacher_id" in update_data:
        if update_data["teacher_id"]:
            t_res = await db.execute(select(Teacher).where(Teacher.id == update_data["teacher_id"]))
            t = t_res.scalar_one_or_none()
            if not t:
                raise HTTPException(status_code=400, detail="Teacher not found")
            if t.id != subject.teacher_id and t.status != "ACTIVE":
                raise HTTPException(status_code=400, detail="Cannot assign an inactive teacher to a subject")
            subject.teacher_name_snapshot = t.name
        else:
            subject.teacher_name_snapshot = None

    for field, val in update_data.items():
        setattr(subject, field, val)

    await db.commit()
    await db.refresh(subject)
    return subject
