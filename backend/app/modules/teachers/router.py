from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
import uuid

from app.database.session import get_db
from app.modules.teachers.models import Teacher
from app.modules.teachers.schemas import TeacherCreate, TeacherUpdate, TeacherResponse
from app.core.dependencies import require_staff, require_admin
from app.common.pagination import PageResponse

router = APIRouter(prefix="/api/teachers", tags=["Teachers"])

@router.get("", response_model=PageResponse[TeacherResponse])
async def list_teachers(
    page: int = 1,
    page_size: int = 20,
    search: str = None,
    status: str = None,
    db: AsyncSession = Depends(get_db),
    user = Depends(require_staff)
):
    query = select(Teacher)
    count_query = select(func.count(Teacher.id))

    if search:
        search_filter = or_(
            Teacher.name.ilike(f"%{search}%"),
            Teacher.mobile.ilike(f"%{search}%"),
            Teacher.teacher_code.ilike(f"%{search}%"),
            Teacher.specialization.ilike(f"%{search}%")
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    if status:
        query = query.where(Teacher.status == status)
        count_query = count_query.where(Teacher.status == status)

    total = (await db.execute(count_query)).scalar() or 0
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    query = query.order_by(Teacher.name.asc()).offset((page - 1) * page_size).limit(page_size)
    items = (await db.execute(query)).scalars().all()

    return PageResponse(
        items=[TeacherResponse.model_validate(t) for t in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )

@router.get("/{teacher_id}", response_model=TeacherResponse)
async def get_teacher(teacher_id: uuid.UUID, db: AsyncSession = Depends(get_db), user = Depends(require_staff)):
    teacher = (await db.execute(select(Teacher).where(Teacher.id == teacher_id))).scalar_one_or_none()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    return TeacherResponse.model_validate(teacher)

@router.post("", response_model=TeacherResponse, status_code=status.HTTP_201_CREATED)
async def create_teacher(
    req: TeacherCreate,
    db: AsyncSession = Depends(get_db),
    admin = Depends(require_admin)
):
    # Auto-generate teacher code
    count = (await db.execute(select(func.count(Teacher.id)))).scalar() or 0
    code = f"TCH{count + 1:03d}"

    new_teacher = Teacher(
        teacher_code=code,
        name=req.name.strip(),
        mobile=req.mobile.strip(),
        email=req.email.strip().lower() if req.email else None,
        qualification=req.qualification,
        specialization=req.specialization,
        photo_url=req.photo_url,
        joining_date=req.joining_date,
        status=req.status
    )
    db.add(new_teacher)
    await db.commit()
    await db.refresh(new_teacher)
    return TeacherResponse.model_validate(new_teacher)

@router.put("/{teacher_id}", response_model=TeacherResponse)
async def update_teacher(
    teacher_id: uuid.UUID,
    req: TeacherUpdate,
    db: AsyncSession = Depends(get_db),
    admin = Depends(require_admin)
):
    teacher = (await db.execute(select(Teacher).where(Teacher.id == teacher_id))).scalar_one_or_none()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    if req.name is not None: teacher.name = req.name.strip()
    if req.mobile is not None: teacher.mobile = req.mobile.strip()
    if req.email is not None: teacher.email = req.email.strip().lower() if req.email else None
    if req.qualification is not None: teacher.qualification = req.qualification
    if req.specialization is not None: teacher.specialization = req.specialization
    if req.photo_url is not None: teacher.photo_url = req.photo_url
    if req.joining_date is not None: teacher.joining_date = req.joining_date
    if req.status is not None: teacher.status = req.status

    await db.commit()
    await db.refresh(teacher)
    return TeacherResponse.model_validate(teacher)
