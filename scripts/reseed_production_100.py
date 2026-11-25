#!/usr/bin/env python3
"""
Thakurdwara ERP - Production Database Wipe & 100-Student Reseed (M41)
=====================================================================
Formats (wipes) all business data in `thakurdwara_erp` ONLY while strictly
preserving `users` (ADM001, CSH001, TCH001, TCH002 with current passwords),
`institute_settings` (NALANDA IAS ACADEMY), and `alembic_version`.

Seeds fresh realistic data:
  - 5 Teachers (including K.K. Chauhan linked to TCH001 user account)
  - 6 Active Coaching Subjects (Mathematics, Physics, Chemistry, Biology, English, Computer Science)
  - 3 Green Card Products (1 Month / 30d ₹2,500, 3 Months / 90d ₹6,500, Annual / 365d ₹15,000)
  - 3 Expense Categories
  - 100 Realistic Students (varied male & female Indian names, unique 10-digit mobiles)
  - 100 Admissions (1-2 subjects each, mixed PAID / PARTIALLY_PAID / UNPAID states)
  - Ledger-consistent Payments, Allocations, FinancialTransactions, TeacherEarnings, AuditLogs & Due Reminders
"""

import asyncio
import glob
import json
import os
import random
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

# Ensure backend package is importable
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")
sys.path.insert(0, BACKEND_DIR)
os.chdir(BACKEND_DIR)

from sqlalchemy import func, select, text
from sqlalchemy.orm import selectinload

from app.common.calculations import (
    calculate_admission_financials,
    calculate_course_duration_fee,
    compute_rolling_cycle_end,
)
from app.common.numbering import generate_student_code, next_number
from app.core.config import settings
from app.core.redis import delete_cache_pattern
from app.database.models import (
    Admission,
    AdmissionItem,
    AuditLog,
    ExpenseCategory,
    GreenCardProduct,
    InstituteSetting,
    Payment,
    PaymentAllocation,
    Student,
    Subject,
    Teacher,
    User,
)
from app.database.session import AsyncSessionLocal
from app.modules.ledger.service import record_payment_service
from app.modules.reminders.service import build_due_reminders


BUSINESS_TABLES = [
    "student_marks",
    "assessments",
    "enquiry_demo_items",
    "enquiries",
    "teacher_earnings",
    "teacher_attendance",
    "payment_allocations",
    "financial_transactions",
    "refunds",
    "payments",
    "reminder_queue",
    "admission_items",
    "admissions",
    "batch_subjects",
    "batches",
    "subjects",
    "teachers",
    "expenses",
    "expense_categories",
    "salary_records",
    "students",
    "green_card_products",
    "audit_logs",
    "refresh_tokens",
    "idempotency_records",
    "number_sequences",
]

# 50 Male + 50 Female distinct realistic Indian student entries (name, father_first_name, gender_tag)
STUDENT_PROFILES = [
    # Male (50)
    ("Aarav Sharma", "Rajesh", "M"),
    ("Vivaan Verma", "Suresh", "M"),
    ("Aditya Chauhan", "Mahendra", "M"),
    ("Rohan Gupta", "Ramesh", "M"),
    ("Siddharth Mishra", "Pradeep", "M"),
    ("Arjun Yadav", "Virendra", "M"),
    ("Kabir Saxena", "Anil", "M"),
    ("Krishna Tiwari", "Satish", "M"),
    ("Ishan Pandey", "Rakesh", "M"),
    ("Pranav Joshi", "Deepak", "M"),
    ("Devansh Agarwal", "Nitin", "M"),
    ("Utkarsh Shukla", "Dinesh", "M"),
    ("Harshvardhan Singh", "Devendra", "M"),
    ("Kunal Rastogi", "Manoj", "M"),
    ("Manav Bhatnagar", "Ashok", "M"),
    ("Nikhil Kashyap", "Sanjay", "M"),
    ("Ayush Srivastava", "Alok", "M"),
    ("Yashwant Tomar", "Rajpal", "M"),
    ("Gaurav Chaudhary", "Brijesh", "M"),
    ("Tushar Rajput", "Harish", "M"),
    ("Piyush Vishwakarma", "Kamlesh", "M"),
    ("Saurabh Gangwar", "Naresh", "M"),
    ("Ankit Maurya", "Ramphal", "M"),
    ("Deepanshu Bisht", "Girish", "M"),
    ("Himanshu Rawat", "Mohan", "M"),
    ("Kartikeya Dubey", "Vinod", "M"),
    ("Lakshay Bansal", "Pankaj", "M"),
    ("Mayank Singhal", "Subhash", "M"),
    ("Naman Goyal", "Rajeev", "M"),
    ("Omkar Tripathi", "Awadhesh", "M"),
    ("Parth Kulkarni", "Shrikant", "M"),
    ("Raghavendra Negi", "Jagdish", "M"),
    ("Shubham Saini", "Mahavir", "M"),
    ("Tanmay Khare", "Prashant", "M"),
    ("Ujjwal Pathak", "Kailash", "M"),
    ("Varun Malhotra", "Sunil", "M"),
    ("Yuvraj Solanki", "Bhupendra", "M"),
    ("Abhinav Chaturvedi", "Gopal", "M"),
    ("Bhavesh Tyagi", "Omprakash", "M"),
    ("Chirag Mittal", "Vipin", "M"),
    ("Daksh Khandelwal", "Tarun", "M"),
    ("Eklavya Pal", "Yogendra", "M"),
    ("Faizan Siddiqui", "Imran", "M"),
    ("Hemant Nautiyal", "Rameshwar", "M"),
    ("Jatin Grover", "Mukesh", "M"),
    ("Keshav Upadhyay", "Balkrishna", "M"),
    ("Mohit Prajapati", "Radheshyam", "M"),
    ("Nitin Deshmukh", "Ravindra", "M"),
    ("Prashant Awasthi", "Umesh", "M"),
    ("Rishabh Bajpai", "Hemraj", "M"),
    # Female (50)
    ("Ananya Sharma", "Vishnu", "F"),
    ("Priya Verma", "Mukesh", "F"),
    ("Ishita Mishra", "Sharad", "F"),
    ("Kavya Tripathi", "Raghvendra", "F"),
    ("Sneha Yadav", "Surendra", "F"),
    ("Riya Saxena", "Vivek", "F"),
    ("Meera Chauhan", "Narendra", "F"),
    ("Pooja Singh", "Harishankar", "F"),
    ("Shreya Gupta", "Arvind", "F"),
    ("Diya Joshi", "Kamal", "F"),
    ("Aditi Tiwari", "Akhilesh", "F"),
    ("Bhavna Pandey", "Girish", "F"),
    ("Chhavi Agarwal", "Prakash", "F"),
    ("Divya Shukla", "Shyam", "F"),
    ("Ekta Rastogi", "Dharmendra", "F"),
    ("Garima Bhatnagar", "Rajendra", "F"),
    ("Harshita Kashyap", "Ramesh", "F"),
    ("Jhanvi Srivastava", "Atul", "F"),
    ("Kajal Tomar", "Veerpal", "F"),
    ("Lavanya Chaudhary", "Sudhir", "F"),
    ("Manya Rajput", "Jitendra", "F"),
    ("Nandini Vishwakarma", "Satyapal", "F"),
    ("Ojasvi Gangwar", "Mahesh", "F"),
    ("Palak Maurya", "Devki", "F"),
    ("Rashi Bisht", "Harish", "F"),
    ("Sanya Rawat", "Prem", "F"),
    ("Tanvi Dubey", "Anand", "F"),
    ("Urvi Bansal", "Neeraj", "F"),
    ("Vaishnavi Singhal", "Ajay", "F"),
    ("Yashika Goyal", "Sanjeev", "F"),
    ("Aakanksha Negi", "Balwant", "F"),
    ("Bhumika Saini", "Pramod", "F"),
    ("Charu Khare", "Deepak", "F"),
    ("Deeksha Pathak", "Shivkumar", "F"),
    ("Esha Malhotra", "Rajan", "F"),
    ("Falguni Solanki", "Kuldeep", "F"),
    ("Gunjan Chaturvedi", "Ashwani", "F"),
    ("Hema Tyagi", "Satpal", "F"),
    ("Ira Mittal", "Gaurav", "F"),
    ("Jyoti Khandelwal", "Lokesh", "F"),
    ("Kirti Pal", "Devraj", "F"),
    ("Lakshmi Upadhyay", "Govind", "F"),
    ("Mahima Nautiyal", "Suresh", "F"),
    ("Neha Grover", "Rakesh", "F"),
    ("Prachi Prajapati", "Maheshwar", "F"),
    ("Radhika Awasthi", "Kishore", "F"),
    ("Sakshi Bajpai", "Hemant", "F"),
    ("Tanya Deshmukh", "Rajeshwar", "F"),
    ("Vanshika Kulkarni", "Pravin", "F"),
    ("Zoya Siddiqui", "Farhan", "F"),
]

ADDRESSES = [
    "Civil Lines, Near Tehsil Office, Thakurdwara, UP",
    "Station Road, Ward 4, Thakurdwara, Moradabad",
    "Kashipur Road, Near Bus Stand, Thakurdwara",
    "Jaspur Chauraha, Main Market, Thakurdwara",
    "Budh Bazar Colony, Thakurdwara, UP - 244601",
    "Subhash Chowk, Civil Lines, Thakurdwara",
    "Surajnagar Road, Thakurdwara, Moradabad",
    "Moradabad Road, Shastri Nagar, Thakurdwara",
    "Court Road, Near Nagar Palika, Thakurdwara",
    "Kanth Road Crossing, Thakurdwara, Moradabad",
]


def verify_prerequisites():
    if "thakurdwara_erp_test" in settings.DATABASE_URL:
        raise RuntimeError("ABORTING: DATABASE_URL points to thakurdwara_erp_test! Must target thakurdwara_erp.")
    if not settings.DATABASE_URL.endswith("/thakurdwara_erp"):
        raise RuntimeError(f"Unexpected DATABASE_URL: {settings.DATABASE_URL}")

    backup_dir = os.path.join(ROOT_DIR, "backups")
    today_prefix = date.today().strftime("%Y%m%d")
    sql_backups = sorted(glob.glob(os.path.join(backup_dir, f"thakurdwara_erp_backup_{today_prefix}_*.sql")))
    dump_backups = sorted(glob.glob(os.path.join(backup_dir, f"thakurdwara_erp_backup_{today_prefix}_*.dump")))
    if not sql_backups or os.path.getsize(sql_backups[-1]) == 0:
        raise RuntimeError("No non-empty today's .sql backup found in backups/. Run pg_dump first!")
    if not dump_backups or os.path.getsize(dump_backups[-1]) == 0:
        raise RuntimeError("No non-empty today's .dump backup found in backups/. Run pg_dump first!")
    print(f"[Backup Verified] SQL : {sql_backups[-1]} ({os.path.getsize(sql_backups[-1]):,} bytes)")
    print(f"[Backup Verified] DUMP: {dump_backups[-1]} ({os.path.getsize(dump_backups[-1]):,} bytes)")


async def run_wipe_and_reseed():
    verify_prerequisites()
    rng = random.Random(20261125)
    today = date(2026, 11, 25)

    async with AsyncSessionLocal() as db:
        # 1. Verify preserved users & institute_settings BEFORE wipe
        users = (await db.execute(select(User))).scalars().all()
        user_by_emp = {u.employee_id: u for u in users}
        for req_emp in ("ADM001", "CSH001", "TCH001"):
            if req_emp not in user_by_emp:
                raise RuntimeError(f"Required user {req_emp} missing from users table!")
        user_pwd_snapshot = {u.employee_id: u.password_hash for u in users}

        inst_before = (
            await db.execute(select(InstituteSetting).where(InstituteSetting.key == "institute_profile"))
        ).scalar_one_or_none()
        if not inst_before:
            raise RuntimeError("institute_settings row 'institute_profile' missing!")
        inst_snapshot = (inst_before.institute_name, inst_before.phone, inst_before.address, inst_before.logo_url)
        print(f"[Pre-Check] Users preserved: {sorted(user_by_emp.keys())}")
        print(f"[Pre-Check] Institute preserved: {inst_snapshot[0]} | {inst_snapshot[1]}")

        # 2. Wipe all business tables
        print("\n[Wipe] Truncating all business tables...")
        await db.execute(text(f"TRUNCATE TABLE {', '.join(BUSINESS_TABLES)} RESTART IDENTITY CASCADE;"))
        await db.commit()

        for tbl in BUSINESS_TABLES:
            cnt = (await db.execute(text(f"SELECT COUNT(*) FROM {tbl}"))).scalar_one()
            if cnt != 0:
                raise RuntimeError(f"Table {tbl} still has {cnt} rows after TRUNCATE!")
        print(f"  OK: {len(BUSINESS_TABLES)} business tables wiped to 0 rows.")

        # Verify users & institute_settings untouched
        users_after = (await db.execute(select(User))).scalars().all()
        assert len(users_after) == len(users), "users count changed!"
        for u in users_after:
            assert u.password_hash == user_pwd_snapshot[u.employee_id], f"Password hash changed for {u.employee_id}!"
        inst_after = (
            await db.execute(select(InstituteSetting).where(InstituteSetting.key == "institute_profile"))
        ).scalar_one()
        assert (inst_after.institute_name, inst_after.phone, inst_after.address, inst_after.logo_url) == inst_snapshot
        print("  OK: users (with current passwords) and institute_settings preserved untouched.")

        adm_user = user_by_emp["ADM001"]
        csh_user = user_by_emp["CSH001"]
        tch001_user = user_by_emp["TCH001"]
        tch002_user = user_by_emp.get("TCH002")

        # 3. Seed Expense Categories
        categories = [
            ExpenseCategory(
                name="Building Rent & Infrastructure",
                description="Premises lease, building maintenance and hall upkeep",
            ),
            ExpenseCategory(
                name="Electricity & Utilities",
                description="Power, high-speed internet, inverter maintenance & drinking water",
            ),
            ExpenseCategory(
                name="Study Materials & Printing",
                description="DPPs, assignment booklets, question papers, question banks",
            ),
        ]
        db.add_all(categories)
        await db.flush()

        # 4. Seed 5 Teachers (including K.K. Chauhan linked to TCH001 user)
        teachers_spec = [
            {
                "teacher_code": "TCH001",
                "name": "K.K. Chauhan",
                "mobile": "8859817771",  # +91 88598 17771 normalized to 10-digit Indian mobile
                "email": "teacher@thakurdwara.local",
                "qualification": "M.Sc. Mathematics, B.Ed. (14+ Yrs Exp)",
                "specialization": "Mathematics & Quantitative Aptitude",
                "joining_date": date(2024, 4, 1),
                "share_type": "PERCENT",
                "share_value": Decimal("40.00"),
                "user_id": tch001_user.id,
            },
            {
                "teacher_code": "TCH002",
                "name": "Dr. Amit Sharma",
                "mobile": "9839012345",
                "email": "amit.sharma@thakurdwara.local",
                "qualification": "Ph.D. Physics, IIT Roorkee (12+ Yrs Exp)",
                "specialization": "Physics (Class 11-12 & JEE/NEET)",
                "joining_date": date(2024, 5, 1),
                "share_type": "PERCENT",
                "share_value": Decimal("40.00"),
                "user_id": tch002_user.id if tch002_user else None,
            },
            {
                "teacher_code": "TCH003",
                "name": "Dr. Sunita Saxena",
                "mobile": "9839123456",
                "email": "sunita.saxena@thakurdwara.local",
                "qualification": "Ph.D. Chemistry, CSIR NET (11+ Yrs Exp)",
                "specialization": "Organic & Physical Chemistry",
                "joining_date": date(2024, 6, 15),
                "share_type": "PERCENT",
                "share_value": Decimal("35.00"),
                "user_id": None,
            },
            {
                "teacher_code": "TCH004",
                "name": "Dr. Priya Pandey",
                "mobile": "9839234567",
                "email": "priya.pandey@thakurdwara.local",
                "qualification": "M.Sc. Zoology, B.Ed. (9+ Yrs Exp)",
                "specialization": "Biology (Botany & Zoology - NEET)",
                "joining_date": date(2024, 7, 1),
                "share_type": "PERCENT",
                "share_value": Decimal("35.00"),
                "user_id": None,
            },
            {
                "teacher_code": "TCH005",
                "name": "Vikram Singh Rathore",
                "mobile": "9839345678",
                "email": "vikram.rathore@thakurdwara.local",
                "qualification": "M.A. English, MCA (8+ Yrs Exp)",
                "specialization": "English & Computer Science",
                "joining_date": date(2024, 8, 1),
                "share_type": "PERCENT",
                "share_value": Decimal("35.00"),
                "user_id": None,
            },
        ]
        teachers = []
        for ts in teachers_spec:
            t = Teacher(status="ACTIVE", **ts)
            db.add(t)
            teachers.append(t)
        await db.flush()
        t_kk, t_amit, t_sunita, t_priya, t_vikram = teachers
        print(f"[Seed] Created 5 teachers (K.K. Chauhan linked to user {tch001_user.employee_id} -> {t_kk.user_id}).")

        # 5. Seed 6 Coaching Subjects
        subjects_spec = [
            {
                "subject_code": "MATH-1001",
                "name": "Mathematics (Class 11-12 & JEE)",
                "description": "Comprehensive algebra, calculus, trigonometry, and coordinate geometry for board & competitive exams",
                "default_fee": Decimal("1500.00"),
                "teacher_id": t_kk.id,
                "teacher_name_snapshot": t_kk.name,
                "hall_number": "Hall 101",
                "schedule": "Mon-Sat 04:00 PM - 05:30 PM",
                "class_category": "Class 11-12",
                "default_discount_percentage": Decimal("10.00"),
            },
            {
                "subject_code": "PHYS-1002",
                "name": "Physics (Class 11-12 & JEE/NEET)",
                "description": "Mechanics, electrodynamics, optics, and modern physics with intensive numerical practice",
                "default_fee": Decimal("1600.00"),
                "teacher_id": t_amit.id,
                "teacher_name_snapshot": t_amit.name,
                "hall_number": "Hall 102",
                "schedule": "Mon-Sat 05:30 PM - 07:00 PM",
                "class_category": "Class 11-12",
                "default_discount_percentage": Decimal("10.00"),
            },
            {
                "subject_code": "CHEM-1003",
                "name": "Chemistry (Organic & Physical)",
                "description": "Reaction mechanisms, stoichiometry, thermodynamics, and inorganic chemistry mastery",
                "default_fee": Decimal("1500.00"),
                "teacher_id": t_sunita.id,
                "teacher_name_snapshot": t_sunita.name,
                "hall_number": "Hall 201",
                "schedule": "Tue-Thu-Sat 04:00 PM - 05:30 PM",
                "class_category": "Class 11-12",
                "default_discount_percentage": Decimal("10.00"),
            },
            {
                "subject_code": "BIOL-1004",
                "name": "Biology (NEET Medical Prep)",
                "description": "Human physiology, genetics, ecology, and NCERT line-by-line NEET preparation",
                "default_fee": Decimal("1400.00"),
                "teacher_id": t_priya.id,
                "teacher_name_snapshot": t_priya.name,
                "hall_number": "Hall 202",
                "schedule": "Tue-Thu-Sat 05:30 PM - 07:00 PM",
                "class_category": "Class 11-12",
                "default_discount_percentage": Decimal("10.00"),
            },
            {
                "subject_code": "ENGL-1005",
                "name": "English Language & Grammar",
                "description": "Writing skills, core grammar, reading comprehension, and communicative fluency",
                "default_fee": Decimal("1000.00"),
                "teacher_id": t_vikram.id,
                "teacher_name_snapshot": t_vikram.name,
                "hall_number": "Hall 103",
                "schedule": "Sat-Sun 10:00 AM - 12:00 PM",
                "class_category": "Foundations",
                "default_discount_percentage": Decimal("5.00"),
            },
            {
                "subject_code": "COMP-1006",
                "name": "Computer Science & Python",
                "description": "Python programming, SQL databases, data structures, and CBSE board practical prep",
                "default_fee": Decimal("1200.00"),
                "teacher_id": t_vikram.id,
                "teacher_name_snapshot": t_vikram.name,
                "hall_number": "Computer Lab 1",
                "schedule": "Sat-Sun 02:00 PM - 04:00 PM",
                "class_category": "Skill Development",
                "default_discount_percentage": Decimal("10.00"),
            },
        ]
        subjects = []
        for ss in subjects_spec:
            sub = Subject(status="ACTIVE", **ss)
            db.add(sub)
            subjects.append(sub)
        await db.flush()
        teacher_by_id = {t.id: t for t in teachers}
        print("[Seed] Created 6 active coaching subjects.")

        # 6. Seed 3 Green Card Products
        gc_products = [
            GreenCardProduct(
                name="All-Access Green Card (1 Month)",
                description="Attend any coaching batch & subject for 30 consecutive days",
                validity_days=30,
                price=Decimal("2500.00"),
                is_active=True,
            ),
            GreenCardProduct(
                name="Quarterly Green Card (3 Months)",
                description="Comprehensive 3-month institute pass for all lectures and revision batches",
                validity_days=90,
                price=Decimal("6500.00"),
                is_active=True,
            ),
            GreenCardProduct(
                name="Green Card - All Access Annual Pass",
                description="Unlimited access to all active subjects, batches and test series for 1 academic year (365 days)",
                validity_days=365,
                price=Decimal("15000.00"),
                is_active=True,
            ),
        ]
        db.add_all(gc_products)
        await db.flush()
        print("[Seed] Created 3 Green Card products (30d ₹2500, 90d ₹6500, 365d ₹15000).")

        # 7. Seed 100 Students + 100 Admissions + Mixed Payments
        assert len(STUDENT_PROFILES) == 100
        # Realistic subject pair combos + single subjects so Mathematics & Science streams feel authentic
        sub_math, sub_phys, sub_chem, sub_bio, sub_eng, sub_comp = subjects
        combo_choices = [
            [sub_math],
            [sub_phys],
            [sub_chem],
            [sub_bio],
            [sub_eng],
            [sub_comp],
            [sub_math, sub_phys],
            [sub_phys, sub_chem],
            [sub_chem, sub_bio],
            [sub_math, sub_comp],
            [sub_math, sub_eng],
            [sub_bio, sub_eng],
        ]

        # Payment states: 60 PAID, 25 PARTIALLY_PAID, 15 UNPAID (shuffled deterministically)
        payment_states = (["PAID"] * 60) + (["PARTIAL"] * 25) + (["UNPAID"] * 15)
        rng.shuffle(payment_states)
        payment_modes = ["CASH", "UPI", "BANK_TRANSFER", "CARD"]

        used_mobiles = set()
        for idx, (full_name, father_first, _gender) in enumerate(STUDENT_PROFILES, start=1):
            last_name = full_name.split()[-1]
            father_name = f"Mr. {father_first} {last_name}"

            # Unique 10-digit Indian mobile starting with 98/97/96/88/89/70
            while True:
                prefix = rng.choice(["98", "97", "96", "89", "87", "79", "70"])
                mobile = prefix + f"{10000000 + idx * 7919 + rng.randint(0, 500):08d}"[:8]
                if len(mobile) == 10 and mobile not in used_mobiles and mobile != "8859817771":
                    used_mobiles.add(mobile)
                    break

            reg_offset = (idx - 1) % 24  # Nov 1 to Nov 24, 2026
            adm_date = date(2026, 11, 1) + timedelta(days=reg_offset)
            dob_year = rng.randint(2007, 2011)
            dob_month = rng.randint(1, 12)
            dob_day = rng.randint(1, 28)

            email_slug = full_name.lower().replace(" ", ".")
            student_code = await generate_student_code(db, year=adm_date.year)
            student = Student(
                student_code=student_code,
                name=full_name,
                mobile=mobile,
                father_name=father_name,
                email=f"{email_slug}{idx}@example.in",
                address=ADDRESSES[(idx - 1) % len(ADDRESSES)],
                dob=date(dob_year, dob_month, dob_day),
                registration_date=adm_date,
                status="ACTIVE",
                has_green_card=False,
            )
            db.add(student)
            await db.flush()

            # Choose 1-2 subjects
            chosen_subs = combo_choices[(idx - 1) % len(combo_choices)]
            months = 1 if idx % 10 not in (0, 3) else (2 if idx % 10 == 3 else 3)
            valid_from = adm_date
            valid_to, _ = compute_rolling_cycle_end(valid_from, months)

            # Discount on ~15% of students
            overall_disc_type = "NONE"
            overall_disc_val = Decimal("0.00")
            if idx % 7 == 0:
                overall_disc_type = "PERCENTAGE"
                overall_disc_val = Decimal("10.00")

            raw_items = []
            for sub in chosen_subs:
                fee = calculate_course_duration_fee(sub.default_fee, valid_from=valid_from, valid_to=valid_to, months=months)
                raw_items.append({
                    "subject": sub,
                    "price": fee,
                    "discount_type": "NONE",
                    "discount_value": Decimal("0.00"),
                })

            calc = calculate_admission_financials(
                items=raw_items,
                overall_discount_type=overall_disc_type,
                overall_discount_value=overall_disc_val,
                gst_enabled=False,
                gst_rate=Decimal("18.00"),
            )

            adm_no = await next_number(db, "ADM")
            collector = csh_user if idx % 4 != 0 else adm_user

            admission = Admission(
                admission_number=adm_no,
                student_id=student.id,
                student_name_snapshot=student.name,
                admission_date=adm_date,
                subtotal=calc["subtotal"],
                individual_discount_total=calc["individual_discount_total"],
                overall_discount_type=overall_disc_type,
                overall_discount_value=overall_disc_val,
                overall_discount_amount=calc["overall_discount_amount"],
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
                valid_from=valid_from,
                valid_to=valid_to,
                notes=f"{months}-month enrollment in {', '.join(s.name.split(' (')[0] for s in chosen_subs)}",
                created_by=collector.id,
            )
            db.add(admission)
            await db.flush()

            adm_items = []
            for c_itm in calc["items"]:
                sub = c_itm["subject"]
                t_obj = teacher_by_id[sub.teacher_id]
                ai = AdmissionItem(
                    admission_id=admission.id,
                    student_id=student.id,
                    item_type="SUBJECT",
                    subject_id=sub.id,
                    teacher_id=t_obj.id,
                    teacher_name_snapshot=t_obj.name,
                    hall_number_snapshot=sub.hall_number,
                    item_name_snapshot=sub.name if months == 1 else f"{sub.name} ({months} Months)",
                    original_price=c_itm["original_price"],
                    discount_type="NONE",
                    discount_value=Decimal("0.00"),
                    discount_amount=c_itm["individual_discount"],
                    overall_discount_share=c_itm["overall_discount_share"],
                    net_price=c_itm["net_price"],
                    amount_collected=Decimal("0.00"),
                    balance_due=c_itm["net_price"],
                    valid_from=valid_from,
                    valid_to=valid_to,
                    status="ACTIVE",
                    share_type=t_obj.share_type,
                    share_value=t_obj.share_value,
                    share_percent=t_obj.share_value if t_obj.share_type == "PERCENT" else None,
                )
                db.add(ai)
                adm_items.append(ai)
            await db.flush()

            state = payment_states[idx - 1]
            if state in ("PAID", "PARTIAL"):
                if state == "PAID":
                    pay_amt = calc["total_payable"]
                else:
                    # Pay 40% - 65% rounded to nearest 100
                    pct = Decimal(str(rng.choice([0.40, 0.50, 0.60])))
                    raw_part = (calc["total_payable"] * pct / Decimal("100")).quantize(Decimal("1")) * Decimal("100")
                    pay_amt = max(Decimal("300.00"), min(raw_part, calc["total_payable"] - Decimal("200.00")))

                p_mode = payment_modes[(idx - 1) % len(payment_modes)]
                tx_ref = f"{p_mode[:3]}/202611/{idx:04d}" if p_mode != "CASH" else None
                await record_payment_service(
                    db=db,
                    admission=admission,
                    amount=pay_amt,
                    payment_mode=p_mode,
                    collected_by_user=collector,
                    transaction_reference=tx_ref,
                    notes="Full fee received" if state == "PAID" else "Partial installment paid at admission",
                    valid_from=valid_from,
                    valid_to=valid_to,
                    fee_period=f"{valid_from} to {valid_to}",
                    allocation_mode="PROPORTIONAL",
                )

            db.add(
                AuditLog(
                    user_id=collector.id,
                    action="ADMISSION_CREATED",
                    entity_type="ADMISSION",
                    entity_id=admission.id,
                    details=json.dumps({
                        "admission_number": admission.admission_number,
                        "student_id": str(student.id),
                        "student_name": student.name,
                        "total_payable": float(admission.total_payable),
                        "amount_paid": float(admission.amount_paid),
                        "balance_due": float(admission.balance_due),
                        "payment_status": admission.payment_status,
                    }),
                )
            )

        await db.flush()
        reminders_cnt = await build_due_reminders(db)
        await db.commit()
        print(f"[Seed] Created 100 students, 100 admissions, and queued {reminders_cnt} due reminders.")

    # 8. Flush Redis cache so live backend serves fresh data
    try:
        await delete_cache_pattern("erp:*")
        print("[Cache] Cleared Redis erp:* cache.")
    except Exception as e:
        print(f"[Cache] Warning: could not clear Redis cache: {e}")

    # 9. Verification Summary
    async with AsyncSessionLocal() as db:
        sub_cnt = (await db.execute(select(func.count(Subject.id)))).scalar_one()
        tch_cnt = (await db.execute(select(func.count(Teacher.id)))).scalar_one()
        stu_cnt = (await db.execute(select(func.count(Student.id)))).scalar_one()
        adm_cnt = (await db.execute(select(func.count(Admission.id)))).scalar_one()
        pay_cnt = (await db.execute(select(func.count(Payment.id)))).scalar_one()
        gc_cnt = (await db.execute(select(func.count(GreenCardProduct.id)))).scalar_one()

        sums = (
            await db.execute(
                select(
                    func.coalesce(func.sum(Admission.total_payable), 0),
                    func.coalesce(func.sum(Admission.amount_paid), 0),
                    func.coalesce(func.sum(Admission.balance_due), 0),
                )
            )
        ).one()

        status_breakdown = (
            await db.execute(
                select(Admission.payment_status, func.count(Admission.id)).group_by(Admission.payment_status)
            )
        ).all()

        kk = (await db.execute(select(Teacher).where(Teacher.teacher_code == "TCH001"))).scalar_one()
        all_codes = list((await db.execute(select(Student.student_code))).scalars().all())
        assert len(all_codes) == 100 and len(set(all_codes)) == 100, "Student codes must be 100 unique values!"
        assert all(len(c) == 13 and c.startswith("STU2026") and c[7:].isdigit() for c in all_codes), "Invalid student code format!"

        print("\n" + "=" * 60)
        print("RESEED VERIFICATION SUMMARY")
        print("=" * 60)
        print(f"  Subjects            : {sub_cnt}")
        print(f"  Teachers            : {tch_cnt} (K.K. Chauhan user_id={kk.user_id}, mobile={kk.mobile})")
        print(f"  Green Card Products : {gc_cnt}")
        print(f"  Students            : {stu_cnt} (sample codes: {all_codes[:5]})")
        print(f"  Admissions          : {adm_cnt}")
        print(f"  Payments            : {pay_cnt}")
        print(f"  Payment Status Mix  : {dict(status_breakdown)}")
        print(f"  Total Fees Booked   : ₹{sums[0]:,.2f}")
        print(f"  Total Fees Collected: ₹{sums[1]:,.2f}")
        print(f"  Total Fees Due      : ₹{sums[2]:,.2f}")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run_wipe_and_reseed())
