import uuid
from decimal import Decimal
from typing import Optional
from sqlalchemy import String, Numeric, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import BaseModel

class Subject(BaseModel):
    __tablename__ = "subjects"

    subject_code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    default_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    
    # Teacher & Hall assignment directly on Subject
    teacher_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("teachers.id"), nullable=True, index=True)
    teacher_name_snapshot: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    hall_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default="Main Hall")
    schedule: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    class_category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, default="General")
    default_discount_percentage: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True, default=Decimal("10.00"))
    
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ACTIVE") # ACTIVE, INACTIVE

    # Relationship to Teacher
    teacher: Mapped[Optional["app.modules.teachers.models.Teacher"]] = relationship(
        "app.modules.teachers.models.Teacher", lazy="joined"
    )
