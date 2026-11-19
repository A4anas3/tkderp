import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, delete
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.core.dependencies import require_staff, require_admin
from app.database.models import Batch, BatchSubject, Teacher, Subject, AdmissionItem, User
from app.modules.batches.schemas import BatchCreate, BatchUpdate, BatchResponse, BatchSubjectResponse
from app.common.pagination import PaginationParams, PageResponse

router = APIRouter(prefix="/api/batches", tags=["Batches"])

@router.get("", response_model=PageResponse[BatchResponse])
async def list_batches(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    teacher_id: Optional[uuid.UUID] = None,
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    query = select(Batch).options(selectinload(Batch.subjects).joinedload(BatchSubject.subject))
    count_query = select(func.count(Batch.id))

    if search:
        search_pattern = f"%{search.strip()}%"
        filter_clause = or_(
            Batch.name.ilike(search_pattern),
            Batch.batch_code.ilike(search_pattern),
            Batch.teacher_name_snapshot.ilike(search_pattern),
            Batch.class_category.ilike(search_pattern),
            Batch.hall_number.ilike(search_pattern)
        )
        query = query.where(filter_clause)
        count_query = count_query.where(filter_clause)

    if teacher_id:
        query = query.where(Batch.teacher_id == teacher_id)
        count_query = count_query.where(Batch.teacher_id == teacher_id)

    if status_filter:
        query = query.where(Batch.status == status_filter)
        count_query = count_query.where(Batch.status == status_filter)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(Batch.start_date.desc()).offset(offset).limit(page_size)
    items_result = await db.execute(query)
    batches = items_result.scalars().all()

    # Get enrolled student counts per batch
    batch_ids = [b.id for b in batches]
    enrolled_counts = {}
    if batch_ids:
        enr_q = (
            select(AdmissionItem.batch_id, func.count(AdmissionItem.id))
            .where(AdmissionItem.batch_id.in_(batch_ids))
            .group_by(AdmissionItem.batch_id)
        )
        enr_res = await db.execute(enr_q)
        for b_id, cnt in enr_res.all():
            enrolled_counts[b_id] = cnt

    response_items = []
    for b in batches:
        subj_responses = []
        for bs in b.subjects:
            subj_responses.append(
                BatchSubjectResponse(
                    id=bs.id,
                    subject_id=bs.subject_id,
                    subject_name=bs.subject.name if bs.subject else None,
                    subject_code=bs.subject.subject_code if bs.subject else None,
                    fee=bs.fee,
                    teacher_id=bs.teacher_id,
                    teacher_name_snapshot=bs.teacher_name_snapshot,
                    hall_number=bs.hall_number
                )
            )
        response_items.append(
            BatchResponse(
                id=b.id,
                batch_code=b.batch_code,
                name=b.name,
                teacher_id=b.teacher_id,
                teacher_name_snapshot=b.teacher_name_snapshot,
                teacher_mobile_snapshot=b.teacher_mobile_snapshot,
                class_category=b.class_category,
                hall_number=b.hall_number,
                schedule=b.schedule,
                start_date=b.start_date,
                end_date=b.end_date,
                status=b.status,
                subjects=subj_responses,
                enrolled_count=enrolled_counts.get(b.id, 0)
            )
        )

    return PageResponse.create(items=response_items, total=total, params=PaginationParams(page=page, page_size=page_size))

@router.get("/all", response_model=list[BatchResponse])
async def get_all_active_batches(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    query = (
        select(Batch)
        .options(selectinload(Batch.subjects).joinedload(BatchSubject.subject))
        .where(Batch.status.in_(["ACTIVE", "UPCOMING"]))
        .order_by(Batch.name.asc())
    )
    result = await db.execute(query)
    batches = result.scalars().all()

    response_items = []
    for b in batches:
        subj_responses = [
            BatchSubjectResponse(
                id=bs.id,
                subject_id=bs.subject_id,
                subject_name=bs.subject.name if bs.subject else None,
                subject_code=bs.subject.subject_code if bs.subject else None,
                fee=bs.fee,
                teacher_id=bs.teacher_id,
                teacher_name_snapshot=bs.teacher_name_snapshot,
                hall_number=bs.hall_number
            )
            for bs in b.subjects
        ]
        response_items.append(
            BatchResponse(
                id=b.id,
                batch_code=b.batch_code,
                name=b.name,
                teacher_id=b.teacher_id,
                teacher_name_snapshot=b.teacher_name_snapshot,
                teacher_mobile_snapshot=b.teacher_mobile_snapshot,
                class_category=b.class_category,
                hall_number=b.hall_number,
                schedule=b.schedule,
                start_date=b.start_date,
                end_date=b.end_date,
                status=b.status,
                subjects=subj_responses,
                enrolled_count=0
            )
        )
    return response_items

@router.post("", response_model=BatchResponse, status_code=status.HTTP_201_CREATED)
async def create_batch(
    payload: BatchCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    # Lookup teacher snapshot
    teacher_name = "Unassigned"
    teacher_mobile = None
    if payload.teacher_id:
        t_res = await db.execute(select(Teacher).where(Teacher.id == payload.teacher_id))
        teacher = t_res.scalar_one_or_none()
        if teacher:
            teacher_name = teacher.name
            teacher_mobile = teacher.mobile

    # Batch code
    if payload.batch_code:
        b_code = payload.batch_code
    else:
        cnt_res = await db.execute(select(func.count(Batch.id)))
        b_code = f"BAT{(cnt_res.scalar_one() + 1):03d}"

    batch = Batch(
        batch_code=b_code,
        name=payload.name,
        teacher_id=payload.teacher_id,
        teacher_name_snapshot=teacher_name,
        teacher_mobile_snapshot=teacher_mobile,
        class_category=payload.class_category,
        hall_number=payload.hall_number,
        schedule=payload.schedule,
        start_date=payload.start_date,
        end_date=payload.end_date,
        status=payload.status
    )
    db.add(batch)
    await db.flush()

    for item in payload.subjects:
        sub_teacher_id = item.teacher_id or batch.teacher_id
        sub_teacher_name = item.teacher_name_snapshot
        if not sub_teacher_name and sub_teacher_id:
            if sub_teacher_id == batch.teacher_id:
                sub_teacher_name = batch.teacher_name_snapshot
            else:
                t_res = await db.execute(select(Teacher).where(Teacher.id == sub_teacher_id))
                t_obj = t_res.scalar_one_or_none()
                sub_teacher_name = t_obj.name if t_obj else "Unassigned"
        elif not sub_teacher_name:
            sub_teacher_name = batch.teacher_name_snapshot or "Unassigned"

        sub_hall = item.hall_number or batch.hall_number

        bs = BatchSubject(
            batch_id=batch.id,
            subject_id=item.subject_id,
            fee=item.fee,
            teacher_id=sub_teacher_id,
            teacher_name_snapshot=sub_teacher_name,
            hall_number=sub_hall
        )
        db.add(bs)

    await db.commit()
    
    # Reload with relationships
    return await get_batch(batch.id, db, current_user)

@router.get("/{batch_id}", response_model=BatchResponse)
async def get_batch(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    query = (
        select(Batch)
        .options(selectinload(Batch.subjects).joinedload(BatchSubject.subject))
        .where(Batch.id == batch_id)
    )
    res = await db.execute(query)
    batch = res.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    enr_q = select(func.count(AdmissionItem.id)).where(AdmissionItem.batch_id == batch_id)
    enr_res = await db.execute(enr_q)
    enrolled = enr_res.scalar_one()

    subj_responses = [
        BatchSubjectResponse(
            id=bs.id,
            subject_id=bs.subject_id,
            subject_name=bs.subject.name if bs.subject else None,
            subject_code=bs.subject.subject_code if bs.subject else None,
            fee=bs.fee,
            teacher_id=bs.teacher_id,
            teacher_name_snapshot=bs.teacher_name_snapshot,
            hall_number=bs.hall_number
        )
        for bs in batch.subjects
    ]

    return BatchResponse(
        id=batch.id,
        batch_code=batch.batch_code,
        name=batch.name,
        teacher_id=batch.teacher_id,
        teacher_name_snapshot=batch.teacher_name_snapshot,
        teacher_mobile_snapshot=batch.teacher_mobile_snapshot,
        class_category=batch.class_category,
        hall_number=batch.hall_number,
        schedule=batch.schedule,
        start_date=batch.start_date,
        end_date=batch.end_date,
        status=batch.status,
        subjects=subj_responses,
        enrolled_count=enrolled
    )

@router.put("/{batch_id}", response_model=BatchResponse)
async def update_batch(
    batch_id: uuid.UUID,
    payload: BatchUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    res = await db.execute(select(Batch).where(Batch.id == batch_id))
    batch = res.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "teacher_id" in update_data and update_data["teacher_id"] != batch.teacher_id:
        if update_data["teacher_id"]:
            t_res = await db.execute(select(Teacher).where(Teacher.id == update_data["teacher_id"]))
            teacher = t_res.scalar_one_or_none()
            if teacher:
                batch.teacher_id = teacher.id
                batch.teacher_name_snapshot = teacher.name
                batch.teacher_mobile_snapshot = teacher.mobile
        else:
            batch.teacher_id = None
            batch.teacher_name_snapshot = "Unassigned"
            batch.teacher_mobile_snapshot = None

    for field in ["name", "class_category", "hall_number", "schedule", "start_date", "end_date", "status"]:
        if field in update_data:
            setattr(batch, field, update_data[field])

    if payload.subjects is not None:
        await db.execute(delete(BatchSubject).where(BatchSubject.batch_id == batch_id))
        for item in payload.subjects:
            sub_teacher_id = item.teacher_id or batch.teacher_id
            sub_teacher_name = item.teacher_name_snapshot
            if not sub_teacher_name and sub_teacher_id:
                if sub_teacher_id == batch.teacher_id:
                    sub_teacher_name = batch.teacher_name_snapshot
                else:
                    t_res = await db.execute(select(Teacher).where(Teacher.id == sub_teacher_id))
                    t_obj = t_res.scalar_one_or_none()
                    sub_teacher_name = t_obj.name if t_obj else "Unassigned"
            elif not sub_teacher_name:
                sub_teacher_name = batch.teacher_name_snapshot or "Unassigned"

            sub_hall = item.hall_number or batch.hall_number

            bs = BatchSubject(
                batch_id=batch.id,
                subject_id=item.subject_id,
                fee=item.fee,
                teacher_id=sub_teacher_id,
                teacher_name_snapshot=sub_teacher_name,
                hall_number=sub_hall
            )
            db.add(bs)

    await db.commit()
    return await get_batch(batch.id, db, current_user)
