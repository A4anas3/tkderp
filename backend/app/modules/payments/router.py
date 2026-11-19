import uuid
import json
from datetime import datetime, timezone, date
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc, delete
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.core.dependencies import require_staff, require_cashier_or_admin
from app.database.models import (
    Payment, PaymentAllocation, Admission, AdmissionItem, Student, User, Refund, AuditLog
)
from app.modules.payments.schemas import (
    PaymentCreate, PaymentUpdate, PaymentResponse, PaymentAllocationResponse, PaymentReceiptResponse,
    RefundCreate, RefundResponse, RefundReceiptResponse
)
from app.common.calculations import allocate_payment_proportionally
from app.common.pagination import PaginationParams, PageResponse

router = APIRouter(prefix="/api/payments", tags=["Payments"])

@router.get("", response_model=PageResponse[PaymentResponse])
async def list_payments(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    search: Optional[str] = None,
    student_id: Optional[uuid.UUID] = None,
    admission_id: Optional[uuid.UUID] = None,
    payment_mode: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    query = (
        select(Payment)
        .options(
            selectinload(Payment.allocations),
            selectinload(Payment.admission),
            selectinload(Payment.student)
        )
    )
    count_query = select(func.count(Payment.id))

    if search:
        search_pattern = f"%{search.strip()}%"
        filter_clause = or_(
            Payment.payment_number.ilike(search_pattern),
            Payment.collector_name_snapshot.ilike(search_pattern),
            Payment.transaction_reference.ilike(search_pattern)
        )
        query = query.where(filter_clause)
        count_query = count_query.where(filter_clause)

    if student_id:
        query = query.where(Payment.student_id == student_id)
        count_query = count_query.where(Payment.student_id == student_id)

    if admission_id:
        query = query.where(Payment.admission_id == admission_id)
        count_query = count_query.where(Payment.admission_id == admission_id)

    if payment_mode:
        query = query.where(Payment.payment_mode == payment_mode)
        count_query = count_query.where(Payment.payment_mode == payment_mode)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(desc(Payment.payment_date)).offset(offset).limit(page_size)
    items_result = await db.execute(query)
    payments = items_result.scalars().all()

    response_items = []
    for p in payments:
        alloc_resps = [
            PaymentAllocationResponse(
                id=a.id,
                admission_item_id=a.admission_item_id,
                allocated_amount=a.allocated_amount
            )
            for a in p.allocations
        ]
        response_items.append(
            PaymentResponse(
                id=p.id,
                payment_number=p.payment_number,
                admission_id=p.admission_id,
                student_id=p.student_id,
                student_name=p.student.full_name if p.student else None,
                admission_number=p.admission.admission_number if p.admission else None,
                amount=p.amount,
                payment_mode=p.payment_mode,
                transaction_reference=p.transaction_reference,
                payment_date=p.payment_date,
                collected_by=p.collected_by,
                collector_name_snapshot=p.collector_name_snapshot,
                notes=p.notes,
                allocations=alloc_resps
            )
        )

    return PageResponse.create(items=response_items, total=total, params=PaginationParams(page=page, page_size=page_size))

@router.post("", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def record_payment(
    payload: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    # Fetch admission
    adm_res = await db.execute(
        select(Admission)
        .options(selectinload(Admission.items), selectinload(Admission.student))
        .where(Admission.id == payload.admission_id)
    )
    admission = adm_res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Admission not found")

    if admission.balance_due <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="This admission is already fully paid")

    if payload.amount > admission.balance_due:
        raise HTTPException(
            status_code=400,
            detail=f"Payment amount ₹{payload.amount} exceeds outstanding balance ₹{admission.balance_due}"
        )

    year_str = datetime.now().strftime("%Y")
    p_cnt_res = await db.execute(select(func.count(Payment.id)))
    seq = p_cnt_res.scalar_one() + 1
    pay_no = f"PAY{year_str}{seq:04d}"

    payment = Payment(
        payment_number=pay_no,
        admission_id=admission.id,
        student_id=admission.student_id,
        amount=payload.amount,
        payment_mode=payload.payment_mode,
        transaction_reference=payload.transaction_reference,
        payment_date=datetime.now(timezone.utc),
        collected_by=current_user.id,
        collector_name_snapshot=current_user.full_name,
        notes=payload.notes
    )
    db.add(payment)
    await db.flush()

    # Allocate proportionally across admission items with remaining balance
    unpaid_items = [
        {"id": itm.id, "balance_due": itm.balance_due}
        for itm in admission.items
        if itm.balance_due > Decimal("0.00")
    ]
    allocations = allocate_payment_proportionally(payload.amount, unpaid_items)

    pa_objs = []
    for itm_id, alloc_amt in allocations:
        pa = PaymentAllocation(
            payment_id=payment.id,
            admission_item_id=itm_id,
            allocated_amount=alloc_amt
        )
        db.add(pa)
        pa_objs.append(pa)
        for ai in admission.items:
            if ai.id == itm_id:
                ai.amount_collected += alloc_amt
                ai.balance_due -= alloc_amt

    await db.flush()

    alloc_resps = [
        PaymentAllocationResponse(
            id=pa.id,
            admission_item_id=pa.admission_item_id,
            allocated_amount=pa.allocated_amount
        )
        for pa in pa_objs
    ]

    # Update admission totals
    admission.amount_paid += payload.amount
    admission.balance_due = max(Decimal("0.00"), admission.total_payable - admission.amount_paid)
    if admission.balance_due == Decimal("0.00"):
        admission.payment_status = "PAID"
    else:
        admission.payment_status = "PARTIALLY_PAID"

    await db.commit()

    return PaymentResponse(
        id=payment.id,
        payment_number=payment.payment_number,
        admission_id=payment.admission_id,
        student_id=payment.student_id,
        student_name=admission.student.full_name,
        admission_number=admission.admission_number,
        amount=payment.amount,
        payment_mode=payment.payment_mode,
        transaction_reference=payment.transaction_reference,
        payment_date=payment.payment_date,
        collected_by=payment.collected_by,
        collector_name_snapshot=payment.collector_name_snapshot,
        notes=payment.notes,
        allocations=alloc_resps
    )

@router.get("/{payment_id}/receipt", response_model=PaymentReceiptResponse)
async def get_payment_receipt(
    payment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    query = (
        select(Payment)
        .options(
            selectinload(Payment.allocations),
            selectinload(Payment.admission).selectinload(Admission.items),
            selectinload(Payment.student)
        )
        .where(Payment.id == payment_id)
    )
    res = await db.execute(query)
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")

    item_names = {itm.id: itm.item_name_snapshot for itm in p.admission.items}
    alloc_data = [
        {
            "item_name": item_names.get(a.admission_item_id, "Item"),
            "amount": a.allocated_amount
        }
        for a in p.allocations
    ]

    return PaymentReceiptResponse(
        payment_number=p.payment_number,
        payment_date=p.payment_date,
        amount=p.amount,
        payment_mode=p.payment_mode,
        transaction_reference=p.transaction_reference,
        collector_name=p.collector_name_snapshot,
        student_name=p.student.full_name,
        student_reg_no=p.student.registration_no,
        student_mobile=p.student.mobile,
        admission_number=p.admission.admission_number,
        total_admission_payable=p.admission.total_payable,
        total_amount_paid_so_far=p.admission.amount_paid,
        remaining_balance_due=p.admission.balance_due,
        allocations=alloc_data
    )

@router.put("/{payment_id}", response_model=PaymentResponse)
async def update_payment(
    payment_id: uuid.UUID,
    payload: PaymentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    query = (
        select(Payment)
        .options(
            selectinload(Payment.allocations),
            selectinload(Payment.admission).selectinload(Admission.items),
            selectinload(Payment.student)
        )
        .where(Payment.id == payment_id)
    )
    res = await db.execute(query)
    payment = res.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    admission = payment.admission
    old_amount = payment.amount
    old_mode = payment.payment_mode
    old_ref = payment.transaction_reference

    amount_changed = payload.amount is not None and payload.amount != old_amount

    if amount_changed:
        new_amount = payload.amount
        other_paid = admission.amount_paid - old_amount
        max_possible = admission.total_payable - other_paid
        if new_amount > max_possible:
            raise HTTPException(
                status_code=400,
                detail=f"New amount ₹{new_amount} exceeds maximum allowed payable ₹{max_possible}"
            )

        # Roll back old allocations on admission items
        for pa in payment.allocations:
            for ai in admission.items:
                if ai.id == pa.admission_item_id:
                    ai.amount_collected = max(Decimal("0.00"), ai.amount_collected - pa.allocated_amount)
                    ai.balance_due = min(ai.net_price, ai.balance_due + pa.allocated_amount)

        # Remove old allocations
        await db.execute(delete(PaymentAllocation).where(PaymentAllocation.payment_id == payment.id))

        # Reallocate new_amount across admission items with balance_due > 0
        unpaid_items = [
            {"id": itm.id, "balance_due": itm.balance_due}
            for itm in admission.items
            if itm.balance_due > Decimal("0.00")
        ]
        if not unpaid_items:
            unpaid_items = [{"id": itm.id, "balance_due": itm.net_price} for itm in admission.items]

        allocations = allocate_payment_proportionally(new_amount, unpaid_items)
        for itm_id, alloc_amt in allocations:
            pa = PaymentAllocation(
                payment_id=payment.id,
                admission_item_id=itm_id,
                allocated_amount=alloc_amt
            )
            db.add(pa)
            for ai in admission.items:
                if ai.id == itm_id:
                    ai.amount_collected += alloc_amt
                    ai.balance_due = max(Decimal("0.00"), ai.net_price - ai.amount_collected)

        payment.amount = new_amount
        admission.amount_paid = other_paid + new_amount
        admission.balance_due = max(Decimal("0.00"), admission.total_payable - admission.amount_paid)
        if admission.balance_due == Decimal("0.00"):
            admission.payment_status = "PAID"
        elif admission.amount_paid > Decimal("0.00"):
            admission.payment_status = "PARTIALLY_PAID"
        else:
            admission.payment_status = "UNPAID"

    if payload.payment_mode is not None:
        payment.payment_mode = payload.payment_mode
    if payload.transaction_reference is not None:
        payment.transaction_reference = payload.transaction_reference
    if payload.notes is not None:
        payment.notes = payload.notes

    audit = AuditLog(
        user_id=current_user.id,
        action="PAYMENT_EDITED",
        entity_type="PAYMENT",
        entity_id=payment.id,
        details=json.dumps({
            "payment_number": payment.payment_number,
            "admission_number": admission.admission_number,
            "old_amount": float(old_amount),
            "new_amount": float(payment.amount),
            "old_mode": old_mode,
            "new_mode": payment.payment_mode,
            "edit_reason": payload.edit_reason
        })
    )
    db.add(audit)
    await db.commit()

    res = await db.execute(query)
    updated_payment = res.scalar_one()

    alloc_resps = [
        PaymentAllocationResponse(
            id=a.id,
            admission_item_id=a.admission_item_id,
            allocated_amount=a.allocated_amount
        )
        for a in updated_payment.allocations
    ]
    return PaymentResponse(
        id=updated_payment.id,
        payment_number=updated_payment.payment_number,
        admission_id=updated_payment.admission_id,
        student_id=updated_payment.student_id,
        student_name=updated_payment.student.full_name if updated_payment.student else None,
        admission_number=updated_payment.admission.admission_number if updated_payment.admission else None,
        amount=updated_payment.amount,
        payment_mode=updated_payment.payment_mode,
        transaction_reference=updated_payment.transaction_reference,
        payment_date=updated_payment.payment_date,
        collected_by=updated_payment.collected_by,
        collector_name_snapshot=updated_payment.collector_name_snapshot,
        notes=updated_payment.notes,
        allocations=alloc_resps
    )

@router.post("/refund", response_model=RefundResponse, status_code=status.HTTP_201_CREATED)
async def process_refund(
    payload: RefundCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    adm_res = await db.execute(
        select(Admission)
        .options(selectinload(Admission.items), selectinload(Admission.student))
        .where(Admission.id == payload.admission_id)
    )
    admission = adm_res.scalar_one_or_none()
    if not admission:
        raise HTTPException(status_code=404, detail="Admission not found")

    if admission.amount_paid <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Cannot issue refund. No fee has been paid for this admission.")

    if payload.amount > admission.amount_paid:
        raise HTTPException(
            status_code=400,
            detail=f"Refund amount ₹{payload.amount} cannot exceed total amount paid ₹{admission.amount_paid}"
        )

    year_str = datetime.now().strftime("%Y")
    ref_cnt_res = await db.execute(select(func.count(Refund.id)))
    seq = ref_cnt_res.scalar_one() + 1
    ref_no = f"REF{year_str}{seq:04d}"

    refund = Refund(
        refund_number=ref_no,
        admission_id=admission.id,
        payment_id=payload.payment_id,
        student_id=admission.student_id,
        amount=payload.amount,
        refund_mode=payload.refund_mode,
        reason=payload.reason.strip(),
        refund_date=datetime.now(timezone.utc),
        processed_by=current_user.id,
        processor_name_snapshot=current_user.full_name,
        notes=payload.notes
    )
    db.add(refund)

    admission.amount_paid -= payload.amount
    admission.balance_due = admission.total_payable - admission.amount_paid

    if admission.amount_paid <= Decimal("0.00"):
        admission.payment_status = "UNPAID"
    else:
        admission.payment_status = "PARTIALLY_PAID"

    paid_items = [
        {"id": itm.id, "balance_due": itm.amount_collected}
        for itm in admission.items
        if itm.amount_collected > Decimal("0.00")
    ]
    if paid_items:
        reductions = allocate_payment_proportionally(payload.amount, paid_items)
        for itm_id, red_amt in reductions:
            for ai in admission.items:
                if ai.id == itm_id:
                    ai.amount_collected = max(Decimal("0.00"), ai.amount_collected - red_amt)
                    ai.balance_due = min(ai.net_price, ai.net_price - ai.amount_collected)

    audit = AuditLog(
        user_id=current_user.id,
        action="FEE_REFUNDED",
        entity_type="REFUND",
        entity_id=refund.id,
        details=json.dumps({
            "refund_number": ref_no,
            "admission_number": admission.admission_number,
            "student_name": admission.student.full_name,
            "amount": float(payload.amount),
            "refund_mode": payload.refund_mode,
            "reason": payload.reason.strip()
        })
    )
    db.add(audit)
    await db.commit()
    await db.refresh(refund)

    return RefundResponse(
        id=refund.id,
        refund_number=refund.refund_number,
        admission_id=refund.admission_id,
        payment_id=refund.payment_id,
        student_id=refund.student_id,
        student_name=admission.student.full_name,
        admission_number=admission.admission_number,
        amount=refund.amount,
        refund_mode=refund.refund_mode,
        reason=refund.reason,
        refund_date=refund.refund_date,
        processed_by=refund.processed_by,
        processor_name_snapshot=refund.processor_name_snapshot,
        notes=refund.notes
    )

@router.get("/refunds", response_model=PageResponse[RefundResponse])
async def list_refunds(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    search: Optional[str] = None,
    student_id: Optional[uuid.UUID] = None,
    admission_id: Optional[uuid.UUID] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    query = (
        select(Refund)
        .options(
            selectinload(Refund.admission),
            selectinload(Refund.student)
        )
    )
    count_query = select(func.count(Refund.id))

    if search:
        search_pattern = f"%{search.strip()}%"
        filter_clause = or_(
            Refund.refund_number.ilike(search_pattern),
            Refund.processor_name_snapshot.ilike(search_pattern),
            Refund.reason.ilike(search_pattern)
        )
        query = query.where(filter_clause)
        count_query = count_query.where(filter_clause)

    if student_id:
        query = query.where(Refund.student_id == student_id)
        count_query = count_query.where(Refund.student_id == student_id)

    if admission_id:
        query = query.where(Refund.admission_id == admission_id)
        count_query = count_query.where(Refund.admission_id == admission_id)

    if from_date:
        query = query.where(Refund.refund_date >= datetime.combine(from_date, datetime.min.time()))
        count_query = count_query.where(Refund.refund_date >= datetime.combine(from_date, datetime.min.time()))

    if to_date:
        query = query.where(Refund.refund_date <= datetime.combine(to_date, datetime.max.time()))
        count_query = count_query.where(Refund.refund_date <= datetime.combine(to_date, datetime.max.time()))

    total = (await db.execute(count_query)).scalar_one()
    offset = (page - 1) * page_size
    query = query.order_by(desc(Refund.refund_date)).offset(offset).limit(page_size)
    refunds = (await db.execute(query)).scalars().all()

    items = [
        RefundResponse(
            id=r.id,
            refund_number=r.refund_number,
            admission_id=r.admission_id,
            payment_id=r.payment_id,
            student_id=r.student_id,
            student_name=r.student.full_name if r.student else None,
            admission_number=r.admission.admission_number if r.admission else None,
            amount=r.amount,
            refund_mode=r.refund_mode,
            reason=r.reason,
            refund_date=r.refund_date,
            processed_by=r.processed_by,
            processor_name_snapshot=r.processor_name_snapshot,
            notes=r.notes
        )
        for r in refunds
    ]
    return PageResponse.create(items=items, total=total, params=PaginationParams(page=page, page_size=page_size))

@router.get("/refunds/{refund_id}/receipt", response_model=RefundReceiptResponse)
async def get_refund_receipt(
    refund_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    query = (
        select(Refund)
        .options(
            selectinload(Refund.admission),
            selectinload(Refund.student)
        )
        .where(Refund.id == refund_id)
    )
    res = await db.execute(query)
    r = res.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Refund record not found")

    return RefundReceiptResponse(
        refund_number=r.refund_number,
        refund_date=r.refund_date,
        amount=r.amount,
        refund_mode=r.refund_mode,
        reason=r.reason,
        processor_name=r.processor_name_snapshot,
        student_name=r.student.full_name,
        student_reg_no=r.student.registration_no,
        student_mobile=r.student.mobile,
        admission_number=r.admission.admission_number,
        admission_total_payable=r.admission.total_payable,
        net_amount_paid_after_refund=r.admission.amount_paid,
        remaining_balance_due=r.admission.balance_due,
        notes=r.notes
    )
