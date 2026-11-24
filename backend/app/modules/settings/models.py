import uuid
from decimal import Decimal
from typing import Optional
from sqlalchemy import String, Numeric, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database.base import BaseModel

class InstituteSetting(BaseModel):
    __tablename__ = "institute_settings"

    key: Mapped[str] = mapped_column(String(50), unique=True, index=True, default="institute_profile")
    gstin: Mapped[str] = mapped_column(String(50), nullable=False, default="09AAACT1234F1Z5")
    gst_rate: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=Decimal("18.00"))
    institute_name: Mapped[str] = mapped_column(String(200), nullable=False, default="THAKURDWARA COACHING INSTITUTE")
    address: Mapped[str] = mapped_column(String(300), nullable=False, default="Civil Lines Road, Thakurdwara, UP - 244601")
    phone: Mapped[str] = mapped_column(String(50), nullable=False, default="+91 98765 43210")
    email: Mapped[str] = mapped_column(String(100), nullable=False, default="accounts@thakurdwara.edu.in")
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    govt_regd_no: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    iso_certification: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
