import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database.session import get_db
from app.core.dependencies import require_staff

from app.core.config import settings
from app.modules.auth.router import router as auth_router
from app.modules.users.router import router as users_router
from app.modules.teachers.router import router as teachers_router
from app.modules.students.router import router as students_router
from app.modules.enquiries.router import router as enquiries_router
from app.modules.subjects.router import router as subjects_router
from app.modules.batches.router import router as batches_router, get_batches_active_summary
from app.modules.green_card.router import router as green_card_router
from app.modules.admissions.router import router as admissions_router
from app.modules.payments.router import router as payments_router
from app.modules.expenses.router import router as expenses_router
from app.modules.reports.router import router as reports_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.assessments.router import router as assessments_router
from app.modules.enrollments.router import router as enrollments_router
from app.modules.audit.router import router as audit_router
from app.modules.verification.router import router as verification_router
from app.modules.reminders.router import router as reminders_router
from app.database.session import engine
from app.database.models import Base

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from app.services.daily_jobs import refresh_statuses

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure uploads directory exists
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    # Ensure all tables (including reminder_queue) are created
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Initialize and start APScheduler for daily 00:05 IST status refresh
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        refresh_statuses,
        trigger=CronTrigger(hour=0, minute=5, timezone="Asia/Kolkata"),
        id="daily_refresh_statuses",
        replace_existing=True
    )
    scheduler.start()
    
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)

app = FastAPI(
    title="Thakurdwara Coaching ERP API",
    description="Backend API for Thakurdwara Coaching Institute Management System",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount local uploads for static serving
uploads_path = os.path.abspath(settings.UPLOAD_DIR)
os.makedirs(uploads_path, exist_ok=True)
os.makedirs(os.path.join(uploads_path, "students"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_path), name="uploads")
app.mount("/api/v1/uploads", StaticFiles(directory=uploads_path), name="api_uploads")

# Include API Routers
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(teachers_router)
app.include_router(students_router)
app.include_router(enquiries_router)
app.include_router(subjects_router)
app.include_router(batches_router)
app.include_router(green_card_router)
app.include_router(admissions_router)
app.include_router(payments_router)
app.include_router(expenses_router)
app.include_router(reports_router)
app.include_router(dashboard_router)
app.include_router(assessments_router)
app.include_router(enrollments_router)
app.include_router(audit_router)
app.include_router(verification_router)
app.include_router(reminders_router)

# Direct root alias for batches active summary
@app.get("/batches/active-summary", tags=["Batches"])
async def batches_active_summary_alias(
    db=Depends(get_db),
    current_user=Depends(require_staff)
):
    return await get_batches_active_summary(db=db, current_user=current_user)

@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "service": "Thakurdwara Coaching Institute ERP API",
        "version": "1.0.0"
    }

@app.get("/", tags=["Root"])
async def root():
    return {
        "message": "Welcome to Thakurdwara Coaching Institute ERP API",
        "docs_url": "/docs",
        "health_url": "/health"
    }
