import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database.session import get_db
from app.core.dependencies import require_staff, require_admin
from app.database.models import GreenCardProduct, User
from app.modules.green_card.schemas import GreenCardCreate, GreenCardUpdate, GreenCardResponse

router = APIRouter(prefix="/api/green-card", tags=["Green Card"])

@router.get("", response_model=list[GreenCardResponse])
async def list_green_cards(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    result = await db.execute(select(GreenCardProduct).order_by(GreenCardProduct.created_at.desc()))
    return result.scalars().all()

@router.get("/active", response_model=Optional[GreenCardResponse])
async def get_active_green_card(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    result = await db.execute(select(GreenCardProduct).where(GreenCardProduct.is_active == True).limit(1))
    return result.scalar_one_or_none()

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
    return product
