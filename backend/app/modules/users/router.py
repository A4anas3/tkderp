from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc
from typing import List
import json
import uuid

from app.core.cache import (
    TTL_LONG,
    cache_get,
    cache_set,
    invalidate_teacher_cache,
    invalidate_user_cache,
    make_cache_key,
)
from app.database.session import get_db
from app.database.models import AuditLog
from app.modules.users.models import User
from app.modules.teachers.models import Teacher
from app.modules.subjects.models import Subject
from app.modules.expenses.models import SalaryRecord
from app.modules.auth.router import revoke_all_user_refresh_tokens
from app.modules.auth.schemas import UserResponse
from app.modules.users.schemas import (
    CreateUserRequest,
    UpdateUserRequest,
    ResetPasswordRequest,
    LinkedTeacherDetail,
    LinkedTeacherLookupResponse,
)
from app.core.security import get_password_hash
from app.core.dependencies import require_admin
from app.common.pagination import PageResponse

router = APIRouter(prefix="/api/users", tags=["Users & Staff Management"])

@router.get("", response_model=PageResponse[UserResponse])
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    cache_key = make_cache_key("users", "list", page=page, page_size=page_size, search=search)
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached

    query = select(User)
    count_query = select(func.count(User.id))

    if search:
        search_filter = or_(
            User.full_name.ilike(f"%{search}%"),
            User.employee_id.ilike(f"%{search}%"),
            User.email.ilike(f"%{search}%")
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    total = (await db.execute(count_query)).scalar() or 0
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    query = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = (await db.execute(query)).scalars().all()

    resp = PageResponse(
        items=[UserResponse.model_validate(u) for u in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )
    await cache_set(cache_key, resp, ttl=TTL_LONG, model=PageResponse[UserResponse])
    return resp

@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    req: CreateUserRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    # Check duplicate
    stmt = select(User).where(or_(User.employee_id == req.employee_id, User.email == req.email))
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Employee ID or Email already exists")

    new_user = User(
        employee_id=req.employee_id.strip().upper(),
        full_name=req.full_name.strip(),
        email=req.email.strip().lower(),
        password_hash=get_password_hash(req.password),
        role=req.role,
        status="ACTIVE"
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    await invalidate_user_cache()
    return UserResponse.model_validate(new_user)

@router.get("/linked-teacher/{employee_id}", response_model=LinkedTeacherLookupResponse)
async def get_linked_teacher_by_employee_id(
    employee_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Look up the Teacher record matching a staff account's employee_id (teacher_code == employee_id).
    Admin-only. Does not error if no teacher record exists.
    """
    emp_id = (employee_id or "").strip().upper()
    if not emp_id:
        return LinkedTeacherLookupResponse(found=False, teacher=None)

    teacher = (
        await db.execute(
            select(Teacher).where(func.upper(Teacher.teacher_code) == emp_id)
        )
    ).scalar_one_or_none()
    if not teacher:
        return LinkedTeacherLookupResponse(found=False, teacher=None)

    subs_res = await db.execute(
        select(Subject.name)
        .where(Subject.teacher_id == teacher.id)
        .order_by(Subject.name.asc())
    )
    assigned_subjects = [name for name in subs_res.scalars().all() if name]

    latest_salary = (
        await db.execute(
            select(SalaryRecord)
            .where(
                or_(
                    SalaryRecord.employee_id == teacher.id,
                    SalaryRecord.employee_name_snapshot.ilike(teacher.name.strip()),
                )
            )
            .order_by(desc(SalaryRecord.month_year), desc(SalaryRecord.created_at))
            .limit(1)
        )
    ).scalar_one_or_none()

    monthly_salary = None
    if latest_salary is not None:
        raw_sal = latest_salary.base_salary if latest_salary.base_salary is not None else latest_salary.salary_amount
        monthly_salary = float(raw_sal) if raw_sal is not None else None
    elif (teacher.share_type or "").upper() == "FIXED_MONTHLY" and teacher.share_value and teacher.share_value > 0:
        monthly_salary = float(teacher.share_value)

    detail = LinkedTeacherDetail(
        id=teacher.id,
        teacher_code=teacher.teacher_code,
        name=teacher.name,
        specialization=teacher.specialization,
        qualification=teacher.qualification,
        email=teacher.email,
        mobile=teacher.mobile,
        assigned_subjects=assigned_subjects,
        joining_date=teacher.joining_date,
        monthly_salary=monthly_salary,
        share_type=teacher.share_type,
        share_value=float(teacher.share_value or 0),
        status=teacher.status,
    )
    return LinkedTeacherLookupResponse(found=True, teacher=detail)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    req: UpdateUserRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if req.full_name is not None:
        user.full_name = req.full_name.strip()
    if req.role is not None:
        user.role = req.role
    if req.status is not None:
        user.status = req.status
        if req.status != "ACTIVE":
            await revoke_all_user_refresh_tokens(db, user.id)
    if req.new_password:
        user.password_hash = get_password_hash(req.new_password)
        await revoke_all_user_refresh_tokens(db, user.id)

    teacher_synced = False
    if req.status is not None and (user.role or "").strip().upper() == "TEACHER":
        emp_id = (user.employee_id or "").strip().upper()
        if emp_id:
            linked_teacher = (
                await db.execute(
                    select(Teacher).where(func.upper(Teacher.teacher_code) == emp_id)
                )
            ).scalar_one_or_none()
            if linked_teacher and linked_teacher.status != user.status:
                old_teacher_status = linked_teacher.status
                linked_teacher.status = user.status
                db.add(
                    AuditLog(
                        user_id=admin.id,
                        action="TEACHER_STATUS_UPDATED",
                        entity_type="TEACHER",
                        entity_id=linked_teacher.id,
                        details=json.dumps({
                            "teacher_code": linked_teacher.teacher_code,
                            "teacher_name": linked_teacher.name,
                            "old_status": old_teacher_status,
                            "new_status": user.status,
                            "reason": f"Synced from staff account ({user.employee_id}) status change",
                        }),
                    )
                )
                teacher_synced = True

    await db.commit()
    await db.refresh(user)
    await invalidate_user_cache()
    if teacher_synced:
        await invalidate_teacher_cache()
    return UserResponse.model_validate(user)

@router.post("/{user_id}/reset-password")
async def reset_password(
    user_id: uuid.UUID,
    req: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password_hash = get_password_hash(req.new_password)
    await revoke_all_user_refresh_tokens(db, user.id)
    await db.commit()
    await invalidate_user_cache()
    return {"success": True, "message": f"Password reset successfully for {user.employee_id}"}
