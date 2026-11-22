import uuid
import random
import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.database.session import get_db
from app.core.dependencies import require_staff, require_admin
from app.database.models import Subject, User, Teacher
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

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(Subject.name.asc()).offset(offset).limit(page_size)
    items_result = await db.execute(query)
    items = items_result.scalars().all()

    return PageResponse.create(items=items, total=total, params=PaginationParams(page=page, page_size=page_size))

@router.get("/all", response_model=list[SubjectResponse])
async def get_all_active_subjects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    result = await db.execute(select(Subject).where(Subject.status == "ACTIVE").order_by(Subject.name.asc()))
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
    if payload.subject_code and payload.subject_code.strip():
        code = payload.subject_code.strip().upper()
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
        if t:
            teacher_name = t.name
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
        schedule=payload.schedule,
        class_category=payload.class_category or "General",
        default_discount_percentage=payload.default_discount_percentage if payload.default_discount_percentage is not None else Decimal("10.00"),
        status=payload.status
    )
    db.add(subject)
    await db.commit()
    await db.refresh(subject)
    return subject

@router.get("/{subject_id}", response_model=SubjectResponse)
async def get_subject(
    subject_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    res = await db.execute(select(Subject).where(Subject.id == subject_id))
    subject = res.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
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
    if "teacher_id" in update_data:
        if update_data["teacher_id"]:
            t_res = await db.execute(select(Teacher).where(Teacher.id == update_data["teacher_id"]))
            t = t_res.scalar_one_or_none()
            if t:
                subject.teacher_name_snapshot = t.name
        else:
            subject.teacher_name_snapshot = None

    for field, val in update_data.items():
        setattr(subject, field, val)

    await db.commit()
    await db.refresh(subject)
    return subject
