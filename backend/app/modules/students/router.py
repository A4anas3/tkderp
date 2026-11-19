from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from decimal import Decimal
from datetime import datetime, timezone
import json
import uuid

from app.database.session import get_db
from app.modules.students.models import Student
from app.modules.admissions.models import Admission
from app.modules.audit.models import AuditLog
from app.modules.students.schemas import (
    StudentCreate, StudentUpdate, StudentRevokeRequest,
    StudentResponse, StudentDetailResponse
)
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
        clean_search = search.strip()
        search_pattern = f"%{clean_search}%"
        # Subquery to match student by admission number
        adm_subquery = select(Admission.student_id).where(Admission.admission_number.ilike(search_pattern))

        search_filter = or_(
            Student.name.ilike(search_pattern),
            Student.student_code.ilike(search_pattern),
            Student.mobile.ilike(search_pattern),
            Student.father_name.ilike(search_pattern),
            Student.id.in_(adm_subquery)
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

    # Map latest admission number for display in student search dropdown
    student_ids = [s.id for s in items]
    adm_map = {}
    if student_ids:
        adm_stmt = (
            select(Admission.student_id, Admission.admission_number)
            .where(Admission.student_id.in_(student_ids))
            .order_by(Admission.created_at.desc())
        )
        adm_res = await db.execute(adm_stmt)
        for s_id, adm_no in adm_res.all():
            if s_id not in adm_map:
                adm_map[s_id] = adm_no

    response_items = []
    for s in items:
        resp = StudentResponse.model_validate(s)
        resp.latest_admission_number = adm_map.get(s.id)
        response_items.append(resp)

    return PageResponse(
        items=response_items,
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

@router.post("/{student_id}/revoke", response_model=StudentResponse)
async def revoke_student(
    student_id: uuid.UUID,
    payload: StudentRevokeRequest,
    db: AsyncSession = Depends(get_db),
    user = Depends(require_cashier_or_admin)
):
    student = (await db.execute(select(Student).where(Student.id == student_id))).scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    student.status = "REVOKED"
    student.revoke_reason = payload.reason.strip()
    student.revoked_at = datetime.now(timezone.utc)
    student.revoked_by = user.id
    student.has_green_card = False

    audit = AuditLog(
        user_id=user.id,
        action="REVOKE_STUDENT",
        entity_type="STUDENT",
        entity_id=student.id,
        details=json.dumps({
            "student_code": student.student_code,
            "student_name": student.name,
            "reason": payload.reason.strip()
        })
    )
    db.add(audit)
    await db.commit()
    await db.refresh(student)
    return StudentResponse.model_validate(student)

@router.post("/{student_id}/restore", response_model=StudentResponse)
async def restore_student(
    student_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user = Depends(require_cashier_or_admin)
):
    student = (await db.execute(select(Student).where(Student.id == student_id))).scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    old_reason = student.revoke_reason
    student.status = "ACTIVE"
    student.revoke_reason = None
    student.revoked_at = None
    student.revoked_by = None

    audit = AuditLog(
        user_id=user.id,
        action="RESTORE_STUDENT",
        entity_type="STUDENT",
        entity_id=student.id,
        details=json.dumps({
            "student_code": student.student_code,
            "student_name": student.name,
            "previous_revoke_reason": old_reason
        })
    )
    db.add(audit)
    await db.commit()
    await db.refresh(student)
    return StudentResponse.model_validate(student)
