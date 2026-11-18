import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.modules.auth.router import router as auth_router
from app.modules.users.router import router as users_router
from app.modules.teachers.router import router as teachers_router
from app.modules.students.router import router as students_router
from app.modules.enquiries.router import router as enquiries_router
from app.modules.subjects.router import router as subjects_router
from app.modules.batches.router import router as batches_router
from app.modules.green_card.router import router as green_card_router
from app.modules.admissions.router import router as admissions_router
from app.modules.payments.router import router as payments_router
from app.modules.expenses.router import router as expenses_router
from app.modules.reports.router import router as reports_router
from app.modules.dashboard.router import router as dashboard_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure uploads directory exists
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    yield

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
app.mount("/uploads", StaticFiles(directory=uploads_path), name="uploads")

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
