#!/usr/bin/env python3
"""
Thakurdwara ERP - Production Database Wipe & Demo Data Seeder
==============================================================
Seeds realistic demo data through the backend API:
  - 5 Teachers (realistic Indian names, qualifications, subjects, commission shares)
  - 6 Subjects (5 ACTIVE, 1 INACTIVE; realistic fees, teachers, halls, schedules)
  - EXACTLY 10 Students (realistic Indian names, Kanpur/Thakurdwara addresses, 10-digit mobiles)
  - 10 Admissions (1-2 subjects each, valid date cycles)
  - Realistic Ledger Payments:
      * 6 Fully Paid (Cash / UPI / Bank Transfer)
      * 3 Partially Paid with real ₹1,000 dues (triggers Dues & Reminders queue)
      * 1 with a ₹300 Merit Waiver via API (triggers Waiver FinancialTransaction & AuditLog)
  - Automatic Dues & Reminders generation
  - Built-in backup & re-wipe safety if run after a partial failure.
"""

import sys
import os
import json
import time
import subprocess
from datetime import date, datetime, timedelta
from decimal import Decimal
import requests

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080")
API_URL = f"{BASE_URL}/api"
ADMIN_USER = os.environ.get("ADMIN_USER", "ADM001")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "Admin@1234")
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_USER = os.environ.get("DB_USER", "brightloop_user")
DB_PASS = os.environ.get("DB_PASS", "brightloop_password")
DB_NAME = os.environ.get("DB_NAME", "thakurdwara_erp")

BACKUP_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backups")

BUSINESS_TABLES = [
    "student_marks",
    "assessments",
    "enquiry_demo_items",
    "enquiries",
    "teacher_earnings",
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
    "idempotency_records",
    "number_sequences"
]


def take_backup(timestamp: str = None) -> tuple[str, str]:
    """Take a full pg_dump backup in both .sql and .dump formats."""
    if not timestamp:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    sql_path = os.path.join(BACKUP_DIR, f"thakurdwara_erp_backup_{timestamp}.sql")
    dump_path = os.path.join(BACKUP_DIR, f"thakurdwara_erp_backup_{timestamp}.dump")

    print(f"[Backup] Generating full database backup timestamped {timestamp}...")

    # Plain text SQL dump
    cmd_sql = (
        f"docker exec -e PGPASSWORD={DB_PASS} brightloop-postgres "
        f"pg_dump -U {DB_USER} -d {DB_NAME} -F p > '{sql_path}'"
    )
    subprocess.run(cmd_sql, shell=True, check=True)

    # Custom archive dump
    cmd_dump = (
        f"docker exec -e PGPASSWORD={DB_PASS} brightloop-postgres "
        f"pg_dump -U {DB_USER} -d {DB_NAME} -F c > '{dump_path}'"
    )
    subprocess.run(cmd_dump, shell=True, check=True)

    if not os.path.exists(sql_path) or os.path.getsize(sql_path) == 0:
        raise RuntimeError(f"Backup file {sql_path} missing or empty!")
    if not os.path.exists(dump_path) or os.path.getsize(dump_path) == 0:
        raise RuntimeError(f"Backup file {dump_path} missing or empty!")

    print(f"  ✓ SQL backup:  {sql_path} ({os.path.getsize(sql_path):,} bytes)")
    print(f"  ✓ Dump backup: {dump_path} ({os.path.getsize(dump_path):,} bytes)")
    return sql_path, dump_path


def get_table_counts(tables: list[str]) -> dict[str, int]:
    """Get exact row counts for each specified table."""
    select_parts = [f"SELECT '{t}' as tbl, count(*) as cnt FROM {t}" for t in tables]
    sql = f"SELECT json_object_agg(tbl, cnt) FROM ({' UNION ALL '.join(select_parts)}) s;"
    cmd = f"PGPASSWORD={DB_PASS} psql -h {DB_HOST} -U {DB_USER} -d {DB_NAME} -t -c \"{sql}\""
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True, check=True)
    raw = res.stdout.strip()
    return json.loads(raw) if raw else {t: 0 for t in tables}


def wipe_business_tables() -> tuple[dict[str, int], dict[str, int]]:
    """
    Wipe all business tables while strictly keeping users and alembic_version.
    Resets primary-key sequences and reports counts before and after.
    """
    all_monitored_tables = BUSINESS_TABLES + ["users"]
    counts_before = get_table_counts(all_monitored_tables)

    print("\n[Wipe] Truncating all business tables and resetting sequences...")
    print("  -> Preserving 'users' (admin/cashier accounts) and 'alembic_version' intact.")

    truncate_sql = f"TRUNCATE TABLE {', '.join(BUSINESS_TABLES)} RESTART IDENTITY CASCADE;"
    cmd = f"PGPASSWORD={DB_PASS} psql -h {DB_HOST} -U {DB_USER} -d {DB_NAME} -c \"{truncate_sql}\""
    subprocess.run(cmd, shell=True, check=True)

    counts_after = get_table_counts(all_monitored_tables)

    # Report counts before and after (after: 0 in every wiped table)
    print("\n" + "=" * 65)
    print(f"{'BUSINESS TABLE':<28} | {'BEFORE':>10} | {'AFTER (WIPED)':>15} | {'STATUS':<8}")
    print("-" * 65)
    for tbl in sorted(BUSINESS_TABLES):
        b_cnt = counts_before.get(tbl, 0)
        a_cnt = counts_after.get(tbl, 0)
        status = "0 (OK)" if a_cnt == 0 else "FAIL"
        print(f"{tbl:<28} | {b_cnt:>10} | {a_cnt:>15} | {status:<8}")
        if a_cnt != 0:
            raise RuntimeError(f"Table '{tbl}' was not wiped completely! {a_cnt} rows remaining.")

    # Users preserved check
    u_before = counts_before.get("users", 0)
    u_after = counts_after.get("users", 0)
    print("-" * 65)
    print(f"{'users (PRESERVED)':<28} | {u_before:>10} | {u_after:>15} | PRESERVED")
    print("=" * 65)
    if u_after == 0 or u_after != u_before:
        raise RuntimeError(f"Users table was affected during wipe! Before: {u_before}, After: {u_after}")

    print(f"  ✓ Verified: 0 rows in every wiped table (all {len(BUSINESS_TABLES)} business tables).")
    print(f"  ✓ Verified: {u_after} user accounts preserved intact in users table.\n")
    return counts_before, counts_after


def login(session: requests.Session) -> str:
    """Log in as admin and set Authorization Bearer header."""
    print(f"[Auth] Logging in as {ADMIN_USER} at {API_URL}/auth/login...")
    resp = session.post(
        f"{API_URL}/auth/login",
        json={"username": ADMIN_USER, "password": ADMIN_PASS},
        timeout=10
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Login failed ({resp.status_code}): {resp.text}")
    data = resp.json()
    token = data["access_token"]
    session.headers.update({"Authorization": f"Bearer {token}"})
    print(f"  ✓ Authenticated as {data['user']['full_name']} ({data['user']['role']})")
    return token


def seed_teachers(session: requests.Session) -> list[dict]:
    """Create 5 realistic teachers with Indian names, qualifications, and commission rates."""
    print("\n[Seed] Creating 5 realistic teachers...")
    teachers_data = [
        {
            "name": "Prof. Rajesh Kumar Sharma",
            "mobile": "9839012345",
            "email": "rajesh.sharma@thakurdwara.local",
            "qualification": "M.Sc. Physics, Ph.D. (15+ Yrs Exp)",
            "specialization": "Physics (Class 11-12 & JEE/NEET)",
            "joining_date": "2024-07-01",
            "status": "ACTIVE",
            "share_type": "PERCENT",
            "share_value": 40.00
        },
        {
            "name": "Dr. Sunita Saxena",
            "mobile": "9839123456",
            "email": "sunita.saxena@thakurdwara.local",
            "qualification": "Ph.D. Chemistry, CSIR NET (12+ Yrs Exp)",
            "specialization": "Organic & Physical Chemistry",
            "joining_date": "2024-08-01",
            "status": "ACTIVE",
            "share_type": "PERCENT",
            "share_value": 35.00
        },
        {
            "name": "Er. Manoj Dixit",
            "mobile": "9839234567",
            "email": "manoj.dixit@thakurdwara.local",
            "qualification": "B.Tech IIT Kanpur, M.Tech (10+ Yrs Exp)",
            "specialization": "Advanced Mathematics & Calculus",
            "joining_date": "2024-07-15",
            "status": "ACTIVE",
            "share_type": "PERCENT",
            "share_value": 40.00
        },
        {
            "name": "Dr. Priya Pandey",
            "mobile": "9839345678",
            "email": "priya.pandey@thakurdwara.local",
            "qualification": "M.Sc. Zoology, B.Ed. (8+ Yrs Exp)",
            "specialization": "Botany & Zoology (NEET Specialist)",
            "joining_date": "2024-09-01",
            "status": "ACTIVE",
            "share_type": "PERCENT",
            "share_value": 35.00
        },
        {
            "name": "Vikram Singh Rathore",
            "mobile": "9839456789",
            "email": "vikram.rathore@thakurdwara.local",
            "qualification": "M.A. English Literature (6+ Yrs Exp)",
            "specialization": "English Communication & Grammar",
            "joining_date": "2024-10-01",
            "status": "ACTIVE",
            "share_type": "PERCENT",
            "share_value": 30.00
        }
    ]

    created = []
    for td in teachers_data:
        res = session.post(f"{API_URL}/teachers", json=td, timeout=10)
        if res.status_code not in (200, 201):
            raise RuntimeError(f"Failed to create teacher {td['name']}: {res.status_code} {res.text}")
        t = res.json()
        print(f"  ✓ Teacher {t['teacher_code']}: {t['name']} ({t['specialization']})")
        created.append(t)
    return created


def seed_subjects(session: requests.Session, teachers: list[dict]) -> list[dict]:
    """Create 6 realistic subjects (5 ACTIVE, 1 INACTIVE)."""
    print("\n[Seed] Creating 6 realistic subjects (5 ACTIVE, 1 INACTIVE)...")
    t_map = {t["specialization"].split()[0]: t for t in teachers}
    t_phys = next(t for t in teachers if "Physics" in t["specialization"])
    t_chem = next(t for t in teachers if "Chemistry" in t["specialization"])
    t_math = next(t for t in teachers if "Mathematics" in t["specialization"])
    t_bio = next(t for t in teachers if "Botany" in t["specialization"] or "Zoology" in t["specialization"])
    t_eng = next(t for t in teachers if "English" in t["specialization"])

    subjects_data = [
        {
            "name": "Mathematics (Class 11-12 & JEE)",
            "description": "Comprehensive algebra, calculus, and coordinate geometry for board & competitive exams",
            "default_fee": 1500.00,
            "teacher_id": t_math["id"],
            "teacher_name_snapshot": t_math["name"],
            "hall_number": "Hall A (Room 101)",
            "schedule": "Mon-Wed-Fri 04:00 PM - 05:30 PM",
            "class_category": "Class 11-12",
            "default_discount_percentage": 10.00,
            "status": "ACTIVE"
        },
        {
            "name": "Physics (Foundations & Competitive)",
            "description": "Mechanics, electrodynamics, optics, and modern physics with problem-solving sessions",
            "default_fee": 1600.00,
            "teacher_id": t_phys["id"],
            "teacher_name_snapshot": t_phys["name"],
            "hall_number": "Hall B (Room 102)",
            "schedule": "Mon-Wed-Fri 05:30 PM - 07:00 PM",
            "class_category": "Class 11-12",
            "default_discount_percentage": 10.00,
            "status": "ACTIVE"
        },
        {
            "name": "Chemistry (Organic & Physical)",
            "description": "Reaction mechanisms, stoichiometry, thermodynamics, and periodic trends",
            "default_fee": 1500.00,
            "teacher_id": t_chem["id"],
            "teacher_name_snapshot": t_chem["name"],
            "hall_number": "Hall C (Room 201)",
            "schedule": "Tue-Thu-Sat 04:00 PM - 05:30 PM",
            "class_category": "Class 11-12",
            "default_discount_percentage": 10.00,
            "status": "ACTIVE"
        },
        {
            "name": "Biology (NEET Medical Prep)",
            "description": "Human physiology, genetics, ecology, cell biology with diagrams and past NEET papers",
            "default_fee": 1400.00,
            "teacher_id": t_bio["id"],
            "teacher_name_snapshot": t_bio["name"],
            "hall_number": "Hall B (Room 102)",
            "schedule": "Tue-Thu-Sat 05:30 PM - 07:00 PM",
            "class_category": "Class 11-12",
            "default_discount_percentage": 10.00,
            "status": "ACTIVE"
        },
        {
            "name": "English Language & Grammar",
            "description": "English writing skills, core grammar, reading comprehension, and communicative fluency",
            "default_fee": 1000.00,
            "teacher_id": t_eng["id"],
            "teacher_name_snapshot": t_eng["name"],
            "hall_number": "Hall D (Room 202)",
            "schedule": "Sat-Sun 10:00 AM - 12:00 PM",
            "class_category": "Foundations",
            "default_discount_percentage": 5.00,
            "status": "ACTIVE"
        },
        {
            "name": "Computer Science & Python",
            "description": "Python basics, data structures, and algorithmic thinking (Inactive batch for curriculum demo)",
            "default_fee": 1200.00,
            "teacher_id": t_math["id"],
            "teacher_name_snapshot": t_math["name"],
            "hall_number": "Computer Lab 1",
            "schedule": "Weekend 02:00 PM - 04:00 PM",
            "class_category": "Skill Development",
            "default_discount_percentage": 10.00,
            "status": "INACTIVE"
        }
    ]

    created = []
    for sd in subjects_data:
        res = session.post(f"{API_URL}/subjects", json=sd, timeout=10)
        if res.status_code not in (200, 201):
            raise RuntimeError(f"Failed to create subject {sd['name']}: {res.status_code} {res.text}")
        s = res.json()
        print(f"  ✓ Subject {s['subject_code']}: {s['name']} (₹{s['default_fee']} / mo) [{s['status']}]")
        created.append(s)
    return created


def seed_students_and_admissions(session: requests.Session, subjects: list[dict]):
    """
    Create EXACTLY 10 realistic students, enroll them in 1-2 subjects with valid dates,
    and process payments (mix of fully paid, partially paid, and one waiver).
    """
    print("\n[Seed] Creating EXACTLY 10 students and processing ledger admissions...")

    # Index active subjects by short name
    s_math = next(s for s in subjects if "Mathematics" in s["name"])
    s_phys = next(s for s in subjects if "Physics" in s["name"])
    s_chem = next(s for s in subjects if "Chemistry" in s["name"])
    s_bio = next(s for s in subjects if "Biology" in s["name"])
    s_eng = next(s for s in subjects if "English" in s["name"])

    # Billing cycle dates: Current active month (Nov 2026)
    valid_from = date(2026, 11, 1).isoformat()
    valid_to = date(2026, 11, 30).isoformat()
    admission_date = date(2026, 11, 1).isoformat()

    # 10 Students Configuration
    student_specs = [
        # 1. Aarav Gupta: 1 subject (Maths: ₹1,500) -> Fully Paid via UPI
        {
            "profile": {
                "name": "Aarav Gupta",
                "father_name": "Ramesh Gupta",
                "mobile": "9838011221",
                "email": "aarav.gupta@gmail.com",
                "address": "128/42, Kidwai Nagar, Kanpur",
                "registration_date": admission_date,
                "status": "ACTIVE"
            },
            "subjects": [s_math],
            "discount_type": "NONE",
            "discount_val": 0.00,
            "payment": {
                "amount": 1500.00,
                "payment_mode": "UPI",
                "transaction_reference": "UPI/202611/AARAV01",
                "notes": "Full fee paid via Google Pay UPI"
            },
            "waive": None
        },
        # 2. Ananya Verma: 2 subjects (Physics: ₹1,600 + Chemistry: ₹1,500 = ₹3,100) -> Fully Paid via Bank Transfer
        {
            "profile": {
                "name": "Ananya Verma",
                "father_name": "Suresh Chandra Verma",
                "mobile": "9838022332",
                "email": "ananya.verma@outlook.com",
                "address": "45, Civil Lines, Kanpur",
                "registration_date": admission_date,
                "status": "ACTIVE"
            },
            "subjects": [s_phys, s_chem],
            "discount_type": "NONE",
            "discount_val": 0.00,
            "payment": {
                "amount": 3100.00,
                "payment_mode": "BANK_TRANSFER",
                "transaction_reference": "NEFT/SBI/20261101/002",
                "notes": "Full semester instalment via SBI Net Banking"
            },
            "waive": None
        },
        # 3. Rohan Srivastava: 2 subjects (Maths: ₹1,500 + Physics: ₹1,600 = ₹3,100)
        # Discount: ₹300 fixed -> Total: ₹2,800. Paid: ₹1,800 Cash. DUE: ₹1,000 (Partial #1)
        {
            "profile": {
                "name": "Rohan Srivastava",
                "father_name": "Alok Srivastava",
                "mobile": "9838033443",
                "email": "rohan.sri@gmail.com",
                "address": "12/A, Swaroop Nagar, Kanpur",
                "registration_date": admission_date,
                "status": "ACTIVE"
            },
            "subjects": [s_math, s_phys],
            "discount_type": "FIXED",
            "discount_val": 300.00,
            "payment": {
                "amount": 1800.00,
                "payment_mode": "CASH",
                "transaction_reference": None,
                "notes": "Initial deposit ₹1,800 paid at counter. Balance ₹1,000 due by 15th."
            },
            "waive": None
        },
        # 4. Ishita Mishra: 1 subject (Biology: ₹1,400) -> Fully Paid via Cash
        {
            "profile": {
                "name": "Ishita Mishra",
                "father_name": "Pradeep Mishra",
                "mobile": "9838044554",
                "email": "ishita.mishra@yahoo.com",
                "address": "78, Kakadeo Coaching Hub, Kanpur",
                "registration_date": admission_date,
                "status": "ACTIVE"
            },
            "subjects": [s_bio],
            "discount_type": "NONE",
            "discount_val": 0.00,
            "payment": {
                "amount": 1400.00,
                "payment_mode": "CASH",
                "transaction_reference": None,
                "notes": "Full monthly tuition paid in cash"
            },
            "waive": None
        },
        # 5. Aditya Tiwari: 2 subjects (Chemistry: ₹1,500 + Biology: ₹1,400 = ₹2,900)
        # Paid: ₹1,900 UPI. DUE: ₹1,000 (Partial #2)
        {
            "profile": {
                "name": "Aditya Tiwari",
                "father_name": "Satish Tiwari",
                "mobile": "9838055665",
                "email": "aditya.tiwari@gmail.com",
                "address": "23, Barra-2, Kanpur",
                "registration_date": admission_date,
                "status": "ACTIVE"
            },
            "subjects": [s_chem, s_bio],
            "discount_type": "NONE",
            "discount_val": 0.00,
            "payment": {
                "amount": 1900.00,
                "payment_mode": "UPI",
                "transaction_reference": "UPI/202611/ADITYA05",
                "notes": "Part payment of ₹1,900 via Paytm UPI. Balance ₹1,000 pending."
            },
            "waive": None
        },
        # 6. Kavya Tripathi: 1 subject (English: ₹1,000) -> Fully Paid via UPI
        {
            "profile": {
                "name": "Kavya Tripathi",
                "father_name": "Rakesh Tripathi",
                "mobile": "9838066776",
                "email": "kavya.tripathi@gmail.com",
                "address": "15/280, Govind Nagar, Kanpur",
                "registration_date": admission_date,
                "status": "ACTIVE"
            },
            "subjects": [s_eng],
            "discount_type": "NONE",
            "discount_val": 0.00,
            "payment": {
                "amount": 1000.00,
                "payment_mode": "UPI",
                "transaction_reference": "UPI/202611/KAVYA06",
                "notes": "Monthly communication batch fee paid online"
            },
            "waive": None
        },
        # 7. Utkarsh Shukla: 2 subjects (Maths: ₹1,500 + Physics: ₹1,600 = ₹3,100)
        # Paid: ₹2,100 Bank Transfer. DUE: ₹1,000 (Partial #3)
        {
            "profile": {
                "name": "Utkarsh Shukla",
                "father_name": "Dinesh Shukla",
                "mobile": "9838077887",
                "email": "utkarsh.shukla@rediffmail.com",
                "address": "67, Sharda Nagar, Kanpur",
                "registration_date": admission_date,
                "status": "ACTIVE"
            },
            "subjects": [s_math, s_phys],
            "discount_type": "NONE",
            "discount_val": 0.00,
            "payment": {
                "amount": 2100.00,
                "payment_mode": "BANK_TRANSFER",
                "transaction_reference": "IMPS/HDFC/20261101/007",
                "notes": "First installment paid via HDFC IMPS. ₹1,000 balance due."
            },
            "waive": None
        },
        # 8. Sneha Yadav: 1 subject (Biology: ₹1,400) -> Fully Paid via Cash
        {
            "profile": {
                "name": "Sneha Yadav",
                "father_name": "Virendra Yadav",
                "mobile": "9838088998",
                "email": "sneha.yadav@gmail.com",
                "address": "102, Kalyanpur, Kanpur",
                "registration_date": admission_date,
                "status": "ACTIVE"
            },
            "subjects": [s_bio],
            "discount_type": "NONE",
            "discount_val": 0.00,
            "payment": {
                "amount": 1400.00,
                "payment_mode": "CASH",
                "transaction_reference": None,
                "notes": "Cash collected at desk by cashier"
            },
            "waive": None
        },
        # 9. Devansh Agnihotri: 1 subject (Physics: ₹1,600)
        # Initial payment: ₹1,300 via UPI (leaving ₹300 due).
        # Waiver: ₹300 waived via API (Merit concession approved by Principal)
        {
            "profile": {
                "name": "Devansh Agnihotri",
                "father_name": "Mahesh Agnihotri",
                "mobile": "9838099009",
                "email": "devansh.agnihotri@gmail.com",
                "address": "54, Shastri Nagar, Kanpur",
                "registration_date": admission_date,
                "status": "ACTIVE"
            },
            "subjects": [s_phys],
            "discount_type": "NONE",
            "discount_val": 0.00,
            "payment": {
                "amount": 1300.00,
                "payment_mode": "UPI",
                "transaction_reference": "UPI/202611/DEVANSH09",
                "notes": "Initial deposit ₹1,300 paid online via PhonePe"
            },
            "waive": {
                "amount": 300.00,
                "reason": "Merit concession approved by Principal (Science Olympiad rank holder)"
            }
        },
        # 10. Pooja Singh: 1 subject (Chemistry: ₹1,500) -> Fully Paid via UPI
        {
            "profile": {
                "name": "Pooja Singh",
                "father_name": "Harish Chandra Singh",
                "mobile": "9838100110",
                "email": "pooja.singh@gmail.com",
                "address": "Thakurdwara Road, Main Market, Kanpur Dehat",
                "registration_date": admission_date,
                "status": "ACTIVE"
            },
            "subjects": [s_chem],
            "discount_type": "NONE",
            "discount_val": 0.00,
            "payment": {
                "amount": 1500.00,
                "payment_mode": "UPI",
                "transaction_reference": "UPI/202611/POOJA10",
                "notes": "Full fee paid via BHIM UPI"
            },
            "waive": None
        }
    ]

    total_billed = Decimal("0.00")
    total_paid = Decimal("0.00")
    total_due = Decimal("0.00")
    total_waived = Decimal("0.00")

    for i, spec in enumerate(student_specs, start=1):
        # 1. Create Student
        s_res = session.post(f"{API_URL}/students", json=spec["profile"], timeout=10)
        if s_res.status_code not in (200, 201):
            raise RuntimeError(f"Failed to create student {spec['profile']['name']}: {s_res.status_code} {s_res.text}")
        student = s_res.json()
        student_id = student["id"]
        student_code = student["student_code"]

        # 2. Build Admission Items
        adm_items = []
        for sub in spec["subjects"]:
            adm_items.append({
                "item_type": "SUBJECT",
                "subject_id": sub["id"],
                "item_name_snapshot": sub["name"],
                "teacher_id": sub["teacher_id"],
                "teacher_name_snapshot": sub["teacher_name_snapshot"],
                "hall_number_snapshot": sub["hall_number"],
                "original_price": float(sub["default_fee"]),
                "months": 1,
                "discount_type": "NONE",
                "discount_value": 0.00,
                "valid_from": valid_from,
                "valid_to": valid_to
            })

        # 3. Create Admission with Initial Payment
        adm_payload = {
            "student_id": student_id,
            "admission_date": admission_date,
            "items": adm_items,
            "overall_discount_type": spec["discount_type"],
            "overall_discount_value": spec["discount_val"],
            "valid_from": valid_from,
            "valid_to": valid_to,
            "initial_payment": {
                "amount": spec["payment"]["amount"],
                "payment_mode": spec["payment"]["payment_mode"],
                "transaction_reference": spec["payment"]["transaction_reference"],
                "notes": spec["payment"]["notes"],
                "allocation_mode": "PROPORTIONAL"
            },
            "notes": f"Enrolled in {len(spec['subjects'])} subject(s) for Nov 2026 session"
        }

        a_res = session.post(f"{API_URL}/admissions", json=adm_payload, timeout=10)
        if a_res.status_code not in (200, 201):
            raise RuntimeError(f"Failed to create admission for {student['name']}: {a_res.status_code} {a_res.text}")
        adm = a_res.json()
        adm_id = adm["id"]
        adm_no = adm["admission_number"]

        # 4. Handle Waiver if specified
        if spec.get("waive"):
            w_spec = spec["waive"]
            w_res = session.post(
                f"{API_URL}/admissions/{adm_id}/waive",
                json={"amount": w_spec["amount"], "reason": w_spec["reason"]},
                timeout=10
            )
            if w_res.status_code != 200:
                raise RuntimeError(f"Failed to waive fee for admission {adm_no}: {w_res.status_code} {w_res.text}")
            adm = w_res.json()
            total_waived += Decimal(str(w_spec["amount"]))
            print(f"  ✓ Waived ₹{w_spec['amount']} for {student['name']} ({adm_no}) — Reason: {w_spec['reason']}")

        # Track totals
        billed = Decimal(str(adm["total_payable"]))
        paid = Decimal(str(adm["amount_paid"]))
        due = Decimal(str(adm["balance_due"]))
        total_billed += billed
        total_paid += paid
        total_due += due

        print(
            f"  ✓ [{i:02d}/10] {student_code}: {student['name']:<22} | "
            f"Adm: {adm_no} | Billed: ₹{billed:>6} | Paid: ₹{paid:>6} ({spec['payment']['payment_mode']:<13}) | "
            f"Due: ₹{due:>5} [{adm['payment_status']}]"
        )

    # 5. Generate Dues Reminders
    print("\n[Seed] Generating Dues & Reminders queue...")
    rem_res = session.post(f"{API_URL}/reminders/generate", timeout=10)
    if rem_res.status_code != 200:
        raise RuntimeError(f"Failed to generate reminders: {rem_res.status_code} {rem_res.text}")
    rem_data = rem_res.json()
    print(f"  ✓ {rem_data['message']}")

    print("\n" + "=" * 60)
    print("DEMO DATA SEEDING COMPLETED SUCCESSFULLY")
    print(f"  Total Students Seeded: 10")
    print(f"  Total Revenue Booked:  ₹{total_billed:,.2f}")
    print(f"  Total Cash Collected:  ₹{total_paid:,.2f}")
    print(f"  Total Fee Waived:      ₹{total_waived:,.2f}")
    print(f"  Total Balance Due:     ₹{total_due:,.2f}")
    print("=" * 60)


def verify_seeded_system(session: requests.Session):
    """Live verification of the seeded database according to prompt requirements."""
    print("\n[Verify] Running live system verification checks...")

    # 1. Check exactly 10 students
    s_list_res = session.get(f"{API_URL}/students?page_size=50", timeout=10)
    assert s_list_res.status_code == 200, "Failed to fetch student list"
    s_list_data = s_list_res.json()
    student_count = s_list_data.get("total", len(s_list_data.get("items", [])))
    print(f"  1. Students List: Found {student_count} student(s) (Expected: 10)")
    assert student_count == 10, f"Expected exactly 10 students, found {student_count}"

    # 2. Check Admin Dashboard Metrics
    dash_res = session.get(f"{API_URL}/dashboard/admin", timeout=10)
    assert dash_res.status_code == 200, "Failed to fetch admin dashboard"
    metrics = dash_res.json()["metrics"]
    print(
        f"  2. Admin Dashboard: Students={metrics['total_students']}, "
        f"Teachers={metrics['total_teachers']}, ActiveSubjects={metrics['active_subjects']}, "
        f"Booked=₹{metrics['total_revenue_booked']}, Collected=₹{metrics['total_cash_collected']}"
    )
    assert metrics["total_students"] == 10, f"Dashboard students mismatch: {metrics['total_students']}"
    assert metrics["total_teachers"] == 5, f"Dashboard teachers mismatch: {metrics['total_teachers']}"
    assert metrics["active_subjects"] == 5, f"Dashboard active subjects mismatch: {metrics['active_subjects']}"
    assert metrics["total_revenue_booked"] == 20300.0, f"Revenue booked mismatch: {metrics['total_revenue_booked']}"
    assert metrics["total_cash_collected"] == 17000.0, f"Cash collected mismatch: {metrics['total_cash_collected']}"

    # 3. Check Subject Detail and Roster
    subs_res = session.get(f"{API_URL}/subjects/all", timeout=10)
    assert subs_res.status_code == 200, "Failed to fetch subjects"
    subjects = subs_res.json()
    math_sub = next(s for s in subjects if "Mathematics" in s["name"])
    rep_res = session.get(f"{API_URL}/reports/subject-revenue", timeout=10)
    assert rep_res.status_code == 200, "Failed to fetch subject revenue report"
    rep_json = rep_res.json()
    rep_items = rep_json.get("items", rep_json if isinstance(rep_json, list) else [])
    math_rep = next(r for r in rep_items if r["subject_id"] == math_sub["id"])
    print(
        f"  3. Subject Page ({math_sub['name']}): Enrolled={math_rep['enrolled_count']}, "
        f"Booked=₹{math_rep['total_booked']}, Collected=₹{math_rep['total_collected']}"
    )
    assert math_rep["enrolled_count"] >= 3, "Mathematics should have at least 3 enrolled students"

    # 4. Check Institutional Reports (Collections, Waivers, Subject Revenue)
    coll_res = session.get(f"{API_URL}/reports/collections", timeout=10)
    assert coll_res.status_code == 200, "Failed to fetch collections report"
    coll_data = coll_res.json()
    assert coll_data["summary"]["gross_collected"] == 17000.0, f"Collections gross mismatch: {coll_data['summary']['gross_collected']}"
    assert coll_data["summary"]["payment_count"] == 10, f"Collections payment count mismatch: {coll_data['summary']['payment_count']}"

    waiver_res = session.get(f"{API_URL}/reports/waivers", timeout=10)
    assert waiver_res.status_code == 200, "Failed to fetch waivers report"
    waiver_data = waiver_res.json()
    assert waiver_data["summary"]["total_waived_amount"] == 300.0, f"Waiver amount mismatch: {waiver_data['summary']['total_waived_amount']}"
    assert waiver_data["summary"]["waivers_count"] == 1, f"Waiver count mismatch: {waiver_data['summary']['waivers_count']}"
    print(
        f"  4. Institutional Reports: Gross Collections=₹{coll_data['summary']['gross_collected']}, "
        f"Payments=10, Fee Waivers=₹{waiver_data['summary']['total_waived_amount']} (1 record)"
    )

    # 5. Check Dues & Reminders Queue
    rem_res = session.get(f"{API_URL}/reminders/queue?status=pending", timeout=10)
    assert rem_res.status_code == 200, "Failed to fetch reminder queue"
    rem_data = rem_res.json()
    pending_count = rem_data.get("total", len(rem_data.get("items", [])))
    print(f"  5. Dues & Reminders Queue: Found {pending_count} pending reminder(s) (Expected: 3)")
    assert pending_count == 3, f"Expected exactly 3 pending reminders, found {pending_count}"
    for item in rem_data.get("items", []):
        mob = item.get("student_mobile") or item.get("mobile", "")
        print(f"     * {item['student_name']}: Due ₹{item['due_amount']} | Mobile: {mob}")

    # 6. Check Public ID Card by Admission Number (no authentication required)
    public_session = requests.Session()
    id_card_res = public_session.get(f"{BASE_URL}/api/public/id-card/ADM-2026-0001", timeout=10)
    assert id_card_res.status_code == 200, f"Public ID card check failed: {id_card_res.status_code} {id_card_res.text}"
    id_card = id_card_res.json()
    print(
        f"  6. Public ID Card for ADM-2026-0001: Student '{id_card['student']['name']}', "
        f"Enrolled Courses: {len(id_card['active_courses'])} active course(s)"
    )
    assert id_card["student"]["name"] == "Aarav Gupta", f"ID card student mismatch: {id_card['student']['name']}"
    assert len(id_card["active_courses"]) > 0, "Public ID card must list active course"

    print("\n✓ ALL 6 LIVE VERIFICATION CHECKS PASSED WITH FLYING COLORS!")


def main():
    print("=" * 60)
    print("THAKURDWARA ERP - DATABASE BACKUP, WIPE & SEED RUNNER")
    print("=" * 60)

    # Step 1: Backup
    print("\n--- STEP 1: BACKUP DATABASE ---")
    take_backup()

    # Step 2: Wipe
    print("\n--- STEP 2: WIPE BUSINESS TABLES ---")
    wipe_business_tables()

    # Step 3: Seed
    print("\n--- STEP 3: SEED DEMO DATA ---")
    session = requests.Session()
    login(session)
    teachers = seed_teachers(session)
    subjects = seed_subjects(session, teachers)
    seed_students_and_admissions(session, subjects)

    # Step 4: Verify
    print("\n--- STEP 4: VERIFY SEEDED SYSTEM ---")
    verify_seeded_system(session)

    print("\n" + "=" * 60)
    print("DEMO RUN COMPLETE: PRODUCTION DATABASE FORMATTED, SEEDED & VERIFIED!")
    print("=" * 60)


if __name__ == "__main__":
    main()
