import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.database.session import get_db
from app.core.dependencies import require_staff, require_admin
from app.database.models import Subject, User
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
            Subject.subject_code.ilike(search_pattern)
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

@router.post("", response_model=SubjectResponse, status_code=status.HTTP_201_CREATED)
async def create_subject(
    payload: SubjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    if payload.subject_code:
        existing = await db.execute(select(Subject).where(Subject.subject_code == payload.subject_code))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Subject code already exists")
        code = payload.subject_code
    else:
        cnt_res = await db.execute(select(func.count(Subject.id)))
        code = f"SUB{(cnt_res.scalar_one() + 1):03d}"

    subject = Subject(
        subject_code=code,
        name=payload.name,
        description=payload.description,
        default_fee=payload.default_fee,
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
    for field, val in update_data.items():
        setattr(subject, field, val)

    await db.commit()
    await db.refresh(subject)
    return subject
