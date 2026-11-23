import uuid
import json
from datetime import date
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.core.dependencies import require_staff, require_cashier_or_admin, require_admin
from app.database.models import ExpenseCategory, Expense, SalaryRecord, User, AuditLog
from app.modules.expenses.schemas import (
    ExpenseCategoryCreate, ExpenseCategoryResponse,
    ExpenseCreate, ExpenseResponse,
    SalaryRecordCreate, SalaryRecordResponse, PaySalaryRequest
)
from app.common.pagination import PaginationParams, PageResponse

router = APIRouter(prefix="/api/expenses", tags=["Expenses & Salaries"])

# --- Categories ---
@router.get("/categories", response_model=list[ExpenseCategoryResponse])
async def list_expense_categories(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    result = await db.execute(select(ExpenseCategory).order_by(ExpenseCategory.name.asc()))
    return result.scalars().all()

@router.post("/categories", response_model=ExpenseCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_expense_category(
    payload: ExpenseCategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    existing = await db.execute(select(ExpenseCategory).where(ExpenseCategory.name.ilike(payload.name.strip())))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Category with this name already exists")

    cat = ExpenseCategory(
        name=payload.name.strip(),
        description=payload.description,
        is_active=payload.is_active
    )
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat

# --- Daily Expenses ---
@router.get("", response_model=PageResponse[ExpenseResponse])
async def list_expenses(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    search: Optional[str] = None,
    category_id: Optional[uuid.UUID] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    query = select(Expense).options(selectinload(Expense.category))
    count_query = select(func.count(Expense.id))

    if search:
        search_pattern = f"%{search.strip()}%"
        filter_clause = or_(
            Expense.title.ilike(search_pattern),
            Expense.transaction_reference.ilike(search_pattern)
        )
        query = query.where(filter_clause)
        count_query = count_query.where(filter_clause)

    if category_id:
        query = query.where(Expense.category_id == category_id)
        count_query = count_query.where(Expense.category_id == category_id)

    if from_date:
        query = query.where(Expense.expense_date >= from_date)
        count_query = count_query.where(Expense.expense_date >= from_date)

    if to_date:
        query = query.where(Expense.expense_date <= to_date)
        count_query = count_query.where(Expense.expense_date <= to_date)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(desc(Expense.expense_date), desc(Expense.created_at)).offset(offset).limit(page_size)
    items_result = await db.execute(query)
    expenses = items_result.scalars().all()

    response_items = [
        ExpenseResponse(
            id=exp.id,
            category_id=exp.category_id,
            category_name=exp.category.name if exp.category else None,
            title=exp.title,
            amount=exp.amount,
            expense_date=exp.expense_date,
            payment_mode=exp.payment_mode,
            transaction_reference=exp.transaction_reference,
            notes=exp.notes,
            added_by=exp.added_by
        )
        for exp in expenses
    ]

    return PageResponse.create(items=response_items, total=total, params=PaginationParams(page=page, page_size=page_size))

@router.post("", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
async def create_expense(
    payload: ExpenseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    # Verify category
    c_res = await db.execute(select(ExpenseCategory).where(ExpenseCategory.id == payload.category_id))
    cat = c_res.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Expense category not found")

    expense = Expense(
        category_id=payload.category_id,
        title=payload.title,
        amount=payload.amount,
        expense_date=payload.expense_date,
        payment_mode=payload.payment_mode,
        transaction_reference=payload.transaction_reference,
        notes=payload.notes,
        added_by=current_user.id
    )
    db.add(expense)
    await db.flush()

    audit = AuditLog(
        user_id=current_user.id,
        action="EXPENSE_CREATED",
        entity_type="EXPENSE",
        entity_id=expense.id,
        details=json.dumps({
            "title": expense.title,
            "category": cat.name,
            "amount": float(expense.amount),
            "expense_date": str(expense.expense_date),
            "payment_mode": expense.payment_mode,
            "transaction_reference": expense.transaction_reference,
            "notes": expense.notes
        })
    )
    db.add(audit)
    await db.commit()
    await db.refresh(expense)

    return ExpenseResponse(
        id=expense.id,
        category_id=expense.category_id,
        category_name=cat.name,
        title=expense.title,
        amount=expense.amount,
        expense_date=expense.expense_date,
        payment_mode=expense.payment_mode,
        transaction_reference=expense.transaction_reference,
        notes=expense.notes,
        added_by=expense.added_by
    )

# --- Salary Records ---
@router.get("/salaries", response_model=PageResponse[SalaryRecordResponse])
async def list_salary_records(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    month_year: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    query = select(SalaryRecord)
    count_query = select(func.count(SalaryRecord.id))

    if month_year:
        query = query.where(SalaryRecord.month_year == month_year)
        count_query = count_query.where(SalaryRecord.month_year == month_year)

    if status_filter:
        query = query.where(SalaryRecord.status == status_filter)
        count_query = count_query.where(SalaryRecord.status == status_filter)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(desc(SalaryRecord.due_date)).offset(offset).limit(page_size)
    items_result = await db.execute(query)
    items = items_result.scalars().all()

    return PageResponse.create(items=items, total=total, params=PaginationParams(page=page, page_size=page_size))

@router.post("/salaries", response_model=SalaryRecordResponse, status_code=status.HTTP_201_CREATED)
async def create_salary_record(
    payload: SalaryRecordCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    record = SalaryRecord(
        employee_id=payload.employee_id,
        employee_type=payload.employee_type,
        employee_name_snapshot=payload.employee_name_snapshot,
        month_year=payload.month_year,
        salary_amount=payload.salary_amount,
        due_date=payload.due_date,
        paid_amount=Decimal("0.00"),
        status="PENDING",
        notes=payload.notes
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record

@router.post("/salaries/{record_id}/pay", response_model=SalaryRecordResponse)
async def pay_salary(
    record_id: uuid.UUID,
    payload: PaySalaryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    res = await db.execute(select(SalaryRecord).where(SalaryRecord.id == record_id))
    record = res.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Salary record not found")

    new_paid = record.paid_amount + payload.paid_amount
    record.paid_amount = new_paid
    record.payment_date = payload.payment_date
    record.payment_mode = payload.payment_mode
    if payload.notes:
        record.notes = f"{record.notes or ''}\n{payload.notes}".strip()

    if new_paid >= record.salary_amount:
        record.status = "PAID"
    else:
        record.status = "PARTIALLY_PAID"

    audit = AuditLog(
        user_id=current_user.id,
        action="SALARY_PAID",
        entity_type="SALARY",
        entity_id=record.id,
        details=json.dumps({
            "record_id": str(record.id),
            "employee_name": record.employee_name_snapshot,
            "employee_type": record.employee_type,
            "month_year": record.month_year,
            "paid_amount": float(payload.paid_amount),
            "payment_date": str(payload.payment_date),
            "payment_mode": payload.payment_mode,
            "status": record.status,
            "notes": payload.notes
        })
    )
    db.add(audit)

    await db.commit()
    await db.refresh(record)
    return record
