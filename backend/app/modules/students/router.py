from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, desc
from sqlalchemy.orm import selectinload
from decimal import Decimal
from datetime import datetime, timezone, date, timedelta
from typing import Optional, List
import json
import uuid
import os
import io
import re
from PIL import Image

from app.common.validators import normalize_mobile, validate_mobile_10_digits
from app.core.config import settings
from app.database.session import get_db
from app.modules.users.models import User
from app.modules.students.models import Student
from app.modules.admissions.models import Admission, AdmissionItem
from app.modules.payments.models import Payment, Refund, PaymentAllocation, FinancialTransaction
from app.modules.batches.models import Batch
from app.modules.audit.models import AuditLog
from app.modules.audit.schemas import AuditLogResponse
from app.modules.students.schemas import (
    StudentCreate, StudentUpdate, StudentRevokeRequest,
    StudentResponse, StudentDetailResponse, StudentLineResponse
)
from app.modules.admissions.schemas import AdmissionResponse, RenewalsDueItemResponse
from app.modules.payments.schemas import FinancialTransactionResponse
from app.common.active_lines import today_kolkata, is_active_line, derive_student_status
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
        pay_subquery = select(Payment.student_id).where(Payment.payment_number.ilike(search_pattern))

        clauses = [
            Student.name.ilike(search_pattern),
            Student.student_code.ilike(search_pattern),
            Student.mobile.ilike(search_pattern),
            Student.father_name.ilike(search_pattern),
            Student.id.in_(adm_subquery),
            Student.id.in_(pay_subquery)
        ]
        if norm_search and norm_search != clean_search:
            clauses.append(Student.mobile.ilike(f"%{norm_search}%"))

        search_filter = or_(*clauses)
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    if status and status != "ALL":
        today = today_kolkata()
        active_lines_sub = (
            select(AdmissionItem.student_id)
            .join(Admission, AdmissionItem.admission_id == Admission.id)
            .where(
                AdmissionItem.access_status == "ACTIVE",
                Admission.document_status == "VALID",
                or_(AdmissionItem.valid_from == None, AdmissionItem.valid_from <= today),
                or_(AdmissionItem.valid_to == None, AdmissionItem.valid_to >= today),
            )
        )
        if status == "ACTIVE":
            cond = and_(Student.status == "ACTIVE", Student.id.in_(active_lines_sub))
            query = query.where(cond)
            count_query = count_query.where(cond)
        elif status == "UPCOMING":
            upcoming_lines_sub = (
                select(AdmissionItem.student_id)
                .join(Admission, AdmissionItem.admission_id == Admission.id)
                .where(
                    AdmissionItem.access_status == "ACTIVE",
                    Admission.document_status == "VALID",
                    AdmissionItem.valid_from != None,
                    AdmissionItem.valid_from > today,
                )
            )
            cond = Student.id.in_(upcoming_lines_sub)
            query = query.where(cond)
            count_query = count_query.where(cond)
        elif status == "EXPIRED":
            expired_lines_sub = (
                select(AdmissionItem.student_id)
                .join(Admission, AdmissionItem.admission_id == Admission.id)
                .where(
                    Admission.document_status == "VALID",
                    AdmissionItem.valid_to != None,
                    AdmissionItem.valid_to < today,
                    AdmissionItem.access_status.in_(["ACTIVE", "EXPIRED"]),
                )
            )
            cond = and_(Student.id.in_(expired_lines_sub), ~Student.id.in_(active_lines_sub))
            query = query.where(cond)
            count_query = count_query.where(cond)
        elif status == "DISCONTINUED":
            disc_lines_sub = (
                select(AdmissionItem.student_id)
                .join(Admission, AdmissionItem.admission_id == Admission.id)
                .where(
                    or_(
                        AdmissionItem.access_status.in_(["SUSPENDED", "REVOKED"]),
                        Admission.document_status == "VOID",
                    )
                )
            )
            cond = or_(Student.status.in_(["REVOKED", "INACTIVE"]), Student.id.in_(disc_lines_sub))
            query = query.where(cond)
            count_query = count_query.where(cond)
        elif status == "INACTIVE":
            cond = Student.status.in_(["REVOKED", "INACTIVE"])
            query = query.where(cond)
            count_query = count_query.where(cond)
        elif status == "REVOKED":
            revoked_lines_sub = (
                select(AdmissionItem.student_id)
                .join(Admission, AdmissionItem.admission_id == Admission.id)
                .where(
                    or_(
                        AdmissionItem.access_status == "REVOKED",
                        Admission.document_status == "VOID",
                    )
                )
            )
            cond = and_(or_(Student.status == "REVOKED", Student.id.in_(revoked_lines_sub)), ~Student.id.in_(active_lines_sub))
            query = query.where(cond)
            count_query = count_query.where(cond)
        else:
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
    if not norm or len(norm) != 10:
        return {"exists": False, "valid": False, "message": "Mobile number must be exactly 10 numeric digits", "student": None}

    clauses = [
        Student.mobile == norm,
        Student.mobile == f"0{norm}",
        Student.mobile == f"+91{norm}",
        Student.mobile == clean_mob,
    ]
    stmt = select(Student).where(or_(*clauses)).order_by(Student.registration_date.desc(), Student.created_at.desc()).limit(1)
    student = (await db.execute(stmt)).scalars().first()

    if not student:
        return {"exists": False, "valid": True, "student": None}

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
        "valid": True,
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

    today = today_kolkata()

    # Load all admissions with their items
    adms_stmt = (
        select(Admission)
        .options(selectinload(Admission.items))
        .where(Admission.student_id == student_id)
        .order_by(Admission.admission_date.desc(), Admission.created_at.desc())
    )
    admissions = list((await db.execute(adms_stmt)).scalars().all())

    # Flatten all items with admission reference attached
    all_items = []
    for adm in admissions:
        for itm in adm.items:
            itm.admission = adm
            all_items.append(itm)

    # Derive student status dynamically from lines
    if all_items and student.status != "REVOKED":
        student.status = derive_student_status(all_items, today)

    # Financial totals for student
    total_adm_count = len(admissions)
    active_adm_count = sum(1 for a in admissions if a.status == "ACTIVE" and getattr(a, "access_status", "ACTIVE") == "ACTIVE")
    revoked_adm_count = sum(1 for a in admissions if a.status in ["REVOKED", "CANCELLED"] or getattr(a, "access_status", "ACTIVE") == "REVOKED")

    valid_adms = [
        a for a in admissions
        if a.status not in ["REVOKED", "CANCELLED"]
        and getattr(a, "document_status", "VALID") != "VOID"
    ]
    total_billed = sum((a.total_payable for a in valid_adms), Decimal("0.00"))
    total_due = sum((a.balance_due for a in valid_adms), Decimal("0.00"))
    expired_due = sum(
        (a.balance_due for a in valid_adms if a.status == "EXPIRED" or (a.valid_to is not None and a.valid_to < today)),
        Decimal("0.00")
    )

    total_paid = (await db.execute(
        select(func.coalesce(func.sum(Payment.amount), Decimal("0.00")))
        .where(Payment.student_id == student_id)
    )).scalar() or Decimal("0.00")

    total_refunded = (await db.execute(
        select(func.coalesce(func.sum(Refund.amount), Decimal("0.00")))
        .where(Refund.student_id == student_id)
    )).scalar() or Decimal("0.00")

    net_paid = total_paid - total_refunded

    # Fetch last payment per item in one query
    item_ids = [itm.id for itm in all_items]
    last_payment_info = {}
    if item_ids:
        pa_stmt = (
            select(PaymentAllocation.admission_item_id, Payment.payment_date, PaymentAllocation.allocated_amount)
            .join(Payment, PaymentAllocation.payment_id == Payment.id)
            .where(
                PaymentAllocation.admission_item_id.in_(item_ids),
                PaymentAllocation.kind == "PAYMENT"
            )
            .order_by(Payment.payment_date.desc(), PaymentAllocation.created_at.desc())
        )
        pa_res = await db.execute(pa_stmt)
        for aid, p_date, p_amt in pa_res.all():
            if aid not in last_payment_info:
                last_payment_info[aid] = (p_date, p_amt)

    # Fetch batch names in one query
    batch_ids = [itm.batch_id for itm in all_items if itm.batch_id]
    batch_names = {}
    if batch_ids:
        b_res = await db.execute(select(Batch.id, Batch.name).where(Batch.id.in_(batch_ids)))
        batch_names = {bid: bname for bid, bname in b_res.all()}

    # Group lines: active, expiring, expired, revoked
    RENEWAL_ALERT_DAYS = 5
    active_lines = []
    expiring_lines = []
    expired_lines = []
    revoked_lines = []

    for itm in all_items:
        last_p_date, last_p_amt = last_payment_info.get(itm.id, (None, None))
        if isinstance(last_p_date, datetime):
            last_p_date = last_p_date.date()
        days_left = (itm.valid_to - today).days if itm.valid_to else None

        if itm.amount_collected >= itm.net_price:
            pay_st = "PAID"
        elif itm.amount_collected > Decimal("0.00"):
            pay_st = "PARTIAL"
        else:
            pay_st = "UNPAID"

        is_line_revoked = (
            itm.access_status == "REVOKED"
            or getattr(itm.admission, "document_status", "VALID") == "VOID"
        )
        is_line_expired = (
            itm.access_status == "EXPIRED"
            or (itm.valid_to is not None and itm.valid_to < today)
        )
        is_line_overdue = is_line_expired and itm.balance_due > Decimal("0.00")

        line_resp = StudentLineResponse(
            id=itm.id,
            admission_id=itm.admission_id,
            slip_number=itm.admission.admission_number,
            subject_id=itm.subject_id,
            subject_name=itm.item_name_snapshot,
            teacher_id=itm.teacher_id,
            teacher_name=itm.teacher_name_snapshot,
            batch_id=itm.batch_id,
            batch_name=batch_names.get(itm.batch_id),
            hall_number=itm.hall_number_snapshot,
            valid_from=itm.valid_from,
            valid_to=itm.valid_to,
            days_left=days_left,
            net_price=itm.net_price,
            amount_collected=itm.amount_collected,
            balance_due=itm.balance_due,
            last_paid_date=last_p_date,
            last_paid_amount=last_p_amt,
            payment_status=pay_st,
            access_status=itm.access_status,
            item_type=itm.item_type,
            is_expired=is_line_expired,
            is_overdue=is_line_overdue
        )

        if is_line_revoked:
            revoked_lines.append(line_resp)
        elif is_line_expired:
            expired_lines.append(line_resp)
        elif days_left is not None and 0 <= days_left <= RENEWAL_ALERT_DAYS:
            expiring_lines.append(line_resp)
            active_lines.append(line_resp)
        else:
            active_lines.append(line_resp)

    # Fetch financial transactions history
    tx_stmt = (
        select(FinancialTransaction)
        .where(FinancialTransaction.student_id == student_id)
        .order_by(FinancialTransaction.txn_at.desc(), FinancialTransaction.created_at.desc())
    )
    txns = list((await db.execute(tx_stmt)).scalars().all())

    res = StudentDetailResponse.model_validate(student)
    if admissions:
        active_adms_list = [a for a in admissions if a.status == "ACTIVE" and getattr(a, "document_status", "VALID") != "VOID"]
        res.latest_admission_number = active_adms_list[0].admission_number if active_adms_list else admissions[0].admission_number
    res.admissions_count = total_adm_count
    res.active_admissions_count = active_adm_count
    res.revoked_admissions_count = revoked_adm_count
    res.total_billed = total_billed
    res.total_paid = total_paid
    res.total_refunded = total_refunded
    res.net_paid = net_paid
    res.total_balance_due = total_due
    res.expired_balance_due = expired_due

    res.active = active_lines
    res.expiring = expiring_lines
    res.expired = expired_lines
    res.revoked = revoked_lines
    res.slips = [AdmissionResponse.model_validate(adm) for adm in admissions]
    res.transactions = [FinancialTransactionResponse.model_validate(tx) for tx in txns]
    return res

@router.get("/{student_id}/audit", response_model=PageResponse[AuditLogResponse])
async def get_student_audit_alias(
    student_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    action: Optional[str] = Query(None),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff)
):
    from app.modules.audit.router import get_student_audit_logs
    return await get_student_audit_logs(
        student_id=student_id,
        page=page,
        page_size=page_size,
        action=action,
        from_date=from_date,
        to_date=to_date,
        search=search,
        db=db,
        current_user=user
    )

@router.post("", response_model=StudentResponse, status_code=status.HTTP_201_CREATED)
async def create_student(
    req: StudentCreate,
    check_duplicate: bool = False,
    db: AsyncSession = Depends(get_db),
    user = Depends(require_cashier_or_admin)
):
    # Normalize and validate mobile number (10 digits numeric)
    norm_mob = normalize_mobile(req.mobile) if req.mobile else None
    if req.mobile:
        if not norm_mob or len(norm_mob) != 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mobile number must be exactly 10 numeric digits"
            )
        req.mobile = norm_mob

    # Check mobile number constraint when requested
    if norm_mob and check_duplicate:
        match_clauses = [
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
                detail=f"Student already registered{adm_text} with mobile {norm_mob}: {existing.name} ({existing.student_code}). Student ID: {existing.id}"
            )

    # Auto-generate unique student code STU<Year><Count:04d>
    year = req.registration_date.year
    count = (await db.execute(select(func.count(Student.id)))).scalar() or 0
    candidate_num = count + 1
    while True:
        candidate_code = f"STU{year}{candidate_num:04d}"
        exists = (await db.execute(select(Student.id).where(Student.student_code == candidate_code).limit(1))).scalar_one_or_none()
        if not exists:
            code = candidate_code
            break
        candidate_num += 1

    new_student = Student(
        student_code=code,
        name=req.name.strip(),
        mobile=norm_mob,
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
    await db.flush()

    audit = AuditLog(
        user_id=user.id,
        action="STUDENT_CREATED",
        entity_type="STUDENT",
        entity_id=new_student.id,
        details=json.dumps({
            "student_id": str(new_student.id),
            "student_code": new_student.student_code,
            "name": new_student.name,
            "mobile": new_student.mobile,
            "father_name": new_student.father_name,
            "email": new_student.email,
            "registration_date": str(new_student.registration_date) if new_student.registration_date else None,
            "status": new_student.status
        })
    )
    db.add(audit)
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
    if req.mobile is not None:
        if req.mobile:
            norm_mob = normalize_mobile(req.mobile)
            if not norm_mob or len(norm_mob) != 10:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Mobile number must be exactly 10 numeric digits"
                )
            student.mobile = norm_mob
        else:
            student.mobile = None
    if req.father_name is not None: student.father_name = req.father_name.strip() if req.father_name else None
    if req.email is not None: student.email = req.email.strip().lower() if req.email else None
    if req.photo_url is not None: student.photo_url = req.photo_url
    if req.address is not None: student.address = req.address
    if req.dob is not None: student.dob = req.dob
    if req.registration_date is not None: student.registration_date = req.registration_date
    if req.status is not None: student.status = req.status
    if req.notes is not None: student.notes = req.notes

    updated_fields = {k: str(v) if v is not None else None for k, v in req.model_dump(exclude_unset=True).items()}
    audit = AuditLog(
        user_id=user.id,
        action="STUDENT_UPDATED",
        entity_type="STUDENT",
        entity_id=student.id,
        details=json.dumps({
            "student_id": str(student.id),
            "student_code": student.student_code,
            "name": student.name,
            "mobile": student.mobile,
            "updated_fields": updated_fields
        })
    )
    db.add(audit)

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

    # Automatically revoke/cancel all active batch purchases of this student
    active_adms_res = await db.execute(
        select(Admission).where(Admission.student_id == student_id, Admission.status == "ACTIVE")
    )
    for adm in active_adms_res.scalars().all():
        adm.status = "REVOKED"
        adm.revocation_reason = f"Student admission revoked: {payload.reason.strip()}"
        adm.revoked_at = datetime.now(timezone.utc)
        adm.revoked_by = user.id
        adm.balance_due = Decimal("0.00")
        if adm.amount_paid <= Decimal("0.00"):
            adm.payment_status = "VOID"

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

    # Automatically restore admissions that were revoked due to student revocation
    revoked_adms_res = await db.execute(
        select(Admission).where(
            Admission.student_id == student_id,
            Admission.status.in_(["REVOKED", "CANCELLED"]),
            Admission.revocation_reason.like("Student admission revoked:%")
        )
    )
    for adm in revoked_adms_res.scalars().all():
        adm.status = "ACTIVE"
        adm.revocation_reason = None
        adm.revoked_at = None
        adm.revoked_by = None
        adm.balance_due = max(Decimal("0.00"), adm.total_payable - adm.amount_paid)
        if adm.balance_due == Decimal("0.00"):
            adm.payment_status = "PAID"
        elif adm.amount_paid > Decimal("0.00"):
            adm.payment_status = "PARTIALLY_PAID"
        else:
            adm.payment_status = "UNPAID"
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

@router.get("/{student_id}/last-fee-period")
@router.get("/{student_id}/last-batch-period")
async def get_student_last_fee_period(
    student_id: uuid.UUID,
    subject_id: Optional[uuid.UUID] = None,
    batch_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    user = Depends(require_staff)
):
    """
    Retrieves the ending date of the student's previous enrolled cycle.
    Provides smart suggested next start date (next day after previous end) and end date (+30 days).
    Admin can override the start date for the next cycle.
    """
    student = (await db.execute(select(Student).where(Student.id == student_id))).scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Search for latest active admission item for this student (excluding Green Card passes)
    stmt = (
        select(AdmissionItem, Admission)
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .where(
            Admission.student_id == student_id,
            Admission.status == "ACTIVE",
            AdmissionItem.item_type != "GREEN_CARD"
        )
    )
    if subject_id:
        stmt = stmt.where(AdmissionItem.subject_id == subject_id)
    elif batch_id:
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


@router.get("/{student_id}/renewals-due", response_model=List[RenewalsDueItemResponse])
async def get_student_renewals_due(
    student_id: uuid.UUID,
    days: int = Query(7, ge=1, description="Number of days ahead to look for expiring subjects"),
    include_overdue: bool = Query(True, description="Include items that expired in the past 30 days"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    student = (await db.execute(select(Student).where(Student.id == student_id))).scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    today = date.today()
    window_end = today + timedelta(days=days)
    gap_limit = getattr(settings, "RENEWAL_GAP_RESET_DAYS", 30)

    conds = [
        AdmissionItem.student_id == student_id,
        AdmissionItem.item_type == "BATCH_SUBJECT",
        AdmissionItem.status != "DISCONTINUED",
        Admission.document_status == "VALID",
        Admission.status != "CANCELLED",
        AdmissionItem.valid_to != None,
        AdmissionItem.valid_to <= window_end
    ]
    if include_overdue:
        conds.append(AdmissionItem.valid_to >= today - timedelta(days=gap_limit))
    else:
        conds.append(AdmissionItem.valid_to >= today)

    stmt = (
        select(AdmissionItem, Admission, Student, Batch)
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .join(Student, Admission.student_id == Student.id)
        .outerjoin(Batch, AdmissionItem.batch_id == Batch.id)
        .where(and_(*conds))
        .order_by(AdmissionItem.valid_to.asc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    item_ids = [itm.id for itm, adm, stu, bch in rows]
    renewed_ids = set()
    if item_ids:
        r_stmt = (
            select(AdmissionItem.renewed_from_item_id)
            .where(
                AdmissionItem.renewed_from_item_id.in_(item_ids),
                AdmissionItem.status != "DISCONTINUED"
            )
        )
        r_res = await db.execute(r_stmt)
        renewed_ids = set(r_res.scalars().all())

    results = []
    for itm, adm, stu, bch in rows:
        d_remaining = (itm.valid_to - today).days if itm.valid_to else 0
        results.append(
            RenewalsDueItemResponse(
                item_id=itm.id,
                admission_id=adm.id,
                admission_number=adm.admission_number,
                student_id=stu.id,
                student_name=stu.full_name,
                student_mobile=stu.mobile,
                student_code=stu.student_code,
                subject_id=itm.subject_id,
                subject_name=itm.item_name_snapshot,
                batch_id=itm.batch_id,
                batch_name=bch.name if bch else itm.item_name_snapshot,
                teacher_id=itm.teacher_id,
                teacher_name=itm.teacher_name_snapshot,
                hall_number=itm.hall_number_snapshot,
                valid_from=itm.valid_from,
                valid_to=itm.valid_to,
                days_remaining=d_remaining,
                balance_due=itm.balance_due,
                net_price=itm.net_price,
                amount_collected=itm.amount_collected,
                payment_status=adm.payment_status,
                status=itm.status,
                renewed=(itm.id in renewed_ids)
            )
        )
    return results


@router.get("/{student_id}/active-enrollment")
async def get_student_active_enrollment(
    student_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user = Depends(require_staff)
):
    student = (await db.execute(select(Student).where(Student.id == student_id))).scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Fetch all admission items with parent admissions
    stmt = (
        select(AdmissionItem, Admission)
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .where(Admission.student_id == student_id)
        .order_by(desc(func.coalesce(AdmissionItem.valid_to, Admission.valid_to)), desc(Admission.admission_date))
    )
    rows = (await db.execute(stmt)).all()

    today = date.today()
    active_green_card = None
    active_subjects_dict = {}  # subj_key -> list of (item, adm, item_dict)
    historical_subjects = []
    historical_memberships = []

    active_fee_total = Decimal("0.00")
    active_paid_total = Decimal("0.00")
    active_due_total = Decimal("0.00")

    for item, adm in rows:
        # Determine active status: parent admission and item must both be ACTIVE, and valid_to must cover today or future
        is_active = (
            adm.status == "ACTIVE" and
            item.status == "ACTIVE" and
            (item.valid_to is None or item.valid_to >= today)
        )

        days_remaining = None
        if item.valid_to:
            days_remaining = (item.valid_to - today).days

        # Clean subject name: strip any legacy "[Renewal] " prefix from display
        raw_name = item.item_name_snapshot or ""
        if raw_name.startswith("[Renewal] "):
            raw_name = raw_name[len("[Renewal] "):]

        is_item_expired = (days_remaining is not None and days_remaining < 0) or item.status == "EXPIRED" or adm.status == "EXPIRED"
        is_item_overdue = is_item_expired and item.balance_due > Decimal("0.00")

        item_dict = {
            "id": str(item.id),
            "admission_id": str(adm.id),
            "admission_number": adm.admission_number,
            "subject_id": str(item.subject_id) if item.subject_id else None,
            "subject_name": raw_name,
            "item_type": item.item_type,
            "teacher_id": str(item.teacher_id) if item.teacher_id else None,
            "teacher_name": item.teacher_name_snapshot,
            "hall_number": item.hall_number_snapshot,
            "valid_from": item.valid_from.isoformat() if item.valid_from else (adm.valid_from.isoformat() if adm.valid_from else None),
            "valid_to": item.valid_to.isoformat() if item.valid_to else (adm.valid_to.isoformat() if adm.valid_to else None),
            "original_price": float(item.original_price),
            "net_price": float(item.net_price),
            "amount_collected": float(item.amount_collected),
            "balance_due": float(item.balance_due),
            "status": "EXPIRED" if is_item_expired and item.status not in ["REVOKED", "CANCELLED", "SUSPENDED", "DISCONTINUED"] else (item.status if adm.status == "ACTIVE" else adm.status),
            "days_remaining": days_remaining,
            "is_expiring_soon": days_remaining is not None and 0 <= days_remaining <= 7,
            "is_expired": is_item_expired,
            "is_overdue": is_item_overdue,
            "lifecycle_reason": item.lifecycle_reason or adm.revocation_reason,
            "can_cancel": item.can_cancel
        }

        if item.item_type == "GREEN_CARD":
            if is_active and not active_green_card:
                active_green_card = item_dict
            else:
                historical_memberships.append(item_dict)
        else:
            if is_active:
                clean_base_key = raw_name.split(" (")[0].strip().lower()
                subj_key = str(item.subject_id) if item.subject_id else clean_base_key
                if subj_key not in active_subjects_dict:
                    active_subjects_dict[subj_key] = []
                active_subjects_dict[subj_key].append((item, adm, item_dict))
            else:
                hist_item = dict(item_dict)
                if hist_item["status"] in ["ACTIVE", "UPCOMING"] and ((item.valid_to and item.valid_to < today) or is_item_expired):
                    hist_item["status"] = "EXPIRED"
                hist_item["is_expired"] = is_item_expired
                hist_item["is_overdue"] = is_item_overdue
                historical_subjects.append(hist_item)

    # Consolidate chained active cycles for each subject (e.g. Month 1 + Month 2 renewal)
    active_subjects = []
    for subj_key, cycle_list in active_subjects_dict.items():
        # Sort cycles chronologically by valid_from
        cycle_list.sort(key=lambda x: (x[0].valid_from or x[1].valid_from or x[1].admission_date or date.min))

        valid_froms = [x[0].valid_from or x[1].valid_from for x in cycle_list if (x[0].valid_from or x[1].valid_from)]
        earliest_start = min(valid_froms) if valid_froms else (cycle_list[0][0].valid_from or cycle_list[0][1].admission_date)

        valid_tos = [x[0].valid_to or x[1].valid_to for x in cycle_list if (x[0].valid_to or x[1].valid_to)]
        latest_end = max(valid_tos) if valid_tos else None

        # Most recent cycle provides assigned teacher, hall, and admission reference
        latest_item, latest_adm, latest_dict = cycle_list[-1]

        total_original = sum(Decimal(str(x[0].original_price)) for x in cycle_list)
        total_net = sum(Decimal(str(x[0].net_price)) for x in cycle_list)
        total_paid = sum(Decimal(str(x[0].amount_collected)) for x in cycle_list)
        total_due = sum(Decimal(str(x[0].balance_due)) for x in cycle_list)

        days_remaining = None
        if latest_end:
            days_remaining = (latest_end - today).days

        consolidated = {
            "id": latest_dict["id"],
            "admission_id": latest_dict["admission_id"],
            "admission_number": latest_dict["admission_number"],
            "subject_id": latest_dict["subject_id"],
            "subject_name": latest_dict["subject_name"],
            "item_type": latest_dict["item_type"],
            "teacher_id": latest_dict["teacher_id"],
            "teacher_name": latest_dict["teacher_name"],
            "hall_number": latest_dict["hall_number"],
            "valid_from": earliest_start.isoformat() if earliest_start else latest_dict["valid_from"],
            "valid_to": latest_end.isoformat() if latest_end else latest_dict["valid_to"],
            "original_price": float(total_original),
            "net_price": float(total_net),
            "amount_collected": float(total_paid),
            "balance_due": float(total_due),
            "status": "ACTIVE",
            "days_remaining": days_remaining,
            "is_expiring_soon": days_remaining is not None and 0 <= days_remaining <= 7,
            "is_expired": False,
            "is_overdue": False,
            "is_renewed": len(cycle_list) > 1,
            "cycle_count": len(cycle_list),
            "lifecycle_reason": latest_dict["lifecycle_reason"]
        }

        active_subjects.append(consolidated)
        active_fee_total += total_net
        active_paid_total += total_paid
        active_due_total += total_due

    expired_due_total = sum(
        Decimal(str(h.get("balance_due", 0)))
        for h in historical_subjects
        if h.get("status") not in ["CANCELLED", "REVOKED"] and Decimal(str(h.get("balance_due", 0))) > Decimal("0.00")
    )
    if historical_memberships:
        expired_due_total += sum(
            Decimal(str(h.get("balance_due", 0)))
            for h in historical_memberships
            if h.get("status") not in ["CANCELLED", "REVOKED"] and Decimal(str(h.get("balance_due", 0))) > Decimal("0.00")
        )
    total_due_all = active_due_total + expired_due_total

    # Permanent enrollment code (stable)
    enrollment_number = f"ENR-{student.student_code}" if student.student_code else f"ENR-{student.id.hex[:8]}"

    return {
        "student_id": str(student.id),
        "student_code": student.student_code,
        "enrollment_number": enrollment_number,
        "student_name": student.name,
        "has_active_green_card": active_green_card is not None or student.has_green_card,
        "active_green_card": active_green_card,
        "is_student_active": len(active_subjects) > 0 or active_green_card is not None,
        "active_subjects": active_subjects,
        "historical_subjects": historical_subjects,
        "historical_memberships": historical_memberships,
        "expired_due_total": float(expired_due_total),
        "total_due": float(total_due_all),
        "active_totals": {
            "total_fee": float(active_fee_total),
            "total_paid": float(active_paid_total),
            "total_due": float(active_due_total),
            "expired_due": float(expired_due_total),
            "total_due": float(total_due_all),
            "total_outstanding_due": float(total_due_all)
        }
    }

