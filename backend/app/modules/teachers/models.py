import uuid
from datetime import date
from typing import Optional
from sqlalchemy import String, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import BaseModel

class Teacher(BaseModel):
    __tablename__ = "teachers"

    teacher_code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    mobile: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    qualification: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    specialization: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    photo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    joining_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ACTIVE") # ACTIVE, INACTIVE

    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
