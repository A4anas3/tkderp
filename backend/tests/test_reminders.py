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
            "start_date": (date.today() - timedelta(days=50)).isoformat(),
            "hall_number": f"H-{uuid.uuid4().hex[:5]}",
            "schedule": "Daily 9-10 AM",
            "subjects": [{"subject_id": subj_id, "fee": 3000.00, "schedule": "Daily 9-10 AM"}]
        }, headers=admin_headers)
        assert batch_res.status_code == 201
        batch_id = batch_res.json()["id"]

        # 4. Create Student with Mobile
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

        # 6. Create Expired Admission with partial payment (fee: 3000, paid: 1000, balance: 2000)
        past_from = (date.today() - timedelta(days=45)).isoformat()
        past_to = (date.today() - timedelta(days=5)).isoformat() # expired 5 days ago

        adm1_res = await client.post("/api/admissions", json={
            "student_id": stu_id,
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

        # Run daily job to mark status expired on adm1
        async with AsyncSessionLocal() as db:
            await refresh_statuses(today=date.today(), db=db)

        # 7. Cashier calls POST /api/reminders/generate
        gen_res = await client.post("/api/reminders/generate", headers=cashier_headers)
        assert gen_res.status_code == 200
        gen_data = gen_res.json()
        assert "count" in gen_data
        assert "message" in gen_data

        # 8. Cashier calls GET /api/reminders/queue
        queue_res = await client.get("/api/reminders/queue", headers=cashier_headers)
        assert queue_res.status_code == 200
        queue_data = queue_res.json()
        assert "items" in queue_data
        assert "counts" in queue_data
        assert queue_data["counts"]["pending"] >= 2

        # Verify the student with mobile in queue using search
        stu_search_res = await client.get(f"/api/reminders/queue?status=pending&search={student_name}", headers=cashier_headers)
        assert stu_search_res.status_code == 200
        matched_rem = stu_search_res.json()["items"]
        assert len(matched_rem) == 1
        rem_item = matched_rem[0]
        assert rem_item["student_name"] == student_name
        assert rem_item["student_mobile"] == mobile_num
        assert rem_item["has_mobile"] is True
        assert rem_item["course_name"] == subj_name
        assert float(rem_item["due_amount"]) == 2000.00
        assert rem_item["is_expired"] is True
        assert rem_item["kind"] == "expired_due"
        assert rem_item["status"] == "pending"

        # Check pre-filled WhatsApp click-to-chat URL
        wa_url = rem_item["whatsapp_url"]
        assert wa_url.startswith("https://wa.me/91")
        assert f"91{mobile_num}" in wa_url
        assert "text=" in wa_url
        # Message must name the student, course, and due amount
        msg = rem_item["message"]
        assert student_name in msg
        assert subj_name in msg
        assert "2,000.00" in msg

        # Verify the student without mobile in queue using search
        no_mob_search_res = await client.get(f"/api/reminders/queue?status=pending&search={no_mob_name}", headers=cashier_headers)
        assert no_mob_search_res.status_code == 200
        matched_no_mob = no_mob_search_res.json()["items"]
        assert len(matched_no_mob) == 1
        no_mob_rem = matched_no_mob[0]
        assert no_mob_rem["has_mobile"] is False
        assert no_mob_rem["whatsapp_url"] == ""

        # 9. Mark Reminder as Sent
        rem_id = rem_item["id"]
        sent_res = await client.post(f"/api/reminders/{rem_id}/mark-sent", headers=cashier_headers)
        assert sent_res.status_code == 200
        sent_data = sent_res.json()
        assert sent_data["status"] == "sent"
        assert sent_data["handled_at"] is not None

        # Verify in queue under sent filter
        sent_queue = await client.get("/api/reminders/queue?status=sent", headers=admin_headers)
        assert sent_queue.status_code == 200
        sent_items = sent_queue.json()["items"]
        assert any(it["id"] == rem_id for it in sent_items)

        # 10. Reset back to pending
        reset_res = await client.post(f"/api/reminders/{rem_id}/reset-pending", headers=admin_headers)
        assert reset_res.status_code == 200
        assert reset_res.json()["status"] == "pending"

        # 11. Search filter test
        search_res = await client.get(f"/api/reminders/queue?status=all&search={mobile_num}", headers=cashier_headers)
        assert search_res.status_code == 200
        assert len(search_res.json()["items"]) == 1
        assert search_res.json()["items"][0]["id"] == rem_id

        # 12. Unauthorized access test
        unauth_res = await client.get("/api/reminders/queue")
        assert unauth_res.status_code in [401, 403]
