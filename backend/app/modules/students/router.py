from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, desc
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload, joinedload
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
from app.database.models import Teacher, Subject, Enquiry, EnquiryDemoItem
from app.modules.admissions.models import Admission, AdmissionItem
from app.modules.payments.models import Payment, Refund, PaymentAllocation, FinancialTransaction
from app.modules.batches.models import Batch
from app.modules.audit.models import AuditLog
from app.modules.audit.schemas import AuditLogResponse
from app.modules.students.schemas import (
    StudentCreate, StudentUpdate, StudentRevokeRequest,
    StudentResponse, StudentDetailResponse, StudentLineResponse,
    StudentDemoItemResponse, StudentDemoLinkedCourse, StudentDemoCreate
)
from app.modules.enquiries.schemas import EnquiryResponse, EnquiryDemoItemCreate
from app.modules.enquiries.router import create_enquiry_with_demos
from app.modules.admissions.schemas import AdmissionResponse, RenewalsDueItemResponse
from app.modules.payments.schemas import FinancialTransactionResponse
from app.common.active_lines import today_kolkata, is_active_line, derive_student_status, compute_days_remaining
from app.core.dependencies import require_cashier_or_admin, require_staff, require_admin
from app.common.pagination import PageResponse
from app.modules.verification.router import _get_active_demos_for_student
from app.modules.verification.schemas import IDCardDemoItem
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


async def _find_student_by_mobile(
    db: AsyncSession,
    norm_mob: str,
    exclude_student_id: Optional[uuid.UUID] = None
) -> Optional[Student]:
    """
    Find the single registered student matching a normalized 10-digit mobile number.
    """
    clauses = [
        Student.mobile == norm_mob,
        Student.mobile == f"0{norm_mob}",
        Student.mobile == f"+91{norm_mob}",
    ]
    try:
        clauses.append(func.right(func.regexp_replace(Student.mobile, r'[^0-9]', '', 'g'), 10) == norm_mob)
    except Exception:
        pass

    stmt = select(Student).where(Student.mobile.isnot(None), or_(*clauses))
    if exclude_student_id is not None:
        stmt = stmt.where(Student.id != exclude_student_id)
    stmt = stmt.order_by(Student.registration_date.asc(), Student.created_at.asc()).limit(1)
    return (await db.execute(stmt)).scalars().first()

@router.get("", response_model=PageResponse[StudentResponse])
async def list_students(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
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
                AdmissionItem.status.notin_(["REVOKED", "CANCELLED", "DISCONTINUED"]),
                Admission.document_status == "VALID",
                Admission.status.notin_(["REVOKED", "CANCELLED"]),
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
            cond = Student.status == "REVOKED"
            query = query.where(cond)
            count_query = count_query.where(cond)
        else:
            query = query.where(Student.status == status)
            count_query = count_query.where(Student.status == status)

    if user.role == "TEACHER":
        t_stmt = select(Teacher).where(Teacher.user_id == user.id)
        t_rec = (await db.execute(t_stmt)).scalar_one_or_none()
        if not t_rec:
            t_stmt2 = select(Teacher).where(or_(Teacher.email == user.email, Teacher.name == user.full_name))
            t_rec = (await db.execute(t_stmt2)).scalar_one_or_none()
        teacher_id = t_rec.id if t_rec else None
        if teacher_id:
            sub_ids_stmt = select(Subject.id).where(Subject.teacher_id == teacher_id)
            teacher_sub_ids = (await db.execute(sub_ids_stmt)).scalars().all()
            if teacher_sub_ids:
                teacher_students_stmt = (
                    select(Admission.student_id)
                    .join(AdmissionItem, AdmissionItem.admission_id == Admission.id)
                    .where(
                        AdmissionItem.subject_id.in_(teacher_sub_ids),
                        Admission.status.not_in(["REVOKED", "CANCELLED"])
                    )
                )
                query = query.where(Student.id.in_(teacher_students_stmt))
                count_query = count_query.where(Student.id.in_(teacher_students_stmt))

    total = (await db.execute(count_query)).scalar() or 0
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    query = query.order_by(Student.registration_date.desc(), Student.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = (await db.execute(query)).scalars().all()

    # Map latest admission number for display in student search dropdown
    student_ids = [s.id for s in items]
    adm_map = {}
    if student_ids:
        # Prioritize active, non-void admissions (consistent with get_student)
        adm_stmt_active = (
            select(Admission.student_id, Admission.admission_number)
            .where(
                Admission.student_id.in_(student_ids),
                Admission.status == "ACTIVE",
                Admission.document_status != "VOID"
            )
            .order_by(Admission.admission_date.desc(), Admission.created_at.desc())
        )
        adm_res_active = await db.execute(adm_stmt_active)
        for s_id, adm_no in adm_res_active.all():
            if s_id not in adm_map:
                adm_map[s_id] = adm_no

        # For students without an active valid admission, fallback to latest admission
        remaining_ids = [s_id for s_id in student_ids if s_id not in adm_map]
        if remaining_ids:
            adm_stmt_fallback = (
                select(Admission.student_id, Admission.admission_number)
                .where(Admission.student_id.in_(remaining_ids))
                .order_by(Admission.admission_date.desc(), Admission.created_at.desc())
            )
            adm_res_fallback = await db.execute(adm_stmt_fallback)
            for s_id, adm_no in adm_res_fallback.all():
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

    student = await _find_student_by_mobile(db, norm)

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

    # Load all admissions with their items and payment history
    adms_stmt = (
        select(Admission)
        .options(
            selectinload(Admission.items).selectinload(AdmissionItem.demo_item),
            selectinload(Admission.payments),
        )
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
    revoked_adm_count = sum(
        1 for a in admissions
        if a.status in ["REVOKED", "CANCELLED", "DISCONTINUED"]
        or getattr(a, "access_status", "ACTIVE") in ["REVOKED", "CANCELLED", "DISCONTINUED"]
    )

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

    # Fetch batch names and subject schedules in one query
    batch_ids = [itm.batch_id for itm in all_items if itm.batch_id]
    batch_names = {}
    if batch_ids:
        b_res = await db.execute(select(Batch.id, Batch.name).where(Batch.id.in_(batch_ids)))
        batch_names = {bid: bname for bid, bname in b_res.all()}

    subject_ids = [itm.subject_id for itm in all_items if itm.subject_id]
    subject_schedules = {}
    subjects_map = {}
    if subject_ids:
        s_res = await db.execute(
            select(Subject)
            .options(joinedload(Subject.teacher))
            .where(Subject.id.in_(subject_ids))
        )
        for s in s_res.scalars().all():
            subjects_map[s.id] = s
            subject_schedules[s.id] = s.schedule

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
        days_left = compute_days_remaining(
            itm.valid_to,
            itm.valid_from or (itm.admission.valid_from if itm.admission else None),
            today,
        )

        if itm.amount_collected >= itm.net_price:
            pay_st = "PAID"
        elif itm.amount_collected > Decimal("0.00"):
            pay_st = "PARTIAL"
        else:
            pay_st = "UNPAID"

        is_line_revoked = (
            itm.access_status in ("REVOKED", "CANCELLED", "DISCONTINUED")
            or getattr(itm, "status", "ACTIVE") in ("REVOKED", "CANCELLED", "DISCONTINUED")
            or getattr(itm.admission, "status", "ACTIVE") in ("REVOKED", "CANCELLED", "DISCONTINUED")
            or getattr(itm.admission, "document_status", "VALID") == "VOID"
        )
        if is_line_revoked:
            days_left = None
            is_line_expired = False
            is_line_overdue = False
        else:
            is_line_expired = (
                itm.access_status == "EXPIRED"
                or (itm.valid_to is not None and itm.valid_to < today)
            )
            is_line_overdue = is_line_expired and itm.balance_due > Decimal("0.00")

        sub = subjects_map.get(itm.subject_id)
        hall_num = (sub.hall_number if sub and sub.hall_number else itm.hall_number_snapshot)
        class_sched = (sub.schedule if sub and sub.schedule else (itm.schedule or subject_schedules.get(itm.subject_id)))
        teach_name = (sub.teacher_name if sub and sub.teacher_name else itm.teacher_name_snapshot)

        line_resp = StudentLineResponse(
            id=itm.id,
            admission_id=itm.admission_id,
            slip_number=itm.admission.admission_number,
            subject_id=itm.subject_id,
            subject_name=itm.item_name_snapshot,
            teacher_id=itm.teacher_id,
            teacher_name=teach_name,
            batch_id=itm.batch_id,
            batch_name=batch_names.get(itm.batch_id),
            hall_number=hall_num,
            schedule=class_sched,
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
            is_overdue=is_line_overdue,
            source_demo_number=itm.source_demo_number
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
    res.demos = await _get_demos_for_student(db, student)
    return res

async def _get_demos_for_student(db: AsyncSession, student: Student) -> List[StudentDemoItemResponse]:
    cond = (Enquiry.converted_student_id == student.id)
    norm_mob = normalize_mobile(student.mobile) if student.mobile else None
    if norm_mob and len(norm_mob) >= 10:
        last10 = norm_mob[-10:]
        cond = or_(
            Enquiry.converted_student_id == student.id,
            and_(Enquiry.converted_student_id.is_(None), Enquiry.mobile.like(f"%{last10}%"))
        )

    q = (
        select(EnquiryDemoItem, Enquiry)
        .join(Enquiry, EnquiryDemoItem.enquiry_id == Enquiry.id)
        .options(
            selectinload(EnquiryDemoItem.admission_item).selectinload(AdmissionItem.admission)
        )
        .where(cond)
        .order_by(desc(EnquiryDemoItem.demo_start_date), desc(EnquiryDemoItem.created_at))
    )
    rows = (await db.execute(q)).all()

    demos = []
    for ditm, enq in rows:
        linked = None
        if ditm.converted_admission_item_id and ditm.admission_item:
            adm_no = ditm.admission_item.admission.admission_number if ditm.admission_item.admission else "ADM-UNKNOWN"
            linked = StudentDemoLinkedCourse(
                admission_item_id=ditm.admission_item.id,
                admission_id=ditm.admission_item.admission_id,
                subject=ditm.admission_item.item_name_snapshot,
                admission_number=adm_no
            )
        demos.append(StudentDemoItemResponse(
            id=ditm.id,
            demo_reference_number=ditm.demo_reference_number,
            subject_id=ditm.subject_id,
            subject_name=ditm.subject_name_snapshot,
            teacher_id=ditm.teacher_id,
            teacher_name=ditm.teacher_name_snapshot,
            hall=ditm.hall_number_snapshot,
            demo_start_date=ditm.demo_start_date,
            demo_end_date=ditm.demo_end_date,
            demo_duration_days=ditm.demo_duration_days,
            status=ditm.status,
            notes=ditm.notes,
            drop_reason=ditm.drop_reason,
            enquiry_id=enq.id,
            enquiry_code=enq.enquiry_code,
            converted_admission_item_id=ditm.converted_admission_item_id,
            linked_course=linked
        ))
    return demos

@router.get("/{student_id}/demos", response_model=List[StudentDemoItemResponse])
async def get_student_demos(
    student_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user = Depends(require_staff)
):
    student = (await db.execute(select(Student).where(Student.id == student_id))).scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return await _get_demos_for_student(db, student)


@router.post("/{student_id}/demos", response_model=EnquiryResponse, status_code=status.HTTP_201_CREATED)
async def create_student_demo(
    student_id: uuid.UUID,
    payload: StudentDemoCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_cashier_or_admin)
):
    """
    Give a trial demo directly from an already-registered student profile.
    Enforces Admin/Cashier role (teachers remain read-only).
    Creates a linked Enquiry + EnquiryDemoItem(s) with DEM-YYYY-NNNN reference numbers
    so they appear in both the student profile demos list and the Demo Register.
    """
    student = (await db.execute(select(Student).where(Student.id == student_id))).scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    if student.status == "REVOKED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot give a demo to a revoked student"
        )

    demo_items = list(payload.demo_items or [])
    if not demo_items:
        if not (payload.subject_id or payload.subject_name or payload.subject_name_snapshot):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Subject is required to give a demo"
            )
        demo_items = [
            EnquiryDemoItemCreate(
                subject_id=payload.subject_id,
                batch_id=payload.batch_id,
                teacher_id=payload.teacher_id,
                subject_name=payload.subject_name,
                subject_name_snapshot=payload.subject_name_snapshot,
                teacher_name_snapshot=payload.teacher_name_snapshot,
                hall_number_snapshot=payload.hall_number_snapshot or payload.hall,
                demo_start_date=payload.demo_start_date,
                demo_end_date=payload.demo_end_date,
                demo_duration_days=payload.demo_duration_days,
                notes=payload.notes,
            )
        ]

    first_item = demo_items[0]
    return await create_enquiry_with_demos(
        db=db,
        current_user=user,
        linked_student=student,
        student_name=student.name,
        mobile=student.mobile,
        father_name=student.father_name,
        purpose=payload.purpose or "Trial Demo",
        source="Student Profile",
        demo_start_date=first_item.demo_start_date or payload.demo_start_date or date.today(),
        demo_duration_days=first_item.demo_duration_days or payload.demo_duration_days or 3,
        notes=payload.notes,
        enquiry_status="ACTIVE_DEMO",
        demo_items=demo_items,
        is_demo_request=True,
        audit_action="STUDENT_DEMO_CREATED",
    )

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

    # Enforce unique phone number (normalised to last 10 digits)
    if norm_mob:
        existing = await _find_student_by_mobile(db, norm_mob)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This phone number is already registered"
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
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This phone number is already registered"
        )

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
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This phone number is already registered"
        )
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
            existing = await _find_student_by_mobile(db, norm_mob, exclude_student_id=student.id)
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This phone number is already registered"
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

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This phone number is already registered"
        )
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

    # Automatically revoke/cancel all active batch purchases and active enrollments of this student
    stmt = (
        select(Admission)
        .options(selectinload(Admission.items).selectinload(AdmissionItem.demo_item))
        .where(Admission.student_id == student_id)
    )
    student_adms_res = await db.execute(stmt)
    student_admissions = student_adms_res.scalars().all()

    now_utc = datetime.now(timezone.utc)
    revoke_reason_text = f"Student admission revoked: {payload.reason.strip()}"

    for adm in student_admissions:
        is_adm_active = (
            adm.status == "ACTIVE"
            and getattr(adm, "access_status", "ACTIVE") != "REVOKED"
            and getattr(adm, "document_status", "VALID") != "VOID"
        )
        if is_adm_active:
            adm.previous_status = adm.status
            adm.previous_access_status = getattr(adm, "access_status", "ACTIVE")
            adm.status = "REVOKED"
            adm.access_status = "REVOKED"
            adm.revoke_type = "STUDENT_REVOKE"
            adm.revocation_reason = revoke_reason_text
            adm.revoked_at = now_utc
            adm.revoked_by = user.id
            # Preserve balance_due and payment_status to keep financial history accurate

        for itm in adm.items:
            is_item_active = (
                itm.status not in ("DISCONTINUED", "COMPLETED", "CANCELLED", "REVOKED")
                and getattr(itm, "access_status", "ACTIVE") != "REVOKED"
            )
            if is_item_active:
                itm.previous_status = itm.status
                itm.previous_access_status = getattr(itm, "access_status", "ACTIVE")
                itm.status = "DISCONTINUED"
                itm.access_status = "REVOKED"
                itm.revoke_type = "STUDENT_REVOKE"
                itm.lifecycle_reason = revoke_reason_text
                itm.discontinued_at = now_utc
                # Preserve valid_from, valid_to, and balance_due

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

    # Load all admissions with items
    stmt = (
        select(Admission)
        .options(selectinload(Admission.items).selectinload(AdmissionItem.demo_item))
        .where(Admission.student_id == student_id)
    )
    student_adms_res = await db.execute(stmt)
    student_admissions = student_adms_res.scalars().all()

    for adm in student_admissions:
        is_adm_revoked_by_revoke = (
            adm.revoke_type == "STUDENT_REVOKE"
            or (adm.revocation_reason and adm.revocation_reason.startswith("Student admission revoked:"))
        )

        has_restored_item = False
        for itm in adm.items:
            was_item_cancelled_by_revoke = (
                itm.revoke_type == "STUDENT_REVOKE"
                or (itm.lifecycle_reason and itm.lifecycle_reason.startswith("Student admission revoked:"))
                or (
                    is_adm_revoked_by_revoke
                    and itm.revoke_type in (None, "STUDENT_REVOKE")
                    and (
                        not itm.lifecycle_reason
                        or itm.lifecycle_reason.startswith("Student admission revoked:")
                        or (old_reason and itm.lifecycle_reason == old_reason)
                    )
                )
            )
            if was_item_cancelled_by_revoke:
                itm.status = itm.previous_status or "ACTIVE"
                itm.access_status = getattr(itm, "previous_access_status", None) or "ACTIVE"
                itm.previous_status = None
                itm.previous_access_status = None
                itm.revoke_type = None
                itm.lifecycle_reason = None
                itm.discontinued_at = None
                itm.balance_due = max(Decimal("0.00"), itm.net_price - itm.amount_collected)
                if adm.valid_to and (itm.valid_to is None or itm.valid_to < adm.valid_to):
                    itm.valid_to = adm.valid_to
                has_restored_item = True

        if is_adm_revoked_by_revoke or has_restored_item:
            has_active_items = any(
                i.status not in ("DISCONTINUED", "COMPLETED", "CANCELLED", "REVOKED")
                and getattr(i, "access_status", "ACTIVE") != "REVOKED"
                for i in adm.items
            )
            if has_active_items or not adm.items:
                adm.status = adm.previous_status or "ACTIVE"
                adm.access_status = getattr(adm, "previous_access_status", None) or "ACTIVE"
            adm.previous_status = None
            adm.previous_access_status = None
            adm.revoke_type = None
            adm.revocation_reason = None
            adm.revoked_at = None
            adm.revoked_by = None
            if getattr(adm, "document_status", "VALID") == "VOID":
                adm.document_status = "VALID"
            adm.balance_due = max(Decimal("0.00"), adm.total_payable - adm.amount_paid)
            if adm.balance_due == Decimal("0.00"):
                adm.payment_status = "PAID"
            elif adm.amount_paid > Decimal("0.00"):
                adm.payment_status = "PARTIALLY_PAID"
            else:
                adm.payment_status = "UNPAID"

    # Restore Green Card status if applicable
    from app.modules.ledger.service import update_student_green_card_status
    await update_student_green_card_status(student.id, db)

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
    user = Depends(require_cashier_or_admin)
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
            Admission.document_status == "VALID",
            AdmissionItem.status.notin_(["DISCONTINUED", "REVOKED", "CANCELLED"]),
            AdmissionItem.access_status.notin_(["DISCONTINUED", "REVOKED", "CANCELLED"]),
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
    current_user: User = Depends(require_cashier_or_admin)
):
    student = (await db.execute(select(Student).where(Student.id == student_id))).scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    today = today_kolkata()
    window_end = today + timedelta(days=days)
    gap_limit = getattr(settings, "RENEWAL_GAP_RESET_DAYS", 30)

    conds = [
        AdmissionItem.student_id == student_id,
        AdmissionItem.item_type == "BATCH_SUBJECT",
        AdmissionItem.status.notin_(["DISCONTINUED", "REVOKED", "CANCELLED"]),
        AdmissionItem.access_status.notin_(["REVOKED", "CANCELLED", "DISCONTINUED"]),
        Admission.document_status == "VALID",
        Admission.status.notin_(["CANCELLED", "REVOKED", "DISCONTINUED"]),
        Admission.access_status.notin_(["REVOKED", "CANCELLED", "DISCONTINUED"]),
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
                AdmissionItem.status.notin_(["DISCONTINUED", "REVOKED", "CANCELLED"])
            )
        )
        r_res = await db.execute(r_stmt)
        renewed_ids = set(r_res.scalars().all())

    results = []
    for itm, adm, stu, bch in rows:
        d_remaining = compute_days_remaining(itm.valid_to, itm.valid_from or adm.valid_from, today) or 0
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
        .options(selectinload(AdmissionItem.demo_item))
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .where(Admission.student_id == student_id)
        .order_by(desc(func.coalesce(AdmissionItem.valid_to, Admission.valid_to)), desc(Admission.admission_date))
    )
    rows = (await db.execute(stmt)).all()

    today = today_kolkata()
    active_green_card = None
    active_subjects_dict = {}  # subj_key -> list of (item, adm, item_dict)
    historical_subjects = []
    historical_memberships = []

    active_fee_total = Decimal("0.00")
    active_paid_total = Decimal("0.00")
    active_due_total = Decimal("0.00")

    # Preload Subject models with assigned teachers
    subject_ids = [item.subject_id for item, _ in rows if item.subject_id]
    subjects_map = {}
    if subject_ids:
        s_res = await db.execute(
            select(Subject)
            .options(joinedload(Subject.teacher))
            .where(Subject.id.in_(subject_ids))
        )
        subjects_map = {s.id: s for s in s_res.scalars().all()}

    subjects_by_name = {s.name.lower().strip(): s for s in subjects_map.values()}
    all_raw_names = list({(item.item_name_snapshot or "").replace("[Renewal] ", "").strip().lower() for item, _ in rows if item.item_name_snapshot})
    missing_names = [name for name in all_raw_names if name and name not in subjects_by_name]
    if missing_names:
        sn_res = await db.execute(
            select(Subject)
            .options(joinedload(Subject.teacher))
            .where(func.lower(Subject.name).in_(missing_names))
        )
        for s in sn_res.scalars().all():
            subjects_by_name[s.name.lower().strip()] = s

    for item, adm in rows:
        is_cancelled = (
            adm.status in ["REVOKED", "CANCELLED"] or
            getattr(adm, "access_status", "ACTIVE") in ["REVOKED", "CANCELLED"] or
            getattr(adm, "document_status", "VALID") == "VOID" or
            item.status in ["REVOKED", "CANCELLED"]
        )
        is_discontinued = (
            adm.status == "DISCONTINUED" or
            getattr(adm, "access_status", "ACTIVE") == "DISCONTINUED" or
            item.status == "DISCONTINUED" or
            getattr(item, "access_status", "ACTIVE") == "DISCONTINUED"
        )
        is_inactive_or_cancelled = is_cancelled or is_discontinued or getattr(item, "access_status", "ACTIVE") in ["REVOKED", "CANCELLED"]

        eff_from = item.valid_from or adm.valid_from
        eff_to = item.valid_to or adm.valid_to

        # Determine active status: parent admission and item must both be ACTIVE, and valid_to must cover today or future
        is_active = (
            not is_inactive_or_cancelled and
            adm.status == "ACTIVE" and
            getattr(adm, "access_status", "ACTIVE") == "ACTIVE" and
            item.status == "ACTIVE" and
            getattr(item, "access_status", "ACTIVE") == "ACTIVE" and
            (eff_to is None or eff_to >= today)
        )

        days_remaining = None
        if not is_inactive_or_cancelled and eff_to:
            days_remaining = compute_days_remaining(eff_to, eff_from, today)

        # Clean subject name: strip any legacy "[Renewal] " prefix from display
        raw_name = item.item_name_snapshot or ""
        if raw_name.startswith("[Renewal] "):
            raw_name = raw_name[len("[Renewal] "):]

        if is_cancelled:
            item_status = "CANCELLED"
            is_item_expired = False
            is_item_overdue = False
            can_cancel = False
        elif is_discontinued:
            item_status = "DISCONTINUED"
            is_item_expired = False
            is_item_overdue = False
            can_cancel = False
        elif item.status == "SUSPENDED":
            item_status = "SUSPENDED"
            is_item_expired = False
            is_item_overdue = False
            can_cancel = False
        else:
            is_item_expired = (eff_to is not None and eff_to < today) or item.status == "EXPIRED" or adm.status == "EXPIRED"
            is_item_overdue = is_item_expired and item.balance_due > Decimal("0.00")
            item_status = "EXPIRED" if is_item_expired and item.status not in ["REVOKED", "CANCELLED", "SUSPENDED", "DISCONTINUED"] else (item.status if adm.status == "ACTIVE" else adm.status)
            can_cancel = item.can_cancel

        sub = subjects_map.get(item.subject_id) or (subjects_by_name.get(raw_name.lower().strip()) if raw_name else None)
        hall_num = (sub.hall_number if sub and sub.hall_number else item.hall_number_snapshot)
        class_sched = (sub.schedule if sub and sub.schedule else (item.schedule if hasattr(item, "schedule") else None))
        teach_name = (sub.teacher_name if sub and sub.teacher_name else item.teacher_name_snapshot)
        teach_id = str(sub.teacher_id) if (sub and sub.teacher_id) else (str(item.teacher_id) if item.teacher_id else None)

        item_dict = {
            "id": str(item.id),
            "admission_id": str(adm.id),
            "admission_number": adm.admission_number,
            "subject_id": str(item.subject_id) if item.subject_id else None,
            "subject_name": raw_name,
            "item_type": item.item_type,
            "teacher_id": teach_id,
            "teacher_name": teach_name,
            "hall_number": hall_num,
            "schedule": class_sched,
            "timing": class_sched,
            "valid_from": item.valid_from.isoformat() if item.valid_from else (adm.valid_from.isoformat() if adm.valid_from else None),
            "valid_to": item.valid_to.isoformat() if item.valid_to else (adm.valid_to.isoformat() if adm.valid_to else None),
            "original_price": float(item.original_price),
            "net_price": float(item.net_price),
            "amount_collected": float(item.amount_collected),
            "balance_due": float(item.balance_due),
            "status": item_status,
            "days_remaining": days_remaining,
            "is_expiring_soon": days_remaining is not None and 0 <= days_remaining <= 7,
            "is_expired": is_item_expired,
            "is_overdue": is_item_overdue,
            "lifecycle_reason": item.lifecycle_reason or adm.revocation_reason,
            "can_cancel": can_cancel,
            "source_demo_number": item.source_demo_number
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
                if is_cancelled:
                    hist_item["status"] = "CANCELLED"
                    hist_item["days_remaining"] = None
                    hist_item["is_expiring_soon"] = False
                    hist_item["is_expired"] = False
                    hist_item["is_overdue"] = False
                elif is_discontinued:
                    hist_item["status"] = "DISCONTINUED"
                    hist_item["days_remaining"] = None
                    hist_item["is_expiring_soon"] = False
                    hist_item["is_expired"] = False
                    hist_item["is_overdue"] = False
                elif hist_item["status"] in ["ACTIVE", "UPCOMING"] and ((item.valid_to and item.valid_to < today) or is_item_expired):
                    hist_item["status"] = "EXPIRED"
                hist_item["is_expired"] = False if is_inactive_or_cancelled else is_item_expired
                hist_item["is_overdue"] = False if is_inactive_or_cancelled else is_item_overdue
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
            days_remaining = compute_days_remaining(latest_end, earliest_start, today)

        source_demo_no = next(
            (x[0].source_demo_number for x in cycle_list if x[0].source_demo_number),
            None
        )

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
            "schedule": latest_dict.get("schedule"),
            "timing": latest_dict.get("timing"),
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
            "is_renewed": len(cycle_list) > 1 or bool(getattr(latest_item, "renewed_from_item_id", None) or (getattr(latest_item, "renewal_count", 0) or 0) > 0),
            "cycle_count": max(len(cycle_list), (getattr(latest_item, "renewal_count", 0) or 0) + 1),
            "lifecycle_reason": latest_dict["lifecycle_reason"],
            "source_demo_number": source_demo_no
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

    active_demos = await _get_active_demos_for_student(db, student, today)

    return {
        "student_id": str(student.id),
        "student_code": student.student_code,
        "enrollment_number": enrollment_number,
        "student_name": student.name,
        "has_active_green_card": active_green_card is not None or student.has_green_card,
        "active_green_card": active_green_card,
        "is_student_active": len(active_subjects) > 0 or active_green_card is not None or len(active_demos) > 0,
        "active_subjects": active_subjects,
        "historical_subjects": historical_subjects,
        "historical_memberships": historical_memberships,
        "active_demos": [d.model_dump() for d in active_demos],
        "total_active_demos": len(active_demos),
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

