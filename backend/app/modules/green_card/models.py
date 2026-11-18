from decimal import Decimal
from typing import Optional
from sqlalchemy import String, Numeric, Integer, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.database.base import BaseModel

class GreenCardProduct(BaseModel):
    __tablename__ = "green_card_products"

    name: Mapped[str] = mapped_column(String(150), nullable=False, default="Green Card - All Access Pass")
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("15000.00"))
    validity_days: Mapped[int] = mapped_column(Integer, nullable=False, default=365) # e.g. 1 year
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
