from typing import Optional
import uuid
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.core.dependencies import require_cashier_or_admin
from app.database.models import User
from app.modules.reminders.schemas import (
    ReminderItemResponse,
    ReminderListResponse,
    ReminderGenerateResponse,
)
from app.modules.reminders.service import (
    build_due_reminders,
    list_reminder_queue,
    mark_reminder_sent,
    reset_reminder_pending,
)

router = APIRouter(prefix="/api/reminders", tags=["Fee Reminders & WhatsApp Queue"])


@router.get("/queue", response_model=ReminderListResponse)
async def get_reminder_queue(
    status: Optional[str] = Query("pending"),
    search: Optional[str] = Query(None),
    page: Optional[int] = Query(1, ge=1),
    page_size: Optional[int] = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin),
):
    """
    Get due reminder queue with ready-to-click WhatsApp links (Cashier & Admin).
    Pre-populates phone number, student name, course, and amount due.
    Includes expired dues from F1.
    """
    return await list_reminder_queue(
        db=db,
        status_filter=status,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.post("/generate", response_model=ReminderGenerateResponse, status_code=status.HTTP_200_OK)
async def generate_reminders(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin),
):
    """Scan and queue reminders for all students with pending or expired dues."""
    count = await build_due_reminders(db)
    return ReminderGenerateResponse(
        message=f"Queued {count} new due reminder(s)",
        count=count,
    )


@router.post("/{reminder_id}/mark-sent", response_model=ReminderItemResponse)
async def mark_sent(
    reminder_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin),
):
    """Mark reminder as sent by staff member."""
    return await mark_reminder_sent(db, reminder_id, current_user.id)


@router.post("/{reminder_id}/reset-pending", response_model=ReminderItemResponse)
async def reset_pending(
    reminder_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin),
):
    """Reset a sent reminder back to pending status."""
    return await reset_reminder_pending(db, reminder_id, current_user.id)
