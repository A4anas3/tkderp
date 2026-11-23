import uuid
import json
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc, and_
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.core.config import settings
from app.core.dependencies import require_staff, require_cashier_or_admin, require_admin
from app.database.models import (
    Admission, AdmissionItem, Student, Payment, PaymentAllocation, GreenCardProduct, User, BatchSubject, Refund, AuditLog,
    Subject, Batch, Teacher, FinancialTransaction
)
from app.modules.admissions.schemas import (
    AdmissionCreate, AdmissionResponse, AdmissionCalculatePreviewRequest, AdmissionItemResponse, AdmissionRevokeRequest,
    AdmissionSlipsResponse, SlipItemResponse, AdmissionValidityUpdate, AdmissionLifecycleAction,
    AdmissionItemValidityUpdate, AdmissionItemLifecycleAction, SubjectRenewalRequest, SubjectChangeRequest,
    ItemRenewalRequest, RenewalsDueItemResponse, ItemRenewalSpec, AdmissionWaiveDueRequest,
    RenewalCalculateRequest, RenewalCalculateResponse
)
from app.common.calculations import (
    calculate_admission_financials, allocate_payment_proportionally, compute_rolling_cycle_end,
    calculate_course_duration_fee, calculate_course_duration_breakdown
)
from app.common.pagination import PaginationParams, PageResponse
from app.common.numbering import next_number
from app.common.idempotency import get_idempotency_record, save_idempotency_record, build_idempotent_response
from app.common.active_lines import today_kolkata, is_active_line
from app.modules.ledger.service import (
    record_payment_service, process_refund_service, recompute_admission_totals,
    update_student_green_card_status, cancel_admission_service, revoke_admission_service,
    restore_admission_service, renew_admission_items_service, waive_due_service
)

async def update_student_green_card_flag(student_id: uuid.UUID, db: AsyncSession) -> None:
    """
    Checks if the student has any active green card line across all valid admissions.
    Updates has_green_card and expiry correctly (never blindly sets False if another exists).
    """
    await update_student_green_card_status(student_id, db)

router = APIRouter(prefix="/api/admissions", tags=["Admissions"])

@router.post("/preview")
async def preview_admission_calculation(
    payload: AdmissionCalculatePreviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    items_data = []
    for itm in payload.items:
        price = itm.original_price
        if itm.subject_id:
            bs = None
            if itm.batch_id:
                bs_res = await db.execute(
                    select(BatchSubject).where(
                        BatchSubject.batch_id == itm.batch_id,
                        BatchSubject.subject_id == itm.subject_id
                    )
                )
                bs = bs_res.scalar_one_or_none()
            if bs and bs.fee is not None:
                base_fee = bs.fee
            else:
                s_res = await db.execute(select(Subject).where(Subject.id == itm.subject_id))
                subj = s_res.scalar_one_or_none()
                base_fee = subj.default_fee if subj else (price or Decimal("0.00"))

            computed = calculate_course_duration_fee(
                monthly_fee=base_fee,
                valid_from=itm.valid_from,
                valid_to=itm.valid_to,
                months=getattr(itm, "months", None)
            )
            if price is None or price == Decimal("0.00"):
                price = computed

        items_data.append({
            "price": price if price is not None else Decimal("0.00"),
            "discount_type": itm.discount_type,
            "discount_value": itm.discount_value,
            "item_name_snapshot": itm.item_name_snapshot,
            "item_type": itm.item_type
        })
    calc = calculate_admission_financials(
        items=items_data,
        overall_discount_type=payload.overall_discount_type,
        overall_discount_value=payload.overall_discount_value,
        gst_enabled=payload.gst_enabled,
        gst_rate=payload.gst_rate
    )
    return calc

@router.get("", response_model=PageResponse[AdmissionResponse])
async def list_admissions(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    search: Optional[str] = None,
    student_id: Optional[uuid.UUID] = None,
    payment_status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    query = select(Admission).options(selectinload(Admission.items))
    count_query = select(func.count(Admission.id))

    if search:
        search_pattern = f"%{search.strip()}%"
        filter_clause = or_(
            Admission.admission_number.ilike(search_pattern),
            Admission.student_name_snapshot.ilike(search_pattern),
            Admission.items.any(AdmissionItem.item_name_snapshot.ilike(search_pattern)),
            Admission.items.any(AdmissionItem.teacher_name_snapshot.ilike(search_pattern))
        )
        query = query.where(filter_clause)
        count_query = count_query.where(filter_clause)

    if student_id:
        query = query.where(Admission.student_id == student_id)
        count_query = count_query.where(Admission.student_id == student_id)

    if payment_status and payment_status != "ALL":
        if payment_status in ("REVOKED", "CANCELLED"):
            query = query.where(Admission.status.in_(["REVOKED", "CANCELLED"]))
            count_query = count_query.where(Admission.status.in_(["REVOKED", "CANCELLED"]))
        elif payment_status in ("SUSPENDED", "DISCONTINUED", "ACTIVE"):
            query = query.where(Admission.status == payment_status)
            count_query = count_query.where(Admission.status == payment_status)
        else:
            query = query.where(Admission.payment_status == payment_status)
            count_query = count_query.where(Admission.payment_status == payment_status)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(desc(Admission.admission_date), desc(Admission.created_at)).offset(offset).limit(page_size)
    items_result = await db.execute(query)
    admissions = items_result.scalars().all()

    return PageResponse.create(items=admissions, total=total, params=PaginationParams(page=page, page_size=page_size))

@router.post("", response_model=AdmissionResponse, status_code=status.HTTP_201_CREATED)
async def create_admission(
    payload: AdmissionCreate,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    if idempotency_key:
        cached = await get_idempotency_record(db, idempotency_key, "POST /api/admissions")
        if cached:
            return build_idempotent_response(cached)

    # Verify student
    st_res = await db.execute(select(Student).where(Student.id == payload.student_id))
    student = st_res.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Generate sequential admission number atomically
    adm_no = await next_number(db, "ADM")

    # Calculate item financials
    raw_items = []
    for itm in payload.items:
        price = itm.original_price
        if itm.subject_id:
            bs = None
            if itm.batch_id:
                bs_res = await db.execute(
                    select(BatchSubject).where(
                        BatchSubject.batch_id == itm.batch_id,
                        BatchSubject.subject_id == itm.subject_id
                    )
                )
                bs = bs_res.scalar_one_or_none()
            if bs and bs.fee is not None:
                base_fee = bs.fee
            else:
                s_res = await db.execute(select(Subject).where(Subject.id == itm.subject_id))
                subj = s_res.scalar_one_or_none()
                base_fee = subj.default_fee if subj else (price or Decimal("0.00"))

            computed = calculate_course_duration_fee(
                monthly_fee=base_fee,
                valid_from=itm.valid_from,
                valid_to=itm.valid_to,
                months=getattr(itm, "months", None)
            )
            if price is None or price == Decimal("0.00"):
                price = computed

        raw_items.append({
            "raw_item": itm,
            "price": price if price is not None else Decimal("0.00"),
            "discount_type": itm.discount_type,
            "discount_value": itm.discount_value
        })
    calc = calculate_admission_financials(
        items=raw_items,
        overall_discount_type=payload.overall_discount_type,
        overall_discount_value=payload.overall_discount_value,
        gst_enabled=payload.gst_enabled,
        gst_rate=payload.gst_rate
    )

    # Determine valid_from and valid_to for overall admission
    adm_valid_from = payload.valid_from
    adm_valid_to = payload.valid_to
    if not adm_valid_from:
        item_froms = [itm.valid_from for itm in payload.items if itm.valid_from]
        adm_valid_from = min(item_froms) if item_froms else payload.admission_date
    if not adm_valid_to:
        item_tos = [itm.valid_to for itm in payload.items if itm.valid_to]
        adm_valid_to = max(item_tos) if item_tos else compute_rolling_cycle_end(adm_valid_from, 1)[0]

    admission = Admission(
        admission_number=adm_no,
        student_id=student.id,
        student_name_snapshot=student.full_name,
        admission_date=payload.admission_date,
        subtotal=calc["subtotal"],
        individual_discount_total=calc["individual_discount_total"],
        overall_discount_type=payload.overall_discount_type,
        overall_discount_value=payload.overall_discount_value,
        overall_discount_amount=calc["overall_discount_amount"],
        total_discount=calc["total_discount"],
        gst_enabled=calc["gst_enabled"],
        gst_rate=calc["gst_rate"],
        taxable_base=calc["taxable_base"],
        gst_amount=calc["gst_amount"],
        total_payable=calc["total_payable"],
        amount_paid=Decimal("0.00"),
        balance_due=calc["total_payable"],
        payment_status="UNPAID",
        status="ACTIVE",
        notes=payload.notes,
        valid_from=adm_valid_from,
        valid_to=adm_valid_to,
        created_by=current_user.id
    )
    db.add(admission)
    await db.flush()

    # Create Admission Items
    has_gc = False
    gc_validity_days = 365
    db_items = []
    for c_itm in calc["items"]:
        raw = c_itm["raw_item"]
        if raw.item_type == "GREEN_CARD":
            has_gc = True
            if raw.green_card_id:
                gc_res = await db.execute(select(GreenCardProduct).where(GreenCardProduct.id == raw.green_card_id))
                gc_prod = gc_res.scalar_one_or_none()
                if gc_prod:
                    gc_validity_days = gc_prod.validity_days

        # Resolve teacher and hall snapshots
        t_id = raw.teacher_id
        t_name = raw.teacher_name_snapshot
        h_no = raw.hall_number_snapshot
        bs_obj = None

        if raw.batch_id and raw.subject_id:
            bs_res = await db.execute(
                select(BatchSubject).where(
                    BatchSubject.batch_id == raw.batch_id,
                    BatchSubject.subject_id == raw.subject_id
                )
            )
            bs_obj = bs_res.scalar_one_or_none()
            if bs_obj:
                if not t_id and bs_obj.teacher_id:
                    t_id = bs_obj.teacher_id
                if not t_name and bs_obj.teacher_name_snapshot:
                    t_name = bs_obj.teacher_name_snapshot
                if not h_no and bs_obj.hall_number:
                    h_no = bs_obj.hall_number

        itm_from = raw.valid_from or adm_valid_from
        if raw.item_type == "GREEN_CARD":
            itm_to = raw.valid_to or (itm_from + timedelta(days=gc_validity_days))
        else:
            itm_to = raw.valid_to or compute_rolling_cycle_end(itm_from, 1)[0]

        # Snapshot teacher compensation settings at sale time
        s_type = "PERCENT"
        s_val = Decimal("0.00")
        s_pct = Decimal("0.00")

        if t_id:
            t_res = await db.execute(select(Teacher).where(Teacher.id == t_id))
            t_obj = t_res.scalar_one_or_none()
            if not t_obj:
                raise HTTPException(status_code=400, detail="Assigned teacher not found")
            if t_obj.status != "ACTIVE":
                raise HTTPException(status_code=400, detail=f"Cannot assign inactive teacher '{t_obj.name}' to a new admission")

            if bs_obj and bs_obj.share_value is not None and bs_obj.share_value > Decimal("0.00"):
                s_type = bs_obj.share_type or "PERCENT"
                s_val = bs_obj.share_value
            else:
                s_type = t_obj.share_type or "PERCENT"
                s_val = t_obj.share_value or Decimal("0.00")

            if s_type == "PERCENT":
                s_pct = s_val
            else:
                s_pct = None

        # Archive/discontinue previous subject if changing subject
        if raw.change_from_item_id:
            old_res = await db.execute(
                select(AdmissionItem).where(
                    AdmissionItem.id == raw.change_from_item_id,
                    AdmissionItem.student_id == admission.student_id
                )
            )
            old_item = old_res.scalar_one_or_none()
            if old_item and old_item.status != "DISCONTINUED":
                old_item.previous_status = old_item.status
                old_item.status = "DISCONTINUED"
                old_item.access_status = "REVOKED"
                old_item.discontinued_at = datetime.now(timezone.utc)
                old_item.lifecycle_reason = f"Changed subject to {raw.item_name_snapshot}"
                old_item.written_off_amount = old_item.balance_due
                old_item.balance_due = Decimal("0.00")
                old_adm_res = await db.execute(
                    select(Admission).options(selectinload(Admission.items)).where(Admission.id == old_item.admission_id)
                )
                old_adm = old_adm_res.scalar_one_or_none()
                if old_adm:
                    await recompute_admission_totals(old_adm, db)

        ai = AdmissionItem(
            admission=admission,
            student_id=admission.student_id,
            item_type=raw.item_type,
            batch_id=raw.batch_id,
            subject_id=raw.subject_id,
            green_card_id=raw.green_card_id,
            teacher_id=t_id,
            teacher_name_snapshot=t_name,
            hall_number_snapshot=h_no,
            item_name_snapshot=raw.item_name_snapshot,
            original_price=c_itm["original_price"],
            discount_type=raw.discount_type,
            discount_value=raw.discount_value,
            discount_amount=c_itm["individual_discount"],
            overall_discount_share=c_itm["overall_discount_share"],
            net_price=c_itm["net_price"],
            amount_collected=Decimal("0.00"),
            balance_due=c_itm["net_price"],
            valid_from=itm_from,
            valid_to=itm_to,
            renewed_from_item_id=raw.change_from_item_id or raw.renewed_from_item_id,
            price_override_reason=raw.price_override_reason,
            share_type=s_type,
            share_value=s_val,
            share_percent=s_pct
        )
        db.add(ai)
        db_items.append(ai)

    await db.flush()

    if has_gc:
        student.has_green_card = True
        student.green_card_expiry = max(student.green_card_expiry or date.min, adm_valid_from + timedelta(days=gc_validity_days))
        if admission.valid_to is None or admission.valid_to < (adm_valid_from + timedelta(days=gc_validity_days)):
            admission.valid_to = adm_valid_from + timedelta(days=gc_validity_days)

    # Process Initial Payment via centralized ledger service
    if payload.initial_payment and payload.initial_payment.amount > Decimal("0.00"):
        if payload.initial_payment.amount > admission.total_payable:
            raise HTTPException(
                status_code=400,
                detail=f"Initial payment amount ₹{payload.initial_payment.amount} exceeds total payable ₹{admission.total_payable}"
            )
        await record_payment_service(
            db=db,
            admission=admission,
            amount=payload.initial_payment.amount,
            payment_mode=payload.initial_payment.payment_mode,
            collected_by_user=current_user,
            transaction_reference=payload.initial_payment.transaction_reference,
            notes=payload.initial_payment.notes or "Initial payment at admission",
            valid_from=adm_valid_from,
            valid_to=adm_valid_to,
            fee_period=f"{adm_valid_from} to {adm_valid_to}",
            allocation_mode=payload.initial_payment.allocation_mode,
            manual_allocations=payload.initial_payment.manual_allocations
        )

    # Audit log for admission creation / course purchase
    adm_audit = AuditLog(
        user_id=current_user.id,
        action="ADMISSION_CREATED",
        entity_type="ADMISSION",
        entity_id=admission.id,
        details=json.dumps({
            "admission_number": admission.admission_number,
            "student_id": str(admission.student_id),
            "student_name": student.name,
            "total_payable": float(admission.total_payable),
            "amount_paid": float(admission.amount_paid),
            "balance_due": float(admission.balance_due),
            "payment_status": admission.payment_status,
            "items": [
                {
                    "item_id": str(itm.id),
                    "subject": itm.item_name_snapshot,
                    "net_price": float(itm.net_price)
                }
                for itm in db_items
            ]
        })
    )
    db.add(adm_audit)

    await db.commit()

    full_adm = await get_admission(admission.id, db, current_user)

    if idempotency_key:
        resp_data = AdmissionResponse.model_validate(full_adm).model_dump(mode="json")
        await save_idempotency_record(
            db,
            idempotency_key,
            "POST /api/admissions",
            status.HTTP_201_CREATED,
            resp_data
        )
        await db.commit()

    return full_adm


@router.get("/renewals-due", response_model=List[RenewalsDueItemResponse])
async def get_renewals_due(
    days: int = Query(7, ge=1, description="Number of days ahead to look for expiring subjects"),
    teacher_id: Optional[uuid.UUID] = Query(None, description="Filter by teacher"),
    subject_id: Optional[uuid.UUID] = Query(None, description="Filter by subject"),
    include_overdue: bool = Query(True, description="Include items that expired in the past 30 days"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    today = date.today()
    window_end = today + timedelta(days=days)
    gap_limit = getattr(settings, "RENEWAL_GAP_RESET_DAYS", 30)

    conds = [
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

    if teacher_id:
        conds.append(AdmissionItem.teacher_id == teacher_id)
    if subject_id:
        conds.append(AdmissionItem.subject_id == subject_id)

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

    # Determine which items are renewed
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


@router.get("/{admission_id}", response_model=AdmissionResponse)
async def get_admission(
    admission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    query = select(Admission).options(selectinload(Admission.items)).where(Admission.id == admission_id)
    res = await db.execute(query)
    admission = res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Admission not found")

    # Reconcile items collected and due if out of sync with admission.amount_paid
    if admission.status == "ACTIVE" and admission.items:
        sum_collected = sum((itm.amount_collected or Decimal("0.00")) for itm in admission.items)
        if sum_collected != admission.amount_paid:
            await recompute_admission_totals(admission, db)
            await db.commit()
            await db.refresh(admission)

    return admission

@router.get("/{admission_id}/slips", response_model=AdmissionSlipsResponse)
async def get_admission_slips(
    admission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    """
    Returns all generated slips, payment receipts (1st, 2nd, installments),
    and refund vouchers for a given course purchase / admission.
    """
    query = (
        select(Admission)
        .options(
            selectinload(Admission.items),
            selectinload(Admission.student)
        )
        .where(Admission.id == admission_id)
    )
    res = await db.execute(query)
    admission = res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Course purchase / admission not found")

    # Fetch all payments
    p_query = (
        select(Payment)
        .options(
            selectinload(Payment.allocations),
            selectinload(Payment.student)
        )
        .where(Payment.admission_id == admission_id)
        .order_by(Payment.payment_date.asc())
    )
    payments = (await db.execute(p_query)).scalars().all()

    # Fetch all refunds
    r_query = (
        select(Refund)
        .options(selectinload(Refund.student))
        .where(Refund.admission_id == admission_id)
        .order_by(Refund.refund_date.asc())
    )
    refunds = (await db.execute(r_query)).scalars().all()

    slips: List[SlipItemResponse] = []

    # 1. Course Enrollment / Admission Slip
    adm_dict = {
        "id": str(admission.id),
        "admission_number": admission.admission_number,
        "purchase_transaction_id": admission.admission_number,
        "student_id": str(admission.student_id),
        "student_name_snapshot": admission.student_name_snapshot,
        "student_reg_no": admission.student.registration_no if admission.student else None,
        "student_mobile": admission.student.mobile if admission.student else None,
        "student_father_name": admission.student.father_name if admission.student else None,
        "admission_date": admission.admission_date.isoformat(),
        "subtotal": float(admission.subtotal),
        "individual_discount_total": float(admission.individual_discount_total),
        "overall_discount_type": admission.overall_discount_type,
        "overall_discount_value": float(admission.overall_discount_value),
        "overall_discount_amount": float(admission.overall_discount_amount),
        "total_discount": float(admission.total_discount),
        "gst_enabled": admission.gst_enabled,
        "gst_rate": float(admission.gst_rate),
        "taxable_base": float(admission.taxable_base),
        "gst_amount": float(admission.gst_amount),
        "total_payable": float(admission.total_payable),
        "amount_paid": float(admission.amount_paid),
        "balance_due": float(admission.balance_due),
        "written_off_amount": float(admission.written_off_amount or Decimal("0.00")),
        "payment_status": admission.payment_status,
        "status": admission.status,
        "notes": admission.notes,
        "valid_from": admission.valid_from.isoformat() if admission.valid_from else None,
        "valid_to": admission.valid_to.isoformat() if admission.valid_to else None,
        "items": [
            {
                "id": str(itm.id),
                "item_type": itm.item_type,
                "batch_id": str(itm.batch_id) if itm.batch_id else None,
                "subject_id": str(itm.subject_id) if itm.subject_id else None,
                "item_name_snapshot": itm.item_name_snapshot,
                "teacher_name_snapshot": itm.teacher_name_snapshot,
                "hall_number_snapshot": itm.hall_number_snapshot,
                "schedule": itm.schedule or (itm.subject.schedule if getattr(itm, "subject", None) else None),
                "original_price": float(itm.original_price),
                "discount_amount": float(itm.discount_amount),
                "overall_discount_share": float(itm.overall_discount_share),
                "net_price": float(itm.net_price),
                "amount_collected": float(itm.amount_collected),
                "balance_due": float(itm.balance_due),
                "written_off_amount": float(itm.written_off_amount or Decimal("0.00")),
                "valid_from": itm.valid_from.isoformat() if itm.valid_from else None,
                "valid_to": itm.valid_to.isoformat() if itm.valid_to else None,
            }
            for itm in admission.items
        ]
    }
    slips.append(
        SlipItemResponse(
            id=admission.id,
            slip_type="ADMISSION_INVOICE",
            slip_number=admission.admission_number,
            date=datetime.combine(admission.admission_date, datetime.min.time()),
            title="Course Purchase & Enrollment Invoice",
            amount=admission.total_payable,
            mode="INVOICE",
            ref=admission.admission_number,
            collector_or_processor=admission.student_name_snapshot,
            notes=admission.notes,
            status_badge=admission.payment_status,
            data=adm_dict
        )
    )

    # 2. Payments (1st partial, 2nd payment, balance clearing, etc.)
    item_names_map = {itm.id: itm.item_name_snapshot for itm in admission.items}
    item_schedules_map = {itm.id: (itm.schedule or (itm.subject.schedule if getattr(itm, "subject", None) else None)) for itm in admission.items}
    for idx, p in enumerate(payments):
        alloc_data = [
            {
                "item_name": item_names_map.get(a.admission_item_id, "Course Item"),
                "allocated_amount": float(a.allocated_amount),
                "schedule": item_schedules_map.get(a.admission_item_id)
            }
            for a in p.allocations
        ]
        p_receipt_data = {
            "payment_number": p.payment_number,
            "payment_date": p.payment_date.isoformat(),
            "amount": float(p.amount),
            "payment_mode": p.payment_mode,
            "transaction_reference": p.transaction_reference,
            "collector_name": p.collector_name_snapshot,
            "student_name": admission.student.full_name if admission.student else admission.student_name_snapshot,
            "student_reg_no": admission.student.registration_no if admission.student else "—",
            "student_mobile": admission.student.mobile if admission.student else None,
            "student_father_name": admission.student.father_name if admission.student else None,
            "admission_number": admission.admission_number,
            "total_admission_payable": float(admission.total_payable),
            "total_amount_paid_so_far": float(admission.amount_paid),
            "remaining_balance_due": float(admission.balance_due),
            "written_off_amount": float(admission.written_off_amount or Decimal("0.00")),
            "valid_from": p.valid_from.isoformat() if p.valid_from else (admission.valid_from.isoformat() if admission.valid_from else None),
            "valid_to": p.valid_to.isoformat() if p.valid_to else (admission.valid_to.isoformat() if admission.valid_to else None),
            "fee_period": p.fee_period,
            "allocations": alloc_data
        }
        title_suffix = "Initial Payment" if idx == 0 and p.amount < admission.total_payable else "Due Balance Cleared" if p.amount >= admission.balance_due else "Installment Payment"
        slips.append(
            SlipItemResponse(
                id=p.id,
                slip_type="PAYMENT_RECEIPT",
                slip_number=p.payment_number,
                date=p.payment_date,
                title=f"Payment Receipt #{idx + 1} ({title_suffix})",
                amount=p.amount,
                mode=p.payment_mode,
                ref=p.transaction_reference,
                collector_or_processor=p.collector_name_snapshot,
                notes=p.notes,
                status_badge="PAID",
                data=p_receipt_data
            )
        )

    # 3. Refunds / Revocation Vouchers
    c_str = ", ".join(i.item_name_snapshot for i in admission.items)
    for idx, r in enumerate(refunds):
        r_receipt_data = {
            "refund_number": r.refund_number,
            "refund_date": r.refund_date.isoformat(),
            "amount": float(r.amount),
            "refund_mode": r.refund_mode,
            "reason": r.reason,
            "processor_name": r.processor_name_snapshot,
            "student_name": admission.student.full_name if admission.student else admission.student_name_snapshot,
            "student_reg_no": admission.student.registration_no if admission.student else "—",
            "student_mobile": admission.student.mobile if admission.student else None,
            "student_father_name": admission.student.father_name if admission.student else None,
            "admission_number": admission.admission_number,
            "course_name": c_str,
            "admission_total_payable": float(admission.total_payable),
            "net_amount_paid_after_refund": float(admission.amount_paid),
            "remaining_balance_due": float(admission.balance_due),
            "notes": r.notes
        }
        slips.append(
            SlipItemResponse(
                id=r.id,
                slip_type="REFUND_VOUCHER",
                slip_number=r.refund_number,
                date=r.refund_date,
                title="Fee Refund Voucher (Batch Revocation / Refund)",
                amount=r.amount,
                mode=r.refund_mode,
                ref=None,
                collector_or_processor=r.processor_name_snapshot,
                notes=r.reason,
                status_badge="REFUNDED",
                data=r_receipt_data
            )
        )

    # 4. Waivers (FinancialTransaction with txn_type == "WAIVER")
    w_query = (
        select(FinancialTransaction)
        .where(
            FinancialTransaction.admission_id == admission_id,
            FinancialTransaction.txn_type == "WAIVER"
        )
        .order_by(FinancialTransaction.txn_at.asc())
    )
    waivers = (await db.execute(w_query)).scalars().all()
    for w in waivers:
        w_receipt_data = {
            "voucher_number": w.txn_number,
            "waiver_number": w.txn_number,
            "date": w.txn_at.isoformat(),
            "amount": float(w.signed_amount),
            "reason": w.reason,
            "student_name": admission.student.full_name if admission.student else admission.student_name_snapshot,
            "student_reg_no": admission.student.registration_no if admission.student else "—",
            "student_mobile": admission.student.mobile if admission.student else None,
            "student_father_name": admission.student.father_name if admission.student else None,
            "admission_number": admission.admission_number,
            "total_admission_payable": float(admission.total_payable),
            "total_amount_paid": float(admission.amount_paid),
            "total_written_off": float(admission.written_off_amount or 0),
            "remaining_balance_due": float(admission.balance_due),
        }
        slips.append(
            SlipItemResponse(
                id=w.id,
                slip_type="WAIVER_VOUCHER",
                slip_number=w.txn_number,
                date=w.txn_at,
                title="Fee Due Waiver Voucher (Maaf)",
                amount=w.signed_amount,
                mode="WAIVER",
                ref=w.reference or admission.admission_number,
                collector_or_processor=admission.student_name_snapshot,
                notes=w.reason,
                status_badge="WAIVED",
                data=w_receipt_data
            )
        )

    return AdmissionSlipsResponse(
        admission_id=admission.id,
        admission_number=admission.admission_number,
        admission_date=admission.admission_date,
        student_id=admission.student_id,
        student_name=admission.student.full_name if admission.student else admission.student_name_snapshot,
        student_reg_no=admission.student.registration_no if admission.student else None,
        student_mobile=admission.student.mobile if admission.student else None,
        student_father_name=admission.student.father_name if admission.student else None,
        total_payable=admission.total_payable,
        amount_paid=admission.amount_paid,
        balance_due=admission.balance_due,
        payment_status=admission.payment_status,
        status=admission.status,
        valid_from=admission.valid_from,
        valid_to=admission.valid_to,
        written_off_amount=admission.written_off_amount or Decimal("0.00"),
        items=admission.items,
        slips=slips
    )

@router.post("/{admission_id}/cancel", response_model=AdmissionResponse)
async def cancel_admission(
    admission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    query = (
        select(Admission)
        .options(selectinload(Admission.items), selectinload(Admission.student))
        .where(Admission.id == admission_id)
        .with_for_update(of=Admission)
    )
    res = await db.execute(query)
    admission = res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Admission not found")

    admission = await cancel_admission_service(admission, db, current_user)
    await db.commit()
    await db.refresh(admission)
    return admission

@router.post("/{admission_id}/revoke", response_model=AdmissionResponse)
async def revoke_batch_purchase(
    admission_id: uuid.UUID,
    payload: AdmissionRevokeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    query = (
        select(Admission)
        .options(selectinload(Admission.items), selectinload(Admission.student))
        .where(Admission.id == admission_id)
        .with_for_update(of=Admission)
    )
    res = await db.execute(query)
    admission = res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Course purchase / admission not found")

    l_refs = [(lr.item_id, lr.refund_amount) for lr in payload.line_refunds] if payload.line_refunds else None
    admission = await revoke_admission_service(
        admission=admission,
        db=db,
        current_user=current_user,
        reason=payload.reason,
        revoke_type=payload.revoke_type,
        scope=payload.scope,
        item_ids=payload.item_ids,
        effective_date=payload.effective_date,
        pending_due_action=payload.pending_due_action,
        refund_amount=payload.refund_amount,
        refund_mode=payload.refund_mode,
        line_refunds=l_refs
    )
    await db.commit()
    await db.refresh(admission)
    return admission

@router.post("/{admission_id}/restore", response_model=AdmissionResponse)
async def restore_batch_purchase(
    admission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    query = (
        select(Admission)
        .options(selectinload(Admission.items), selectinload(Admission.student))
        .where(Admission.id == admission_id)
        .with_for_update(of=Admission)
    )
    res = await db.execute(query)
    admission = res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Course purchase / admission not found")

    admission = await restore_admission_service(admission, db, current_user)
    await db.commit()
    await db.refresh(admission)
    return admission


@router.post("/{admission_id}/waive", response_model=AdmissionResponse)
async def waive_admission_due(
    admission_id: uuid.UUID,
    payload: AdmissionWaiveDueRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Directly waive / forgive (maaf) an outstanding due balance on an admission.
    Restricted to ADMIN role (HTTP 403 otherwise).
    Generates append-only FinancialTransaction with txn_type='WAIVER' and AuditLog entry.
    """
    query = (
        select(Admission)
        .options(selectinload(Admission.items), selectinload(Admission.student))
        .where(Admission.id == admission_id)
        .with_for_update(of=Admission)
    )
    res = await db.execute(query)
    admission = res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Course purchase / admission not found")

    admission, f_txn = await waive_due_service(
        admission=admission,
        db=db,
        current_user=current_user,
        reason=payload.reason,
        amount=payload.amount,
        item_id=payload.item_id
    )

    await db.commit()
    await db.refresh(admission)
    return admission


@router.patch("/{admission_id}/validity", response_model=AdmissionResponse)
async def update_admission_validity(
    admission_id: uuid.UUID,
    payload: AdmissionValidityUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    query = (
        select(Admission)
        .options(selectinload(Admission.items), selectinload(Admission.student))
        .where(Admission.id == admission_id)
        .with_for_update(of=Admission)
    )
    res = await db.execute(query)
    admission = res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Admission not found")

    # Determine which items to update
    if payload.apply_to_all:
        target_items = list(admission.items)
    elif payload.item_ids is not None:
        target_ids = set(payload.item_ids)
        target_items = [itm for itm in admission.items if itm.id in target_ids]
        if not target_items and payload.item_ids:
            raise HTTPException(status_code=400, detail="None of the specified item_ids belong to this admission")
    else:
        target_items = list(admission.items)

    today = today_kolkata()
    for itm in target_items:
        old_item_from = str(itm.valid_from) if itm.valid_from else None
        old_item_to = str(itm.valid_to) if itm.valid_to else None

        if payload.valid_from is not None:
            itm.valid_from = payload.valid_from
        if payload.valid_to is not None:
            itm.valid_to = payload.valid_to
            if itm.access_status in ["ACTIVE", "EXPIRED"]:
                if itm.valid_to < today:
                    itm.access_status = "EXPIRED"
                    itm.status = "EXPIRED"
                else:
                    itm.access_status = "ACTIVE"
                    itm.status = "ACTIVE"

        audit = AuditLog(
            user_id=current_user.id,
            action="ADMISSION_ITEM_VALIDITY_UPDATED",
            entity_type="ADMISSION_ITEM",
            entity_id=itm.id,
            details=json.dumps({
                "admission_id": str(admission.id),
                "admission_number": admission.admission_number,
                "student_id": str(admission.student_id),
                "item_id": str(itm.id),
                "item_name": itm.item_name_snapshot,
                "old_valid_from": old_item_from,
                "new_valid_from": str(itm.valid_from),
                "old_valid_to": old_item_to,
                "new_valid_to": str(itm.valid_to),
                "reason": payload.notes
            })
        )
        db.add(audit)

    # Derive admission boundaries as min/max of items
    item_froms = [i.valid_from for i in admission.items if i.valid_from]
    item_tos = [i.valid_to for i in admission.items if i.valid_to]
    if item_froms:
        admission.valid_from = min(item_froms)
    if item_tos:
        admission.valid_to = max(item_tos)

    if payload.notes:
        admission.notes = f"{admission.notes or ''} • [Validity Adjusted: {payload.notes}]".strip()

    await db.commit()
    await db.refresh(admission)
    return admission


@router.post("/{admission_id}/suspend", response_model=AdmissionResponse)
async def suspend_admission(
    admission_id: uuid.UUID,
    payload: AdmissionLifecycleAction,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    query = (
        select(Admission)
        .options(selectinload(Admission.items), selectinload(Admission.student))
        .where(Admission.id == admission_id)
    )
    res = await db.execute(query)
    admission = res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Admission not found")

    admission.status = "SUSPENDED"
    admission.revocation_reason = f"Suspended: {payload.reason}" if payload.reason else "Suspended by Administrator"
    admission.revoked_at = datetime.now(timezone.utc)
    admission.revoked_by = current_user.id

    audit = AuditLog(
        user_id=current_user.id,
        action="ADMISSION_SUSPENDED",
        entity_type="ADMISSION",
        entity_id=admission.id,
        details=json.dumps({
            "purchase_transaction_id": admission.admission_number,
            "student_id": str(admission.student_id),
            "reason": payload.reason
        })
    )
    db.add(audit)
    await db.commit()
    await db.refresh(admission)
    return admission


@router.post("/{admission_id}/resume", response_model=AdmissionResponse)
async def resume_admission(
    admission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    query = (
        select(Admission)
        .options(selectinload(Admission.items), selectinload(Admission.student))
        .where(Admission.id == admission_id)
    )
    res = await db.execute(query)
    admission = res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Admission not found")

    admission.status = "ACTIVE"
    admission.revocation_reason = None
    admission.revoked_at = None
    admission.revoked_by = None

    audit = AuditLog(
        user_id=current_user.id,
        action="ADMISSION_RESUMED",
        entity_type="ADMISSION",
        entity_id=admission.id,
        details=json.dumps({
            "purchase_transaction_id": admission.admission_number,
            "student_id": str(admission.student_id)
        })
    )
    db.add(audit)
    await db.commit()
    await db.refresh(admission)
    return admission


@router.post("/{admission_id}/discontinue", response_model=AdmissionResponse)
async def discontinue_admission(
    admission_id: uuid.UUID,
    payload: AdmissionLifecycleAction,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    query = (
        select(Admission)
        .options(selectinload(Admission.items), selectinload(Admission.student))
        .where(Admission.id == admission_id)
        .with_for_update(of=Admission)
    )
    res = await db.execute(query)
    admission = res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Admission not found")

    before_status = admission.status
    before_paid = admission.amount_paid
    before_due = admission.balance_due
    before_written_off = admission.written_off_amount or Decimal("0.00")

    disc_reason = f"Discontinued: {payload.reason}" if payload.reason else "Discontinued by Student/Admin"
    admission.previous_status = before_status
    admission.previous_access_status = getattr(admission, "access_status", "ACTIVE")
    admission.status = "DISCONTINUED"
    admission.access_status = "REVOKED"
    admission.revocation_reason = disc_reason
    admission.revoked_at = datetime.now(timezone.utc)
    admission.revoked_by = current_user.id

    for itm in admission.items:
        if itm.status not in ["DISCONTINUED", "COMPLETED"]:
            itm.previous_status = itm.status
            itm.previous_access_status = getattr(itm, "access_status", "ACTIVE")
            itm.status = "DISCONTINUED"
            itm.access_status = "REVOKED"
            itm.discontinued_at = datetime.now(timezone.utc)
            itm.lifecycle_reason = disc_reason
            itm.written_off_amount = itm.balance_due
            itm.balance_due = Decimal("0.00")

    await recompute_admission_totals(admission, db)
    await update_student_green_card_status(admission.student_id, db)

    audit = AuditLog(
        user_id=current_user.id,
        action="ADMISSION_DISCONTINUED",
        entity_type="ADMISSION",
        entity_id=admission.id,
        details=json.dumps({
            "purchase_transaction_id": admission.admission_number,
            "student_id": str(admission.student_id),
            "reason": payload.reason,
            "before": {
                "status": before_status,
                "amount_paid": float(before_paid),
                "balance_due": float(before_due),
                "written_off_amount": float(before_written_off)
            },
            "after": {
                "status": "DISCONTINUED",
                "amount_paid": float(admission.amount_paid),
                "balance_due": float(admission.balance_due),
                "written_off_amount": float(admission.written_off_amount or 0)
            }
        })
    )
    db.add(audit)
    await db.commit()
    await db.refresh(admission)
    return admission


@router.patch("/items/{item_id}/validity", response_model=AdmissionItemResponse)
async def update_item_validity(
    item_id: uuid.UUID,
    payload: AdmissionItemValidityUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    query = select(AdmissionItem).where(AdmissionItem.id == item_id)
    res = await db.execute(query)
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Subject enrollment item not found")

    old_from = item.valid_from
    old_to = item.valid_to

    today = today_kolkata()
    if payload.valid_from is not None:
        item.valid_from = payload.valid_from
    if payload.valid_to is not None:
        item.valid_to = payload.valid_to
        if item.access_status in ["ACTIVE", "EXPIRED"]:
            if item.valid_to < today:
                item.access_status = "EXPIRED"
                item.status = "EXPIRED"
            else:
                item.access_status = "ACTIVE"
                item.status = "ACTIVE"

    # Update parent admission boundaries if applicable
    adm_res = await db.execute(select(Admission).options(selectinload(Admission.items)).where(Admission.id == item.admission_id))
    admission = adm_res.scalar_one_or_none()
    if admission and admission.items:
        valid_froms = [i.valid_from for i in admission.items if i.valid_from]
        valid_tos = [i.valid_to for i in admission.items if i.valid_to]
        if valid_froms:
            admission.valid_from = min(valid_froms)
        if valid_tos:
            admission.valid_to = max(valid_tos)

    audit = AuditLog(
        user_id=current_user.id,
        action="ADMISSION_ITEM_VALIDITY_UPDATED",
        entity_type="ADMISSION_ITEM",
        entity_id=item.id,
        details=json.dumps({
            "student_id": str(item.student_id),
            "subject": item.item_name_snapshot,
            "old_valid_from": str(old_from) if old_from else None,
            "old_valid_to": str(old_to) if old_to else None,
            "new_valid_from": str(item.valid_from) if item.valid_from else None,
            "new_valid_to": str(item.valid_to) if item.valid_to else None,
            "notes": payload.notes
        })
    )
    db.add(audit)
    await db.commit()
    await db.refresh(item)
    return item


@router.post("/items/{item_id}/suspend", response_model=AdmissionItemResponse)
async def suspend_admission_item(
    item_id: uuid.UUID,
    payload: AdmissionItemLifecycleAction,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    res = await db.execute(select(AdmissionItem).where(AdmissionItem.id == item_id))
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Subject enrollment item not found")

    item.status = "SUSPENDED"
    item.suspended_at = datetime.now(timezone.utc)
    item.lifecycle_reason = payload.reason or "Suspended by Administrator"

    audit = AuditLog(
        user_id=current_user.id,
        action="ADMISSION_ITEM_SUSPENDED",
        entity_type="ADMISSION_ITEM",
        entity_id=item.id,
        details=json.dumps({
            "student_id": str(item.student_id),
            "subject": item.item_name_snapshot,
            "reason": payload.reason
        })
    )
    db.add(audit)
    await db.commit()
    await db.refresh(item)
    return item


@router.post("/items/{item_id}/resume", response_model=AdmissionItemResponse)
async def resume_admission_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    res = await db.execute(select(AdmissionItem).where(AdmissionItem.id == item_id))
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Subject enrollment item not found")

    item.status = "ACTIVE"
    item.suspended_at = None
    item.lifecycle_reason = None

    audit = AuditLog(
        user_id=current_user.id,
        action="ADMISSION_ITEM_RESUMED",
        entity_type="ADMISSION_ITEM",
        entity_id=item.id,
        details=json.dumps({
            "student_id": str(item.student_id),
            "subject": item.item_name_snapshot
        })
    )
    db.add(audit)
    await db.commit()
    await db.refresh(item)
    return item


@router.post("/items/{item_id}/discontinue", response_model=AdmissionItemResponse)
async def discontinue_admission_item(
    item_id: uuid.UUID,
    payload: AdmissionItemLifecycleAction,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    res = await db.execute(select(AdmissionItem).where(AdmissionItem.id == item_id))
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Subject enrollment item not found")

    before_status = item.status
    before_due = item.balance_due

    item.previous_status = item.status
    item.status = "DISCONTINUED"
    item.access_status = "REVOKED"
    item.discontinued_at = datetime.now(timezone.utc)
    item.lifecycle_reason = payload.reason or "Discontinued by Student/Admin"
    item.written_off_amount = item.balance_due
    item.balance_due = Decimal("0.00")

    adm_res = await db.execute(
        select(Admission).options(selectinload(Admission.items)).where(Admission.id == item.admission_id).with_for_update(of=Admission)
    )
    admission = adm_res.scalar_one_or_none()
    if admission:
        await recompute_admission_totals(admission, db)
        await update_student_green_card_status(admission.student_id, db)

    audit = AuditLog(
        user_id=current_user.id,
        action="ADMISSION_ITEM_DISCONTINUED",
        entity_type="ADMISSION_ITEM",
        entity_id=item.id,
        details=json.dumps({
            "student_id": str(item.student_id),
            "subject": item.item_name_snapshot,
            "reason": payload.reason,
            "before_status": before_status,
            "after_status": "DISCONTINUED",
            "written_off_amount": float(before_due)
        })
    )
    db.add(audit)
    await db.commit()
    await db.refresh(item)
    return item


@router.post("/items/{item_id}/renew", response_model=AdmissionResponse, status_code=status.HTTP_201_CREATED)
async def renew_admission_item_endpoint(
    item_id: uuid.UUID,
    payload: ItemRenewalRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    target_item_ids = [item_id]
    if payload.additional_item_ids:
        for aid in payload.additional_item_ids:
            if aid not in target_item_ids:
                target_item_ids.append(aid)

    item_overrides = {}
    if payload.items:
        for itm_spec in payload.items:
            item_overrides[itm_spec.item_id] = itm_spec.model_dump(exclude_unset=True)

    default_params = {
        "valid_from": payload.valid_from,
        "valid_to": payload.valid_to,
        "months": payload.months,
        "fee": payload.fee,
        "price_override_reason": payload.price_override_reason,
        "discount_type": payload.discount_type,
        "discount_value": payload.discount_value,
        "batch_id": payload.batch_id,
        "teacher_id": payload.teacher_id,
    }

    adm = await renew_admission_items_service(
        db=db,
        current_user=current_user,
        target_item_ids=target_item_ids,
        item_overrides=item_overrides,
        default_params=default_params,
        initial_payment=payload.initial_payment,
        notes=payload.notes
    )
    return adm


@router.post("/calculate-renewal", response_model=RenewalCalculateResponse)
async def calculate_renewal_endpoint(
    payload: RenewalCalculateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    """
    Computes authoritative renewal payable from subject fee rate, renewal period (months/days divide),
    and discount.
    """
    base_fee = None
    if payload.batch_id:
        bs_res = await db.execute(
            select(BatchSubject).where(
                BatchSubject.batch_id == payload.batch_id,
                BatchSubject.subject_id == payload.subject_id
            )
        )
        bs = bs_res.scalar_one_or_none()
        if bs and bs.fee is not None:
            base_fee = bs.fee

    if base_fee is None:
        s_res = await db.execute(select(Subject).where(Subject.id == payload.subject_id))
        subj = s_res.scalar_one_or_none()
        if subj and subj.default_fee is not None:
            base_fee = subj.default_fee

    if base_fee is None and payload.student_id:
        prev_stmt = (
            select(AdmissionItem)
            .where(
                AdmissionItem.student_id == payload.student_id,
                AdmissionItem.subject_id == payload.subject_id
            )
            .order_by(AdmissionItem.created_at.desc())
        )
        prev_res = await db.execute(prev_stmt)
        prev_item = prev_res.scalars().first()
        if prev_item:
            base_fee = prev_item.original_price

    if base_fee is None:
        base_fee = Decimal("0.00")

    breakdown = calculate_course_duration_breakdown(
        monthly_fee=base_fee,
        valid_from=payload.valid_from,
        valid_to=payload.valid_to,
        months=payload.months,
        fee_override=payload.fee,
        price_override_reason=payload.price_override_reason,
        discount_type=payload.discount_type,
        discount_value=payload.discount_value
    )

    return RenewalCalculateResponse(
        subject_id=payload.subject_id,
        base_monthly_fee=breakdown["base_monthly_fee"],
        duration_days=breakdown["duration_days"],
        duration_factor=breakdown["duration_factor"],
        fee=breakdown["fee"],
        computed_standard_fee=breakdown["computed_standard_fee"],
        discount_type=breakdown["discount_type"],
        discount_value=breakdown["discount_value"],
        discount_amount=breakdown["discount_amount"],
        net_payable=breakdown["net_payable"]
    )


@router.post("/renew-subject", response_model=AdmissionResponse, status_code=status.HTTP_201_CREATED)
async def renew_subject(
    payload: SubjectRenewalRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    # Verify student exists
    st_res = await db.execute(select(Student).where(Student.id == payload.student_id))
    student = st_res.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Find the most recent active/expired AdmissionItem for student_id and subject_id
    stmt = (
        select(AdmissionItem)
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .where(
            AdmissionItem.student_id == payload.student_id,
            AdmissionItem.subject_id == payload.subject_id,
            AdmissionItem.status != "DISCONTINUED",
            Admission.document_status == "VALID",
            Admission.status != "CANCELLED"
        )
        .order_by(
            func.coalesce(AdmissionItem.valid_to, Admission.valid_to).desc(),
            AdmissionItem.created_at.desc()
        )
    )
    res = await db.execute(stmt)
    target_item = res.scalars().first()

    default_params = {
        "valid_from": payload.valid_from,
        "valid_to": payload.valid_to,
        "months": payload.months,
        "fee": payload.fee,
        "price_override_reason": payload.price_override_reason,
        "discount_type": payload.discount_type,
        "discount_value": payload.discount_value,
        "batch_id": payload.batch_id,
        "teacher_id": payload.teacher_id,
    }

    if target_item:
        return await renew_admission_items_service(
            db=db,
            current_user=current_user,
            target_item_ids=[target_item.id],
            item_overrides=None,
            default_params=default_params,
            initial_payment=payload.initial_payment,
            notes=payload.notes
        )
    else:
        # Check if discontinued item exists to raise proper error
        disc_stmt = (
            select(AdmissionItem)
            .where(
                AdmissionItem.student_id == payload.student_id,
                AdmissionItem.subject_id == payload.subject_id,
                AdmissionItem.status == "DISCONTINUED"
            )
        )
        disc_res = await db.execute(disc_stmt)
        disc_item = disc_res.scalars().first()
        if disc_item:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot renew discontinued subject line '{disc_item.item_name_snapshot}'. Enroll as a new subject instead."
            )
        raise HTTPException(
            status_code=404,
            detail="No previous enrollment found for this student and subject to renew."
        )


@router.post("/change-subject", response_model=AdmissionResponse, status_code=status.HTTP_201_CREATED)
async def change_subject(
    payload: SubjectChangeRequest,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    if idempotency_key:
        cached = await get_idempotency_record(db, idempotency_key, "POST /api/admissions/change-subject")
        if cached:
            return build_idempotent_response(cached)

    # 1. Verify student exists
    st_res = await db.execute(select(Student).where(Student.id == payload.student_id))
    student = st_res.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # 2. Locate and discontinue old subject line if specified
    old_item = None
    if payload.old_item_id:
        old_res = await db.execute(
            select(AdmissionItem).where(
                AdmissionItem.id == payload.old_item_id,
                AdmissionItem.student_id == payload.student_id
            )
        )
        old_item = old_res.scalar_one_or_none()
    elif payload.old_subject_id:
        old_stmt = (
            select(AdmissionItem)
            .join(Admission, AdmissionItem.admission_id == Admission.id)
            .where(
                AdmissionItem.student_id == payload.student_id,
                AdmissionItem.subject_id == payload.old_subject_id,
                AdmissionItem.status != "DISCONTINUED",
                Admission.document_status == "VALID",
                Admission.status != "CANCELLED"
            )
            .order_by(
                func.coalesce(AdmissionItem.valid_to, Admission.valid_to).desc(),
                AdmissionItem.created_at.desc()
            )
        )
        old_item = (await db.execute(old_stmt)).scalars().first()

    # 3. Verify new subject exists
    sub_res = await db.execute(select(Subject).where(Subject.id == payload.new_subject_id))
    new_sub = sub_res.scalar_one_or_none()
    if not new_sub:
        raise HTTPException(status_code=404, detail="New subject not found")

    # If old item exists, mark it as DISCONTINUED and clear balance due
    if old_item and old_item.status != "DISCONTINUED":
        old_item.previous_status = old_item.status
        old_item.status = "DISCONTINUED"
        old_item.access_status = "REVOKED"
        old_item.discontinued_at = datetime.now(timezone.utc)
        note_text = f": {payload.notes}" if payload.notes else ""
        old_item.lifecycle_reason = f"Changed subject to {new_sub.name}{note_text}"
        old_item.written_off_amount = old_item.balance_due
        old_item.balance_due = Decimal("0.00")

        old_adm_res = await db.execute(
            select(Admission).options(selectinload(Admission.items)).where(Admission.id == old_item.admission_id)
        )
        old_adm = old_adm_res.scalar_one_or_none()
        if old_adm:
            await recompute_admission_totals(old_adm, db)

    # 4. Resolve validity dates
    val_from = payload.valid_from or date.today()
    if payload.valid_to:
        val_to = payload.valid_to
    else:
        val_to, _ = compute_rolling_cycle_end(val_from, payload.months or 1)

    if val_to < val_from:
        raise HTTPException(status_code=400, detail="End date cannot be earlier than start date")

    # 5. Overlap check for student with the NEW subject
    overlap_stmt = (
        select(AdmissionItem)
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .where(
            AdmissionItem.student_id == payload.student_id,
            AdmissionItem.subject_id == payload.new_subject_id,
            AdmissionItem.status != "DISCONTINUED",
            Admission.document_status == "VALID",
            Admission.status != "CANCELLED",
            AdmissionItem.valid_from != None,
            AdmissionItem.valid_to != None,
            AdmissionItem.valid_from <= val_to,
            AdmissionItem.valid_to >= val_from
        )
    )
    overlap_res = await db.execute(overlap_stmt)
    overlap = overlap_res.scalars().first()
    if overlap:
        raise HTTPException(
            status_code=409,
            detail=f"Student already has an overlapping active enrollment for '{new_sub.name}' from {overlap.valid_from} to {overlap.valid_to}."
        )

    # 6. Resolve teacher, hall, and compensation
    t_id = payload.teacher_id or new_sub.teacher_id
    t_name = new_sub.teacher_name_snapshot
    h_no = new_sub.hall_number or "Main Hall"
    if payload.teacher_id:
        t_res = await db.execute(select(Teacher).where(Teacher.id == payload.teacher_id))
        t_obj = t_res.scalar_one_or_none()
        if not t_obj:
            raise HTTPException(status_code=400, detail="Teacher not found")
        if t_obj.status != "ACTIVE":
            raise HTTPException(status_code=400, detail="Cannot assign an inactive teacher")
        t_name = t_obj.name

    s_type = "PERCENT"
    s_val = Decimal("0.00")
    s_pct = Decimal("0.00")
    if t_id:
        t_res = await db.execute(select(Teacher).where(Teacher.id == t_id))
        t_obj = t_res.scalar_one_or_none()
        if t_obj:
            s_type = t_obj.share_type or "PERCENT"
            s_val = t_obj.share_value or Decimal("0.00")
            s_pct = s_val if s_type == "PERCENT" else None

    # 7. Fee calculation
    std_fee = Decimal(str(payload.fee if payload.fee is not None else new_sub.default_fee))
    raw_calc_item = {
        "price": std_fee,
        "discount_type": payload.discount_type,
        "discount_value": payload.discount_value
    }
    calc = calculate_admission_financials(
        items=[raw_calc_item],
        overall_discount_type="NONE",
        overall_discount_value=Decimal("0.00"),
        gst_enabled=False,
        gst_rate=Decimal("18.00")
    )
    calc_item = calc["items"][0]

    # 8. Generate sequential admission number
    adm_no = await next_number(db, "ADM")

    admission = Admission(
        admission_number=adm_no,
        student_id=student.id,
        student_name_snapshot=student.full_name,
        admission_date=val_from,
        subtotal=calc["subtotal"],
        individual_discount_total=calc["individual_discount_total"],
        overall_discount_type="NONE",
        overall_discount_value=Decimal("0.00"),
        overall_discount_amount=Decimal("0.00"),
        total_discount=calc["total_discount"],
        gst_enabled=calc["gst_enabled"],
        gst_rate=calc["gst_rate"],
        taxable_base=calc["taxable_base"],
        gst_amount=calc["gst_amount"],
        total_payable=calc["total_payable"],
        amount_paid=Decimal("0.00"),
        balance_due=calc["total_payable"],
        payment_status="UNPAID",
        status="ACTIVE",
        notes=payload.notes or f"Changed subject from {old_item.item_name_snapshot if old_item else 'previous course'} to {new_sub.name}",
        valid_from=val_from,
        valid_to=val_to,
        created_by=current_user.id
    )
    db.add(admission)
    await db.flush()

    ai = AdmissionItem(
        admission=admission,
        student_id=student.id,
        item_type="BATCH_SUBJECT",
        batch_id=payload.batch_id,
        subject_id=new_sub.id,
        teacher_id=t_id,
        teacher_name_snapshot=t_name,
        hall_number_snapshot=h_no,
        item_name_snapshot=new_sub.name,
        original_price=std_fee,
        discount_type=payload.discount_type,
        discount_value=payload.discount_value,
        discount_amount=calc_item["individual_discount"],
        overall_discount_share=Decimal("0.00"),
        net_price=calc_item["net_price"],
        amount_collected=Decimal("0.00"),
        balance_due=calc_item["net_price"],
        valid_from=val_from,
        valid_to=val_to,
        renewed_from_item_id=old_item.id if old_item else None,
        price_override_reason=payload.price_override_reason,
        share_type=s_type,
        share_value=s_val,
        share_percent=s_pct
    )
    db.add(ai)
    await db.flush()

    # 9. Process Initial Payment if provided
    if payload.initial_payment and payload.initial_payment.amount > Decimal("0.00"):
        if payload.initial_payment.amount > admission.total_payable:
            raise HTTPException(
                status_code=400,
                detail=f"Initial payment amount ₹{payload.initial_payment.amount} exceeds total payable ₹{admission.total_payable}"
            )
        await record_payment_service(
            db=db,
            admission=admission,
            amount=payload.initial_payment.amount,
            payment_mode=payload.initial_payment.payment_mode,
            collected_by_user=current_user,
            transaction_reference=payload.initial_payment.transaction_reference,
            notes=payload.initial_payment.notes or f"Payment collected at subject change to {new_sub.name}",
            valid_from=val_from,
            valid_to=val_to,
            fee_period=f"{val_from} to {val_to}",
            allocation_mode=payload.initial_payment.allocation_mode,
            manual_allocations=payload.initial_payment.manual_allocations
        )

    # 10. Audit log
    audit = AuditLog(
        user_id=current_user.id,
        action="SUBJECT_CHANGED",
        entity_type="ADMISSION",
        entity_id=admission.id,
        details=json.dumps({
            "admission_number": admission.admission_number,
            "student_id": str(admission.student_id),
            "student_name": student.name,
            "old_item_id": str(old_item.id) if old_item else None,
            "old_subject": old_item.item_name_snapshot if old_item else None,
            "new_subject": new_sub.name,
            "valid_from": str(val_from),
            "valid_to": str(val_to),
            "total_payable": float(admission.total_payable),
            "amount_paid": float(admission.amount_paid),
            "balance_due": float(admission.balance_due)
        })
    )
    db.add(audit)

    await db.commit()

    full_adm = await get_admission(admission.id, db, current_user)

    if idempotency_key:
        resp_data = AdmissionResponse.model_validate(full_adm).model_dump(mode="json")
        await save_idempotency_record(
            db,
            idempotency_key,
            "POST /api/admissions/change-subject",
            status.HTTP_201_CREATED,
            resp_data
        )
        await db.commit()

    return full_adm
