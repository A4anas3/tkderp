import uuid
from datetime import date, timedelta
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_demo_profile_and_purchase_linking():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Login as Admin/Cashier
        login_res = await client.post("/api/auth/login", json={
            "username": "CSH001",
            "password": "Cashier@1234"
        })
        assert login_res.status_code == 200
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Get existing subjects to use for the demo
        sub_res = await client.get("/api/subjects", headers=headers)
        assert sub_res.status_code == 200
        sub_data = sub_res.json()
        subjects = sub_data.get("items", sub_data)
        assert len(subjects) >= 2, "Need at least 2 subjects in database for testing"
        subj1 = subjects[0]
        subj2 = subjects[1]

        # 3. Create test enquiry with 2 demo subjects
        unique_suffix = str(uuid.uuid4().int)[:6]
        phone = f"9988{unique_suffix}"
        today_str = date.today().isoformat()

        enq_payload = {
            "student_name": f"Demo Candidate {unique_suffix}",
            "mobile": phone,
            "father_name": f"Demo Father {unique_suffix}",
            "school_college": "Model Senior Secondary School",
            "purpose": "Two Subject Demo Trial",
            "interested_subject": f"{subj1['name']}, {subj2['name']}",
            "demo_start_date": today_str,
            "demo_duration_days": 3,
            "status": "ACTIVE_DEMO",
            "demo_items": [
                {
                    "subject_id": subj1["id"],
                    "teacher_id": subj1.get("teacher_id"),
                    "demo_duration_days": 3,
                    "demo_start_date": today_str,
                    "notes": "First demo trial"
                },
                {
                    "subject_id": subj2["id"],
                    "teacher_id": subj2.get("teacher_id"),
                    "demo_duration_days": 3,
                    "demo_start_date": today_str,
                    "notes": "Second demo trial"
                }
            ]
        }
        create_enq_res = await client.post("/api/enquiries", json=enq_payload, headers=headers)
        assert create_enq_res.status_code == 201, create_enq_res.text
        enq_data = create_enq_res.json()
        enquiry_id = enq_data["id"]
        assert len(enq_data["demo_items"]) == 2

        demo_item_1 = next(d for d in enq_data["demo_items"] if d["subject_id"] == subj1["id"])
        demo_item_2 = next(d for d in enq_data["demo_items"] if d["subject_id"] == subj2["id"])
        assert demo_item_1["status"] == "SCHEDULED"
        assert demo_item_2["status"] == "SCHEDULED"
        assert demo_item_1["converted_admission_item_id"] is None
        assert demo_item_2["converted_admission_item_id"] is None

        # 4. Register student from enquiry at demo time
        reg_res = await client.post(f"/api/enquiries/{enquiry_id}/register-student", headers=headers)
        assert reg_res.status_code == 200, reg_res.text
        reg_data = reg_res.json()
        assert reg_data["success"] is True
        student_id = reg_data["student_id"]
        student_code = reg_data["student_code"]
        assert student_id is not None

        # 5. Check GET /students/{student_id}/demos BEFORE purchase
        # Both demos should appear, neither converted
        demos_res_before = await client.get(f"/api/students/{student_id}/demos", headers=headers)
        assert demos_res_before.status_code == 200
        demos_before = demos_res_before.json()
        assert len(demos_before) == 2
        for d in demos_before:
            assert d["status"] == "SCHEDULED"
            assert d["converted_admission_item_id"] is None
            assert d["linked_course"] is None

        # Also verify GET /students/{student_id} returns demos list
        stu_detail_before = await client.get(f"/api/students/{student_id}", headers=headers)
        assert stu_detail_before.status_code == 200
        assert "demos" in stu_detail_before.json()
        assert len(stu_detail_before.json()["demos"]) == 2

        # 6. Buy ONLY subj1 (one subject) with enquiry_id
        end_date = (date.today() + timedelta(days=30)).isoformat()
        adm_payload = {
            "student_id": student_id,
            "enquiry_id": enquiry_id,
            "admission_date": today_str,
            "valid_from": today_str,
            "valid_to": end_date,
            "items": [
                {
                    "item_type": "SUBJECT",
                    "subject_id": subj1["id"],
                    "item_name_snapshot": subj1["name"],
                    "original_price": float(subj1.get("default_fee") or 1500.0),
                    "valid_from": today_str,
                    "valid_to": end_date,
                    "months": 1
                }
            ],
            "overall_discount_type": "NONE",
            "overall_discount_value": 0,
            "gst_enabled": False,
            "notes": "Bought single subject from demo trial"
        }
        adm_res = await client.post("/api/admissions", json=adm_payload, headers=headers)
        assert adm_res.status_code == 201, adm_res.text
        adm_data = adm_res.json()
        admission_id = adm_data["id"]
        admission_number = adm_data["admission_number"]
        assert len(adm_data["items"]) == 1
        adm_item = adm_data["items"][0]
        adm_item_id = adm_item["id"]

        # Confirm admission item has source_demo_number populated!
        assert adm_item["source_demo_number"] == demo_item_1["demo_reference_number"]

        # Also call enquiryApi.convert (as NewAdmissionPage does)
        conv_res = await client.post(f"/api/enquiries/{enquiry_id}/convert", json={
            "admission_id": admission_id
        }, headers=headers)
        assert conv_res.status_code == 200

        # 7. Verify enquiry demo items:
        # demo 1 (subj1) is CONVERTED with converted_admission_item_id = adm_item_id
        # demo 2 (subj2) is UNCHANGED (SCHEDULED and converted_admission_item_id is None)
        enq_get_res = await client.get(f"/api/enquiries/{enquiry_id}", headers=headers)
        assert enq_get_res.status_code == 200
        enq_after = enq_get_res.json()
        demo_1_after = next(d for d in enq_after["demo_items"] if d["id"] == demo_item_1["id"])
        demo_2_after = next(d for d in enq_after["demo_items"] if d["id"] == demo_item_2["id"])

        assert demo_1_after["status"] == "CONVERTED"
        assert demo_1_after["converted_admission_item_id"] == adm_item_id
        assert demo_2_after["status"] == "SCHEDULED"
        assert demo_2_after["converted_admission_item_id"] is None

        # 8. Verify GET /students/{student_id}/demos AFTER purchase:
        # demo 1 has linked_course populated with admission_item_id, subject, admission_number
        # demo 2 has linked_course as None
        demos_res_after = await client.get(f"/api/students/{student_id}/demos", headers=headers)
        assert demos_res_after.status_code == 200
        demos_after = demos_res_after.json()
        assert len(demos_after) == 2

        d1 = next(d for d in demos_after if d["id"] == demo_item_1["id"])
        d2 = next(d for d in demos_after if d["id"] == demo_item_2["id"])

        assert d1["status"] == "CONVERTED"
        assert d1["converted_admission_item_id"] == adm_item_id
        assert d1["linked_course"] is not None
        assert d1["linked_course"]["admission_item_id"] == adm_item_id
        assert d1["linked_course"]["subject"] == subj1["name"]
        assert d1["linked_course"]["admission_number"] == admission_number

        assert d2["status"] == "SCHEDULED"
        assert d2["converted_admission_item_id"] is None
        assert d2["linked_course"] is None

        # 9. Verify Admission detail endpoint returns source_demo_number
        get_adm = await client.get(f"/api/admissions/{admission_id}", headers=headers)
        assert get_adm.status_code == 200
        get_adm_data = get_adm.json()
        assert get_adm_data["items"][0]["source_demo_number"] == demo_item_1["demo_reference_number"]

        # 10. Verify Demo Register endpoint returns CONVERTED demo with course name and admission number
        reg_demos_res = await client.get(f"/api/enquiries/demos?search={demo_item_1['demo_reference_number']}", headers=headers)
        assert reg_demos_res.status_code == 200
        reg_demos_data = reg_demos_res.json()
        assert reg_demos_data["total"] >= 1
        found_d1 = next(d for d in reg_demos_data["items"] if d["demo_item_id"] == demo_item_1["id"])
        assert found_d1["status"] == "CONVERTED"
        assert found_d1["converted_course_name"] == subj1["name"]
        assert found_d1["converted_admission_number"] == admission_number
