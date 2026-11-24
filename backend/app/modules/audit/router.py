import json
import uuid
from datetime import date, datetime, time, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, desc

from app.database.session import get_db
from app.core.dependencies import require_cashier_or_admin, require_admin
from app.database.models import AuditLog, User, Student, Admission, Payment, Refund, AdmissionItem
from app.modules.audit.schemas import AuditLogResponse, AuditUserSummary, AuditStatsResponse
from app.common.pagination import PaginationParams, PageResponse

router = APIRouter(prefix="/api/audit", tags=["Audit Logs"])


def _parse_details_safe(details_str: Optional[str]) -> Optional[Dict[str, Any]]:
    if not details_str:
        return None
    try:
        parsed = json.loads(details_str)
        if isinstance(parsed, dict):
            return parsed
        return {"value": parsed}
    except Exception:
        return {"raw": details_str}


def _build_audit_response(audit: AuditLog, user: Optional[User]) -> AuditLogResponse:
    user_name = None
    user_role = None
    user_email = None

    if user:
        user_name = user.full_name or user.email
        user_role = user.role
        user_email = user.email
    elif audit.user_id is None:
        user_name = "System"
        user_role = "SYSTEM"

    return AuditLogResponse(
        id=audit.id,
        created_at=audit.created_at,
        updated_at=audit.updated_at,
        user_id=audit.user_id,
        user_name=user_name,
        user_role=user_role,
        user_email=user_email,
        action=audit.action,
        entity_type=audit.entity_type,
        entity_id=audit.entity_id,
        details=audit.details,
        parsed_details=_parse_details_safe(audit.details),
        ip_address=audit.ip_address,
    )


@router.get("", response_model=PageResponse[AuditLogResponse])
async def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user_id: Optional[uuid.UUID] = Query(None, description="Filter by acting user ID"),
    action: Optional[str] = Query(None, description="Filter by action name"),
    entity_type: Optional[str] = Query(None, description="Filter by entity type"),
    from_date: Optional[date] = Query(None, description="Filter logs starting from date"),
    to_date: Optional[date] = Query(None, description="Filter logs up to date"),
    search: Optional[str] = Query(None, description="Search in details, action, entity type or user"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    List full system audit logs with filters. Restricted to Admin users.
    """
    query = (
        select(AuditLog, User)
        .outerjoin(User, AuditLog.user_id == User.id)
    )
    count_query = select(func.count(AuditLog.id)).outerjoin(User, AuditLog.user_id == User.id)

    filters = []

    if user_id:
        filters.append(AuditLog.user_id == user_id)

    if action and action != "ALL":
        filters.append(AuditLog.action == action)

    if entity_type and entity_type != "ALL":
        filters.append(AuditLog.entity_type == entity_type)

    if from_date:
        start_dt = datetime.combine(from_date, time.min, tzinfo=timezone.utc)
        filters.append(AuditLog.created_at >= start_dt)

    if to_date:
        end_dt = datetime.combine(to_date, time.max, tzinfo=timezone.utc)
        filters.append(AuditLog.created_at <= end_dt)

    if search:
        search_kw = f"%{search.strip()}%"
        filters.append(
            or_(
                AuditLog.action.ilike(search_kw),
                AuditLog.entity_type.ilike(search_kw),
                AuditLog.details.ilike(search_kw),
                User.full_name.ilike(search_kw),
                User.email.ilike(search_kw),
            )
        )

    if filters:
        query = query.where(and_(*filters))
        count_query = count_query.where(and_(*filters))

    total = (await db.execute(count_query)).scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(desc(AuditLog.created_at)).offset(offset).limit(page_size)

    rows = (await db.execute(query)).all()
    items = [_build_audit_response(audit, user) for audit, user in rows]

    return PageResponse.create(items=items, total=total, params=PaginationParams(page=page, page_size=page_size))


@router.get("/student/{student_id}", response_model=PageResponse[AuditLogResponse])
async def get_student_audit_logs(
    student_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    action: Optional[str] = Query(None, description="Filter by action name"),
    from_date: Optional[date] = Query(None, description="Filter logs starting from date"),
    to_date: Optional[date] = Query(None, description="Filter logs up to date"),
    search: Optional[str] = Query(None, description="Search keyword"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    """
    Get all audit log events associated with a specific student across their lifecycle
    (student record, admissions, payments, refunds, subject renewals, suspensions, revokes).
    Accessible to Cashiers and Admins.
    """
    stu_res = await db.execute(select(Student).where(Student.id == student_id))
    student = stu_res.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    adm_ids_sub = select(Admission.id).where(Admission.student_id == student_id)
    pay_ids_sub = select(Payment.id).where(Payment.student_id == student_id)
    ref_ids_sub = select(Refund.id).where(Refund.student_id == student_id)
    item_ids_sub = select(AdmissionItem.id).where(AdmissionItem.student_id == student_id)

    student_condition = or_(
        and_(AuditLog.entity_type == "STUDENT", AuditLog.entity_id == student_id),
        and_(AuditLog.entity_type == "ADMISSION", AuditLog.entity_id.in_(adm_ids_sub)),
        and_(AuditLog.entity_type == "PAYMENT", AuditLog.entity_id.in_(pay_ids_sub)),
        and_(AuditLog.entity_type == "REFUND", AuditLog.entity_id.in_(ref_ids_sub)),
        and_(AuditLog.entity_type == "ADMISSION_ITEM", AuditLog.entity_id.in_(item_ids_sub)),
        AuditLog.details.ilike(f'%"{student_id}"%'),
        AuditLog.details.ilike(f"%{student.student_code}%")
    )

    query = (
        select(AuditLog, User)
        .outerjoin(User, AuditLog.user_id == User.id)
        .where(student_condition)
    )
    count_query = (
        select(func.count(AuditLog.id))
        .outerjoin(User, AuditLog.user_id == User.id)
        .where(student_condition)
    )

    extra_filters = []
    if action and action != "ALL":
        extra_filters.append(AuditLog.action == action)

    if from_date:
        start_dt = datetime.combine(from_date, time.min, tzinfo=timezone.utc)
        extra_filters.append(AuditLog.created_at >= start_dt)

    if to_date:
        end_dt = datetime.combine(to_date, time.max, tzinfo=timezone.utc)
        extra_filters.append(AuditLog.created_at <= end_dt)

    if search:
        search_kw = f"%{search.strip()}%"
        extra_filters.append(
            or_(
                AuditLog.action.ilike(search_kw),
                AuditLog.details.ilike(search_kw),
                User.full_name.ilike(search_kw),
            )
        )

    if extra_filters:
        query = query.where(and_(*extra_filters))
        count_query = count_query.where(and_(*extra_filters))

    total = (await db.execute(count_query)).scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(desc(AuditLog.created_at)).offset(offset).limit(page_size)

    rows = (await db.execute(query)).all()
    items = [_build_audit_response(audit, user) for audit, user in rows]

    return PageResponse.create(items=items, total=total, params=PaginationParams(page=page, page_size=page_size))


@router.get("/actions", response_model=List[str])
async def list_distinct_actions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    """
    Get distinct action names recorded in audit logs for filter dropdowns.
    """
    res = await db.execute(
        select(AuditLog.action).distinct().order_by(AuditLog.action.asc())
    )
    return [r[0] for r in res.all()]


@router.get("/entity-types", response_model=List[str])
async def list_distinct_entity_types(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    """
    Get distinct entity types recorded in audit logs for filter dropdowns.
    """
    res = await db.execute(
        select(AuditLog.entity_type).distinct().order_by(AuditLog.entity_type.asc())
    )
    return [r[0] for r in res.all()]


@router.get("/users", response_model=List[AuditUserSummary])
async def list_audit_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Get list of staff users who have performed audited actions.
    """
    res = await db.execute(
        select(User).order_by(User.full_name.asc())
    )
    users = res.scalars().all()
    return [
        AuditUserSummary(
            id=u.id,
            full_name=u.full_name,
            email=u.email,
            role=u.role
        )
        for u in users
    ]


@router.get("/stats", response_model=AuditStatsResponse)
async def get_audit_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Get summary stats for the audit dashboard header.
    """
    total_q = await db.execute(select(func.count(AuditLog.id)))
    total_events = total_q.scalar_one()

    fin_q = await db.execute(
        select(func.count(AuditLog.id)).where(
            AuditLog.entity_type.in_(["PAYMENT", "REFUND", "EXPENSE", "SALARY"])
        )
    )
    financial_events = fin_q.scalar_one()

    stu_q = await db.execute(
        select(func.count(AuditLog.id)).where(
            AuditLog.entity_type.in_(["STUDENT", "ADMISSION", "ADMISSION_ITEM"])
        )
    )
    student_events = stu_q.scalar_one()

    today_start = datetime.combine(date.today(), time.min, tzinfo=timezone.utc)
    today_q = await db.execute(
        select(func.count(AuditLog.id)).where(AuditLog.created_at >= today_start)
    )
    today_events = today_q.scalar_one()

    return AuditStatsResponse(
        total_events=total_events,
        financial_events=financial_events,
        student_events=student_events,
        today_events=today_events
    )
