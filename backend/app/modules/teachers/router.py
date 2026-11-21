from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, desc, case
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional, List
import uuid
import os
import json

from app.database.session import get_db
from app.core.config import settings
from app.modules.students.router import compress_avatar_image
from app.modules.teachers.models import Teacher, TeacherEarning
from app.modules.teachers.schemas import (
    TeacherCreate, TeacherUpdate, TeacherResponse,
    TeacherEnrollmentItem, TeacherRosterMetrics, TeacherRosterResponse, TeacherSubjectOption,
    TeacherPayoutCreate, TeacherPayoutResponse, TeacherEarningsResponse, TeacherSubjectEarningItem
)
from app.modules.batches.models import Batch
from app.modules.subjects.models import Subject
from app.modules.admissions.models import Admission, AdmissionItem
from app.modules.students.models import Student
from app.modules.expenses.models import SalaryRecord
from app.database.models import AuditLog
from app.modules.reports.ledger_queries import get_item_allocated_collected_map, ist_day_boundaries
from app.common.active_student import active_student_subject_filter, today_kolkata
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

@router.get("/by-mobile/{mobile}", response_model=Optional[TeacherResponse])
async def get_teacher_by_mobile(
    mobile: str,
    db: AsyncSession = Depends(get_db),
    user = Depends(require_staff)
):
    clean = mobile.strip()
    if len(clean) > 10:
        if clean.startswith("+91"):
            clean = clean[3:]
        elif clean.startswith("91") and len(clean) == 12:
            clean = clean[2:]
        elif clean.startswith("0") and len(clean) == 11:
            clean = clean[1:]
    teacher = (await db.execute(select(Teacher).where(Teacher.mobile == clean))).scalar_one_or_none()
    if not teacher:
        return None
    return TeacherResponse.model_validate(teacher)

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
    clean_mob = req.mobile.strip()
    existing_teacher = (await db.execute(select(Teacher).where(Teacher.mobile == clean_mob))).scalar_one_or_none()
    if existing_teacher:
        raise HTTPException(
            status_code=400,
            detail=f"Faculty member already registered with mobile {clean_mob}: {existing_teacher.name} ({existing_teacher.teacher_code})"
        )

    if not req.name or not req.name.strip():
        raise HTTPException(status_code=400, detail="Teacher name is required")
    if req.qualification is not None and not req.qualification.strip():
        raise HTTPException(status_code=400, detail="Qualification cannot be blank")
    if req.specialization is not None and not req.specialization.strip():
        raise HTTPException(status_code=400, detail="Specialization cannot be blank")

    # Auto-generate teacher code
    count = (await db.execute(select(func.count(Teacher.id)))).scalar() or 0
    code = f"TCH{count + 1:03d}"

    new_teacher = Teacher(
        teacher_code=code,
        name=req.name.strip(),
        mobile=clean_mob,
        email=req.email.strip().lower() if req.email else None,
        qualification=req.qualification.strip() if req.qualification else "Faculty Educator",
        specialization=req.specialization.strip() if req.specialization else "General Faculty",
        photo_url=req.photo_url,
        joining_date=req.joining_date,
        status=req.status,
        share_type=req.share_type,
        share_value=req.share_value
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

    if req.mobile is not None:
        clean_mob = req.mobile.strip()
        existing_teacher = (await db.execute(
            select(Teacher).where(Teacher.mobile == clean_mob, Teacher.id != teacher_id)
        )).scalar_one_or_none()
        if existing_teacher:
            raise HTTPException(
                status_code=400,
                detail=f"Another faculty member already registered with mobile {clean_mob}: {existing_teacher.name} ({existing_teacher.teacher_code})"
            )
        teacher.mobile = clean_mob

    if req.name is not None:
        if not req.name.strip():
            raise HTTPException(status_code=400, detail="Teacher name cannot be blank")
        teacher.name = req.name.strip()
    if req.email is not None: teacher.email = req.email.strip().lower() if req.email else None
    if req.qualification is not None:
        if not req.qualification.strip():
            raise HTTPException(status_code=400, detail="Qualification cannot be blank")
        teacher.qualification = req.qualification.strip()
    if req.specialization is not None:
        if not req.specialization.strip():
            raise HTTPException(status_code=400, detail="Specialization cannot be blank")
        teacher.specialization = req.specialization.strip()
    if req.photo_url is not None: teacher.photo_url = req.photo_url
    if req.joining_date is not None: teacher.joining_date = req.joining_date
    if req.status is not None: teacher.status = req.status
    if req.share_type is not None: teacher.share_type = req.share_type
    if req.share_value is not None: teacher.share_value = req.share_value

    await db.commit()
    await db.refresh(teacher)
    return TeacherResponse.model_validate(teacher)

@router.post("/upload-photo")
async def upload_teacher_photo_standalone(
    file: UploadFile = File(...),
    admin = Depends(require_admin)
):
    """
    Upload and compress a teacher photo to <= 20 KB.
    Used during faculty registration before record exists.
    """
    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    try:
        compressed_bytes = compress_avatar_image(raw_bytes, max_kb=20)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image format: {str(e)}")

    upload_dir = os.path.join(os.path.abspath(settings.UPLOAD_DIR), "teachers")
    os.makedirs(upload_dir, exist_ok=True)

    filename = f"temp_tch_{uuid.uuid4().hex[:12]}.jpg"
    filepath = os.path.join(upload_dir, filename)
    with open(filepath, "wb") as f:
        f.write(compressed_bytes)

    photo_url = f"/uploads/teachers/{filename}"
    return {
        "photo_url": photo_url,
        "size_kb": round(len(compressed_bytes) / 1024, 2)
    }

@router.post("/{teacher_id}/photo", response_model=TeacherResponse)
async def upload_teacher_photo(
    teacher_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin = Depends(require_admin)
):
    """
    Upload, compress to <= 20 KB and attach photo directly to an existing faculty member.
    """
    teacher = (await db.execute(select(Teacher).where(Teacher.id == teacher_id))).scalar_one_or_none()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    try:
        compressed_bytes = compress_avatar_image(raw_bytes, max_kb=20)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image format: {str(e)}")

    upload_dir = os.path.join(os.path.abspath(settings.UPLOAD_DIR), "teachers")
    os.makedirs(upload_dir, exist_ok=True)

    filename = f"tch_{teacher.teacher_code.lower()}_{uuid.uuid4().hex[:8]}.jpg"
    filepath = os.path.join(upload_dir, filename)
    with open(filepath, "wb") as f:
        f.write(compressed_bytes)

    teacher.photo_url = f"/uploads/teachers/{filename}"
    await db.commit()
    await db.refresh(teacher)
    return TeacherResponse.model_validate(teacher)

@router.get("/{teacher_id}/roster", response_model=TeacherRosterResponse)
async def get_teacher_roster(
    teacher_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query("ALL"),
    subject_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    user = Depends(require_staff)
):
    """
    Returns complete assigned course enrollment cohort roster for a teacher with
    database-level search, status filtering (Active vs Inactive/Expired vs Cancelled),
    subject filtering, and pre-computed DB metrics.
    """
    teacher = (await db.execute(select(Teacher).where(Teacher.id == teacher_id))).scalar_one_or_none()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    # 1. Collect batches and subjects belonging to this teacher
    b_ids = (await db.execute(select(Batch.id).where(Batch.teacher_id == teacher_id))).scalars().all()
    s_ids = (await db.execute(select(Subject.id).where(Subject.teacher_id == teacher_id))).scalars().all()

    where_cond = [AdmissionItem.teacher_id == teacher_id]
    if b_ids: where_cond.append(AdmissionItem.batch_id.in_(b_ids))
    if s_ids: where_cond.append(AdmissionItem.subject_id.in_(s_ids))
    base_teacher_filter = or_(*where_cond)

    today = today_kolkata()
    start_col = func.coalesce(AdmissionItem.valid_from, Admission.valid_from, Admission.admission_date)
    end_col = func.coalesce(AdmissionItem.valid_to, Admission.valid_to, Admission.admission_date + 30)

    # 2. Pre-compute summary metrics across teacher's entire cohort using canonical active definition
    active_cond = active_student_subject_filter(AdmissionItem, Admission, today)
    metrics_stmt = (
        select(
            func.count(AdmissionItem.id),
            func.count(case((active_cond, 1), else_=None)),
            func.count(case((and_(Admission.status == "ACTIVE", or_(AdmissionItem.valid_to < today, AdmissionItem.status == "EXPIRED")), 1), else_=None)),
            func.count(case((or_(Admission.status.in_(["CANCELLED", "REVOKED"]), AdmissionItem.status.in_(["CANCELLED", "REVOKED", "DISCONTINUED"])), 1), else_=None)),
            func.count(func.distinct(Admission.student_id))
        )
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .where(base_teacher_filter)
    )
    m_row = (await db.execute(metrics_stmt)).one()
    total_enr, active_enr, inactive_enr, cancelled_enr, uniq_stu = m_row

    metrics = TeacherRosterMetrics(
        total_enrollments=total_enr or 0,
        active_enrollments=active_enr or 0,
        inactive_enrollments=inactive_enr or 0,
        cancelled_enrollments=cancelled_enr or 0,
        unique_students_count=uniq_stu or 0
    )

    # 3. Base Query for paginated, filtered items
    q_items = (
        select(AdmissionItem, Admission, Student, Batch, Subject)
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .join(Student, Admission.student_id == Student.id)
        .outerjoin(Batch, AdmissionItem.batch_id == Batch.id)
        .outerjoin(Subject, AdmissionItem.subject_id == Subject.id)
        .where(base_teacher_filter)
    )

    q_count = (
        select(func.count(AdmissionItem.id))
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .join(Student, Admission.student_id == Student.id)
        .outerjoin(Batch, AdmissionItem.batch_id == Batch.id)
        .outerjoin(Subject, AdmissionItem.subject_id == Subject.id)
        .where(base_teacher_filter)
    )

    # Apply database-level status filtering
    if status_filter == "ACTIVE":
        status_cond = active_cond
        q_items = q_items.where(status_cond)
        q_count = q_count.where(status_cond)
    elif status_filter in ("INACTIVE", "EXPIRED"):
        status_cond = and_(Admission.status == "ACTIVE", end_col < today)
        q_items = q_items.where(status_cond)
        q_count = q_count.where(status_cond)
    elif status_filter in ("CANCELLED", "REVOKED"):
        status_cond = Admission.status.in_(["CANCELLED", "REVOKED"])
        q_items = q_items.where(status_cond)
        q_count = q_count.where(status_cond)

    # Apply database-level subject filtering
    if subject_id:
        q_items = q_items.where(AdmissionItem.subject_id == subject_id)
        q_count = q_count.where(AdmissionItem.subject_id == subject_id)

    # Apply database-level search query (student name, code, mobile, subject, batch)
    if search and search.strip():
        pat = f"%{search.strip()}%"
        search_clause = or_(
            Student.name.ilike(pat),
            Student.student_code.ilike(pat),
            Student.mobile.ilike(pat),
            Subject.name.ilike(pat),
            Batch.name.ilike(pat),
            AdmissionItem.item_name_snapshot.ilike(pat)
        )
        q_items = q_items.where(search_clause)
        q_count = q_count.where(search_clause)

    total_filtered = (await db.execute(q_count)).scalar() or 0
    total_pages = (total_filtered + page_size - 1) // page_size if total_filtered > 0 else 1

    offset = (page - 1) * page_size
    q_items = q_items.order_by(desc(Admission.admission_date), desc(AdmissionItem.created_at)).offset(offset).limit(page_size)

    rows = (await db.execute(q_items)).all()

    item_ids = [itm.id for itm, adm, stu, bch, sub in rows]
    collected_map = await get_item_allocated_collected_map(db, item_ids)

    items = []
    for itm, adm, stu, bch, sub in rows:
        c_start = itm.valid_from or adm.valid_from or adm.admission_date
        c_end = itm.valid_to or adm.valid_to or (c_start + timedelta(days=30))

        if adm.status in ("CANCELLED", "REVOKED"):
            c_status = "CANCELLED"
            s_label = "Cancelled"
            badge_var = "danger"
            s_subtext = adm.revocation_reason or "Enrollment cancelled / dropped"
            days_rem = 0
        elif today > c_end:
            c_status = "INACTIVE"
            s_label = "Inactive (Expired)"
            badge_var = "danger"
            days_ago = (today - c_end).days
            s_subtext = f"Cycle ended {days_ago}d ago ({c_end.strftime('%d %b %Y')})"
            days_rem = -(today - c_end).days
        else:
            c_status = "ACTIVE"
            s_label = "Active"
            days_left = (c_end - today).days
            days_rem = days_left
            badge_var = "warning" if days_left <= 7 else "success"
            s_subtext = f"{days_left}d remaining in cycle"

        c_period_label = f"{c_start.strftime('%d %b %Y')} → {c_end.strftime('%d %b %Y')}"

        items.append(TeacherEnrollmentItem(
            item_id=itm.id,
            admission_id=adm.id,
            admission_number=adm.admission_number,
            admission_date=adm.admission_date,
            student_id=stu.id,
            student_code=stu.student_code,
            student_name=stu.name,
            mobile=stu.mobile,
            father_name=stu.father_name,
            photo_url=stu.photo_url,
            subject_id=sub.id if sub else itm.subject_id,
            subject_name=sub.name if sub else (itm.item_name_snapshot or "Enrolled Course"),
            subject_code=sub.subject_code if sub else None,
            batch_id=bch.id if bch else None,
            batch_name=bch.name if bch else "Direct Subject",
            hall_number=itm.hall_number_snapshot or (bch.hall_number if bch else (sub.hall_number if sub and sub.hall_number else "Main")),
            fee_billed=float(itm.net_price or 0),
            fee_collected=float(collected_map.get(itm.id, Decimal("0.00"))),
            balance_due=float(itm.balance_due or 0),
            payment_status=adm.payment_status,
            admission_status=adm.status,
            valid_from=c_start,
            valid_to=c_end,
            days_remaining=days_rem,
            cycle_status=c_status,
            status_label=s_label,
            badge_variant=badge_var,
            status_subtext=s_subtext,
            billing_day=c_start.day if c_start else None,
            cycle_period_label=c_period_label
        ))

    # 4. Collect unique subjects for this teacher's cohort for frontend filter dropdown
    subs_stmt = (
        select(Subject.id, Subject.name)
        .join(AdmissionItem, AdmissionItem.subject_id == Subject.id)
        .where(base_teacher_filter)
        .distinct()
        .order_by(Subject.name.asc())
    )
    sub_rows = (await db.execute(subs_stmt)).all()
    subjects_list = [TeacherSubjectOption(id=r[0], name=r[1]) for r in sub_rows]

    return TeacherRosterResponse(
        items=items,
        total=total_filtered,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        metrics=metrics,
        subjects=subjects_list
    )


@router.get("/{teacher_id}/earnings", response_model=TeacherEarningsResponse)
async def get_teacher_earnings(
    teacher_id: uuid.UUID,
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    start_date: Optional[date] = Query(None, alias="from_date"),
    end_date: Optional[date] = Query(None, alias="to_date"),
    db: AsyncSession = Depends(get_db),
    user = Depends(require_staff)
):
    """
    Returns breakdown of earnings (earned, reversed, paid, payable) for a teacher,
    with per-subject breakdown and list of payout transactions.
    """
    f_date = from_date or start_date
    t_date = to_date or end_date

    t_res = await db.execute(select(Teacher).where(Teacher.id == teacher_id))
    teacher = t_res.scalar_one_or_none()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    start_dt, end_dt = ist_day_boundaries(f_date, t_date)
    date_conds = []
    if start_dt:
        date_conds.append(TeacherEarning.earning_date >= start_dt)
    if end_dt:
        date_conds.append(TeacherEarning.earning_date < end_dt)

    # 1. Total aggregations
    stmt_totals = (
        select(
            func.coalesce(func.sum(case((TeacherEarning.earning_type == "EARNED", TeacherEarning.amount), else_=Decimal("0.00"))), Decimal("0.00")),
            func.coalesce(func.sum(case((TeacherEarning.earning_type == "REVERSAL", TeacherEarning.amount), else_=Decimal("0.00"))), Decimal("0.00")),
            func.coalesce(func.sum(case((TeacherEarning.earning_type == "PAYOUT", TeacherEarning.amount), else_=Decimal("0.00"))), Decimal("0.00"))
        )
        .where(TeacherEarning.teacher_id == teacher_id)
    )
    if date_conds:
        stmt_totals = stmt_totals.where(and_(*date_conds))
    res_totals = await db.execute(stmt_totals)
    tot_earned, tot_reversed, tot_paid = res_totals.one()

    tot_earned = Decimal(str(tot_earned))
    tot_reversed = Decimal(str(tot_reversed))
    tot_paid = Decimal(str(tot_paid))
    net_earned = tot_earned - tot_reversed
    payable = tot_earned - tot_reversed - tot_paid

    # 2. Per-subject breakdown
    stmt_subj = (
        select(
            TeacherEarning.subject_id,
            Subject.name,
            func.coalesce(func.sum(case((TeacherEarning.earning_type == "EARNED", TeacherEarning.amount), else_=Decimal("0.00"))), Decimal("0.00")),
            func.coalesce(func.sum(case((TeacherEarning.earning_type == "REVERSAL", TeacherEarning.amount), else_=Decimal("0.00"))), Decimal("0.00"))
        )
        .outerjoin(Subject, TeacherEarning.subject_id == Subject.id)
        .where(
            TeacherEarning.teacher_id == teacher_id,
            TeacherEarning.earning_type.in_(["EARNED", "REVERSAL"])
        )
    )
    if date_conds:
        stmt_subj = stmt_subj.where(and_(*date_conds))
    stmt_subj = stmt_subj.group_by(TeacherEarning.subject_id, Subject.name)
    res_subj = await db.execute(stmt_subj)
    by_subject = []
    for s_id, s_name, s_earned, s_rev in res_subj.all():
        s_e = Decimal(str(s_earned))
        s_r = Decimal(str(s_rev))
        by_subject.append(TeacherSubjectEarningItem(
            subject_id=s_id,
            subject_name=s_name or "General / Direct",
            earned=s_e,
            reversed=s_r,
            net_earned=s_e - s_r
        ))

    # 3. Payouts list
    stmt_payouts = (
        select(TeacherEarning)
        .where(
            TeacherEarning.teacher_id == teacher_id,
            TeacherEarning.earning_type == "PAYOUT"
        )
    )
    if date_conds:
        stmt_payouts = stmt_payouts.where(and_(*date_conds))
    stmt_payouts = stmt_payouts.order_by(desc(TeacherEarning.earning_date))
    payout_rows = (await db.execute(stmt_payouts)).scalars().all()
    payouts_list = [
        {
            "id": str(p.id),
            "amount": float(p.amount),
            "payout_mode": p.payout_mode or "CASH",
            "date": p.earning_date.isoformat(),
            "notes": p.notes,
            "salary_record_id": str(p.salary_record_id) if p.salary_record_id else None
        }
        for p in payout_rows
    ]

    basis = getattr(settings, "TEACHER_EARNING_BASIS", "CASH")

    return TeacherEarningsResponse(
        teacher_id=teacher.id,
        teacher_name=teacher.name,
        teacher_code=teacher.teacher_code,
        share_type=teacher.share_type,
        share_value=Decimal(str(teacher.share_value)),
        basis=basis,
        from_date=f_date,
        to_date=t_date,
        total_earned=tot_earned,
        total_reversed=tot_reversed,
        net_earned=net_earned,
        total_paid=tot_paid,
        payable=payable,
        by_subject=by_subject,
        payouts=payouts_list
    )


@router.post("/{teacher_id}/payouts", response_model=TeacherPayoutResponse, status_code=status.HTTP_201_CREATED)
async def create_teacher_payout(
    teacher_id: uuid.UUID,
    payload: TeacherPayoutCreate,
    db: AsyncSession = Depends(get_db),
    admin = Depends(require_admin)
):
    """
    Creates a payout for a teacher.
    Links payout to SalaryRecord (status=PAID) so cash-flow reports do not double count.
    Records TeacherEarning row (type=PAYOUT) and AuditLog.
    """
    t_res = await db.execute(select(Teacher).where(Teacher.id == teacher_id))
    teacher = t_res.scalar_one_or_none()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    p_amt = Decimal(str(payload.amount))
    if p_amt <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Payout amount must be greater than zero")

    pay_date = payload.payment_date or date.today()
    month_str = pay_date.strftime("%Y-%m")

    # 1. Create SalaryRecord linked so cash-flow outflow recognizes it once
    salary_record = SalaryRecord(
        employee_id=teacher.id,
        employee_type="TEACHER",
        employee_name_snapshot=teacher.name,
        month_year=month_str,
        salary_amount=p_amt,
        due_date=pay_date,
        paid_amount=p_amt,
        status="PAID",
        payment_date=pay_date,
        payment_mode=payload.payout_mode,
        notes=f"Faculty payout: {payload.notes or ''}"
    )
    db.add(salary_record)
    await db.flush()

    # 2. Append-only TeacherEarning (PAYOUT)
    now_dt = datetime.combine(pay_date, datetime.min.time(), tzinfo=timezone.utc)
    earning = TeacherEarning(
        teacher_id=teacher.id,
        earning_type="PAYOUT",
        basis=getattr(settings, "TEACHER_EARNING_BASIS", "CASH"),
        amount=p_amt,
        salary_record_id=salary_record.id,
        payout_mode=payload.payout_mode,
        earning_date=now_dt,
        notes=payload.notes or f"Payout of ₹{p_amt} via {payload.payout_mode}",
        created_by=admin.id
    )
    db.add(earning)
    await db.flush()

    # 3. Audit Log
    audit = AuditLog(
        user_id=admin.id,
        action="TEACHER_PAYOUT_RECORDED",
        entity_type="TEACHER_PAYOUT",
        entity_id=earning.id,
        details=json.dumps({
            "teacher_id": str(teacher.id),
            "teacher_name": teacher.name,
            "amount": float(p_amt),
            "payout_mode": payload.payout_mode,
            "salary_record_id": str(salary_record.id),
            "payment_date": pay_date.isoformat()
        })
    )
    db.add(audit)
    await db.commit()
    await db.refresh(earning)

    return TeacherPayoutResponse(
        id=earning.id,
        teacher_id=teacher.id,
        amount=earning.amount,
        payout_mode=earning.payout_mode or "CASH",
        earning_date=earning.earning_date,
        salary_record_id=earning.salary_record_id,
        notes=earning.notes
    )
