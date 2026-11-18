from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from decimal import Decimal
import uuid

from app.database.session import get_db
from app.modules.students.models import Student
from app.modules.admissions.models import Admission
from app.modules.students.schemas import StudentCreate, StudentUpdate, StudentResponse, StudentDetailResponse
from app.core.dependencies import require_cashier_or_admin, require_staff
from app.common.pagination import PageResponse

router = APIRouter(prefix="/api/students", tags=["Students"])

@router.get("", response_model=PageResponse[StudentResponse])
async def list_students(
    page: int = 1,
    page_size: int = 20,
    search: str = None,
    status: str = None,
    db: AsyncSession = Depends(get_db),
    user = Depends(require_staff)
):
    query = select(Student)
    count_query = select(func.count(Student.id))

    if search:
        search_filter = or_(
            Student.name.ilike(f"%{search}%"),
            Student.student_code.ilike(f"%{search}%"),
            Student.mobile.ilike(f"%{search}%"),
            Student.father_name.ilike(f"%{search}%")
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    if status:
        query = query.where(Student.status == status)
        count_query = count_query.where(Student.status == status)

    total = (await db.execute(count_query)).scalar() or 0
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    query = query.order_by(Student.registration_date.desc(), Student.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = (await db.execute(query)).scalars().all()

    return PageResponse(
        items=[StudentResponse.model_validate(s) for s in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )

@router.get("/{student_id}", response_model=StudentDetailResponse)
async def get_student(student_id: uuid.UUID, db: AsyncSession = Depends(get_db), user = Depends(require_staff)):
    student = (await db.execute(select(Student).where(Student.id == student_id))).scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Financial totals for student
    adm_stmt = select(
        func.count(Admission.id),
        func.coalesce(func.sum(Admission.total_payable), Decimal("0.00")),
        func.coalesce(func.sum(Admission.amount_paid), Decimal("0.00")),
        func.coalesce(func.sum(Admission.balance_due), Decimal("0.00"))
    ).where(Admission.student_id == student_id, Admission.status == "ACTIVE")
    
    row = (await db.execute(adm_stmt)).first()
    adm_count, billed, paid, due = row if row else (0, Decimal("0.00"), Decimal("0.00"), Decimal("0.00"))

    res = StudentDetailResponse.model_validate(student)
    res.admissions_count = adm_count
    res.total_billed = billed
    res.total_paid = paid
    res.total_balance_due = due
    return res

@router.post("", response_model=StudentResponse, status_code=status.HTTP_201_CREATED)
async def create_student(
    req: StudentCreate,
    db: AsyncSession = Depends(get_db),
    user = Depends(require_cashier_or_admin)
):
    # Auto-generate student code STU<Year><Count:04d>
    year = req.registration_date.year
    count = (await db.execute(select(func.count(Student.id)))).scalar() or 0
    code = f"STU{year}{count + 1:04d}"

    new_student = Student(
        student_code=code,
        name=req.name.strip(),
        mobile=req.mobile.strip() if req.mobile else None,
        father_name=req.father_name.strip() if req.father_name else None,
        email=req.email.strip().lower() if req.email else None,
        photo_url=req.photo_url,
        address=req.address,
        dob=req.dob,
        registration_date=req.registration_date,
        status=req.status,
        notes=req.notes
    )
    db.add(new_student)
    await db.commit()
    await db.refresh(new_student)
    return StudentResponse.model_validate(new_student)

@router.put("/{student_id}", response_model=StudentResponse)
async def update_student(
    student_id: uuid.UUID,
    req: StudentUpdate,
    db: AsyncSession = Depends(get_db),
    user = Depends(require_cashier_or_admin)
):
    student = (await db.execute(select(Student).where(Student.id == student_id))).scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if req.name is not None: student.name = req.name.strip()
    if req.mobile is not None: student.mobile = req.mobile.strip() if req.mobile else None
    if req.father_name is not None: student.father_name = req.father_name.strip() if req.father_name else None
    if req.email is not None: student.email = req.email.strip().lower() if req.email else None
    if req.photo_url is not None: student.photo_url = req.photo_url
    if req.address is not None: student.address = req.address
    if req.dob is not None: student.dob = req.dob
    if req.status is not None: student.status = req.status
    if req.notes is not None: student.notes = req.notes

    await db.commit()
    await db.refresh(student)
    return StudentResponse.model_validate(student)
