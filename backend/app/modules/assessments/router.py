import uuid
from datetime import date
from decimal import Decimal
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, desc

from app.database.session import get_db
from app.core.dependencies import require_staff, require_admin
from app.database.models import User, Teacher, Subject, Batch, Student
from app.modules.assessments.models import Assessment, StudentMark
from app.modules.assessments.schemas import (
    AssessmentCreate, AssessmentUpdate, AssessmentResponse,
    AssessmentDetailResponse, StudentMarkBulkUpdate, StudentMarkResponse
)
from app.common.pagination import PageResponse

router = APIRouter(prefix="/api/assessments", tags=["Assessments & Marks"])


def _calculate_grade(pct: Decimal) -> str:
    if pct >= 90:
        return "A+"
    elif pct >= 80:
        return "A"
    elif pct >= 70:
        return "B+"
    elif pct >= 60:
        return "B"
    elif pct >= 50:
        return "C"
    elif pct >= 40:
        return "D"
    else:
        return "F"


@router.get("", response_model=PageResponse[AssessmentResponse])
async def list_assessments(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    subject_id: Optional[uuid.UUID] = None,
    batch_id: Optional[uuid.UUID] = None,
    teacher_id: Optional[uuid.UUID] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    query = select(Assessment)
    count_query = select(func.count(Assessment.id))

    # If user is a teacher, restrict to their assigned subjects/assessments
    if current_user.role == "TEACHER":
        t_res = await db.execute(select(Teacher).where(Teacher.user_id == current_user.id))
        teacher = t_res.scalar_one_or_none()
        if teacher:
            query = query.where(Assessment.teacher_id == teacher.id)
            count_query = count_query.where(Assessment.teacher_id == teacher.id)

    if subject_id:
        query = query.where(Assessment.subject_id == subject_id)
        count_query = count_query.where(Assessment.subject_id == subject_id)
    if batch_id:
        query = query.where(Assessment.batch_id == batch_id)
        count_query = count_query.where(Assessment.batch_id == batch_id)
    if teacher_id:
        query = query.where(Assessment.teacher_id == teacher_id)
        count_query = count_query.where(Assessment.teacher_id == teacher_id)
    if from_date:
        query = query.where(Assessment.exam_date >= from_date)
        count_query = count_query.where(Assessment.exam_date >= from_date)
    if to_date:
        query = query.where(Assessment.exam_date <= to_date)
        count_query = count_query.where(Assessment.exam_date <= to_date)

    total = (await db.execute(count_query)).scalar() or 0
    query = query.order_by(desc(Assessment.exam_date), desc(Assessment.created_at))
    query = query.offset((page - 1) * page_size).limit(page_size)

    res = await db.execute(query)
    assessments = res.scalars().all()

    items = []
    for a in assessments:
        marks_cnt = len(a.marks)
        avg_pct = None
        if marks_cnt > 0:
            avg_pct = round(sum(m.percentage for m in a.marks) / marks_cnt, 2)

        items.append(
            AssessmentResponse(
                id=a.id,
                name=a.name,
                description=a.description,
                subject_id=a.subject_id,
                subject_name=a.subject.name if a.subject else None,
                batch_id=a.batch_id,
                batch_name=a.batch.name if a.batch else None,
                teacher_id=a.teacher_id,
                teacher_name=a.teacher.name if a.teacher else None,
                exam_date=a.exam_date,
                max_marks=a.max_marks,
                passing_marks=a.passing_marks,
                total_students_assessed=marks_cnt,
                average_percentage=avg_pct,
                created_at=a.created_at
            )
        )

    return PageResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size if total > 0 else 0
    )


@router.post("", response_model=AssessmentResponse, status_code=status.HTTP_201_CREATED)
async def create_assessment(
    payload: AssessmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    # Verify subject exists
    sub = await db.get(Subject, payload.subject_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subject not found")

    teacher_id = payload.teacher_id
    if not teacher_id and sub.teacher_id:
        teacher_id = sub.teacher_id

    assessment = Assessment(
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        subject_id=payload.subject_id,
        batch_id=payload.batch_id,
        teacher_id=teacher_id,
        exam_date=payload.exam_date,
        max_marks=payload.max_marks,
        passing_marks=payload.passing_marks,
        created_by=current_user.id
    )
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)

    return AssessmentResponse(
        id=assessment.id,
        name=assessment.name,
        description=assessment.description,
        subject_id=assessment.subject_id,
        subject_name=sub.name,
        batch_id=assessment.batch_id,
        batch_name=assessment.batch.name if assessment.batch else None,
        teacher_id=assessment.teacher_id,
        teacher_name=assessment.teacher.name if assessment.teacher else None,
        exam_date=assessment.exam_date,
        max_marks=assessment.max_marks,
        passing_marks=assessment.passing_marks,
        total_students_assessed=0,
        average_percentage=None,
        created_at=assessment.created_at
    )


@router.get("/{id}", response_model=AssessmentDetailResponse)
async def get_assessment(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    a = await db.get(Assessment, id)
    if not a:
        raise HTTPException(status_code=404, detail="Assessment not found")

    marks_rows = []
    for m in a.marks:
        marks_rows.append(
            StudentMarkResponse(
                id=m.id,
                assessment_id=m.assessment_id,
                student_id=m.student_id,
                student_name=m.student.name if m.student else None,
                student_code=m.student.student_code if m.student else None,
                marks_obtained=m.marks_obtained,
                percentage=m.percentage,
                grade=m.grade,
                remarks=m.remarks,
                created_at=m.created_at
            )
        )

    marks_cnt = len(marks_rows)
    avg_pct = round(sum(m.percentage for m in marks_rows) / marks_cnt, 2) if marks_cnt > 0 else None

    return AssessmentDetailResponse(
        id=a.id,
        name=a.name,
        description=a.description,
        subject_id=a.subject_id,
        subject_name=a.subject.name if a.subject else None,
        batch_id=a.batch_id,
        batch_name=a.batch.name if a.batch else None,
        teacher_id=a.teacher_id,
        teacher_name=a.teacher.name if a.teacher else None,
        exam_date=a.exam_date,
        max_marks=a.max_marks,
        passing_marks=a.passing_marks,
        total_students_assessed=marks_cnt,
        average_percentage=avg_pct,
        created_at=a.created_at,
        marks=marks_rows
    )


@router.post("/{id}/marks", response_model=List[StudentMarkResponse])
async def record_student_marks(
    id: uuid.UUID,
    payload: StudentMarkBulkUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    a = await db.get(Assessment, id)
    if not a:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Load existing marks for assessment
    existing_marks_res = await db.execute(select(StudentMark).where(StudentMark.assessment_id == id))
    existing_marks = {m.student_id: m for m in existing_marks_res.scalars().all()}

    saved_marks = []
    for item in payload.marks:
        pct = Decimal("0.00")
        if a.max_marks > 0:
            pct = round((item.marks_obtained / a.max_marks) * 100, 2)
        grd = _calculate_grade(pct)

        if item.student_id in existing_marks:
            sm = existing_marks[item.student_id]
            sm.marks_obtained = item.marks_obtained
            sm.percentage = pct
            sm.grade = grd
            sm.remarks = item.remarks.strip() if item.remarks else None
            sm.recorded_by = current_user.id
            saved_marks.append(sm)
        else:
            sm = StudentMark(
                assessment_id=id,
                student_id=item.student_id,
                marks_obtained=item.marks_obtained,
                percentage=pct,
                grade=grd,
                remarks=item.remarks.strip() if item.remarks else None,
                recorded_by=current_user.id
            )
            db.add(sm)
            saved_marks.append(sm)

    await db.commit()

    # Re-fetch with relationships
    res_list = []
    for sm in saved_marks:
        await db.refresh(sm)
        res_list.append(
            StudentMarkResponse(
                id=sm.id,
                assessment_id=sm.assessment_id,
                student_id=sm.student_id,
                student_name=sm.student.name if sm.student else None,
                student_code=sm.student.student_code if sm.student else None,
                marks_obtained=sm.marks_obtained,
                percentage=sm.percentage,
                grade=sm.grade,
                remarks=sm.remarks,
                created_at=sm.created_at
            )
        )

    return res_list


@router.get("/students/{student_id}/history", response_model=List[dict])
async def get_student_assessment_history(
    student_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff)
):
    stmt = (
        select(StudentMark, Assessment, Subject)
        .join(Assessment, StudentMark.assessment_id == Assessment.id)
        .join(Subject, Assessment.subject_id == Subject.id)
        .where(StudentMark.student_id == student_id)
        .order_by(desc(Assessment.exam_date), desc(StudentMark.created_at))
    )
    res = await db.execute(stmt)
    rows = res.all()

    history = []
    for sm, a, sub in rows:
        history.append({
            "mark_id": str(sm.id),
            "assessment_id": str(a.id),
            "assessment_name": a.name,
            "subject_id": str(sub.id),
            "subject_name": sub.name,
            "exam_date": str(a.exam_date),
            "max_marks": float(a.max_marks),
            "passing_marks": float(a.passing_marks) if a.passing_marks else None,
            "marks_obtained": float(sm.marks_obtained),
            "percentage": float(sm.percentage),
            "grade": sm.grade,
            "remarks": sm.remarks,
            "created_at": sm.created_at.isoformat()
        })
    return history
