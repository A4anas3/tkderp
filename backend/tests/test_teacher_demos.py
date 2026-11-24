import pytest
import uuid
from datetime import date, timedelta
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_teacher_demos_permissions_and_active_filter():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Login as Admin
        admin_login = await client.post("/api/auth/login", json={
            "username": "ADM001",
            "password": "Admin@1234"
        })
        assert admin_login.status_code == 200
        admin_token = admin_login.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # 2. Login as Teacher
        teacher_login = await client.post("/api/auth/login", json={
            "username": "TCH001",
            "password": "Teacher@1234"
        })
        assert teacher_login.status_code == 200
        teacher_token = teacher_login.json()["access_token"]
        teacher_headers = {"Authorization": f"Bearer {teacher_token}"}

        # 3. Create a test enquiry with active demo items via Admin
        today = date.today()
        # Fetch available subject
        sub_res = await client.get("/api/subjects", headers=admin_headers)
        assert sub_res.status_code == 200
        subjects = sub_res.json()["items"]
        assert len(subjects) > 0
        subject = subjects[0]

        tch_res = await client.get("/api/teachers", headers=admin_headers)
        teachers = tch_res.json()["items"]
        teacher = teachers[0]

        enq_payload = {
            "student_name": "Test Active Demo Student",
            "mobile": "9876543210",
            "purpose": "Trial Class",
            "notes": "Testing active demos view",
            "status": "ACTIVE_DEMO",
            "demo_start_date": str(today),
            "demo_duration_days": 5,
            "demo_items": [
                {
                    "subject_id": subject["id"],
                    "teacher_id": teacher["id"],
                    "hall_number_snapshot": "Room 101",
                    "demo_start_date": str(today),
                    "demo_duration_days": 5,
                    "notes": "Subject active demo"
                }
            ]
        }
        create_res = await client.post("/api/enquiries", json=enq_payload, headers=admin_headers)
        assert create_res.status_code == 201
        enq_data = create_res.json()
        enq_id = enq_data["id"]
        assert len(enq_data["demo_items"]) > 0
        demo_item_id = enq_data["demo_items"][0]["id"]

        # 4. Teacher CAN fetch demo list
        teacher_demos_res = await client.get("/api/enquiries/demos?status_filter=ACTIVE", headers=teacher_headers)
        assert teacher_demos_res.status_code == 200
        demos_data = teacher_demos_res.json()
        assert "items" in demos_data
        # Ensure our newly created demo item is present in the list
        found_demo = next((d for d in demos_data["items"] if d["demo_item_id"] == demo_item_id), None)
        assert found_demo is not None
        assert found_demo["student_name"] == "Test Active Demo Student"
        assert found_demo["subject_name"] == subject["name"]

        # 5. Teacher CAN fetch enquiry details
        teacher_enq_res = await client.get(f"/api/enquiries/{enq_id}", headers=teacher_headers)
        assert teacher_enq_res.status_code == 200
        assert teacher_enq_res.json()["student_name"] == "Test Active Demo Student"

        # 6. Teacher CANNOT update demo item status (MUST return 403)
        teacher_status_res = await client.put(
            f"/api/enquiries/demos/{demo_item_id}/status",
            json={"status": "ATTENDED"},
            headers=teacher_headers
        )
        assert teacher_status_res.status_code == 403, f"Expected 403, got {teacher_status_res.status_code}"

        # 7. Teacher CANNOT create an enquiry (MUST return 403)
        teacher_create_res = await client.post(
            "/api/enquiries",
            json=enq_payload,
            headers=teacher_headers
        )
        assert teacher_create_res.status_code == 403

        # 8. Teacher CANNOT update an enquiry (MUST return 403)
        teacher_update_res = await client.put(
            f"/api/enquiries/{enq_id}",
            json={"student_name": "Tampered Name"},
            headers=teacher_headers
        )
        assert teacher_update_res.status_code == 403

        # 9. Teacher CANNOT register student from enquiry (MUST return 403)
        teacher_reg_res = await client.post(
            f"/api/enquiries/{enq_id}/register-student",
            json={},
            headers=teacher_headers
        )
        assert teacher_reg_res.status_code == 403

        # 10. Teacher CANNOT convert enquiry (MUST return 403)
        teacher_conv_res = await client.post(
            f"/api/enquiries/{enq_id}/convert",
            json={},
            headers=teacher_headers
        )
        assert teacher_conv_res.status_code == 403

        # 11. Admin CAN update demo item status (200 OK)
        admin_status_res = await client.put(
            f"/api/enquiries/demos/{demo_item_id}/status",
            json={"status": "ATTENDED"},
            headers=admin_headers
        )
        assert admin_status_res.status_code == 200
        assert admin_status_res.json()["status"] == "ATTENDED"

        # 12. Even after status changed to ATTENDED (with demo_end_date >= today), it still appears in active demos!
        active_res = await client.get("/api/enquiries/demos?status_filter=ACTIVE", headers=teacher_headers)
        assert active_res.status_code == 200
        found_active_attended = next((d for d in active_res.json()["items"] if d["demo_item_id"] == demo_item_id), None)
        assert found_active_attended is not None
        assert found_active_attended["status"] == "ATTENDED"
