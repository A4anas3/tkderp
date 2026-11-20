import uuid
import json
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.core.dependencies import require_staff, require_cashier_or_admin, require_admin
from app.database.models import (
    Admission, AdmissionItem, Student, Payment, PaymentAllocation, GreenCardProduct, User, BatchSubject, Refund, AuditLog,
    Subject, Batch, Teacher
)
from app.modules.admissions.schemas import (
    AdmissionCreate, AdmissionResponse, AdmissionCalculatePreviewRequest, AdmissionItemResponse, AdmissionRevokeRequest,
    AdmissionSlipsResponse, SlipItemResponse, AdmissionValidityUpdate, AdmissionLifecycleAction,
    AdmissionItemValidityUpdate, AdmissionItemLifecycleAction, SubjectRenewalRequest
)
from app.common.calculations import (
    calculate_admission_financials, allocate_payment_proportionally, compute_rolling_cycle_end
)
from app.common.pagination import PaginationParams, PageResponse
from app.common.numbering import next_number
from app.common.idempotency import get_idempotency_record, save_idempotency_record, build_idempotent_response
from app.modules.ledger.service import (
    record_payment_service, process_refund_service, recompute_admission_totals
)

async def update_student_green_card_flag(student_id: uuid.UUID, db: AsyncSession) -> None:
    """
    Checks if the student has any active green card line.
    Green card flag only changes if the student has no other active green-card line.
    """
    stmt = (
        select(AdmissionItem)
        .join(Admission, Admission.id == AdmissionItem.admission_id)
        .where(
            Admission.student_id == student_id,
            AdmissionItem.item_type == "GREEN_CARD",
            AdmissionItem.access_status == "ACTIVE",
            Admission.document_status == "VALID",
            (AdmissionItem.valid_to == None) | (AdmissionItem.valid_to >= date.today())
        )
    )
    res = await db.execute(stmt)
    active_gc_item = res.scalars().first()

    st_res = await db.execute(select(Student).where(Student.id == student_id))
    st = st_res.scalar_one_or_none()
    if st:
        st.has_green_card = active_gc_item is not None

router = APIRouter(prefix="/api/admissions", tags=["Admissions"])

@router.post("/preview")
async def preview_admission_calculation(
    payload: AdmissionCalculatePreviewRequest,
    current_user: User = Depends(require_staff)
):
    items_data = [
        {
            "price": itm.original_price,
            "discount_type": itm.discount_type,
            "discount_value": itm.discount_value,
            "item_name_snapshot": itm.item_name_snapshot,
            "item_type": itm.item_type
        }
        for itm in payload.items
    ]
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
    current_user: User = Depends(require_staff)
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
    raw_items = [
        {
            "raw_item": itm,
            "price": itm.original_price,
            "discount_type": itm.discount_type,
            "discount_value": itm.discount_value
        }
        for itm in payload.items
    ]
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

        if (not t_name or not h_no) and raw.batch_id and raw.subject_id:
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

        ai = AdmissionItem(
            admission=admission,
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
            valid_to=itm_to
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

@router.get("/{admission_id}", response_model=AdmissionResponse)
async def get_admission(
    admission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
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
            items_payload = [{"id": ai.id, "balance_due": ai.net_price} for ai in admission.items]
            allocations = allocate_payment_proportionally(admission.amount_paid, items_payload)
            changed = False
            for itm_id, alloc_amt in allocations:
                for ai in admission.items:
                    if ai.id == itm_id and (ai.amount_collected != alloc_amt or ai.balance_due != (ai.net_price - alloc_amt)):
                        ai.amount_collected = alloc_amt
                        ai.balance_due = max(Decimal("0.00"), ai.net_price - alloc_amt)
                        changed = True
            if changed:
                await db.commit()
                await db.refresh(admission)

    return admission

@router.get("/{admission_id}/slips", response_model=AdmissionSlipsResponse)
async def get_admission_slips(
    admission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
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
                "original_price": float(itm.original_price),
                "discount_amount": float(itm.discount_amount),
                "overall_discount_share": float(itm.overall_discount_share),
                "net_price": float(itm.net_price),
                "amount_collected": float(itm.amount_collected),
                "balance_due": float(itm.balance_due),
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
    for idx, p in enumerate(payments):
        alloc_data = [
            {
                "item_name": item_names_map.get(a.admission_item_id, "Course Item"),
                "allocated_amount": float(a.allocated_amount)
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
        items=admission.items,
        slips=slips
    )

@router.post("/{admission_id}/cancel", response_model=AdmissionResponse)
async def cancel_admission(
    admission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Cancels an admission as ENTRY_MISTAKE (the old cancel).
    Allowed only when net money paid is zero. Sets document_status VOID.
    """
    query = (
        select(Admission)
        .options(selectinload(Admission.items), selectinload(Admission.student))
        .where(Admission.id == admission_id)
        .with_for_update()
    )
    res = await db.execute(query)
    admission = res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Admission not found")

    if getattr(admission, "document_status", "VALID") == "VOID":
        raise HTTPException(status_code=409, detail="Admission document is already VOID")

    if admission.amount_paid > Decimal("0.00"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel admission with paid fees ₹{admission.amount_paid}. Refund fees first."
        )

    admission.document_status = "VOID"
    admission.status = "CANCELLED"
    admission.access_status = "REVOKED"
    admission.revoke_type = "ENTRY_MISTAKE"
    admission.revocation_reason = "Cancelled by administrator as entry mistake"
    admission.revoked_at = datetime.now(timezone.utc)
    admission.revoked_by = current_user.id
    admission.balance_due = Decimal("0.00")
    admission.payment_status = "VOID"

    for itm in admission.items:
        itm.access_status = "REVOKED"
        itm.status = "DISCONTINUED"
        itm.balance_due = Decimal("0.00")

    await update_student_green_card_flag(admission.student_id, db)

    audit = AuditLog(
        user_id=current_user.id,
        action="BATCH_PURCHASE_CANCELLED",
        entity_type="ADMISSION",
        entity_id=admission.id,
        details=json.dumps({
            "purchase_transaction_id": admission.admission_number,
            "student_name": admission.student_name_snapshot,
            "reason": "Cancelled by administrator as entry mistake",
            "document_status": "VOID"
        })
    )
    db.add(audit)
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
    """
    Revocation handling according to P2 specification:
    - DROPOUT_NO_REFUND: lines -> REVOKED, valid_to = effective_date, money untouched,
      payment_status unchanged, forfeited_amount = collected. Teacher earnings stay.
    - DROPOUT_WITH_REFUND: processes refund for requested amount/lines, then revokes.
    - ENTRY_MISTAKE: allowed only when net money paid is zero; sets document_status VOID.
    - pending_due_action: WAIVE (admin only, stores written_off_amount) vs KEEP_DUE (leaves collectable).
    - Double revoke / double cancel -> 409 Conflict.
    """
    query = (
        select(Admission)
        .options(selectinload(Admission.items), selectinload(Admission.student))
        .where(Admission.id == admission_id)
        .with_for_update()
    )
    res = await db.execute(query)
    admission = res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Course purchase / admission not found")

    # Double revoke / cancel checks (409)
    if getattr(admission, "document_status", "VALID") == "VOID":
        raise HTTPException(status_code=409, detail="Admission document is already VOID")

    if payload.scope == "WHOLE_SLIP":
        if getattr(admission, "access_status", "ACTIVE") == "REVOKED":
            raise HTTPException(status_code=409, detail="Admission access is already REVOKED")
        target_items = admission.items
    else:
        # SELECTED_ITEMS
        target_ids = set(payload.item_ids or [])
        target_items = [itm for itm in admission.items if itm.id in target_ids]
        if not target_items:
            raise HTTPException(status_code=400, detail="No matching subject lines found for revocation")
        if all(getattr(itm, "access_status", "ACTIVE") == "REVOKED" for itm in target_items):
            raise HTTPException(status_code=409, detail="All selected subject lines are already REVOKED")

    # Guard ENTRY_MISTAKE
    if payload.revoke_type == "ENTRY_MISTAKE":
        if admission.amount_paid > Decimal("0.00"):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot mark admission as ENTRY_MISTAKE because ₹{admission.amount_paid} has been paid. Refund fees first or use DROPOUT_WITH_REFUND."
            )
        before_status = getattr(admission, "access_status", "ACTIVE")
        admission.document_status = "VOID"
        admission.status = "CANCELLED"
        admission.access_status = "REVOKED"
        admission.revoke_type = "ENTRY_MISTAKE"
        admission.revocation_reason = payload.reason.strip()
        admission.revoked_at = datetime.now(timezone.utc)
        admission.revoked_by = current_user.id
        admission.payment_status = "VOID"
        admission.balance_due = Decimal("0.00")

        for itm in admission.items:
            itm.access_status = "REVOKED"
            itm.status = "DISCONTINUED"
            itm.balance_due = Decimal("0.00")

        await update_student_green_card_flag(admission.student_id, db)

        audit = AuditLog(
            user_id=current_user.id,
            action="BATCH_PURCHASE_REVOKED",
            entity_type="ADMISSION",
            entity_id=admission.id,
            details=json.dumps({
                "admission_number": admission.admission_number,
                "revoke_type": "ENTRY_MISTAKE",
                "before_status": before_status,
                "after_status": "REVOKED",
                "document_status": "VOID",
                "reason": payload.reason.strip()
            })
        )
        db.add(audit)
        await db.commit()
        await db.refresh(admission)
        return admission

    # Check WAIVE permission
    if payload.pending_due_action == "WAIVE" and current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Only administrators can waive pending dues")

    # Handle refund if DROPOUT_WITH_REFUND or refund amount provided
    if payload.revoke_type == "DROPOUT_WITH_REFUND" or (payload.refund_amount and payload.refund_amount > Decimal("0.00")) or payload.line_refunds:
        l_refs = [(lr.item_id, lr.refund_amount) for lr in payload.line_refunds] if payload.line_refunds else None
        tot_ref = sum((lr.refund_amount for lr in payload.line_refunds), Decimal("0.00")) if payload.line_refunds else (payload.refund_amount or Decimal("0.00"))
        if tot_ref > Decimal("0.00"):
            await process_refund_service(
                db=db,
                admission=admission,
                amount=tot_ref,
                refund_mode=payload.refund_mode,
                reason=f"Dropout refund: {payload.reason.strip()}",
                current_user=current_user,
                line_refunds=l_refs
            )

    eff_date = payload.effective_date or date.today()
    before_admission_status = getattr(admission, "access_status", "ACTIVE")

    for itm in target_items:
        itm.previous_access_status = getattr(itm, "access_status", "ACTIVE")
        itm.access_status = "REVOKED"
        itm.status = "DISCONTINUED"
        itm.revoke_type = payload.revoke_type
        itm.valid_to = min(itm.valid_to or eff_date, eff_date)
        itm.discontinued_at = datetime.now(timezone.utc)
        itm.lifecycle_reason = payload.reason.strip()
        itm.forfeited_amount = itm.amount_collected

        if payload.pending_due_action == "WAIVE":
            itm.written_off_amount = itm.balance_due
            itm.balance_due = Decimal("0.00")
            itm.keep_due = False
        else:
            itm.keep_due = True

    admission.previous_access_status = before_admission_status
    if all(getattr(itm, "access_status", "ACTIVE") == "REVOKED" for itm in admission.items):
        admission.access_status = "REVOKED"
        admission.status = "REVOKED"

    admission.revoke_type = payload.revoke_type
    admission.revocation_reason = payload.reason.strip()
    admission.revoked_at = datetime.now(timezone.utc)
    admission.revoked_by = current_user.id
    admission.forfeited_amount = sum((itm.forfeited_amount for itm in admission.items), Decimal("0.00"))

    # Recompute derived totals strictly from allocation ledger and refunds
    await recompute_admission_totals(admission, db)

    # Check green card flag
    await update_student_green_card_flag(admission.student_id, db)

    # Audit log with before / after statuses and amounts
    audit = AuditLog(
        user_id=current_user.id,
        action="BATCH_PURCHASE_REVOKED",
        entity_type="ADMISSION",
        entity_id=admission.id,
        details=json.dumps({
            "admission_number": admission.admission_number,
            "student_name": admission.student_name_snapshot,
            "revoke_type": payload.revoke_type,
            "scope": payload.scope,
            "pending_due_action": payload.pending_due_action,
            "before_access_status": before_admission_status,
            "after_access_status": admission.access_status,
            "amount_paid": float(admission.amount_paid),
            "balance_due": float(admission.balance_due),
            "forfeited_amount": float(admission.forfeited_amount),
            "written_off_amount": float(admission.written_off_amount or 0),
            "reason": payload.reason.strip()
        })
    )
    db.add(audit)
    await db.commit()
    await db.refresh(admission)
    return admission

@router.post("/{admission_id}/restore", response_model=AdmissionResponse)
async def restore_batch_purchase(
    admission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Restores access to previous_access_status (or ACTIVE), clears forfeits & write-offs,
    and recomputes totals.
    """
    query = (
        select(Admission)
        .options(selectinload(Admission.items), selectinload(Admission.student))
        .where(Admission.id == admission_id)
        .with_for_update()
    )
    res = await db.execute(query)
    admission = res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Course purchase / admission not found")

    if getattr(admission, "document_status", "VALID") == "VOID":
        raise HTTPException(status_code=400, detail="Cannot restore an admission marked as VOID (ENTRY_MISTAKE)")

    if getattr(admission, "access_status", "ACTIVE") != "REVOKED" and all(getattr(itm, "access_status", "ACTIVE") != "REVOKED" for itm in admission.items):
        raise HTTPException(status_code=400, detail="Admission is not revoked")

    before_status = getattr(admission, "access_status", "ACTIVE")
    old_reason = admission.revocation_reason

    admission.access_status = getattr(admission, "previous_access_status", None) or "ACTIVE"
    admission.status = "ACTIVE"
    admission.previous_access_status = None
    admission.revoke_type = None
    admission.revocation_reason = None
    admission.revoked_at = None
    admission.revoked_by = None
    admission.forfeited_amount = Decimal("0.00")

    for itm in admission.items:
        if getattr(itm, "access_status", "ACTIVE") == "REVOKED":
            itm.access_status = getattr(itm, "previous_access_status", None) or "ACTIVE"
            itm.status = "ACTIVE"
            itm.previous_access_status = None
            itm.revoke_type = None
            itm.forfeited_amount = Decimal("0.00")
            itm.written_off_amount = Decimal("0.00")
            itm.keep_due = False
            itm.discontinued_at = None
            itm.lifecycle_reason = None

    await recompute_admission_totals(admission, db)
    await update_student_green_card_flag(admission.student_id, db)

    audit = AuditLog(
        user_id=current_user.id,
        action="BATCH_PURCHASE_RESTORED",
        entity_type="ADMISSION",
        entity_id=admission.id,
        details=json.dumps({
            "purchase_transaction_id": admission.admission_number,
            "student_name": admission.student_name_snapshot,
            "before_access_status": before_status,
            "after_access_status": admission.access_status,
            "amount_paid": float(admission.amount_paid),
            "balance_due": float(admission.balance_due),
            "previous_revocation_reason": old_reason
        })
    )
    db.add(audit)
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
    )
    res = await db.execute(query)
    admission = res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Admission not found")

    old_from = str(admission.valid_from) if admission.valid_from else None
    old_to = str(admission.valid_to) if admission.valid_to else None

    if payload.valid_from is not None:
        admission.valid_from = payload.valid_from
        for itm in admission.items:
            itm.valid_from = payload.valid_from

    if payload.valid_to is not None:
        admission.valid_to = payload.valid_to
        for itm in admission.items:
            itm.valid_to = payload.valid_to

    if payload.notes:
        admission.notes = f"{admission.notes or ''} • [Validity Adjusted: {payload.notes}]".strip()

    audit = AuditLog(
        user_id=current_user.id,
        action="ADMISSION_VALIDITY_UPDATED",
        entity_type="ADMISSION",
        entity_id=admission.id,
        details=json.dumps({
            "purchase_transaction_id": admission.admission_number,
            "old_valid_from": old_from,
            "new_valid_from": str(admission.valid_from),
            "old_valid_to": old_to,
            "new_valid_to": str(admission.valid_to),
            "reason": payload.notes
        })
    )
    db.add(audit)
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
            "purchase_transaction_id": admission.admission_number
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
    )
    res = await db.execute(query)
    admission = res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Admission not found")

    admission.status = "DISCONTINUED"
    admission.revocation_reason = f"Discontinued: {payload.reason}" if payload.reason else "Discontinued by Student/Admin"
    admission.revoked_at = datetime.now(timezone.utc)
    admission.revoked_by = current_user.id

    audit = AuditLog(
        user_id=current_user.id,
        action="ADMISSION_DISCONTINUED",
        entity_type="ADMISSION",
        entity_id=admission.id,
        details=json.dumps({
            "purchase_transaction_id": admission.admission_number,
            "reason": payload.reason
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

    if payload.valid_from is not None:
        item.valid_from = payload.valid_from
    if payload.valid_to is not None:
        item.valid_to = payload.valid_to

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

    item.status = "DISCONTINUED"
    item.discontinued_at = datetime.now(timezone.utc)
    item.lifecycle_reason = payload.reason or "Discontinued by Student/Admin"

    audit = AuditLog(
        user_id=current_user.id,
        action="ADMISSION_ITEM_DISCONTINUED",
        entity_type="ADMISSION_ITEM",
        entity_id=item.id,
        details=json.dumps({
            "subject": item.item_name_snapshot,
            "reason": payload.reason
        })
    )
    db.add(audit)
    await db.commit()
    await db.refresh(item)
    return item


@router.post("/renew-subject", response_model=AdmissionResponse, status_code=status.HTTP_201_CREATED)
async def renew_subject(
    payload: SubjectRenewalRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    # Verify and lock student row
    st_res = await db.execute(select(Student).where(Student.id == payload.student_id).with_for_update())
    student = st_res.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Verify subject
    sb_res = await db.execute(select(Subject).where(Subject.id == payload.subject_id))
    subject = sb_res.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    # Resolve Teacher and Hall
    t_id = payload.teacher_id
    t_name = None
    h_no = None

    if t_id:
        t_res = await db.execute(select(Teacher).where(Teacher.id == t_id))
        teacher = t_res.scalar_one_or_none()
        if teacher:
            t_name = teacher.name

    if payload.batch_id:
        b_res = await db.execute(select(Batch).where(Batch.id == payload.batch_id))
        batch = b_res.scalar_one_or_none()
        if batch:
            if not t_name and batch.teacher_name_snapshot:
                t_name = batch.teacher_name_snapshot
            if not h_no and batch.hall_number:
                h_no = batch.hall_number

    # Next sequential admission number atomically
    adm_no = await next_number(db, "ADM")

    # Calculate financials
    raw_item = {
        "price": payload.fee,
        "discount_type": payload.discount_type,
        "discount_value": payload.discount_value
    }
    calc = calculate_admission_financials(
        items=[raw_item],
        overall_discount_type="NONE",
        overall_discount_value=Decimal("0.00"),
        gst_enabled=False,
        gst_rate=Decimal("18.00")
    )

    admission = Admission(
        admission_number=adm_no,
        student_id=student.id,
        student_name_snapshot=student.full_name,
        admission_date=date.today(),
        subtotal=calc["subtotal"],
        individual_discount_total=calc["individual_discount_total"],
        overall_discount_type="NONE",
        overall_discount_value=Decimal("0.00"),
        overall_discount_amount=Decimal("0.00"),
        total_discount=calc["total_discount"],
        gst_enabled=False,
        gst_rate=Decimal("18.00"),
        taxable_base=calc["taxable_base"],
        gst_amount=Decimal("0.00"),
        total_payable=calc["total_payable"],
        amount_paid=Decimal("0.00"),
        balance_due=calc["total_payable"],
        payment_status="UNPAID",
        status="ACTIVE",
        notes=payload.notes or f"Renewal: {subject.name}",
        valid_from=payload.valid_from,
        valid_to=payload.valid_to,
        created_by=current_user.id
    )
    db.add(admission)
    await db.flush()

    item_calc = calc["items"][0]
    ai = AdmissionItem(
        admission=admission,
        item_type="SUBJECT",
        batch_id=payload.batch_id,
        subject_id=subject.id,
        teacher_id=t_id,
        teacher_name_snapshot=t_name,
        hall_number_snapshot=h_no,
        item_name_snapshot=subject.name,
        original_price=item_calc["original_price"],
        discount_type=payload.discount_type,
        discount_value=payload.discount_value,
        discount_amount=item_calc["individual_discount"],
        overall_discount_share=Decimal("0.00"),
        net_price=item_calc["net_price"],
        amount_collected=Decimal("0.00"),
        balance_due=item_calc["net_price"],
        valid_from=payload.valid_from,
        valid_to=payload.valid_to,
        status="ACTIVE"
    )
    db.add(ai)
    await db.flush()

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
            notes=payload.initial_payment.notes or f"Renewal payment for {subject.name}",
            valid_from=payload.valid_from,
            valid_to=payload.valid_to,
            fee_period=f"{payload.valid_from} to {payload.valid_to}",
            allocation_mode=payload.initial_payment.allocation_mode,
            manual_allocations=payload.initial_payment.manual_allocations
        )

    audit = AuditLog(
        user_id=current_user.id,
        action="SUBJECT_RENEWED",
        entity_type="ADMISSION",
        entity_id=admission.id,
        details=json.dumps({
            "student_id": str(student.id),
            "subject": subject.name,
            "valid_from": str(payload.valid_from),
            "valid_to": str(payload.valid_to),
            "fee": str(payload.fee),
            "admission_number": admission.admission_number
        })
    )
    db.add(audit)
    await db.commit()

    # Re-query with eager load of items and student
    stmt = (
        select(Admission)
        .options(selectinload(Admission.items), selectinload(Admission.student))
        .where(Admission.id == admission.id)
    )
    res = await db.execute(stmt)
    full_adm = res.scalar_one()
    return full_adm
