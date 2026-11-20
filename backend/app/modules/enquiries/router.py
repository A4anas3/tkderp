import uuid
from datetime import date, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc

from app.database.session import get_db
from app.core.dependencies import require_staff, require_cashier_or_admin
from app.database.models import Enquiry, Student, User
from app.modules.enquiries.schemas import (
    EnquiryCreate, EnquiryUpdate, EnquiryResponse, ConvertEnquiryRequest
)
from app.common.pagination import PaginationParams, PageResponse

router = APIRouter(prefix="/api/enquiries", tags=["Enquiries"])

@router.get("", response_model=PageResponse[EnquiryResponse])
async def list_enquiries(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    query = select(Enquiry)
    count_query = select(func.count(Enquiry.id))

    if search:
        search_pattern = f"%{search.strip()}%"
        filter_clause = or_(
            Enquiry.student_name.ilike(search_pattern),
            Enquiry.enquiry_code.ilike(search_pattern),
            Enquiry.mobile.ilike(search_pattern),
            Enquiry.interested_subject.ilike(search_pattern)
        )
        query = query.where(filter_clause)
        count_query = count_query.where(filter_clause)

    if status_filter:
        query = query.where(Enquiry.status == status_filter)
        count_query = count_query.where(Enquiry.status == status_filter)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(desc(Enquiry.created_at)).offset(offset).limit(page_size)
    items_result = await db.execute(query)
    items = items_result.scalars().all()

    today = date.today()
    response_items = []
    for item in items:
        rem_days = None
        if item.demo_deadline:
            rem_days = (item.demo_deadline - today).days
        resp = EnquiryResponse(
            id=item.id,
            enquiry_code=item.enquiry_code,
            student_name=item.student_name,
            mobile=item.mobile,
            purpose=item.purpose,
            interested_subject=item.interested_subject,
            demo_start_date=item.demo_start_date,
            demo_duration_days=item.demo_duration_days,
            demo_deadline=item.demo_deadline,
            notes=item.notes,
            status=item.status,
            remaining_days=rem_days,
            converted_student_id=item.converted_student_id,
            created_by=item.created_by
        )
        response_items.append(resp)

    return PageResponse.create(items=response_items, total=total, params=PaginationParams(page=page, page_size=page_size))

@router.get("/upcoming-deadlines", response_model=list[EnquiryResponse])
async def get_upcoming_demo_deadlines(
    days_ahead: int = Query(7, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    today = date.today()
    max_date = today + timedelta(days=days_ahead)
    
    query = select(Enquiry).where(
        Enquiry.status.in_(["PENDING", "ACTIVE_DEMO", "INTERESTED"]),
        Enquiry.demo_deadline.isnot(None),
        Enquiry.demo_deadline <= max_date
    ).order_by(Enquiry.demo_deadline.asc())

    result = await db.execute(query)
    items = result.scalars().all()

    response_items = []
    for item in items:
        rem_days = (item.demo_deadline - today).days if item.demo_deadline else None
        response_items.append(
            EnquiryResponse(
                id=item.id,
                enquiry_code=item.enquiry_code,
                student_name=item.student_name,
                mobile=item.mobile,
                purpose=item.purpose,
                interested_subject=item.interested_subject,
                demo_start_date=item.demo_start_date,
                demo_duration_days=item.demo_duration_days,
                demo_deadline=item.demo_deadline,
                notes=item.notes,
                status=item.status,
                remaining_days=rem_days,
                converted_student_id=item.converted_student_id,
                created_by=item.created_by
            )
        )
    return response_items

@router.post("", response_model=EnquiryResponse, status_code=status.HTTP_201_CREATED)
async def create_enquiry(
    payload: EnquiryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    # Auto-generate enquiry code
    year_str = date.today().strftime("%Y")
    count_query = select(func.count(Enquiry.id))
    cnt_res = await db.execute(count_query)
    seq = cnt_res.scalar_one() + 1
    enquiry_code = f"ENQ{year_str}{seq:04d}"

    deadline = None
    if payload.demo_start_date:
        deadline = payload.demo_start_date + timedelta(days=payload.demo_duration_days)

    enquiry = Enquiry(
        enquiry_code=enquiry_code,
        student_name=payload.student_name,
        mobile=payload.mobile,
        purpose=payload.purpose,
        interested_subject=payload.interested_subject,
        demo_start_date=payload.demo_start_date,
        demo_duration_days=payload.demo_duration_days,
        demo_deadline=deadline,
        notes=payload.notes,
        status=payload.status,
        created_by=current_user.id
    )
    db.add(enquiry)
    await db.commit()
    await db.refresh(enquiry)

    rem_days = (enquiry.demo_deadline - date.today()).days if enquiry.demo_deadline else None
    return EnquiryResponse(
        id=enquiry.id,
        enquiry_code=enquiry.enquiry_code,
        student_name=enquiry.student_name,
        mobile=enquiry.mobile,
        purpose=enquiry.purpose,
        interested_subject=enquiry.interested_subject,
        demo_start_date=enquiry.demo_start_date,
        demo_duration_days=enquiry.demo_duration_days,
        demo_deadline=enquiry.demo_deadline,
        notes=enquiry.notes,
        status=enquiry.status,
        remaining_days=rem_days,
        converted_student_id=enquiry.converted_student_id,
        created_by=enquiry.created_by
    )

@router.get("/{enquiry_id}", response_model=EnquiryResponse)
async def get_enquiry(
    enquiry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    res = await db.execute(select(Enquiry).where(Enquiry.id == enquiry_id))
    enquiry = res.scalar_one_or_none()
    if not enquiry:
        raise HTTPException(status_code=404, detail="Enquiry not found")

    rem_days = (enquiry.demo_deadline - date.today()).days if enquiry.demo_deadline else None
    return EnquiryResponse(
        id=enquiry.id,
        enquiry_code=enquiry.enquiry_code,
        student_name=enquiry.student_name,
        mobile=enquiry.mobile,
        purpose=enquiry.purpose,
        interested_subject=enquiry.interested_subject,
        demo_start_date=enquiry.demo_start_date,
        demo_duration_days=enquiry.demo_duration_days,
        demo_deadline=enquiry.demo_deadline,
        notes=enquiry.notes,
        status=enquiry.status,
        remaining_days=rem_days,
        converted_student_id=enquiry.converted_student_id,
        created_by=enquiry.created_by
    )

@router.put("/{enquiry_id}", response_model=EnquiryResponse)
async def update_enquiry(
    enquiry_id: uuid.UUID,
    payload: EnquiryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    res = await db.execute(select(Enquiry).where(Enquiry.id == enquiry_id))
    enquiry = res.scalar_one_or_none()
    if not enquiry:
        raise HTTPException(status_code=404, detail="Enquiry not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(enquiry, field, val)

    if "demo_start_date" in update_data or "demo_duration_days" in update_data:
        if enquiry.demo_start_date:
            enquiry.demo_deadline = enquiry.demo_start_date + timedelta(days=enquiry.demo_duration_days)
        else:
            enquiry.demo_deadline = None

    await db.commit()
    await db.refresh(enquiry)

    rem_days = (enquiry.demo_deadline - date.today()).days if enquiry.demo_deadline else None
    return EnquiryResponse(
        id=enquiry.id,
        enquiry_code=enquiry.enquiry_code,
        student_name=enquiry.student_name,
        mobile=enquiry.mobile,
        purpose=enquiry.purpose,
        interested_subject=enquiry.interested_subject,
        demo_start_date=enquiry.demo_start_date,
        demo_duration_days=enquiry.demo_duration_days,
        demo_deadline=enquiry.demo_deadline,
        notes=enquiry.notes,
        status=enquiry.status,
        remaining_days=rem_days,
        converted_student_id=enquiry.converted_student_id,
        created_by=enquiry.created_by
    )

@router.post("/{enquiry_id}/convert", status_code=status.HTTP_200_OK)
async def convert_enquiry_to_student(
    enquiry_id: uuid.UUID,
    payload: Optional[ConvertEnquiryRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    req = payload or ConvertEnquiryRequest()
    res = await db.execute(select(Enquiry).where(Enquiry.id == enquiry_id))
    enquiry = res.scalar_one_or_none()
    if not enquiry:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    if enquiry.status == "CONVERTED" and enquiry.converted_student_id:
        raise HTTPException(status_code=400, detail="Enquiry has already been converted to a student")

    # Generate student registration code
    year_str = date.today().strftime("%Y")
    cnt_res = await db.execute(select(func.count(Student.id)))
    seq = cnt_res.scalar_one() + 1
    reg_no = f"STU{year_str}{seq:04d}"

    student = Student(
        student_code=reg_no,
        name=enquiry.student_name,
        father_name=req.father_name,
        mobile=enquiry.mobile,
        email=req.email,
        address=req.address,
        status="ACTIVE"
    )
    db.add(student)
    await db.flush()

    enquiry.status = "CONVERTED"
    enquiry.converted_student_id = student.id
    await db.commit()

    return {
        "message": f"Successfully converted enquiry to student {student.student_code}",
        "student_id": str(student.id),
        "student_code": student.student_code,
        "name": student.name,
        "status": "CONVERTED"
    }
