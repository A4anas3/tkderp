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
    ReminderMarkFailedRequest,
    ReminderSendStudentResponse,
)
from app.modules.reminders.service import (
    build_due_reminders,
    list_reminder_queue,
    mark_reminder_sent,
    mark_reminder_failed,
    reset_reminder_pending,
    send_student_due_reminder,
    send_subject_due_reminders,
)

router = APIRouter(prefix="/api/reminders", tags=["Fee Reminders & WhatsApp Queue"])


@router.get("/queue", response_model=ReminderListResponse)
async def get_reminder_queue(
    status: Optional[str] = Query("pending"),
    subject_id: Optional[uuid.UUID] = Query(None),
    batch_id: Optional[uuid.UUID] = Query(None),
    due_age: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: Optional[int] = Query(1, ge=1),
    page_size: Optional[int] = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin),
):
    """
    Get due reminder queue with ready-to-click WhatsApp links (Cashier & Admin).
    Filters by subject, batch, due-age, and status.
    Reminders are only listed for real outstanding dues (never expired/waived/cancelled items).
    """
    return await list_reminder_queue(
        db=db,
        status_filter=status,
        subject_id=subject_id,
        batch_id=batch_id,
        due_age=due_age,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.post("/generate", response_model=ReminderGenerateResponse, status_code=status.HTTP_200_OK)
async def generate_reminders(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin),
):
    """Scan and queue reminders for students with real outstanding dues."""
    count = await build_due_reminders(db)
    return ReminderGenerateResponse(
        message=f"Queued {count} active due reminder(s)",
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


@router.post("/{reminder_id}/mark-failed", response_model=ReminderItemResponse)
async def mark_failed(
    reminder_id: uuid.UUID,
    payload: Optional[ReminderMarkFailedRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin),
):
    """Mark reminder as failed (e.g. invalid phone number, unreachable)."""
    reason = payload.reason if payload else None
    return await mark_reminder_failed(db, reminder_id, current_user.id, reason)


@router.post("/{reminder_id}/reset-pending", response_model=ReminderItemResponse)
async def reset_pending(
    reminder_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin),
):
    """Reset a sent or failed reminder back to pending status."""
    return await reset_reminder_pending(db, reminder_id, current_user.id)


@router.post("/student/{student_id}/send-due-reminder", response_model=ReminderSendStudentResponse)
async def one_click_send_student_reminder(
    student_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin),
):
    """One-click 'send due reminder' from a student profile."""
    return await send_student_due_reminder(db, student_id, current_user.id)


@router.post("/subject/{subject_id}/send-due-reminders", response_model=ReminderGenerateResponse)
async def one_click_send_subject_reminders(
    subject_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin),
):
    """One-click 'send due reminder' for all students with dues in a subject."""
    count = await send_subject_due_reminders(db, subject_id, current_user.id)
    return ReminderGenerateResponse(
        message=f"Queued {count} due reminder(s) for subject",
        count=count,
    )
