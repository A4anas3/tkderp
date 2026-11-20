from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc
from decimal import Decimal
from datetime import datetime, timezone, date, timedelta
from typing import Optional
import json
import uuid
import os
import io
import re
from PIL import Image

def normalize_mobile(mobile: Optional[str]) -> Optional[str]:
    if not mobile:
        return None
    digits = re.sub(r"\D", "", mobile)
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    return digits or mobile.strip()

from app.core.config import settings
from app.database.session import get_db
from app.modules.users.models import User
from app.modules.students.models import Student
from app.modules.admissions.models import Admission, AdmissionItem
from app.modules.payments.models import Payment, Refund
from app.modules.audit.models import AuditLog
from app.modules.students.schemas import (
    StudentCreate, StudentUpdate, StudentRevokeRequest,
    StudentResponse, StudentDetailResponse
)
from app.core.dependencies import require_cashier_or_admin, require_staff, require_admin
from app.common.pagination import PageResponse
from app.common.calculations import compute_rolling_cycle_end

def compress_avatar_image(file_bytes: bytes, max_kb: int = 20) -> bytes:
    """
    Compresses and resizes avatar image to ensure size is <= max_kb (default 20 KB).
    """
    max_bytes = max_kb * 1024
    img = Image.open(io.BytesIO(file_bytes))
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    
    # Target size: 360x360 maximum
    img.thumbnail((360, 360), Image.Resampling.LANCZOS)
    
    # Progressive quality reduction
    for q in [85, 75, 65, 55, 45, 35, 25]:
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=q, optimize=True)
        if buf.tell() <= max_bytes or q == 25:
            if buf.tell() <= max_bytes:
                return buf.getvalue()
            break
            
    # If still above max_bytes, downscale further to 240x240
    img.thumbnail((240, 240), Image.Resampling.LANCZOS)
    for q in [75, 60, 45, 30, 20]:
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=q, optimize=True)
        if buf.tell() <= max_bytes or q == 20:
            return buf.getvalue()
            
    return buf.getvalue()

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
        norm_search = normalize_mobile(clean_search)
        # Subquery to match student by admission number
        adm_subquery = select(Admission.student_id).where(Admission.admission_number.ilike(search_pattern))

        clauses = [
            Student.name.ilike(search_pattern),
            Student.student_code.ilike(search_pattern),
            Student.mobile.ilike(search_pattern),
            Student.father_name.ilike(search_pattern),
            Student.id.in_(adm_subquery)
        ]
        if norm_search and norm_search != clean_search:
            clauses.append(Student.mobile.ilike(f"%{norm_search}%"))

        search_filter = or_(*clauses)
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

@router.get("/check-mobile/{mobile}")
async def check_student_by_mobile(
    mobile: str,
    db: AsyncSession = Depends(get_db),
    user = Depends(require_staff)
):
    clean_mob = mobile.strip()
    norm = normalize_mobile(clean_mob)
    if not norm or len(norm) < 6:
        return {"exists": False, "student": None}

    clauses = [
        Student.mobile == clean_mob,
        Student.mobile == norm,
        Student.mobile == f"0{norm}",
        Student.mobile == f"+91{norm}",
        Student.mobile.ilike(f"%{norm}%")
    ]
    stmt = select(Student).where(or_(*clauses)).order_by(Student.registration_date.desc(), Student.created_at.desc()).limit(1)
    student = (await db.execute(stmt)).scalars().first()

    if not student:
        return {"exists": False, "student": None}

    # Fetch admissions for this student
    adm_stmt = (
        select(Admission.admission_number, Admission.status)
        .where(Admission.student_id == student.id)
        .order_by(desc(Admission.admission_date))
    )
    adms = (await db.execute(adm_stmt)).all()
    latest_adm = adms[0].admission_number if adms else None
    has_active_adm = any(a.status == "ACTIVE" for a in adms)

    return {
        "exists": True,
        "student": {
            "id": str(student.id),
            "student_code": student.student_code,
            "name": student.name,
            "mobile": student.mobile,
            "father_name": student.father_name,
            "email": student.email,
            "address": student.address,
            "photo_url": student.photo_url,
            "has_admission": len(adms) > 0,
            "has_active_admission": has_active_adm,
            "latest_admission_number": latest_adm,
            "admissions_count": len(adms),
        }
    }

@router.get("/{student_id}", response_model=StudentDetailResponse)
async def get_student(student_id: uuid.UUID, db: AsyncSession = Depends(get_db), user = Depends(require_staff)):
    student = (await db.execute(select(Student).where(Student.id == student_id))).scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Financial totals for student
    total_adm_count = (await db.execute(
        select(func.count(Admission.id)).where(Admission.student_id == student_id)
    )).scalar() or 0

    active_adm_count = (await db.execute(
        select(func.count(Admission.id)).where(Admission.student_id == student_id, Admission.status == "ACTIVE")
    )).scalar() or 0

    revoked_adm_count = (await db.execute(
        select(func.count(Admission.id)).where(Admission.student_id == student_id, Admission.status == "REVOKED")
    )).scalar() or 0

    active_row = (await db.execute(
        select(
            func.coalesce(func.sum(Admission.total_payable), Decimal("0.00")),
            func.coalesce(func.sum(Admission.balance_due), Decimal("0.00"))
        ).where(Admission.student_id == student_id, Admission.status == "ACTIVE")
    )).first()
    active_billed, active_due = active_row if active_row else (Decimal("0.00"), Decimal("0.00"))

    total_paid = (await db.execute(
        select(func.coalesce(func.sum(Payment.amount), Decimal("0.00")))
        .where(Payment.student_id == student_id)
    )).scalar() or Decimal("0.00")

    total_refunded = (await db.execute(
        select(func.coalesce(func.sum(Refund.amount), Decimal("0.00")))
        .where(Refund.student_id == student_id)
    )).scalar() or Decimal("0.00")

    net_paid = total_paid - total_refunded

    res = StudentDetailResponse.model_validate(student)
    res.admissions_count = total_adm_count
    res.active_admissions_count = active_adm_count
    res.revoked_admissions_count = revoked_adm_count
    res.total_billed = active_billed
    res.total_paid = total_paid
    res.total_refunded = total_refunded
    res.net_paid = net_paid
    res.total_balance_due = active_due
    return res

@router.post("", response_model=StudentResponse, status_code=status.HTTP_201_CREATED)
async def create_student(
    req: StudentCreate,
    check_duplicate: bool = False,
    db: AsyncSession = Depends(get_db),
    user = Depends(require_cashier_or_admin)
):
    # Check mobile number constraint when requested
    if req.mobile and check_duplicate:
        clean_mob = req.mobile.strip()
        norm_mob = normalize_mobile(clean_mob)
        if norm_mob and len(norm_mob) >= 8:
            match_clauses = [
                Student.mobile == clean_mob,
                Student.mobile == norm_mob,
                Student.mobile == f"0{norm_mob}",
                Student.mobile == f"+91{norm_mob}",
            ]
            existing = (await db.execute(select(Student).where(or_(*match_clauses)).limit(1))).scalars().first()
            if existing:
                adm_exists = (await db.execute(
                    select(Admission.admission_number).where(Admission.student_id == existing.id).limit(1)
                )).scalar_one_or_none()
                adm_text = f" with admission #{adm_exists}" if adm_exists else ""
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Student already registered{adm_text} with mobile {clean_mob}: {existing.name} ({existing.student_code}). Student ID: {existing.id}"
                )

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
    if req.registration_date is not None: student.registration_date = req.registration_date
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
    user: User = Depends(require_admin)
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
    user: User = Depends(require_admin)
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

@router.post("/upload-photo")
async def upload_student_photo_standalone(
    file: UploadFile = File(...),
    user = Depends(require_cashier_or_admin)
):
    """
    Upload and compress a student photo to <= 20 KB.
    Used during quick student registration before record exists.
    """
    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Empty file uploaded")
    
    try:
        compressed_bytes = compress_avatar_image(raw_bytes, max_kb=20)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image format: {str(e)}")

    upload_dir = os.path.join(os.path.abspath(settings.UPLOAD_DIR), "students")
    os.makedirs(upload_dir, exist_ok=True)
    
    filename = f"temp_{uuid.uuid4().hex[:12]}.jpg"
    filepath = os.path.join(upload_dir, filename)
    with open(filepath, "wb") as f:
        f.write(compressed_bytes)

    photo_url = f"/uploads/students/{filename}"
    return {
        "photo_url": photo_url,
        "size_kb": round(len(compressed_bytes) / 1024, 2)
    }

@router.post("/{student_id}/photo", response_model=StudentResponse)
async def upload_student_photo(
    student_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user = Depends(require_cashier_or_admin)
):
    """
    Upload, compress to <= 20 KB and attach photo directly to an existing student.
    """
    student = (await db.execute(select(Student).where(Student.id == student_id))).scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    try:
        compressed_bytes = compress_avatar_image(raw_bytes, max_kb=20)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image format: {str(e)}")

    upload_dir = os.path.join(os.path.abspath(settings.UPLOAD_DIR), "students")
    os.makedirs(upload_dir, exist_ok=True)

    filename = f"stu_{student.student_code.lower()}_{uuid.uuid4().hex[:8]}.jpg"
    filepath = os.path.join(upload_dir, filename)
    with open(filepath, "wb") as f:
        f.write(compressed_bytes)

    student.photo_url = f"/uploads/students/{filename}"
    await db.commit()
    await db.refresh(student)
    return StudentResponse.model_validate(student)

@router.get("/{student_id}/last-batch-period")
async def get_student_last_batch_period(
    student_id: uuid.UUID,
    batch_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    user = Depends(require_staff)
):
    """
    Retrieves the ending date of the student's previous enrolled batch cycle.
    Provides smart suggested next start date (next day after previous end) and end date (+30 days).
    Admin can override the start date for the next cycle.
    """
    student = (await db.execute(select(Student).where(Student.id == student_id))).scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Search for latest active admission item for this student
    stmt = (
        select(AdmissionItem, Admission)
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .where(
            Admission.student_id == student_id,
            Admission.status == "ACTIVE"
        )
    )
    if batch_id:
        stmt = stmt.where(AdmissionItem.batch_id == batch_id)

    # Order by validity end date or admission date desc
    stmt = stmt.order_by(
        desc(func.coalesce(AdmissionItem.valid_to, Admission.valid_to, Admission.admission_date))
    ).limit(1)

    result = (await db.execute(stmt)).first()

    today = date.today()
    if result:
        item, adm = result
        last_end = item.valid_to or adm.valid_to or adm.admission_date
        suggested_start = last_end + timedelta(days=1)
        suggested_end = compute_rolling_cycle_end(suggested_start, 1)[0]
        return {
            "student_id": str(student_id),
            "batch_id": str(batch_id) if batch_id else None,
            "has_previous": True,
            "last_end_date": last_end.isoformat(),
            "suggested_start_date": suggested_start.isoformat(),
            "suggested_end_date": suggested_end.isoformat(),
            "item_name": item.item_name_snapshot
        }
    else:
        suggested_start = today
        suggested_end = compute_rolling_cycle_end(suggested_start, 1)[0]
        return {
            "student_id": str(student_id),
            "batch_id": str(batch_id) if batch_id else None,
            "has_previous": False,
            "last_end_date": None,
            "suggested_start_date": suggested_start.isoformat(),
            "suggested_end_date": suggested_end.isoformat(),
            "item_name": None
        }

