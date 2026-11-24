from datetime import date
from typing import Optional, List, Any, Tuple
import uuid
from sqlalchemy import select, or_, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.active_student import today_kolkata
from app.modules.users.models import User
from app.modules.teachers.models import Teacher
from app.modules.subjects.models import Subject
from app.modules.admissions.models import Admission, AdmissionItem
from app.modules.students.models import Student
from app.modules.enquiries.models import Enquiry, EnquiryDemoItem


def is_teacher_user(user: Optional[User]) -> bool:
    """Return True when the authenticated user has the TEACHER role."""
    return bool(user and (getattr(user, "role", "") or "").strip().upper() == "TEACHER")


async def resolve_teacher_for_user(db: AsyncSession, user: User) -> Optional[Teacher]:
    """Resolve the Teacher profile linked to a TEACHER user account."""
    t_res = await db.execute(select(Teacher).where(Teacher.user_id == user.id))
    teacher = t_res.scalars().first()
    if not teacher:
        clauses = []
        if getattr(user, "email", None):
            clauses.append(func.lower(Teacher.email) == user.email.strip().lower())
        if getattr(user, "full_name", None):
            clauses.append(func.lower(Teacher.name) == user.full_name.strip().lower())
        if clauses:
            t_res2 = await db.execute(select(Teacher).where(or_(*clauses)))
            teacher = t_res2.scalars().first()
    return teacher


async def get_teacher_subject_ids(db: AsyncSession, teacher_id: uuid.UUID) -> List[uuid.UUID]:
    """Return all Subject IDs currently assigned to the given teacher."""
    res = await db.execute(select(Subject.id).where(Subject.teacher_id == teacher_id))
    return list(res.scalars().all())


def active_teacher_student_item_filter(today: Optional[date] = None):
    """
    SQLAlchemy clause matching an active enrollment item whose parent admission
    is valid and active on `today`.
    """
    t = today or today_kolkata()
    eff_from = func.coalesce(AdmissionItem.valid_from, Admission.valid_from, Admission.admission_date)
    eff_to = func.coalesce(AdmissionItem.valid_to, Admission.valid_to)
    return and_(
        AdmissionItem.status == "ACTIVE",
        AdmissionItem.access_status == "ACTIVE",
        Admission.status == "ACTIVE",
        Admission.access_status == "ACTIVE",
        Admission.document_status == "VALID",
        eff_from <= t,
        or_(eff_to.is_(None), eff_to >= t),
    )


def is_active_teacher_item(
    item: Any,
    admission: Optional[Any] = None,
    today: Optional[date] = None,
) -> bool:
    """In-memory check matching `active_teacher_student_item_filter`."""
    t = today or today_kolkata()
    if getattr(item, "status", None) != "ACTIVE":
        return False
    if getattr(item, "access_status", "ACTIVE") != "ACTIVE":
        return False
    adm = admission or getattr(item, "admission", None)
    if adm is None:
        return False
    if getattr(adm, "status", None) != "ACTIVE":
        return False
    if getattr(adm, "access_status", "ACTIVE") != "ACTIVE":
        return False
    if getattr(adm, "document_status", "VALID") != "VALID":
        return False
    eff_from = getattr(item, "valid_from", None) or getattr(adm, "valid_from", None) or getattr(adm, "admission_date", None)
    eff_to = getattr(item, "valid_to", None) or getattr(adm, "valid_to", None)
    if eff_from is not None and eff_from > t:
        return False
    if eff_to is not None and eff_to < t:
        return False
    return True


async def is_active_student_of_teacher(
    db: AsyncSession,
    student_id: uuid.UUID,
    teacher_id: Optional[uuid.UUID],
    today: Optional[date] = None,
) -> Tuple[bool, List[uuid.UUID]]:
    """
    Return (is_allowed, teacher_subject_ids) where is_allowed is True iff the
    student is ACTIVE and has at least one active enrollment in a subject
    assigned to `teacher_id`.
    """
    if not teacher_id:
        return False, []
    sub_ids = await get_teacher_subject_ids(db, teacher_id)
    if not sub_ids:
        return False, []
    t = today or today_kolkata()
    stmt = (
        select(AdmissionItem.id)
        .join(Admission, AdmissionItem.admission_id == Admission.id)
        .join(Student, Admission.student_id == Student.id)
        .where(
            Admission.student_id == student_id,
            Student.status == "ACTIVE",
            AdmissionItem.subject_id.in_(sub_ids),
            active_teacher_student_item_filter(t),
        )
        .limit(1)
    )
    matched = (await db.execute(stmt)).scalar_one_or_none()
    return (matched is not None), sub_ids


def teacher_demo_ownership_filter(teacher_id: uuid.UUID, teacher_sub_ids: List[uuid.UUID]):
    """SQLAlchemy clause matching demo items assigned to the teacher (or unassigned-teacher demos in his subjects)."""
    if teacher_sub_ids:
        return or_(
            EnquiryDemoItem.teacher_id == teacher_id,
            and_(EnquiryDemoItem.teacher_id.is_(None), EnquiryDemoItem.subject_id.in_(teacher_sub_ids)),
        )
    return EnquiryDemoItem.teacher_id == teacher_id


def active_demo_filter(today: Optional[date] = None):
    """SQLAlchemy clause matching currently active demo items."""
    t = today or today_kolkata()
    return and_(
        EnquiryDemoItem.demo_end_date >= t,
        EnquiryDemoItem.status.notin_(["CONVERTED", "DROPPED", "EXPIRED"]),
        EnquiryDemoItem.converted_admission_item_id.is_(None),
        or_(
            EnquiryDemoItem.status.in_(["SCHEDULED", "ATTENDED"]),
            Enquiry.status == "ACTIVE_DEMO",
        ),
    )
