from decimal import Decimal
from typing import Optional
from sqlalchemy import String, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database.base import BaseModel

class Subject(BaseModel):
    __tablename__ = "subjects"

    subject_code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    default_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ACTIVE") # ACTIVE, INACTIVE
