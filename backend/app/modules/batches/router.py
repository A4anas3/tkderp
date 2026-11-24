import uuid
from decimal import Decimal
from typing import Optional, List, Dict, Any
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, delete, case
from sqlalchemy.orm import selectinload

from app.core.cache import TTL_LONG, TTL_MEDIUM, cache_get, cache_set, invalidate_batch_cache, make_cache_key
from app.database.session import get_db
from app.core.dependencies import require_cashier_or_admin, require_admin
from app.database.models import Batch, BatchSubject, Teacher, Subject, AdmissionItem, Admission, User
from app.modules.batches.schemas import (
    BatchCreate, BatchUpdate, BatchResponse, BatchSubjectResponse,
    BatchActiveSummaryResponse, BatchSubjectActiveSummaryItem
)
from app.common.pagination import PaginationParams, PageResponse
from app.common.active_student import active_student_subject_filter, today_kolkata
from app.common.schedule_helper import schedules_overlap, check_hall_clash

router = APIRouter(prefix="/api/batches", tags=["Batches"])

@router.get("/active-summary", response_model=List[BatchActiveSummaryResponse])
async def get_batches_active_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    """
    Returns active summary per batch and per subject:
    active students, expiring in 7 days, unpaid / partial count, capacity, seats left, teacher, and hall.
    Uses the canonical active student definition strictly at database level.
    """
    cache_key = "erp:batches:active_summary"
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    today = today_kolkata()
    in_7_days = today + timedelta(days=7)

    query = (
        select(Batch)
        .options(selectinload(Batch.subjects).joinedload(BatchSubject.subject))
        .where(Batch.status.in_(["ACTIVE", "UPCOMING"]))
        .order_by(Batch.name.asc())
    )
    res = await db.execute(query)
    batches = res.scalars().all()

    if not batches:
        await cache_set(cache_key, [], ttl=TTL_MEDIUM, model=List[BatchActiveSummaryResponse])
        return []

    batch_ids = [b.id for b in batches]

    # 1. Batch-level metrics
    b_metrics_stmt = (
        select(
            AdmissionItem.batch_id,
            func.count(func.distinct(Admission.student_id)),
            func.count(func.distinct(case((and_(AdmissionItem.valid_to >= today, AdmissionItem.valid_to <= in_7_days), Admission.student_id), else_=None))),
            func.count(func.distinct(case((AdmissionItem.balance_due > Decimal("0.00"), Admission.student_id), else_=None)))
        )
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .where(
            AdmissionItem.batch_id.in_(batch_ids),
            active_student_subject_filter(AdmissionItem, Admission, today)
        )
        .group_by(AdmissionItem.batch_id)
    )
    b_metrics_res = await db.execute(b_metrics_stmt)
    batch_metrics_map = {
        row[0]: {
            "active_students": row[1] or 0,
            "expiring_in_7_days": row[2] or 0,
            "unpaid_or_partial_count": row[3] or 0
        }
        for row in b_metrics_res.all()
    }

    # 2. Subject-level metrics per batch
    s_metrics_stmt = (
        select(
            AdmissionItem.batch_id,
            AdmissionItem.subject_id,
            func.count(func.distinct(Admission.student_id)),
            func.count(func.distinct(case((and_(AdmissionItem.valid_to >= today, AdmissionItem.valid_to <= in_7_days), Admission.student_id), else_=None))),
            func.count(func.distinct(case((AdmissionItem.balance_due > Decimal("0.00"), Admission.student_id), else_=None)))
        )
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .where(
            AdmissionItem.batch_id.in_(batch_ids),
            active_student_subject_filter(AdmissionItem, Admission, today)
        )
        .group_by(AdmissionItem.batch_id, AdmissionItem.subject_id)
    )
    s_metrics_res = await db.execute(s_metrics_stmt)
    subj_metrics_map = {
        (row[0], row[1]): {
            "active_students": row[2] or 0,
            "expiring_in_7_days": row[3] or 0,
            "unpaid_or_partial_count": row[4] or 0
        }
        for row in s_metrics_res.all()
    }

    summary_list = []
    for b in batches:
        b_m = batch_metrics_map.get(b.id, {"active_students": 0, "expiring_in_7_days": 0, "unpaid_or_partial_count": 0})
        b_cap = getattr(b, "capacity", 50) or 50
        b_active = b_m["active_students"]
        b_seats_left = max(0, b_cap - b_active)

        subj_items = []
        for bs in b.subjects:
            s_m = subj_metrics_map.get((b.id, bs.subject_id), {"active_students": 0, "expiring_in_7_days": 0, "unpaid_or_partial_count": 0})
            s_cap = bs.capacity or b_cap
            s_active = s_m["active_students"]
            s_seats_left = max(0, s_cap - s_active)

            subj_items.append(
                BatchSubjectActiveSummaryItem(
                    batch_subject_id=bs.id,
                    subject_id=bs.subject_id,
                    subject_name=bs.subject.name if bs.subject else "Subject",
                    subject_code=bs.subject.subject_code if bs.subject else None,
                    teacher_id=bs.teacher_id or b.teacher_id,
                    teacher_name=bs.teacher_name_snapshot or b.teacher_name_snapshot,
                    hall_number=bs.hall_number or b.hall_number,
                    schedule=bs.schedule or b.schedule,
                    capacity=s_cap,
                    active_students=s_active,
                    expiring_in_7_days=s_m["expiring_in_7_days"],
                    unpaid_or_partial_count=s_m["unpaid_or_partial_count"],
                    seats_left=s_seats_left
                )
            )

        summary_list.append(
            BatchActiveSummaryResponse(
                batch_id=b.id,
                batch_code=b.batch_code,
                batch_name=b.name,
                status=b.status,
                teacher_id=b.teacher_id,
                teacher_name=b.teacher_name_snapshot,
                hall_number=b.hall_number,
                schedule=b.schedule,
                capacity=b_cap,
                active_students=b_active,
                expiring_in_7_days=b_m["expiring_in_7_days"],
                unpaid_or_partial_count=b_m["unpaid_or_partial_count"],
                seats_left=b_seats_left,
                subjects=subj_items
            )
        )

    await cache_set(cache_key, summary_list, ttl=TTL_MEDIUM, model=List[BatchActiveSummaryResponse])
    return summary_list

@router.get("", response_model=PageResponse[BatchResponse])
async def list_batches(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    teacher_id: Optional[uuid.UUID] = None,
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    cache_key = make_cache_key(
        "batches", "list",
        page=page, page_size=page_size, search=search,
        teacher_id=teacher_id, status_filter=status_filter,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
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

    # Get active enrolled student counts per batch using canonical definition
    batch_ids = [b.id for b in batches]
    enrolled_counts = {}
    if batch_ids:
        today = today_kolkata()
        enr_q = (
            select(AdmissionItem.batch_id, func.count(func.distinct(Admission.student_id)))
            .join(Admission, AdmissionItem.admission_id == Admission.id)
            .where(
                AdmissionItem.batch_id.in_(batch_ids),
                active_student_subject_filter(AdmissionItem, Admission, today)
            )
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
                    hall_number=bs.hall_number,
                    schedule=bs.schedule,
                    capacity=bs.capacity,
                    share_type=bs.share_type,
                    share_value=bs.share_value
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
                capacity=getattr(b, "capacity", 50) or 50,
                start_date=b.start_date,
                end_date=b.end_date,
                status=b.status,
                subjects=subj_responses,
                enrolled_count=enrolled_counts.get(b.id, 0)
            )
        )

    resp = PageResponse.create(items=response_items, total=total, params=PaginationParams(page=page, page_size=page_size))
    await cache_set(cache_key, resp, ttl=TTL_LONG, model=PageResponse[BatchResponse])
    return resp

@router.get("/all", response_model=list[BatchResponse])
async def get_all_active_batches(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    cache_key = "erp:batches:all"
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    query = (
        select(Batch)
        .options(selectinload(Batch.subjects).joinedload(BatchSubject.subject))
        .where(Batch.status.in_(["ACTIVE", "UPCOMING"]))
        .order_by(Batch.name.asc())
    )
    result = await db.execute(query)
    batches = result.scalars().all()

    today = today_kolkata()
    batch_ids = [b.id for b in batches]
    enrolled_counts = {}
    if batch_ids:
        enr_q = (
            select(AdmissionItem.batch_id, func.count(func.distinct(Admission.student_id)))
            .join(Admission, AdmissionItem.admission_id == Admission.id)
            .where(
                AdmissionItem.batch_id.in_(batch_ids),
                active_student_subject_filter(AdmissionItem, Admission, today)
            )
            .group_by(AdmissionItem.batch_id)
        )
        enr_res = await db.execute(enr_q)
        for b_id, cnt in enr_res.all():
            enrolled_counts[b_id] = cnt

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
                hall_number=bs.hall_number,
                schedule=bs.schedule,
                capacity=bs.capacity,
                share_type=bs.share_type,
                share_value=bs.share_value
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
                capacity=getattr(b, "capacity", 50) or 50,
                start_date=b.start_date,
                end_date=b.end_date,
                status=b.status,
                subjects=subj_responses,
                enrolled_count=enrolled_counts.get(b.id, 0)
            )
        )
    await cache_set(cache_key, response_items, ttl=TTL_LONG, model=list[BatchResponse])
    return response_items

@router.post("", response_model=BatchResponse, status_code=status.HTTP_201_CREATED)
async def create_batch(
    payload: BatchCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    # 1. Hall-clash check within the payload
    for i, s1 in enumerate(payload.subjects):
        h1 = s1.hall_number or payload.hall_number
        sc1 = s1.schedule or payload.schedule
        if not h1 or not sc1:
            continue
        for j, s2 in enumerate(payload.subjects):
            if i >= j:
                continue
            h2 = s2.hall_number or payload.hall_number
            sc2 = s2.schedule or payload.schedule
            if h2 and h1.strip().lower() == h2.strip().lower() and schedules_overlap(sc1, sc2):
                raise HTTPException(
                    status_code=400,
                    detail=f"Hall clash within batch: Hall '{h1.strip()}' has overlapping schedules for subjects."
                )

    # 2. Hall-clash check against existing active/upcoming batches
    # Check batch-level hall
    await check_hall_clash(
        db=db,
        hall_number=payload.hall_number,
        schedule=payload.schedule,
        batch_start_date=payload.start_date,
        batch_end_date=payload.end_date,
        exclude_batch_id=None,
        subject_label=payload.name
    )
    # Check each subject's hall
    for s in payload.subjects:
        h = s.hall_number or payload.hall_number
        sc = s.schedule or payload.schedule
        await check_hall_clash(
            db=db,
            hall_number=h,
            schedule=sc,
            batch_start_date=payload.start_date,
            batch_end_date=payload.end_date,
            exclude_batch_id=None,
            subject_label=s.teacher_name_snapshot
        )

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
        capacity=payload.capacity or 50,
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
        sub_schedule = item.schedule or batch.schedule

        bs = BatchSubject(
            batch_id=batch.id,
            subject_id=item.subject_id,
            fee=item.fee,
            teacher_id=sub_teacher_id,
            teacher_name_snapshot=sub_teacher_name,
            hall_number=sub_hall,
            schedule=sub_schedule,
            capacity=item.capacity,
            share_type=item.share_type or "PERCENT",
            share_value=item.share_value or Decimal("0.00")
        )
        db.add(bs)

    await db.commit()
    await invalidate_batch_cache()
    return await get_batch(batch.id, db, current_user)

@router.get("/{batch_id}", response_model=BatchResponse)
async def get_batch(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    cache_key = make_cache_key("batches", "detail", batch_id)
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    query = (
        select(Batch)
        .options(selectinload(Batch.subjects).joinedload(BatchSubject.subject))
        .where(Batch.id == batch_id)
    )
    res = await db.execute(query)
    batch = res.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    today = today_kolkata()
    enr_q = (
        select(func.count(func.distinct(Admission.student_id)))
        .select_from(AdmissionItem)
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .where(
            AdmissionItem.batch_id == batch_id,
            active_student_subject_filter(AdmissionItem, Admission, today)
        )
    )
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
            hall_number=bs.hall_number,
            schedule=bs.schedule,
            capacity=bs.capacity,
            share_type=bs.share_type,
            share_value=bs.share_value
        )
        for bs in batch.subjects
    ]

    resp = BatchResponse(
        id=batch.id,
        batch_code=batch.batch_code,
        name=batch.name,
        teacher_id=batch.teacher_id,
        teacher_name_snapshot=batch.teacher_name_snapshot,
        teacher_mobile_snapshot=batch.teacher_mobile_snapshot,
        class_category=batch.class_category,
        hall_number=batch.hall_number,
        schedule=batch.schedule,
        capacity=getattr(batch, "capacity", 50) or 50,
        start_date=batch.start_date,
        end_date=batch.end_date,
        status=batch.status,
        subjects=subj_responses,
        enrolled_count=enrolled
    )
    await cache_set(cache_key, resp, ttl=TTL_LONG, model=BatchResponse)
    return resp

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

    effective_start = update_data.get("start_date", batch.start_date)
    effective_end = update_data.get("end_date", batch.end_date)
    effective_hall = update_data.get("hall_number", batch.hall_number)
    effective_sched = update_data.get("schedule", batch.schedule)

    # Hall clash validation
    if payload.subjects is not None:
        # Check pairwise within incoming subjects
        for i, s1 in enumerate(payload.subjects):
            h1 = s1.hall_number or effective_hall
            sc1 = s1.schedule or effective_sched
            if not h1 or not sc1:
                continue
            for j, s2 in enumerate(payload.subjects):
                if i >= j:
                    continue
                h2 = s2.hall_number or effective_hall
                sc2 = s2.schedule or effective_sched
                if h2 and h1.strip().lower() == h2.strip().lower() and schedules_overlap(sc1, sc2):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Hall clash within batch: Hall '{h1.strip()}' has overlapping schedules for subjects."
                    )

        # Check against other batches in DB
        for s in payload.subjects:
            h = s.hall_number or effective_hall
            sc = s.schedule or effective_sched
            await check_hall_clash(
                db=db,
                hall_number=h,
                schedule=sc,
                batch_start_date=effective_start,
                batch_end_date=effective_end,
                exclude_batch_id=batch.id,
                subject_label=s.teacher_name_snapshot
            )
    elif "hall_number" in update_data or "schedule" in update_data:
        await check_hall_clash(
            db=db,
            hall_number=effective_hall,
            schedule=effective_sched,
            batch_start_date=effective_start,
            batch_end_date=effective_end,
            exclude_batch_id=batch.id,
            subject_label=batch.name
        )

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

    for field in ["name", "class_category", "hall_number", "schedule", "capacity", "start_date", "end_date", "status"]:
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
            sub_sched = item.schedule or batch.schedule

            bs = BatchSubject(
                batch_id=batch.id,
                subject_id=item.subject_id,
                fee=item.fee,
                teacher_id=sub_teacher_id,
                teacher_name_snapshot=sub_teacher_name,
                hall_number=sub_hall,
                schedule=sub_sched,
                capacity=item.capacity,
                share_type=item.share_type or "PERCENT",
                share_value=item.share_value or Decimal("0.00")
            )
            db.add(bs)

    await db.commit()
    await invalidate_batch_cache()
    return await get_batch(batch.id, db, current_user)
