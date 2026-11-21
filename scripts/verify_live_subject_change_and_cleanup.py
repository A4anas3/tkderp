import asyncio
import uuid
import httpx
from decimal import Decimal
from datetime import date, timedelta
from sqlalchemy import select, delete, or_

from app.database.session import AsyncSessionLocal
from app.database.models import Student, Admission, AdmissionItem, Payment, PaymentAllocation, FinancialTransaction, AuditLog, Subject


async def run_live_test_and_clean():
    print("=== STARTING LIVE SUBJECT PURCHASE, CHANGE, AND CLEANUP VERIFICATION ===")
    base_url = "http://localhost:8080"

    # First clean up any existing test students if leftover
    async with AsyncSessionLocal() as db:
        old_test_stu = await db.execute(select(Student).where(Student.name == "LIVE_VERIFY_TEMP_STUDENT"))
        for s in old_test_stu.scalars().all():
            sid = s.id
            pays = (await db.execute(select(Payment.id).where(Payment.student_id == sid))).scalars().all()
            adms = (await db.execute(select(Admission.id).where(Admission.student_id == sid))).scalars().all()
            items = (await db.execute(select(AdmissionItem.id).where(AdmissionItem.student_id == sid))).scalars().all()

            await db.execute(delete(AuditLog).where(or_(AuditLog.entity_id == sid, AuditLog.entity_id.in_(adms), AuditLog.entity_id.in_(pays), AuditLog.entity_id.in_(items), AuditLog.details.ilike(f'%"{sid}"%'))))
            if pays:
                await db.execute(delete(FinancialTransaction).where(FinancialTransaction.payment_id.in_(pays)))
                await db.execute(delete(PaymentAllocation).where(PaymentAllocation.payment_id.in_(pays)))
                await db.execute(delete(Payment).where(Payment.id.in_(pays)))
            if items:
                await db.execute(delete(AdmissionItem).where(AdmissionItem.id.in_(items)))
            if adms:
                await db.execute(delete(Admission).where(Admission.id.in_(adms)))
            await db.execute(delete(Student).where(Student.id == sid))
            await db.commit()

    async with httpx.AsyncClient(base_url=base_url, timeout=30.0) as client:
        # 1. Login
        login_res = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        if login_res.status_code != 200:
            raise RuntimeError(f"Login failed: {login_res.status_code} {login_res.text}")
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("PASS: Admin authentication successful")

        # 2. Get subjects
        subj_res = await client.get("/api/subjects", headers=headers)
        assert subj_res.status_code == 200, f"Subjects failed: {subj_res.text}"
        subjects = subj_res.json().get("items", [])
        if len(subjects) < 2:
            raise RuntimeError("Need at least 2 subjects to test subject change")
        sub_a = subjects[0]
        sub_b = subjects[1]
        print(f"PASS: Found subjects: '{sub_a['name']}' (₹{sub_a['default_fee']}) and '{sub_b['name']}' (₹{sub_b['default_fee']})")

        # 3. Create test student
        test_mobile = f"99{uuid.uuid4().int % 100000000:08d}"
        stu_res = await client.post("/api/students", json={
            "name": "LIVE_VERIFY_TEMP_STUDENT",
            "mobile": test_mobile,
            "father_name": "Test Father",
            "address": "Test Live Verification Address"
        }, headers=headers)
        assert stu_res.status_code == 201, f"Create student failed: {stu_res.text}"
        student = stu_res.json()
        student_id = student["id"]
        print(f"PASS: Created temporary test student {student['name']} ({student['student_code']}, ID: {student_id})")

        try:
            # 4. On-the-spot subject purchase (Subject A)
            today = date.today()
            end_date = today + timedelta(days=30)
            fee_a = float(sub_a["default_fee"])

            adm1_res = await client.post("/api/admissions", json={
                "student_id": student_id,
                "admission_date": today.isoformat(),
                "valid_from": today.isoformat(),
                "valid_to": end_date.isoformat(),
                "items": [{
                    "item_type": "BATCH_SUBJECT",
                    "subject_id": sub_a["id"],
                    "item_name_snapshot": sub_a["name"],
                    "original_price": fee_a,
                    "valid_from": today.isoformat(),
                    "valid_to": end_date.isoformat()
                }],
                "initial_payment": {
                    "amount": fee_a,
                    "payment_mode": "CASH",
                    "notes": "Live test initial purchase payment"
                }
            }, headers=headers)
            assert adm1_res.status_code == 201, f"Admission creation failed: {adm1_res.text}"
            adm1 = adm1_res.json()
            item_a = adm1["items"][0]
            print(f"PASS: On-the-spot purchase completed: {adm1['admission_number']} for subject '{sub_a['name']}' (Status: {item_a['status']})")

            # 5. On-the-spot subject change (Subject A -> Subject B)
            fee_b = float(sub_b["default_fee"])
            change_payload = {
                "student_id": student_id,
                "old_item_id": item_a["id"],
                "old_subject_id": sub_a["id"],
                "new_subject_id": sub_b["id"],
                "valid_from": today.isoformat(),
                "months": 1,
                "fee": fee_b,
                "notes": f"Switched from {sub_a['name']} to {sub_b['name']} via on-the-spot change",
                "initial_payment": {
                    "amount": fee_b,
                    "payment_mode": "CASH",
                    "notes": f"Immediate fee collected for subject change to {sub_b['name']}"
                }
            }
            change_res = await client.post("/api/admissions/change-subject", json=change_payload, headers=headers)
            assert change_res.status_code == 201, f"Subject change failed: {change_res.text}"
            adm2 = change_res.json()
            item_b = adm2["items"][0]
            print(f"PASS: On-the-spot subject change completed: New admission {adm2['admission_number']} for '{sub_b['name']}'")

            # 6. Verify previous item A was discontinued
            async with AsyncSessionLocal() as db:
                res_old = await db.execute(select(AdmissionItem).where(AdmissionItem.id == uuid.UUID(item_a["id"])))
                old_itm_db = res_old.scalar_one()
                assert old_itm_db.status == "DISCONTINUED", f"Old item status should be DISCONTINUED, got {old_itm_db.status}"
                assert old_itm_db.access_status == "REVOKED", f"Old item access should be REVOKED, got {old_itm_db.access_status}"
                print(f"PASS: Old subject item status correctly updated to DISCONTINUED/REVOKED: '{old_itm_db.lifecycle_reason}'")

            # 7. Verify Audit Trail for student
            audit_res = await client.get(f"/api/audit/student/{student_id}", headers=headers)
            assert audit_res.status_code == 200, f"Student audit failed: {audit_res.text}"
            audit_data = audit_res.json()
            audit_actions = [e["action"] for e in audit_data.get("items", [])]
            print(f"PASS: Student audit trail contains {len(audit_actions)} events: {audit_actions}")
            assert "SUBJECT_CHANGED" in audit_actions, f"Expected SUBJECT_CHANGED in audit actions, got: {audit_actions}"
            assert "ADMISSION_CREATED" in audit_actions
            assert "PAYMENT_RECORDED" in audit_actions

        finally:
            # 8. Reversal and cleanup of all test records
            print("\nCleaning up and removing all live test records from database...")
            async with AsyncSessionLocal() as db:
                stu_uuid = uuid.UUID(student_id)
                pay_res = await db.execute(select(Payment.id).where(Payment.student_id == stu_uuid))
                pay_ids = [p[0] for p in pay_res.all()]

                adm_res = await db.execute(select(Admission.id).where(Admission.student_id == stu_uuid))
                adm_ids = [a[0] for a in adm_res.all()]

                item_res = await db.execute(select(AdmissionItem.id).where(AdmissionItem.student_id == stu_uuid))
                item_ids = [i[0] for i in item_res.all()]

                # Delete audit logs related to test student / admissions / payments
                await db.execute(
                    delete(AuditLog).where(
                        or_(
                            AuditLog.entity_id == stu_uuid,
                            AuditLog.entity_id.in_(adm_ids),
                            AuditLog.entity_id.in_(pay_ids),
                            AuditLog.entity_id.in_(item_ids),
                            AuditLog.details.ilike(f'%"{student_id}"%')
                        )
                    )
                )

                # Delete financial transactions and payment allocations
                if pay_ids:
                    await db.execute(delete(FinancialTransaction).where(FinancialTransaction.payment_id.in_(pay_ids)))
                    await db.execute(delete(PaymentAllocation).where(PaymentAllocation.payment_id.in_(pay_ids)))
                    await db.execute(delete(Payment).where(Payment.id.in_(pay_ids)))

                # Delete admission items
                if item_ids:
                    await db.execute(delete(AdmissionItem).where(AdmissionItem.id.in_(item_ids)))

                # Delete admissions
                if adm_ids:
                    await db.execute(delete(Admission).where(Admission.id.in_(adm_ids)))

                # Delete student
                await db.execute(delete(Student).where(Student.id == stu_uuid))
                await db.commit()
                print(f"PASS: Database cleanly reversed and purged of test student {student_id} and all related records.")

    print("\n=== ALL LIVE SUBJECT PURCHASE & CHANGE TESTS PASSED WITH ZERO RESIDUAL TEST DATA ===")

if __name__ == "__main__":
    asyncio.run(run_live_test_and_clean())
