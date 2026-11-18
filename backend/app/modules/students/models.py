from datetime import date
from typing import Optional
from sqlalchemy import String, Date, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.database.base import BaseModel

class Student(BaseModel):
    __tablename__ = "students"

    student_code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    mobile: Mapped[Optional[str]] = mapped_column(String(30), nullable=True, index=True)
    father_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    photo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dob: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    registration_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ACTIVE") # ACTIVE, INACTIVE
    has_green_card: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    green_card_expiry: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    @property
    def full_name(self) -> str:
        return self.name

    @property
    def registration_no(self) -> str:
        return self.student_code
