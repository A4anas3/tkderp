import uuid
import json
from datetime import date
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc
from sqlalchemy.orm import selectinload

from app.core.cache import (
    TTL_LONG,
    TTL_MEDIUM,
    cache_get,
    cache_set,
    invalidate_expense_and_salary_cache,
    make_cache_key,
)
from app.database.session import get_db
from app.core.dependencies import require_staff, require_cashier_or_admin, require_admin
from app.database.models import ExpenseCategory, Expense, SalaryRecord, User, AuditLog, Teacher, TeacherAttendance
from app.modules.expenses.schemas import (
    ExpenseCategoryCreate, ExpenseCategoryResponse,
    ExpenseCreate, ExpenseResponse, ExpensePageResponse,
    SalaryRecordCreate, SalaryRecordResponse, SalaryPageResponse, PaySalaryRequest,
    SalaryFilterStaffOption, SalaryFilterOptionsResponse
)
from app.common.pagination import PaginationParams, PageResponse

router = APIRouter(prefix="/api/expenses", tags=["Expenses & Salaries"])

# --- Categories ---
@router.get("/categories", response_model=list[ExpenseCategoryResponse])
async def list_expense_categories(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    cache_key = "erp:expenses:categories"
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    result = await db.execute(select(ExpenseCategory).order_by(ExpenseCategory.name.asc()))
    items = result.scalars().all()
    await cache_set(cache_key, items, ttl=TTL_LONG, model=list[ExpenseCategoryResponse])
    return items

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
    await invalidate_expense_and_salary_cache()
    return cat

# --- Daily Expenses ---
@router.get("", response_model=ExpensePageResponse)
async def list_expenses(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    search: Optional[str] = None,
    category_id: Optional[uuid.UUID] = None,
    payment_mode: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    cache_key = make_cache_key(
        "expenses", "list",
        page=page, page_size=page_size, search=search,
        category_id=category_id, payment_mode=payment_mode,
        from_date=from_date, to_date=to_date,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    conditions = []

    if search and search.strip():
        search_pattern = f"%{search.strip()}%"
        conditions.append(
            or_(
                Expense.title.ilike(search_pattern),
                Expense.transaction_reference.ilike(search_pattern)
            )
        )

    if category_id:
        conditions.append(Expense.category_id == category_id)

    if payment_mode and payment_mode.strip() and payment_mode.strip().upper() != "ALL":
        mode_val = payment_mode.strip().upper()
        conditions.append(func.upper(Expense.payment_mode) == mode_val)

    if from_date:
        conditions.append(Expense.expense_date >= from_date)

    if to_date:
        conditions.append(Expense.expense_date <= to_date)

    total_result = await db.execute(select(func.count(Expense.id)).where(*conditions))
    total = total_result.scalar_one()

    sum_result = await db.execute(
        select(func.coalesce(func.sum(Expense.amount), Decimal("0.00"))).where(*conditions)
    )
    total_amount = sum_result.scalar_one()

    offset = (page - 1) * page_size
    query = (
        select(Expense)
        .options(selectinload(Expense.category))
        .where(*conditions)
        .order_by(desc(Expense.expense_date), desc(Expense.created_at))
        .offset(offset)
        .limit(page_size)
    )
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

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    resp = ExpensePageResponse(
        items=response_items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        total_amount=total_amount,
    )
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM, model=ExpensePageResponse)
    return resp

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
    await invalidate_expense_and_salary_cache()

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
@router.get("/salaries/filters", response_model=SalaryFilterOptionsResponse)
async def get_salary_filter_options(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    cache_key = "erp:expenses:salary_filters"
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    teachers_res = await db.execute(select(Teacher).order_by(Teacher.name.asc()))
    all_teachers = teachers_res.scalars().all()

    staff_map: dict[str, SalaryFilterStaffOption] = {}
    seen_teacher_ids: set[uuid.UUID] = set()
    teacher_names_lower: set[str] = set()

    for t in all_teachers:
        seen_teacher_ids.add(t.id)
        norm_name = t.name.strip().lower()
        teacher_names_lower.add(norm_name)
        key = f"id:{t.id}"
        staff_map[key] = SalaryFilterStaffOption(
            key=key,
            label=f"{t.name} (Faculty)",
            employee_id=t.id,
            employee_name=t.name,
            employee_type="TEACHER",
        )

    sal_emp_res = await db.execute(
        select(
            SalaryRecord.employee_id,
            SalaryRecord.employee_name_snapshot,
            SalaryRecord.employee_type,
        ).distinct()
    )
    for emp_id, emp_name, emp_type in sal_emp_res.all():
        clean_name = (emp_name or "").strip()
        if not clean_name:
            continue
        if emp_id and emp_id in seen_teacher_ids:
            continue
        if emp_id is None and clean_name.lower() in teacher_names_lower:
            continue
        if emp_id:
            map_key = f"id:{emp_id}"
            seen_teacher_ids.add(emp_id)
        else:
            map_key = f"name:{clean_name.lower()}"
        if map_key not in staff_map:
            role_label = "Faculty" if emp_type == "TEACHER" else "Staff"
            staff_map[map_key] = SalaryFilterStaffOption(
                key=f"id:{emp_id}" if emp_id else f"name:{clean_name}",
                label=f"{clean_name} ({role_label})",
                employee_id=emp_id,
                employee_name=clean_name,
                employee_type=emp_type,
            )

    staff_options = sorted(staff_map.values(), key=lambda x: x.employee_name.lower())

    months_res = await db.execute(
        select(SalaryRecord.month_year).distinct().order_by(desc(SalaryRecord.month_year))
    )
    months = [m for m in months_res.scalars().all() if m]

    resp = SalaryFilterOptionsResponse(staff=staff_options, months=months)
    await cache_set(cache_key, resp, ttl=TTL_LONG, model=SalaryFilterOptionsResponse)
    return resp

@router.get("/salaries", response_model=SalaryPageResponse)
async def list_salary_records(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    month_year: Optional[str] = None,
    status_filter: Optional[str] = None,
    status: Optional[str] = None,
    employee_id: Optional[uuid.UUID] = None,
    employee_name: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    cache_key = make_cache_key(
        "expenses", "salaries",
        page=page, page_size=page_size, month_year=month_year,
        status_filter=status_filter, status=status,
        employee_id=employee_id, employee_name=employee_name, search=search,
    )
    hit, cached = await cache_get(cache_key)
    if hit:
        return cached
    conditions = []

    if search and search.strip():
        search_pattern = f"%{search.strip()}%"
        conditions.append(SalaryRecord.employee_name_snapshot.ilike(search_pattern))

    if month_year and month_year.strip() and month_year.strip().upper() != "ALL":
        conditions.append(SalaryRecord.month_year == month_year.strip())

    eff_status = (status_filter or status or "").strip().upper()
    if eff_status and eff_status != "ALL":
        conditions.append(func.upper(SalaryRecord.status) == eff_status)

    if employee_id:
        t_name = (await db.execute(select(Teacher.name).where(Teacher.id == employee_id))).scalar_one_or_none()
        if t_name:
            emp_clause = or_(
                SalaryRecord.employee_id == employee_id,
                SalaryRecord.employee_name_snapshot.ilike(t_name.strip())
            )
        else:
            emp_clause = (SalaryRecord.employee_id == employee_id)
        conditions.append(emp_clause)

    if employee_name and employee_name.strip():
        name_clause = func.lower(func.trim(SalaryRecord.employee_name_snapshot)) == employee_name.strip().lower()
        conditions.append(name_clause)

    total_result = await db.execute(select(func.count(SalaryRecord.id)).where(*conditions))
    total = total_result.scalar_one()

    sum_result = await db.execute(
        select(
            func.coalesce(func.sum(SalaryRecord.paid_amount), Decimal("0.00")),
            func.coalesce(func.sum(SalaryRecord.salary_amount), Decimal("0.00")),
        ).where(*conditions)
    )
    total_paid_amount, total_salary_amount = sum_result.one()

    offset = (page - 1) * page_size
    query = (
        select(SalaryRecord)
        .where(*conditions)
        .order_by(desc(SalaryRecord.month_year), desc(SalaryRecord.created_at), desc(SalaryRecord.due_date))
        .offset(offset)
        .limit(page_size)
    )
    items_result = await db.execute(query)
    items = items_result.scalars().all()

    # Look up absent counts for teacher records
    teachers_res = await db.execute(select(Teacher))
    all_teachers = teachers_res.scalars().all()
    teacher_name_to_id = {t.name.lower().strip(): t.id for t in all_teachers}

    pairs = set()
    for s in items:
        tid = s.employee_id or teacher_name_to_id.get(s.employee_name_snapshot.lower().strip())
        if tid:
            pairs.add((tid, s.month_year))

    absent_map = {}
    for tid, my in pairs:
        cnt_res = await db.execute(
            select(func.count(TeacherAttendance.id))
            .where(TeacherAttendance.teacher_id == tid, TeacherAttendance.month_year == my)
        )
        absent_map[(tid, my)] = cnt_res.scalar() or 0

    response_items = []
    for s in items:
        tid = s.employee_id or teacher_name_to_id.get(s.employee_name_snapshot.lower().strip())
        abs_count = absent_map.get((tid, s.month_year)) if tid else None
        response_items.append(
            SalaryRecordResponse(
                id=s.id,
                employee_id=s.employee_id or tid,
                employee_type=s.employee_type,
                employee_name_snapshot=s.employee_name_snapshot,
                month_year=s.month_year,
                salary_amount=s.salary_amount,
                due_date=s.due_date,
                paid_amount=s.paid_amount,
                status=s.status,
                payment_date=s.payment_date,
                payment_mode=s.payment_mode,
                notes=s.notes,
                absent_days_count=abs_count,
                base_salary=s.base_salary,
                holidays_count=s.holidays_count or 0
            )
        )

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    resp = SalaryPageResponse(
        items=response_items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        total_amount=total_paid_amount,
        total_paid_amount=total_paid_amount,
        total_salary_amount=total_salary_amount,
    )
    await cache_set(cache_key, resp, ttl=TTL_MEDIUM, model=SalaryPageResponse)
    return resp

@router.post("/salaries", response_model=SalaryRecordResponse, status_code=status.HTTP_201_CREATED)
async def create_salary_record(
    payload: SalaryRecordCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
):
    emp_id = payload.employee_id
    if not emp_id and payload.employee_type == "TEACHER":
        t_res = await db.execute(select(Teacher.id).where(Teacher.name.ilike(payload.employee_name_snapshot.strip())))
        emp_id = t_res.scalar_one_or_none()

    record = SalaryRecord(
        employee_id=emp_id,
        employee_type=payload.employee_type,
        employee_name_snapshot=payload.employee_name_snapshot,
        month_year=payload.month_year,
        salary_amount=payload.salary_amount,
        due_date=payload.due_date,
        paid_amount=Decimal("0.00"),
        status="PENDING",
        notes=payload.notes,
        base_salary=payload.base_salary,
        holidays_count=payload.holidays_count or 0
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    await invalidate_expense_and_salary_cache()

    abs_count = None
    tid = record.employee_id
    if not tid and record.employee_type == "TEACHER":
        t_res = await db.execute(select(Teacher.id).where(Teacher.name.ilike(record.employee_name_snapshot.strip())))
        tid = t_res.scalar_one_or_none()
    if tid:
        cnt_res = await db.execute(
            select(func.count(TeacherAttendance.id))
            .where(TeacherAttendance.teacher_id == tid, TeacherAttendance.month_year == record.month_year)
        )
        abs_count = cnt_res.scalar() or 0

    return SalaryRecordResponse(
        id=record.id,
        employee_id=record.employee_id,
        employee_type=record.employee_type,
        employee_name_snapshot=record.employee_name_snapshot,
        month_year=record.month_year,
        salary_amount=record.salary_amount,
        due_date=record.due_date,
        paid_amount=record.paid_amount,
        status=record.status,
        payment_date=record.payment_date,
        payment_mode=record.payment_mode,
        notes=record.notes,
        absent_days_count=abs_count,
        base_salary=record.base_salary,
        holidays_count=record.holidays_count or 0
    )

@router.post("/salaries/{record_id}/pay", response_model=SalaryRecordResponse)
async def pay_salary(
    record_id: uuid.UUID,
    payload: PaySalaryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_cashier_or_admin)
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
    await invalidate_expense_and_salary_cache()

    abs_count = None
    tid = record.employee_id
    if not tid and record.employee_type == "TEACHER":
        t_res = await db.execute(select(Teacher.id).where(Teacher.name.ilike(record.employee_name_snapshot.strip())))
        tid = t_res.scalar_one_or_none()
    if tid:
        cnt_res = await db.execute(
            select(func.count(TeacherAttendance.id))
            .where(TeacherAttendance.teacher_id == tid, TeacherAttendance.month_year == record.month_year)
        )
        abs_count = cnt_res.scalar() or 0

    return SalaryRecordResponse(
        id=record.id,
        employee_id=record.employee_id,
        employee_type=record.employee_type,
        employee_name_snapshot=record.employee_name_snapshot,
        month_year=record.month_year,
        salary_amount=record.salary_amount,
        due_date=record.due_date,
        paid_amount=record.paid_amount,
        status=record.status,
        payment_date=record.payment_date,
        payment_mode=record.payment_mode,
        notes=record.notes,
        absent_days_count=abs_count,
        base_salary=record.base_salary,
        holidays_count=record.holidays_count or 0
    )
