import uuid
from typing import Optional, Union
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.cache import TTL_LONG, cache_get, cache_set, invalidate_green_card_cache, make_cache_key
from app.common.pagination import PaginationParams, PageResponse
from app.database.session import get_db
from app.core.dependencies import require_cashier_or_admin, require_admin
from app.database.models import GreenCardProduct, User
from app.modules.green_card.schemas import GreenCardCreate, GreenCardUpdate, GreenCardResponse

router = APIRouter(prefix="/api/green-card", tags=["Green Card"])

@router.get("", response_model=Union[PageResponse[GreenCardResponse], list[GreenCardResponse]])
async def list_green_cards(
    page: Optional[int] = Query(None, ge=1),
    page_size: Optional[int] = Query(None, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    if page is not None:
        ps = page_size or 50
        cache_key = make_cache_key("green_card", "list", page=page, page_size=ps)
        hit, cached = await cache_get(cache_key)
        if hit:
            return cached
        total = (await db.execute(select(func.count(GreenCardProduct.id)))).scalar_one()
        result = await db.execute(
            select(GreenCardProduct)
            .order_by(GreenCardProduct.created_at.desc())
            .offset((page - 1) * ps)
            .limit(ps)
        )
        items = result.scalars().all()
        resp = PageResponse.create(items=items, total=total, params=PaginationParams(page=page, page_size=ps))
        await cache_set(cache_key, resp, ttl=TTL_LONG, model=PageResponse[GreenCardResponse])
        return resp

    cache_key = "erp:green_card:list"
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    result = await db.execute(select(GreenCardProduct).order_by(GreenCardProduct.created_at.desc()))
    items = result.scalars().all()
    await cache_set(cache_key, items, ttl=TTL_LONG, model=list[GreenCardResponse])
    return items

@router.get("/active", response_model=Optional[GreenCardResponse])
async def get_active_green_card(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    cache_key = "erp:green_card:active"
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    result = await db.execute(select(GreenCardProduct).where(GreenCardProduct.is_active == True).limit(1))
    card = result.scalar_one_or_none()
    await cache_set(cache_key, card, ttl=TTL_LONG, model=Optional[GreenCardResponse])
    return card

@router.post("", response_model=GreenCardResponse, status_code=status.HTTP_201_CREATED)
async def create_green_card(
    payload: GreenCardCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    product = GreenCardProduct(
        name=payload.name,
        price=payload.price,
        validity_days=payload.validity_days,
        description=payload.description,
        is_active=payload.is_active
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)
    await invalidate_green_card_cache()
    return product

@router.put("/{card_id}", response_model=GreenCardResponse)
async def update_green_card(
    card_id: uuid.UUID,
    payload: GreenCardUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    res = await db.execute(select(GreenCardProduct).where(GreenCardProduct.id == card_id))
    product = res.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Green Card product not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(product, field, val)

    await db.commit()
    await db.refresh(product)
    await invalidate_green_card_cache()
    return product
