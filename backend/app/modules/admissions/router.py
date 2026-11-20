import uuid
import json
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.core.dependencies import require_staff, require_cashier_or_admin, require_admin
from app.database.models import (
    Admission, AdmissionItem, Student, Payment, PaymentAllocation, GreenCardProduct, User, BatchSubject, Refund, AuditLog
)
from app.modules.admissions.schemas import (
    AdmissionCreate, AdmissionResponse, AdmissionCalculatePreviewRequest, AdmissionItemResponse, AdmissionRevokeRequest,
    AdmissionSlipsResponse, SlipItemResponse
)
from app.common.calculations import (
    calculate_admission_financials, allocate_payment_proportionally, compute_rolling_cycle_end
)
from app.common.pagination import PaginationParams, PageResponse

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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    # Verify student
    st_res = await db.execute(select(Student).where(Student.id == payload.student_id))
    student = st_res.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Generate admission number
    year_str = payload.admission_date.strftime("%Y")
    cnt_res = await db.execute(select(func.count(Admission.id)))
    seq = cnt_res.scalar_one() + 1
    adm_no = f"ADM{year_str}{seq:04d}"

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
            # Green Card pass is 1 Year (365 days)
            if raw.valid_to and (raw.valid_to - itm_from).days > 60:
                itm_to = raw.valid_to
            else:
                itm_to = itm_from + timedelta(days=gc_validity_days)
        else:
            itm_to = raw.valid_to or compute_rolling_cycle_end(itm_from, 1)[0]

        ai = AdmissionItem(
            admission_id=admission.id,
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
        if (admission.valid_to - adm_valid_from).days < gc_validity_days:
            admission.valid_to = adm_valid_from + timedelta(days=gc_validity_days)

    # Process Initial Payment if provided
    if payload.initial_payment and payload.initial_payment.amount > Decimal("0.00"):
        pay_amount = min(payload.initial_payment.amount, admission.total_payable)
        p_cnt_res = await db.execute(select(func.count(Payment.id)))
        p_seq = p_cnt_res.scalar_one() + 1
        pay_no = f"PAY{year_str}{p_seq:04d}"

        payment = Payment(
            payment_number=pay_no,
            admission_id=admission.id,
            student_id=student.id,
            amount=pay_amount,
            payment_mode=payload.initial_payment.payment_mode,
            transaction_reference=payload.initial_payment.transaction_reference,
            payment_date=datetime.now(timezone.utc),
            collected_by=current_user.id,
            collector_name_snapshot=current_user.full_name,
            notes=payload.initial_payment.notes or "Initial payment at admission"
        )
        db.add(payment)
        await db.flush()

        # Proportional Allocation
        items_payload = [{"id": ai.id, "balance_due": ai.balance_due} for ai in db_items]
        allocations = allocate_payment_proportionally(pay_amount, items_payload)
        
        for ai_id, alloc_amt in allocations:
            pa = PaymentAllocation(
                payment_id=payment.id,
                admission_item_id=ai_id,
                allocated_amount=alloc_amt
            )
            db.add(pa)
            # Update item balance
            for itm in db_items:
                if itm.id == ai_id:
                    itm.amount_collected += alloc_amt
                    itm.balance_due -= alloc_amt

        admission.amount_paid = pay_amount
        admission.balance_due = max(Decimal("0.00"), admission.total_payable - pay_amount)
        if admission.balance_due == Decimal("0.00"):
            admission.payment_status = "PAID"
        else:
            admission.payment_status = "PARTIALLY_PAID"

    await db.commit()

    return await get_admission(admission.id, db, current_user)

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
    query = select(Admission).options(selectinload(Admission.items)).where(Admission.id == admission_id)
    res = await db.execute(query)
    admission = res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Admission not found")

    admission.status = "CANCELLED"
    await db.commit()
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
    )
    res = await db.execute(query)
    admission = res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Course purchase / admission not found")

    # 1. Process optional refund if requested
    refund_record = None
    if payload.refund_amount and payload.refund_amount > Decimal("0.00"):
        if payload.refund_amount > admission.amount_paid:
            raise HTTPException(
                status_code=400,
                detail=f"Refund amount ₹{payload.refund_amount} cannot exceed total amount paid ₹{admission.amount_paid}"
            )
        year_str = datetime.now().strftime("%Y")
        ref_cnt_res = await db.execute(select(func.count(Refund.id)))
        seq = ref_cnt_res.scalar_one() + 1
        ref_no = f"REF{year_str}{seq:04d}"

        refund_record = Refund(
            refund_number=ref_no,
            admission_id=admission.id,
            payment_id=None,
            student_id=admission.student_id,
            amount=payload.refund_amount,
            refund_mode=payload.refund_mode,
            reason=f"Batch/Course revoked: {payload.reason.strip()}",
            refund_date=datetime.now(timezone.utc),
            processed_by=current_user.id,
            processor_name_snapshot=current_user.full_name,
            notes="Automated refund upon batch revocation"
        )
        db.add(refund_record)
        admission.amount_paid -= payload.refund_amount

        # Proportionally reduce items' amount_collected
        paid_items = [
            {"id": itm.id, "balance_due": itm.amount_collected}
            for itm in admission.items
            if itm.amount_collected > Decimal("0.00")
        ]
        if paid_items:
            reductions = allocate_payment_proportionally(payload.refund_amount, paid_items)
            for itm_id, red_amt in reductions:
                for ai in admission.items:
                    if ai.id == itm_id:
                        ai.amount_collected = max(Decimal("0.00"), ai.amount_collected - red_amt)
                        ai.balance_due = min(ai.net_price, ai.net_price - ai.amount_collected)

    # 2. Revoke the batch purchase
    admission.status = "REVOKED"
    admission.revocation_reason = payload.reason.strip()
    admission.revoked_at = datetime.now(timezone.utc)
    admission.revoked_by = current_user.id
    admission.balance_due = Decimal("0.00")  # Void pending due for dropped batch
    
    if admission.amount_paid <= Decimal("0.00"):
        admission.payment_status = "VOID"
    else:
        admission.payment_status = "PARTIALLY_REFUNDED"

    # 3. If green card attached, revoke access
    has_gc = any(itm.item_type == "GREEN_CARD" for itm in admission.items)
    if has_gc and admission.student:
        admission.student.has_green_card = False

    # 4. Audit Log
    audit = AuditLog(
        user_id=current_user.id,
        action="BATCH_PURCHASE_REVOKED",
        entity_type="ADMISSION",
        entity_id=admission.id,
        details=json.dumps({
            "purchase_transaction_id": admission.admission_number,
            "student_name": admission.student_name_snapshot,
            "reason": payload.reason.strip(),
            "refunded": float(payload.refund_amount or 0),
            "refund_voucher": refund_record.refund_number if refund_record else None
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
    query = (
        select(Admission)
        .options(selectinload(Admission.items), selectinload(Admission.student))
        .where(Admission.id == admission_id)
    )
    res = await db.execute(query)
    admission = res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Course purchase / admission not found")

    old_reason = admission.revocation_reason
    admission.status = "ACTIVE"
    admission.revocation_reason = None
    admission.revoked_at = None
    admission.revoked_by = None
    admission.balance_due = max(Decimal("0.00"), admission.total_payable - admission.amount_paid)

    if admission.balance_due == Decimal("0.00"):
        admission.payment_status = "PAID"
    elif admission.amount_paid > Decimal("0.00"):
        admission.payment_status = "PARTIALLY_PAID"
    else:
        admission.payment_status = "UNPAID"

    # Re-sync items with restored admission amount_paid and balance_due
    if admission.items:
        items_payload = [{"id": ai.id, "balance_due": ai.net_price} for ai in admission.items]
        allocations = allocate_payment_proportionally(admission.amount_paid, items_payload)
        for itm_id, alloc_amt in allocations:
            for ai in admission.items:
                if ai.id == itm_id:
                    ai.amount_collected = alloc_amt
                    ai.balance_due = max(Decimal("0.00"), ai.net_price - alloc_amt)

    has_gc = any(itm.item_type == "GREEN_CARD" for itm in admission.items)
    if has_gc and admission.student:
        admission.student.has_green_card = True

    audit = AuditLog(
        user_id=current_user.id,
        action="BATCH_PURCHASE_RESTORED",
        entity_type="ADMISSION",
        entity_id=admission.id,
        details=json.dumps({
            "purchase_transaction_id": admission.admission_number,
            "student_name": admission.student_name_snapshot,
            "previous_revocation_reason": old_reason
        })
    )
    db.add(audit)
    await db.commit()
    await db.refresh(admission)
    return admission
