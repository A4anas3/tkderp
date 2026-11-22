import uuid
from decimal import Decimal
from datetime import date, timedelta
import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database.session import AsyncSessionLocal
from app.database.models import Admission, AdmissionItem, ReminderQueue
from app.modules.reminders.service import build_whatsapp_link, build_due_reminders
from app.services.daily_jobs import refresh_statuses
from sqlalchemy import select


def test_build_whatsapp_link():
    # 1. 10 digit Indian number should prepend 91
    link1 = build_whatsapp_link("9876543210", "Hello Test Student")
    assert link1.startswith("https://wa.me/919876543210?text=")
    assert "Hello%20Test%20Student" in link1

    # 2. Number with country code 91 should remain 91
    link2 = build_whatsapp_link("+91 9876543210", "Due Reminder ₹1,500.00")
    assert link2.startswith("https://wa.me/919876543210?text=")
    assert "%E2%82%B91%2C500.00" in link2 or "%82%B9" in link2 or "1%2C500.00" in link2

    # 3. None or empty phone should return empty string
    assert build_whatsapp_link(None, "Hello") == ""
    assert build_whatsapp_link("", "Hello") == ""
    assert build_whatsapp_link("   ", "Hello") == ""


@pytest.mark.asyncio
async def test_reminders_queue_and_whatsapp_features():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Login as Admin
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        # 2. Login as Cashier
        csh_login = await client.post("/api/auth/login", json={"username": "CSH001", "password": "Cashier@1234"})
        assert csh_login.status_code == 200
        cashier_headers = {"Authorization": f"Bearer {csh_login.json()['access_token']}"}

        # 3. Create Subject & Batch
        subj_name = f"Mathematics Reminders {uuid.uuid4().hex[:6]}"
        subj_res = await client.post("/api/subjects", json={
            "name": subj_name,
            "default_fee": 3000.00
        }, headers=admin_headers)
        assert subj_res.status_code == 201
        subj_id = subj_res.json()["id"]

        batch_res = await client.post("/api/batches", json={
            "name": f"Batch Reminders {uuid.uuid4().hex[:6]}",
            "start_date": (date.today() - timedelta(days=10)).isoformat(),
            "hall_number": f"H-{uuid.uuid4().hex[:5]}",
            "schedule": "Daily 9-10 AM",
            "subjects": [{"subject_id": subj_id, "fee": 3000.00, "schedule": "Daily 9-10 AM"}]
        }, headers=admin_headers)
        assert batch_res.status_code == 201
        batch_id = batch_res.json()["id"]

        # 4. Create Active Student with Mobile
        mobile_num = f"98{uuid.uuid4().int % 100000000:08d}"
        student_name = f"WhatsApp RemStudent {uuid.uuid4().hex[:5]}"
        stu_res = await client.post("/api/students", json={
            "name": student_name,
            "mobile": mobile_num,
            "gender": "FEMALE"
        }, headers=admin_headers)
        assert stu_res.status_code == 201
        stu_id = stu_res.json()["id"]

        # 5. Create Student without Mobile
        no_mob_name = f"NoMobile Student {uuid.uuid4().hex[:5]}"
        stu_no_mob = await client.post("/api/students", json={
            "name": no_mob_name,
            "mobile": None,
            "gender": "MALE"
        }, headers=admin_headers)
        assert stu_no_mob.status_code == 201
        no_mob_id = stu_no_mob.json()["id"]

        # 6. Create Active Admission with partial payment (fee: 3000, paid: 1000, balance: 2000)
        curr_from = (date.today() - timedelta(days=10)).isoformat()
        curr_to = (date.today() + timedelta(days=20)).isoformat()

        adm1_res = await client.post("/api/admissions", json={
            "student_id": stu_id,
            "admission_date": curr_from,
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "subject_id": subj_id,
                    "batch_id": batch_id,
                    "item_name_snapshot": subj_name,
                    "original_price": 3000.00,
                    "net_price": 3000.00,
                    "valid_from": curr_from,
                    "valid_to": curr_to
                }
            ],
            "initial_payment": {"amount": 1000.00, "payment_mode": "CASH"}
        }, headers=cashier_headers)
        assert adm1_res.status_code == 201
        adm1_data = adm1_res.json()
        assert float(adm1_data["balance_due"]) == 2000.00

        # Also create admission for student without mobile
        adm2_res = await client.post("/api/admissions", json={
            "student_id": no_mob_id,
            "admission_date": date.today().isoformat(),
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "subject_id": subj_id,
                    "batch_id": batch_id,
                    "item_name_snapshot": subj_name,
                    "original_price": 3000.00,
                    "net_price": 3000.00,
                    "valid_from": date.today().isoformat(),
                    "valid_to": (date.today() + timedelta(days=25)).isoformat()
                }
            ],
            "initial_payment": {"amount": 500.00, "payment_mode": "CASH"}
        }, headers=cashier_headers)
        assert adm2_res.status_code == 201

        # 7. Create an EXPIRED admission and verify it NEVER generates a reminder
        exp_stu_name = f"Expired Student {uuid.uuid4().hex[:5]}"
        exp_stu = await client.post("/api/students", json={
            "name": exp_stu_name,
            "mobile": "9811112222",
            "gender": "MALE"
        }, headers=admin_headers)
        exp_stu_id = exp_stu.json()["id"]

        past_from = (date.today() - timedelta(days=60)).isoformat()
        past_to = (date.today() - timedelta(days=10)).isoformat()
        exp_adm_res = await client.post("/api/admissions", json={
            "student_id": exp_stu_id,
            "admission_date": past_from,
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "subject_id": subj_id,
                    "batch_id": batch_id,
                    "item_name_snapshot": subj_name,
                    "original_price": 3000.00,
                    "net_price": 3000.00,
                    "valid_from": past_from,
                    "valid_to": past_to
                }
            ],
            "initial_payment": {"amount": 500.00, "payment_mode": "CASH"}
        }, headers=cashier_headers)
        assert exp_adm_res.status_code == 201

        # Run daily job to mark status expired on exp_adm
        async with AsyncSessionLocal() as db:
            await refresh_statuses(today=date.today(), db=db)

        # 8. Cashier calls POST /api/reminders/generate
        gen_res = await client.post("/api/reminders/generate", headers=cashier_headers)
        assert gen_res.status_code == 200
        gen_data = gen_res.json()
        assert "count" in gen_data
        assert "message" in gen_data

        # 9. Cashier calls GET /api/reminders/queue
        queue_res = await client.get("/api/reminders/queue", headers=cashier_headers)
        assert queue_res.status_code == 200
        queue_data = queue_res.json()
        assert "items" in queue_data
        assert "counts" in queue_data
        assert queue_data["counts"]["pending"] >= 2

        # Verify active student with mobile in queue using search
        stu_search_res = await client.get(f"/api/reminders/queue?status=pending&search={student_name}", headers=cashier_headers)
        assert stu_search_res.status_code == 200
        matched_rem = stu_search_res.json()["items"]
        assert len(matched_rem) == 1
        rem_item = matched_rem[0]
        assert rem_item["student_name"] == student_name
        assert rem_item["student_mobile"] == mobile_num
        assert rem_item["has_mobile"] is True
        assert rem_item["subject_name"] == subj_name
        assert float(rem_item["due_amount"]) == 2000.00
        assert rem_item["due_date"] is not None
        assert rem_item["is_expired"] is False
        assert rem_item["status"] == "pending"

        # Check pre-filled WhatsApp click-to-chat URL
        wa_url = rem_item["whatsapp_url"]
        assert wa_url.startswith("https://wa.me/91")
        assert f"91{mobile_num}" in wa_url
        assert "text=" in wa_url
        msg = rem_item["message"]
        assert student_name in msg
        assert subj_name in msg
        assert "2,000.00" in msg

        # Verify the expired student is NOT in the reminders queue (Rule: never for expired items)
        exp_search_res = await client.get(f"/api/reminders/queue?status=all&search={exp_stu_name}", headers=cashier_headers)
        assert exp_search_res.status_code == 200
        assert len(exp_search_res.json()["items"]) == 0

        # Verify filter by subject
        subj_filter_res = await client.get(f"/api/reminders/queue?subject_id={subj_id}&status=pending", headers=cashier_headers)
        assert subj_filter_res.status_code == 200
        subj_items = subj_filter_res.json()["items"]
        assert any(it["id"] == rem_item["id"] for it in subj_items)

        # Verify filter by batch
        batch_filter_res = await client.get(f"/api/reminders/queue?batch_id={batch_id}&status=pending", headers=cashier_headers)
        assert batch_filter_res.status_code == 200
        batch_items = batch_filter_res.json()["items"]
        assert any(it["id"] == rem_item["id"] for it in batch_items)

        # Verify filter by due-age
        age_filter_res = await client.get("/api/reminders/queue?due_age=0-30&status=pending", headers=cashier_headers)
        assert age_filter_res.status_code == 200
        assert "items" in age_filter_res.json()

        # 10. Mark Reminder as Sent
        rem_id = rem_item["id"]
        sent_res = await client.post(f"/api/reminders/{rem_id}/mark-sent", headers=cashier_headers)
        assert sent_res.status_code == 200
        sent_data = sent_res.json()
        assert sent_data["status"] == "sent"
        assert sent_data["handled_at"] is not None

        # Verify in queue under sent filter (Sent History)
        sent_queue = await client.get("/api/reminders/queue?status=sent", headers=admin_headers)
        assert sent_queue.status_code == 200
        sent_items = sent_queue.json()["items"]
        assert any(it["id"] == rem_id for it in sent_items)

        # 11. Mark Reminder as Failed
        fail_res = await client.post(
            f"/api/reminders/{rem_id}/mark-failed",
            json={"reason": "Student phone number not on WhatsApp"},
            headers=cashier_headers,
        )
        assert fail_res.status_code == 200
        fail_data = fail_res.json()
        assert fail_data["status"] == "failed"
        assert "WhatsApp" in fail_data["error_reason"]

        failed_queue = await client.get("/api/reminders/queue?status=failed", headers=admin_headers)
        assert failed_queue.status_code == 200
        assert any(it["id"] == rem_id for it in failed_queue.json()["items"])

        # 12. Reset back to pending
        reset_res = await client.post(f"/api/reminders/{rem_id}/reset-pending", headers=admin_headers)
        assert reset_res.status_code == 200
        assert reset_res.json()["status"] == "pending"

        # 13. One-click send due reminder from student
        one_click_stu = await client.post(f"/api/reminders/student/{stu_id}/send-due-reminder", headers=cashier_headers)
        assert one_click_stu.status_code == 200
        stu_rem_data = one_click_stu.json()
        assert "whatsapp_url" in stu_rem_data
        assert stu_rem_data["whatsapp_url"].startswith("https://wa.me/91")
        assert "reminder" in stu_rem_data
        assert stu_rem_data["reminder"]["student_name"] == student_name

        # 14. One-click send due reminders for subject
        one_click_subj = await client.post(f"/api/reminders/subject/{subj_id}/send-due-reminders", headers=cashier_headers)
        assert one_click_subj.status_code == 200
        assert "count" in one_click_subj.json()

        # 15. Unauthorized access test
        unauth_res = await client.get("/api/reminders/queue")
        assert unauth_res.status_code in [401, 403]
