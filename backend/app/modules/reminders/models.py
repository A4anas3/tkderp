import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional
from sqlalchemy import String, Text, ForeignKey, DateTime, Numeric, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import BaseModel

class ReminderQueue(BaseModel):
    __tablename__ = "reminder_queue"

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    admission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("admissions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    admission_item_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("admission_items.id", ondelete="SET NULL"), nullable=True
    )
    kind: Mapped[str] = mapped_column(
        String(30), nullable=False, default="due", index=True
    )  # due, due_soon, due_today, overdue_3, overdue_7, expired_due
    course_name: Mapped[str] = mapped_column(String(255), nullable=False)
    due_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", index=True
    )  # pending, sent, skipped
    handled_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    handled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    student: Mapped["app.modules.students.models.Student"] = relationship(
        "app.modules.students.models.Student", lazy="joined"
    )
    admission: Mapped["app.modules.admissions.models.Admission"] = relationship(
        "app.modules.admissions.models.Admission", lazy="joined"
    )
    handler: Mapped[Optional["app.modules.users.models.User"]] = relationship(
        "app.modules.users.models.User", foreign_keys=[handled_by], lazy="joined"
    )
