import uuid
from datetime import date
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_demo_student_registration_full_flow():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Login as Cashier / Admin
        login_res = await client.post("/api/auth/login", json={
            "username": "CSH001",
            "password": "Cashier@1234"
        })
        assert login_res.status_code == 200
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Unique suffix for mobile numbers
        unique_suffix = str(uuid.uuid4().int)[:6]
        phone_a = f"9911{unique_suffix}"
        phone_b = f"9922{unique_suffix}"

        # -------------------------------------------------------------
        # 1. Register brand-new test enquiry person -> creates student
        # -------------------------------------------------------------
        enq_res = await client.post("/api/enquiries", json={
            "student_name": "Test Demo Student One",
            "mobile": f"+91 {phone_a[:5]} {phone_a[5:]}",  # formatted with +91 and space
            "father_name": "Test Father One",
            "school_college": "Delhi Public School",
            "purpose": "Physics Demo",
            "interested_subject": "Physics",
            "demo_start_date": "2026-11-20",
            "demo_duration_days": 3,
            "status": "ACTIVE_DEMO"
        }, headers=headers)
        assert enq_res.status_code == 201
        enq1 = enq_res.json()
        enq1_id = enq1["id"]
        assert enq1["status"] == "ACTIVE_DEMO"
        assert enq1["converted_student_id"] is None

        # Call register-student endpoint
        reg1_res = await client.post(f"/api/enquiries/{enq1_id}/register-student", headers=headers)
        assert reg1_res.status_code == 200
        reg1_data = reg1_res.json()

        assert reg1_data["success"] is True
        assert reg1_data["already_registered"] is False
        assert reg1_data["multiple_matches"] is False
        student1_id = reg1_data["student_id"]
        student1_code = reg1_data["student_code"]
        assert student1_id is not None
        assert student1_code.startswith("STU")

        # Verify enquiry in DB: converted_student_id is set, but status is STILL ACTIVE_DEMO!
        get_enq1 = (await client.get(f"/api/enquiries/{enq1_id}", headers=headers)).json()
        assert get_enq1["converted_student_id"] == student1_id
        assert get_enq1["converted_student_code"] == student1_code
        assert get_enq1["status"] == "ACTIVE_DEMO"  # NOT marked CONVERTED!
        assert len(get_enq1["demo_items"]) >= 1
        assert get_enq1["demo_items"][0]["status"] == "SCHEDULED"  # NOT marked CONVERTED!

        # Verify student details in students table
        stu1_res = (await client.get(f"/api/students/{student1_id}", headers=headers)).json()
        assert stu1_res["name"] == "Test Demo Student One"
        assert stu1_res["mobile"] == phone_a
        assert stu1_res["father_name"] == "Test Father One"
        assert "Delhi Public School" in (stu1_res["notes"] or "")

        # -------------------------------------------------------------
        # 2. Duplicate check: DIFFERENT name with the SAME phone number
        #    Must NOT create a second student — links to existing student!
        # -------------------------------------------------------------
        enq2_res = await client.post("/api/enquiries", json={
            "student_name": "Totally Different Name Person",
            "mobile": f"0{phone_a}",  # same 10 digits with leading 0
            "father_name": "Another Father",
            "purpose": "Maths Demo",
            "interested_subject": "Maths",
            "status": "ACTIVE_DEMO"
        }, headers=headers)
        assert enq2_res.status_code == 201
        enq2 = enq2_res.json()
        enq2_id = enq2["id"]

        reg2_res = await client.post(f"/api/enquiries/{enq2_id}/register-student", headers=headers)
        assert reg2_res.status_code == 200
        reg2_data = reg2_res.json()

        assert reg2_data["success"] is True
        assert reg2_data["already_registered"] is True
        assert reg2_data["multiple_matches"] is False
        assert reg2_data["student_id"] == student1_id  # REUSED existing student!
        assert reg2_data["student_code"] == student1_code
        assert "Already registered" in reg2_data["message"]

        # Confirm enquiry2 is now linked to student1
        get_enq2 = (await client.get(f"/api/enquiries/{enq2_id}", headers=headers)).json()
        assert get_enq2["converted_student_id"] == student1_id
        assert get_enq2["status"] == "ACTIVE_DEMO"  # Demo status NOT changed

        # -------------------------------------------------------------
        # 3. Same name with DIFFERENT phone number -> creates NEW student
        # -------------------------------------------------------------
        enq3_res = await client.post("/api/enquiries", json={
            "student_name": "Test Demo Student One",  # same name as student1
            "mobile": phone_b,                        # DIFFERENT phone number
            "father_name": "Test Father One",
            "purpose": "Chemistry Demo",
            "interested_subject": "Chemistry",
            "status": "ACTIVE_DEMO"
        }, headers=headers)
        assert enq3_res.status_code == 201
        enq3_id = enq3_res.json()["id"]

        reg3_res = await client.post(f"/api/enquiries/{enq3_id}/register-student", headers=headers)
        assert reg3_res.status_code == 200
        reg3_data = reg3_res.json()

        assert reg3_data["success"] is True
        assert reg3_data["already_registered"] is False
        assert reg3_data["student_id"] != student1_id  # NEW student created!
        student3_id = reg3_data["student_id"]
        student3_code = reg3_data["student_code"]
        assert student3_code != student1_code

        # -------------------------------------------------------------
        # 4. Multiple students sharing same phone number:
        #    Create a second student with phone_b directly, then enquiry with phone_b
        # -------------------------------------------------------------
        stu_sibling = await client.post("/api/students", json={
            "name": "Sibling Student Two",
            "mobile": phone_b,
            "father_name": "Test Father One",
            "status": "ACTIVE"
        }, headers=headers)
        assert stu_sibling.status_code == 201
        sibling_id = stu_sibling.json()["id"]

        # Create enquiry with phone_b
        enq4_res = await client.post("/api/enquiries", json={
            "student_name": "Enquiry With Sibling Phone",
            "mobile": f"+91{phone_b}",
            "interested_subject": "Biology",
            "status": "ACTIVE_DEMO"
        }, headers=headers)
        assert enq4_res.status_code == 201
        enq4_id = enq4_res.json()["id"]

        # Register without selecting -> returns multiple matches!
        reg4_res = await client.post(f"/api/enquiries/{enq4_id}/register-student", headers=headers)
        assert reg4_res.status_code == 200
        reg4_data = reg4_res.json()
        assert reg4_data["multiple_matches"] is True
        assert len(reg4_data["matches"]) >= 2
        matched_ids = [m["id"] for m in reg4_data["matches"]]
        assert student3_id in matched_ids
        assert sibling_id in matched_ids

        # Pick sibling_id
        pick_res = await client.post(f"/api/enquiries/{enq4_id}/register-student", json={
            "selected_student_id": sibling_id
        }, headers=headers)
        assert pick_res.status_code == 200
        pick_data = pick_res.json()
        assert pick_data["already_registered"] is True
        assert pick_data["student_id"] == sibling_id

        # -------------------------------------------------------------
        # 5. Later course purchase flow (auto_register=1 / convert):
        #    Must reuse already-linked student, NOT create another!
        # -------------------------------------------------------------
        conv_res = await client.post(f"/api/enquiries/{enq1_id}/convert", headers=headers)
        assert conv_res.status_code == 200
        conv_data = conv_res.json()
        assert conv_data["student_id"] == student1_id  # Reused student1!
        assert conv_data["student_code"] == student1_code
        assert conv_data["status"] == "CONVERTED"

        # Check enquiry in DB: now marked CONVERTED and demo items marked CONVERTED
        final_enq1 = (await client.get(f"/api/enquiries/{enq1_id}", headers=headers)).json()
        assert final_enq1["status"] == "CONVERTED"
        assert final_enq1["converted_student_id"] == student1_id
        assert final_enq1["demo_items"][0]["status"] == "CONVERTED"
