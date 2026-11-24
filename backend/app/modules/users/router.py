from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from typing import List
import uuid

from app.core.cache import TTL_LONG, cache_get, cache_set, invalidate_user_cache, make_cache_key
from app.database.session import get_db
from app.modules.users.models import User
from app.modules.auth.schemas import UserResponse
from app.modules.users.schemas import CreateUserRequest, UpdateUserRequest, ResetPasswordRequest
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

    await db.commit()
    await db.refresh(user)
    await invalidate_user_cache()
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
    await db.commit()
    await invalidate_user_cache()
    return {"success": True, "message": f"Password reset successfully for {user.employee_id}"}
