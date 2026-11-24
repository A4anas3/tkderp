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
        phone_legacy = f"9933{unique_suffix}"

        # -------------------------------------------------------------
        # 0. A demo is NEVER created for an unregistered student
        # -------------------------------------------------------------
        chk_unreg = await client.get(f"/api/enquiries/check-student?mobile={phone_a}", headers=headers)
        assert chk_unreg.status_code == 200
        chk_unreg_data = chk_unreg.json()
        assert chk_unreg_data["valid"] is True
        assert chk_unreg_data["exists"] is False
        assert chk_unreg_data["multiple_matches"] is False

        unreg_demo_res = await client.post("/api/enquiries", json={
            "student_name": "Unregistered Demo Attempt",
            "mobile": phone_a,
            "purpose": "Physics Demo",
            "interested_subject": "Physics",
            "demo_start_date": str(date.today()),
            "demo_duration_days": 3,
            "status": "ACTIVE_DEMO"
        }, headers=headers)
        assert unreg_demo_res.status_code == 400
        assert "register" in unreg_demo_res.json()["detail"].lower()

        # -------------------------------------------------------------
        # 1. Register-first: register student BEFORE creating demo
        # -------------------------------------------------------------
        reg1_res = await client.post("/api/enquiries/register-student", json={
            "name": "Test Demo Student One",
            "mobile": f"+91 {phone_a[:5]} {phone_a[5:]}",  # formatted with +91 and space
            "father_name": "Test Father One",
            "school_college": "Delhi Public School",
            "email": f"demo1.{unique_suffix}@example.com",
            "address": "Model Town",
        }, headers=headers)
        assert reg1_res.status_code == 200
        reg1_data = reg1_res.json()
        assert reg1_data["success"] is True
        assert reg1_data["already_registered"] is False
        assert reg1_data["multiple_matches"] is False
        student1_id = reg1_data["student_id"]
        student1_code = reg1_data["student_code"]
        assert student1_id is not None
        assert student1_code.startswith("STU")

        # Verify student details in students table
        stu1_res = (await client.get(f"/api/students/{student1_id}", headers=headers)).json()
        assert stu1_res["name"] == "Test Demo Student One"
        assert stu1_res["mobile"] == phone_a
        assert stu1_res["father_name"] == "Test Father One"
        assert "Delhi Public School" in (stu1_res["notes"] or "")

        # Now create the demo for the newly registered student
        enq_res = await client.post("/api/enquiries", json={
            "student_id": student1_id,
            "student_name": "Test Demo Student One",
            "mobile": phone_a,
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
        assert enq1["converted_student_id"] == student1_id
        assert enq1["converted_student_code"] == student1_code
        assert len(enq1["demo_items"]) >= 1
        assert enq1["demo_items"][0]["status"] == "SCHEDULED"
        assert enq1["demo_items"][0]["demo_reference_number"].startswith("DEM-")

        # -------------------------------------------------------------
        # 2. Duplicate check: DIFFERENT name with the SAME phone number
        #    (phone-only match, last 10 digits)
        #    Must NOT create a second student — links to existing student!
        # -------------------------------------------------------------
        chk_dup = await client.get(f"/api/enquiries/check-student?mobile=0{phone_a}", headers=headers)
        assert chk_dup.status_code == 200
        chk_dup_data = chk_dup.json()
        assert chk_dup_data["exists"] is True
        assert chk_dup_data["multiple_matches"] is False
        assert chk_dup_data["student"]["id"] == student1_id

        # Standalone register-student with duplicate phone must also reuse existing student
        reg2_res = await client.post("/api/enquiries/register-student", json={
            "name": "Totally Different Name Person",
            "mobile": f"0{phone_a}",
            "father_name": "Another Father",
        }, headers=headers)
        assert reg2_res.status_code == 200
        reg2_data = reg2_res.json()
        assert reg2_data["success"] is True
        assert reg2_data["already_registered"] is True
        assert reg2_data["multiple_matches"] is False
        assert reg2_data["student_id"] == student1_id
        assert reg2_data["student_code"] == student1_code

        # Creating demo directly with matching phone links to student1 directly
        enq2_res = await client.post("/api/enquiries", json={
            "student_name": "Totally Different Name Person",
            "mobile": f"0{phone_a}",
            "purpose": "Maths Demo",
            "interested_subject": "Maths",
            "status": "ACTIVE_DEMO"
        }, headers=headers)
        assert enq2_res.status_code == 201
        enq2 = enq2_res.json()
        assert enq2["converted_student_id"] == student1_id
        assert enq2["status"] == "ACTIVE_DEMO"

        # -------------------------------------------------------------
        # 3. Same name with DIFFERENT phone number -> NOT matched; creates NEW student
        # -------------------------------------------------------------
        chk_b = await client.get(f"/api/enquiries/check-student?mobile={phone_b}", headers=headers)
        assert chk_b.status_code == 200
        assert chk_b.json()["exists"] is False

        reg3_res = await client.post("/api/enquiries/register-student", json={
            "name": "Test Demo Student One",  # same name as student1
            "mobile": phone_b,                # DIFFERENT phone number
            "father_name": "Test Father One",
        }, headers=headers)
        assert reg3_res.status_code == 200
        reg3_data = reg3_res.json()
        assert reg3_data["success"] is True
        assert reg3_data["already_registered"] is False
        assert reg3_data["student_id"] != student1_id
        student3_id = reg3_data["student_id"]
        student3_code = reg3_data["student_code"]
        assert student3_code != student1_code

        # -------------------------------------------------------------
        # 4. Multiple students sharing same phone number:
        #    Create a second student with phone_b directly, then check/create demo
        # -------------------------------------------------------------
        stu_sibling = await client.post("/api/students", json={
            "name": "Sibling Student Two",
            "mobile": phone_b,
            "father_name": "Test Father One",
            "status": "ACTIVE"
        }, headers=headers)
        assert stu_sibling.status_code == 201
        sibling_id = stu_sibling.json()["id"]

        chk_multi = await client.get(f"/api/enquiries/check-student?mobile=+91{phone_b}", headers=headers)
        assert chk_multi.status_code == 200
        chk_multi_data = chk_multi.json()
        assert chk_multi_data["exists"] is True
        assert chk_multi_data["multiple_matches"] is True
        matched_ids = [m["id"] for m in chk_multi_data["matches"]]
        assert student3_id in matched_ids
        assert sibling_id in matched_ids

        # Creating demo with ambiguous phone without student_id is rejected
        ambig_demo = await client.post("/api/enquiries", json={
            "student_name": "Enquiry With Sibling Phone",
            "mobile": f"+91{phone_b}",
            "interested_subject": "Biology",
            "status": "ACTIVE_DEMO"
        }, headers=headers)
        assert ambig_demo.status_code == 400

        # Selecting sibling_id creates demo for sibling_id
        enq4_res = await client.post("/api/enquiries", json={
            "student_id": sibling_id,
            "student_name": "Sibling Student Two",
            "mobile": phone_b,
            "interested_subject": "Biology",
            "status": "ACTIVE_DEMO"
        }, headers=headers)
        assert enq4_res.status_code == 201
        assert enq4_res.json()["converted_student_id"] == sibling_id

        # -------------------------------------------------------------
        # 5. Enquiry page keeps Register Student action for non-demo PENDING enquiries
        # -------------------------------------------------------------
        pending_enq_res = await client.post("/api/enquiries", json={
            "student_name": "Pending Walkin Lead",
            "mobile": phone_legacy,
            "purpose": "General Enquiry",
            "interested_subject": "Physics",
            "status": "PENDING"
        }, headers=headers)
        assert pending_enq_res.status_code == 201
        pending_enq = pending_enq_res.json()
        assert pending_enq["status"] == "PENDING"
        assert pending_enq["demo_items"] == []
        assert pending_enq["converted_student_id"] is None

        reg_legacy = await client.post(f"/api/enquiries/{pending_enq['id']}/register-student", headers=headers)
        assert reg_legacy.status_code == 200
        assert reg_legacy.json()["student_id"] is not None

        # -------------------------------------------------------------
        # 6. Later course purchase flow (auto_register=1 / convert):
        #    Must reuse already-linked student, NOT create another!
        # -------------------------------------------------------------
        conv_res = await client.post(f"/api/enquiries/{enq1_id}/convert", headers=headers)
        assert conv_res.status_code == 200
        conv_data = conv_res.json()
        assert conv_data["student_id"] == student1_id
        assert conv_data["student_code"] == student1_code
        assert conv_data["status"] == "CONVERTED"

        final_enq1 = (await client.get(f"/api/enquiries/{enq1_id}", headers=headers)).json()
        assert final_enq1["status"] == "CONVERTED"
        assert final_enq1["converted_student_id"] == student1_id
        assert final_enq1["demo_items"][0]["status"] == "CONVERTED"
