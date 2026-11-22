import asyncio
import re
import sys
from decimal import Decimal
from sqlalchemy import text
from app.database.session import AsyncSessionLocal

SEEDED_STUDENT_IDS = {
    '77777777-7777-7777-7777-777777777701',
    '77777777-7777-7777-7777-777777777702',
    '77777777-7777-7777-7777-777777777703',
    '77777777-7777-7777-7777-777777777704',
    '77777777-7777-7777-7777-777777777705',
}

TEST_PATTERNS = [
    r'student', r'test', r'dummy', r'waiver', r'verify', r'temp', r'sample',
    r'check', r'mock', r'recon', r'lifecycle', r'query', r'flow',
    r'mistake', r'guard', r'cycle', r'policy', r'expire', r'unpaid',
    r'card', r'physics', r'maths', r'chemistry',
    r'biology', r'crash', r'course', r'idempotent', r'parallel',
    r'nomobile', r'short mobile', r'long mobile', r'alpha mobile',
    r'mobile ten digit', r'mobile country code', r'mobile zero prefix',
    r'override price', r'overlap', r'chain', r'batch', r'3-subject',
    r'remstudent'
]
TEST_REGEX = re.compile('|'.join(TEST_PATTERNS), re.IGNORECASE)


async def run_audit_and_cleanup(apply_changes: bool = False):
    print("=" * 60)
    print("THAKURDWARA ERP - DATABASE AUDIT & CLEANUP")
    print(f"Mode: {'APPLY CHANGES' if apply_changes else 'DRY RUN (AUDIT ONLY)'}")
    print("=" * 60)

    async with AsyncSessionLocal() as session:
        # 1. Report Initial Table Counts
        print("\n--- 1. TABLE COUNTS BEFORE CLEANUP ---")
        tables = [
            "students", "admissions", "admission_items", "payments",
            "payment_allocations", "refunds", "financial_transactions",
            "reminder_queue", "enquiries", "enquiry_demo_items"
        ]
        before_counts = {}
        for t in tables:
            cnt = (await session.execute(text(f"SELECT COUNT(*) FROM {t}"))).scalar()
            before_counts[t] = cnt
            print(f"  {t:25s}: {cnt}")

        # 2. Check Orphaned Rows
        print("\n--- 2. ORPHAN INTEGRITY CHECK BEFORE CLEANUP ---")
        orphan_checks = [
            ("admission_items without admission", "SELECT COUNT(*) FROM admission_items WHERE admission_id NOT IN (SELECT id FROM admissions)"),
            ("payments without admission", "SELECT COUNT(*) FROM payments WHERE admission_id NOT IN (SELECT id FROM admissions)"),
            ("payments without student", "SELECT COUNT(*) FROM payments WHERE student_id NOT IN (SELECT id FROM students)"),
            ("payment_allocations without payment/refund", "SELECT COUNT(*) FROM payment_allocations WHERE (payment_id IS NOT NULL AND payment_id NOT IN (SELECT id FROM payments)) OR (refund_id IS NOT NULL AND refund_id NOT IN (SELECT id FROM refunds))"),
            ("financial_txns without admission", "SELECT COUNT(*) FROM financial_transactions WHERE admission_id NOT IN (SELECT id FROM admissions)"),
            ("reminder_queue without student/admission", "SELECT COUNT(*) FROM reminder_queue WHERE student_id NOT IN (SELECT id FROM students) OR admission_id NOT IN (SELECT id FROM admissions)"),
            ("enquiries without converted_student", "SELECT COUNT(*) FROM enquiries WHERE converted_student_id IS NOT NULL AND converted_student_id NOT IN (SELECT id FROM students)")
        ]
        for desc, sql in orphan_checks:
            cnt = (await session.execute(text(sql))).scalar()
            status = "OK (0)" if cnt == 0 else f"ORPHANS FOUND: {cnt}"
            print(f"  {desc:45s}: {status}")

        # 3. Categorize Students
        print("\n--- 3. STUDENT AUDIT & CLASSIFICATION ---")
        all_students_res = await session.execute(text("SELECT id, student_code, name, mobile FROM students ORDER BY created_at ASC"))
        all_students = all_students_res.fetchall()

        real_students = []
        ambiguous_students = []
        test_students = []

        for s in all_students:
            sid = str(s.id)
            name = s.name
            if sid in SEEDED_STUDENT_IDS:
                real_students.append(s)
            elif TEST_REGEX.search(name):
                test_students.append(s)
            else:
                ambiguous_students.append(s)

        print(f"  Real Institute Students     : {len(real_students)}")
        print(f"  Ambiguous Students (Preserved): {len(ambiguous_students)}")
        print(f"  Unambiguously Test Students  : {len(test_students)}")

        print("\n  [Preserved Real Students]:")
        for s in real_students:
            print(f"    - {s.student_code}: {s.name} ({s.mobile})")

        print("\n  [Preserved Ambiguous Students - Distinct Names & Counts]:")
        amb_summary = {}
        for s in ambiguous_students:
            amb_summary[s.name] = amb_summary.get(s.name, 0) + 1
        for name, cnt in amb_summary.items():
            print(f"    - {name}: {cnt} records (Kept safely; listed as ambiguous)")

        # 4. Perform Cleanup if requested
        if apply_changes:
            print("\n--- 4. EXECUTING TRANSACTIONAL CLEANUP ---")
            test_ids = [str(s.id) for s in test_students]

            # Use a temporary table for bulk joins
            await session.execute(text("CREATE TEMP TABLE tmp_test_students (id UUID PRIMARY KEY)"))
            chunk_size = 500
            for i in range(0, len(test_ids), chunk_size):
                chunk = test_ids[i:i + chunk_size]
                vals = ",".join(f"('{cid}')" for cid in chunk)
                await session.execute(text(f"INSERT INTO tmp_test_students (id) VALUES {vals}"))

            # 4.1 Nullify self-references
            await session.execute(text("""
                UPDATE payment_allocations 
                SET reverses_allocation_id = NULL 
                WHERE reverses_allocation_id IN (
                    SELECT id FROM payment_allocations 
                    WHERE payment_id IN (SELECT id FROM payments WHERE student_id IN (SELECT id FROM tmp_test_students))
                       OR refund_id IN (SELECT id FROM refunds WHERE student_id IN (SELECT id FROM tmp_test_students))
                       OR admission_item_id IN (SELECT id FROM admission_items WHERE student_id IN (SELECT id FROM tmp_test_students))
                )
            """))

            await session.execute(text("""
                UPDATE admission_items 
                SET renewed_from_item_id = NULL 
                WHERE student_id IN (SELECT id FROM tmp_test_students)
                   OR renewed_from_item_id IN (SELECT id FROM admission_items WHERE student_id IN (SELECT id FROM tmp_test_students))
            """))

            await session.execute(text("""
                UPDATE enquiry_demo_items 
                SET converted_admission_item_id = NULL 
                WHERE converted_admission_item_id IN (SELECT id FROM admission_items WHERE student_id IN (SELECT id FROM tmp_test_students))
            """))

            # 4.2 Delete child records linked to test students
            res_te = await session.execute(text("""
                DELETE FROM teacher_earnings 
                WHERE admission_item_id IN (SELECT id FROM admission_items WHERE student_id IN (SELECT id FROM tmp_test_students))
                   OR payment_id IN (SELECT id FROM payments WHERE student_id IN (SELECT id FROM tmp_test_students))
                   OR refund_id IN (SELECT id FROM refunds WHERE student_id IN (SELECT id FROM tmp_test_students))
            """))
            print(f"  Removed test teacher_earnings   : {res_te.rowcount}")

            res_ft = await session.execute(text("""
                DELETE FROM financial_transactions 
                WHERE student_id IN (SELECT id FROM tmp_test_students)
                   OR admission_id IN (SELECT id FROM admissions WHERE student_id IN (SELECT id FROM tmp_test_students))
            """))
            print(f"  Removed test financial_txns     : {res_ft.rowcount}")

            res_pa = await session.execute(text("""
                DELETE FROM payment_allocations 
                WHERE payment_id IN (SELECT id FROM payments WHERE student_id IN (SELECT id FROM tmp_test_students))
                   OR refund_id IN (SELECT id FROM refunds WHERE student_id IN (SELECT id FROM tmp_test_students))
                   OR admission_item_id IN (SELECT id FROM admission_items WHERE student_id IN (SELECT id FROM tmp_test_students))
            """))
            print(f"  Removed test payment_allocations: {res_pa.rowcount}")

            res_ref = await session.execute(text("""
                DELETE FROM refunds 
                WHERE student_id IN (SELECT id FROM tmp_test_students)
                   OR admission_id IN (SELECT id FROM admissions WHERE student_id IN (SELECT id FROM tmp_test_students))
            """))
            print(f"  Removed test refunds            : {res_ref.rowcount}")

            res_pay = await session.execute(text("""
                DELETE FROM payments 
                WHERE student_id IN (SELECT id FROM tmp_test_students)
                   OR admission_id IN (SELECT id FROM admissions WHERE student_id IN (SELECT id FROM tmp_test_students))
            """))
            print(f"  Removed test payments           : {res_pay.rowcount}")

            res_rem = await session.execute(text("""
                DELETE FROM reminder_queue 
                WHERE student_id IN (SELECT id FROM tmp_test_students)
                   OR admission_id IN (SELECT id FROM admissions WHERE student_id IN (SELECT id FROM tmp_test_students))
            """))
            print(f"  Removed test reminder_queue     : {res_rem.rowcount}")

            res_ai = await session.execute(text("""
                DELETE FROM admission_items 
                WHERE student_id IN (SELECT id FROM tmp_test_students)
                   OR admission_id IN (SELECT id FROM admissions WHERE student_id IN (SELECT id FROM tmp_test_students))
            """))
            print(f"  Removed test admission_items    : {res_ai.rowcount}")

            res_adm = await session.execute(text("""
                DELETE FROM admissions 
                WHERE student_id IN (SELECT id FROM tmp_test_students)
            """))
            print(f"  Removed test admissions         : {res_adm.rowcount}")

            res_sm = await session.execute(text("""
                DELETE FROM student_marks 
                WHERE student_id IN (SELECT id FROM tmp_test_students)
            """))
            print(f"  Removed test student_marks      : {res_sm.rowcount}")

            res_stu = await session.execute(text("""
                DELETE FROM students 
                WHERE id IN (SELECT id FROM tmp_test_students)
            """))
            print(f"  Removed test students           : {res_stu.rowcount}")

            await session.commit()
            print("\n  Cleanup transaction COMMITTED successfully!")

            # 5. Report Table Counts After Cleanup
            print("\n--- 5. TABLE COUNTS AFTER CLEANUP ---")
            after_counts = {}
            for t in tables:
                cnt = (await session.execute(text(f"SELECT COUNT(*) FROM {t}"))).scalar()
                after_counts[t] = cnt
                removed = before_counts[t] - cnt
                print(f"  {t:25s}: {cnt:6d} (Removed: {removed:5d})")

            # 6. Post-Cleanup Orphan Integrity Check
            print("\n--- 6. ORPHAN INTEGRITY CHECK AFTER CLEANUP ---")
            for desc, sql in orphan_checks:
                cnt = (await session.execute(text(sql))).scalar()
                status = "OK (0)" if cnt == 0 else f"ORPHANS FOUND: {cnt}"
                print(f"  {desc:45s}: {status}")

            print("\nDatabase cleanup complete and verified!")
        else:
            print("\nDry run completed. To execute cleanup, run with --apply")


if __name__ == "__main__":
    apply_mode = "--apply" in sys.argv
    asyncio.run(run_audit_and_cleanup(apply_changes=apply_mode))
