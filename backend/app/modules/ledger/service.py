import uuid
import json
from datetime import datetime, timezone, date
from decimal import Decimal
from typing import Optional, List, Dict, Any, Tuple
from fastapi import HTTPException
from sqlalchemy import select, func, desc
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value
from sqlalchemy.inspection import inspect as sa_inspect
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    Admission, AdmissionItem, Payment, PaymentAllocation, Refund, FinancialTransaction, AuditLog, Student, User
)
from app.common.numbering import next_number
from app.common.calculations import allocate_payment_proportionally, round_money

async def _ensure_items_loaded(admission: Admission, db: AsyncSession) -> List[AdmissionItem]:
    """Ensures admission.items is eagerly loaded in async context without lazy loading triggers."""
    state = sa_inspect(admission)
    if "items" in state.unloaded:
        res = await db.execute(select(AdmissionItem).where(AdmissionItem.admission_id == admission.id))
        items = list(res.scalars().all())
        set_committed_value(admission, "items", items)
        return items
    return list(admission.items)

async def recompute_admission_totals(admission: Admission, db: AsyncSession) -> None:
    """
    Derives item.amount_collected, item.balance_due, admission.amount_paid,
    admission.balance_due, and payment_status strictly from the allocation ledger and refunds.
    Never assigns statuses manually.
    """
    items = await _ensure_items_loaded(admission, db)
    # Fetch all allocations for all items in this admission
    item_ids = [itm.id for itm in items]
    if not item_ids:
        return

    stmt = select(PaymentAllocation).where(PaymentAllocation.admission_item_id.in_(item_ids))
    res = await db.execute(stmt)
    allocations = res.scalars().all()

    # Sum signed allocations per item
    alloc_sums: Dict[uuid.UUID, Decimal] = {iid: Decimal("0.00") for iid in item_ids}
    for pa in allocations:
        alloc_sums[pa.admission_item_id] = alloc_sums.get(pa.admission_item_id, Decimal("0.00")) + pa.allocated_amount

    # Update item caches
    is_void = getattr(admission, "document_status", "VALID") == "VOID"
    for itm in items:
        net_collected = max(Decimal("0.00"), alloc_sums.get(itm.id, Decimal("0.00")))
        itm.amount_collected = net_collected
        w_off = itm.written_off_amount or Decimal("0.00")
        itm.balance_due = Decimal("0.00") if is_void else max(Decimal("0.00"), itm.net_price - net_collected - w_off)

    # Check if real refund rows exist for this admission
    ref_stmt = select(func.count(Refund.id)).where(Refund.admission_id == admission.id)
    ref_count = (await db.execute(ref_stmt)).scalar_one() or 0

    # Total admission collections
    total_collected = sum((itm.amount_collected for itm in items), Decimal("0.00"))
    total_written_off = sum((itm.written_off_amount or Decimal("0.00") for itm in items), Decimal("0.00"))
    
    admission.amount_paid = total_collected
    admission.written_off_amount = total_written_off

    if is_void:
        admission.balance_due = Decimal("0.00")
        admission.payment_status = "VOID"
    else:
        admission.balance_due = max(Decimal("0.00"), admission.total_payable - total_collected - total_written_off)
        if ref_count > 0:
            if admission.amount_paid <= Decimal("0.00"):
                admission.payment_status = "REFUNDED"
            else:
                admission.payment_status = "PARTIALLY_REFUNDED"
        else:
            if admission.amount_paid >= admission.total_payable:
                admission.payment_status = "PAID"
            elif admission.amount_paid > Decimal("0.00"):
                admission.payment_status = "PARTIALLY_PAID"
            else:
                admission.payment_status = "UNPAID"

    # Derive admission valid_from and valid_to as min/max of items
    item_froms = [i.valid_from for i in items if i.valid_from]
    item_tos = [i.valid_to for i in items if i.valid_to]
    if item_froms:
        admission.valid_from = min(item_froms)
    if item_tos:
        admission.valid_to = max(item_tos)

async def record_payment_service(
    db: AsyncSession,
    admission: Admission,
    amount: Decimal,
    payment_mode: str,
    collected_by_user: User,
    transaction_reference: Optional[str] = None,
    notes: Optional[str] = None,
    valid_from: Optional[date] = None,
    valid_to: Optional[date] = None,
    fee_period: Optional[str] = None,
    allocation_mode: str = "PROPORTIONAL",
    manual_allocations: Optional[Any] = None
) -> Tuple[Payment, FinancialTransaction]:
    """
    Single source of truth for payment creation.
    Creates Payment, PaymentAllocation rows, FinancialTransaction (TXN series),
    recomputes admission totals, and records an AuditLog.
    """
    if getattr(admission, "document_status", "VALID") == "VOID":
        raise HTTPException(status_code=400, detail="Cannot accept payment on a VOID admission document")

    amount = round_money(amount)
    if amount <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")

    items = await _ensure_items_loaded(admission, db)
    # Only lines that are not REVOKED, or are REVOKED with KEEP_DUE, can receive payments
    payable_items = [
        {"id": itm.id, "balance_due": itm.balance_due}
        for itm in items
        if (getattr(itm, "access_status", "ACTIVE") != "REVOKED" or getattr(itm, "keep_due", False))
        and itm.balance_due > Decimal("0.00")
    ]

    total_available_balance = sum((itm["balance_due"] for itm in payable_items), Decimal("0.00"))
    if total_available_balance <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="This admission has no outstanding balance to pay")

    if amount > total_available_balance:
        raise HTTPException(
            status_code=400,
            detail=f"Payment amount ₹{amount} exceeds outstanding balance ₹{total_available_balance}"
        )

    # 1. Sequential Payment number
    pay_no = await next_number(db, "PAY")

    p_from = valid_from or admission.valid_from
    p_to = valid_to or admission.valid_to
    p_fee_period = fee_period or (f"{p_from} to {p_to}" if p_from and p_to else None)

    payment = Payment(
        payment_number=pay_no,
        admission_id=admission.id,
        student_id=admission.student_id,
        amount=amount,
        payment_mode=payment_mode,
        transaction_reference=transaction_reference,
        payment_date=datetime.now(timezone.utc),
        collected_by=collected_by_user.id,
        collector_name_snapshot=collected_by_user.full_name,
        notes=notes,
        valid_from=p_from,
        valid_to=p_to,
        fee_period=p_fee_period
    )
    db.add(payment)
    await db.flush()

    # 2. Allocations via largest-remainder method
    try:
        alloc_tuples = allocate_payment_proportionally(
            amount,
            payable_items,
            mode=allocation_mode,
            manual_allocations=manual_allocations
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    alloc_objs = []
    for itm_id, alloc_amt in alloc_tuples:
        pa = PaymentAllocation(
            payment_id=payment.id,
            admission_item_id=itm_id,
            allocated_amount=alloc_amt,
            kind="PAYMENT"
        )
        db.add(pa)
        alloc_objs.append(pa)

    set_committed_value(payment, "allocations", alloc_objs)
    await db.flush()

    # 3. Append-only FinancialTransaction (TXN series)
    txn_no = await next_number(db, "TXN")
    f_txn = FinancialTransaction(
        txn_number=txn_no,
        txn_type="PAYMENT",
        student_id=admission.student_id,
        admission_id=admission.id,
        payment_id=payment.id,
        mode=payment_mode,
        reference=transaction_reference,
        signed_amount=amount,
        txn_at=datetime.now(timezone.utc),
        created_by=collected_by_user.id,
        reason=notes or f"Fee payment for {admission.admission_number}"
    )
    db.add(f_txn)
    await db.flush()

    # 4. Recompute cached totals from ledger
    await recompute_admission_totals(admission, db)

    # 5. Audit Log
    audit = AuditLog(
        user_id=collected_by_user.id,
        action="PAYMENT_RECORDED",
        entity_type="PAYMENT",
        entity_id=payment.id,
        details=json.dumps({
            "payment_number": pay_no,
            "admission_number": admission.admission_number,
            "amount": float(amount),
            "payment_mode": payment_mode,
            "txn_number": txn_no
        })
    )
    db.add(audit)

    return payment, f_txn

async def edit_payment_service(
    db: AsyncSession,
    payment: Payment,
    admission: Admission,
    current_user: User,
    edit_reason: str,
    new_amount: Optional[Decimal] = None,
    new_mode: Optional[str] = None,
    new_ref: Optional[str] = None,
    new_notes: Optional[str] = None
) -> Tuple[Payment, Optional[FinancialTransaction]]:
    """
    Edits an existing payment.
    - Mode / reference / notes change in place (audited).
    - Amount change = reversal rows for the old allocations + new allocation rows,
      with edit_reason required and history preserved.
    """
    old_amount = payment.amount
    old_mode = payment.payment_mode
    old_ref = payment.transaction_reference

    reversal_txn = None
    if new_mode is not None:
        payment.payment_mode = new_mode
    if new_ref is not None:
        payment.transaction_reference = new_ref
    if new_notes is not None:
        payment.notes = new_notes

    if new_amount is not None and new_amount != old_amount:
        new_amount = round_money(new_amount)
        if new_amount <= Decimal("0.00"):
            raise HTTPException(status_code=400, detail="New payment amount must be greater than zero")

        # 1. Create reversal rows for the old positive allocations
        for pa in list(payment.allocations):
            if pa.kind == "PAYMENT" and pa.allocated_amount > Decimal("0.00"):
                rev_pa = PaymentAllocation(
                    payment=payment,
                    payment_id=payment.id,
                    admission_item_id=pa.admission_item_id,
                    allocated_amount=-pa.allocated_amount,
                    kind="REVERSAL",
                    reverses_allocation_id=pa.id
                )
                db.add(rev_pa)

        await db.flush()

        # Reversal transaction header
        rev_txn_no = await next_number(db, "TXN")
        reversal_txn = FinancialTransaction(
            txn_number=rev_txn_no,
            txn_type="REVERSAL",
            student_id=admission.student_id,
            admission_id=admission.id,
            payment_id=payment.id,
            mode=old_mode,
            reference=old_ref,
            signed_amount=-old_amount,
            txn_at=datetime.now(timezone.utc),
            created_by=current_user.id,
            reason=f"Reversal for payment edit: {edit_reason}"
        )
        db.add(reversal_txn)
        await db.flush()

        # Temporarily recompute to see open balances without this payment
        await recompute_admission_totals(admission, db)

        items = await _ensure_items_loaded(admission, db)
        # 2. Check maximum allowable
        payable_items = [
            {"id": itm.id, "balance_due": itm.balance_due}
            for itm in items
            if (getattr(itm, "access_status", "ACTIVE") != "REVOKED" or getattr(itm, "keep_due", False))
            and itm.balance_due > Decimal("0.00")
        ]
        available_cap = sum((itm["balance_due"] for itm in payable_items), Decimal("0.00"))
        if new_amount > available_cap:
            raise HTTPException(
                status_code=400,
                detail=f"New amount ₹{new_amount} exceeds maximum allowed balance ₹{available_cap}"
            )

        # 3. Create fresh allocation rows for the new amount
        try:
            alloc_tuples = allocate_payment_proportionally(
                new_amount,
                payable_items,
                mode="PROPORTIONAL"
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        for itm_id, alloc_amt in alloc_tuples:
            new_pa = PaymentAllocation(
                payment=payment,
                payment_id=payment.id,
                admission_item_id=itm_id,
                allocated_amount=alloc_amt,
                kind="PAYMENT"
            )
            db.add(new_pa)

        # New transaction header
        new_txn_no = await next_number(db, "TXN")
        new_txn = FinancialTransaction(
            txn_number=new_txn_no,
            txn_type="PAYMENT",
            student_id=admission.student_id,
            admission_id=admission.id,
            payment_id=payment.id,
            mode=payment.payment_mode,
            reference=payment.transaction_reference,
            signed_amount=new_amount,
            txn_at=datetime.now(timezone.utc),
            created_by=current_user.id,
            reason=f"Payment edited from ₹{old_amount} to ₹{new_amount}: {edit_reason}"
        )
        db.add(new_txn)

        payment.amount = new_amount
        await db.flush()

    # 4. Final recompute
    await recompute_admission_totals(admission, db)

    # 5. Audit Log
    audit = AuditLog(
        user_id=current_user.id,
        action="PAYMENT_EDITED",
        entity_type="PAYMENT",
        entity_id=payment.id,
        details=json.dumps({
            "payment_number": payment.payment_number,
            "old_amount": float(old_amount),
            "new_amount": float(payment.amount),
            "edit_reason": edit_reason
        })
    )
    db.add(audit)

    # Eagerly load all allocations so caller can inspect without lazy loading
    pa_res = await db.execute(
        select(PaymentAllocation)
        .where(PaymentAllocation.payment_id == payment.id)
        .order_by(PaymentAllocation.created_at)
    )
    all_allocs = list(pa_res.scalars().all())
    set_committed_value(payment, "allocations", all_allocs)

    return payment, reversal_txn

async def process_refund_service(
    db: AsyncSession,
    admission: Admission,
    amount: Decimal,
    refund_mode: str,
    reason: str,
    current_user: User,
    payment_id: Optional[uuid.UUID] = None,
    target_item_id: Optional[uuid.UUID] = None,
    line_refunds: Optional[List[Tuple[uuid.UUID, Decimal]]] = None,
    deduction_amount: Optional[Decimal] = None,
    deduction_reason: Optional[str] = None,
    notes: Optional[str] = None
) -> Tuple[Refund, FinancialTransaction]:
    """
    Allocation-aware refund:
    Can be per-item (target_item_id), per-line-list (line_refunds), per-payment, or whole slip.
    Creates negative allocation rows (kind=REVERSAL, refund_id=refund.id),
    Refund record, FinancialTransaction, and recomputes totals.
    """
    amount = round_money(amount)
    if amount <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Refund amount must be greater than zero")

    if admission.amount_paid <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Cannot issue refund. No fee has been paid for this admission.")

    if amount > admission.amount_paid:
        raise HTTPException(
            status_code=400,
            detail=f"Refund amount ₹{amount} cannot exceed total amount paid ₹{admission.amount_paid}"
        )

    items = await _ensure_items_loaded(admission, db)
    # Determine refund allocation per item
    if line_refunds:
        sum_lines = sum((round_money(r_amt) for _, r_amt in line_refunds), Decimal("0.00"))
        if sum_lines != amount:
            raise HTTPException(status_code=400, detail=f"Sum of line refunds ₹{sum_lines} does not match refund amount ₹{amount}")
        for itm_id, r_amt in line_refunds:
            itm_obj = next((i for i in items if i.id == itm_id), None)
            if not itm_obj:
                raise HTTPException(status_code=404, detail=f"Subject line {itm_id} not found on this admission")
            if r_amt > itm_obj.amount_collected:
                raise HTTPException(
                    status_code=400,
                    detail=f"Refund amount ₹{r_amt} exceeds collected amount ₹{itm_obj.amount_collected} on {itm_obj.item_name_snapshot}"
                )
        refund_allocations = line_refunds
    elif target_item_id:
        target_item = next((itm for itm in items if itm.id == target_item_id), None)
        if not target_item:
            raise HTTPException(status_code=404, detail="Target subject line not found on this admission")
        if amount > target_item.amount_collected:
            raise HTTPException(
                status_code=400,
                detail=f"Refund amount ₹{amount} exceeds amount collected on this subject ₹{target_item.amount_collected}"
            )
        refund_allocations = [(target_item.id, amount)]
    else:
        # Distribute refund proportionally across lines with collected funds
        items_with_collected = [
            {"id": itm.id, "balance_due": itm.amount_collected}
            for itm in items
            if itm.amount_collected > Decimal("0.00")
        ]
        refund_allocations = allocate_payment_proportionally(amount, items_with_collected, mode="PROPORTIONAL")

    ref_no = await next_number(db, "REF")
    refund = Refund(
        refund_number=ref_no,
        admission_id=admission.id,
        payment_id=payment_id,
        student_id=admission.student_id,
        amount=amount,
        refund_mode=refund_mode,
        reason=reason.strip(),
        refund_date=datetime.now(timezone.utc),
        processed_by=current_user.id,
        processor_name_snapshot=current_user.full_name,
        notes=notes
    )
    db.add(refund)
    await db.flush()

    # Create negative PaymentAllocation rows for the refund
    for itm_id, ref_amt in refund_allocations:
        pa = PaymentAllocation(
            payment_id=payment_id,
            refund_id=refund.id,
            admission_item_id=itm_id,
            allocated_amount=-round_money(ref_amt),
            kind="REVERSAL"
        )
        db.add(pa)

    await db.flush()

    # Append-only transaction
    txn_no = await next_number(db, "TXN")
    f_txn = FinancialTransaction(
        txn_number=txn_no,
        txn_type="REFUND",
        student_id=admission.student_id,
        admission_id=admission.id,
        payment_id=payment_id,
        refund_id=refund.id,
        mode=refund_mode,
        signed_amount=-amount,
        txn_at=datetime.now(timezone.utc),
        created_by=current_user.id,
        reason=f"Refund: {reason.strip()}" + (f" (Deduction: ₹{deduction_amount} - {deduction_reason})" if deduction_amount else "")
    )
    db.add(f_txn)
    await db.flush()

    # Recompute
    await recompute_admission_totals(admission, db)

    # Audit
    audit = AuditLog(
        user_id=current_user.id,
        action="REFUND_PROCESSED",
        entity_type="REFUND",
        entity_id=refund.id,
        details=json.dumps({
            "refund_number": ref_no,
            "admission_number": admission.admission_number,
            "amount": float(amount),
            "reason": reason.strip(),
            "txn_number": txn_no
        })
    )
    db.add(audit)

    return refund, f_txn
