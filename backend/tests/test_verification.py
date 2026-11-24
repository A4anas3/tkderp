import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.fixture
async def admin_token():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/auth/login", json={
            "username": "ADM001",
            "password": "Admin@1234"
        })
        assert res.status_code == 200
        return res.json()["access_token"]

@pytest.mark.asyncio
async def test_public_verify_by_admission_number(admin_token):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Fetch an existing student via admin API to know admission number
        stu_res = await client.get("/api/students", headers={"Authorization": f"Bearer {admin_token}"})
        assert stu_res.status_code == 200
        students = stu_res.json()["items"]
        assert len(students) > 0

        # Find a student that has an admission number
        student_with_adm = next((s for s in students if s.get("latest_admission_number")), None)
        assert student_with_adm is not None, "At least one student should have an admission number"

        adm_no = student_with_adm["latest_admission_number"]

        # 2. Public verification without ANY authentication headers
        verify_res = await client.get(f"/api/verify/{adm_no}")
        assert verify_res.status_code == 200
        data = verify_res.json()

        assert data["verified"] is True
        assert "student" in data
        assert data["student"]["name"] == student_with_adm["name"]
        assert data["student"]["student_code"] == student_with_adm["student_code"]
        assert data["student"]["admission_number"] == adm_no
        assert "active_courses" in data
        assert isinstance(data["active_courses"], list)

        # Check courses validity structure if student has active courses
        for course in data["active_courses"]:
            assert "course_name" in course
            assert "validity_period" in course
            assert "valid_from" in course
            assert "valid_to" in course
            assert course["status"] == "ACTIVE"
            assert "Valid" in course["validity_period"]

@pytest.mark.asyncio
async def test_public_verify_by_student_code(admin_token):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Fetch students
        stu_res = await client.get("/api/students", headers={"Authorization": f"Bearer {admin_token}"})
        assert stu_res.status_code == 200
        students = stu_res.json()["items"]
        assert len(students) > 0

        stu_code = students[0]["student_code"]

        # Verify by student code
        verify_res = await client.get(f"/api/verify/{stu_code}")
        assert verify_res.status_code == 200
        data = verify_res.json()

        assert data["verified"] is True
        assert data["student"]["student_code"] == stu_code
        assert data["student"]["name"] == students[0]["name"]
        assert "institute_name" in data
        assert "Thakurdwara" in data["institute_name"]

@pytest.mark.asyncio
async def test_public_verify_not_found():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        verify_res = await client.get("/api/verify/NON-EXISTENT-CODE-99999")
        assert verify_res.status_code == 404
        assert "No matching student" in verify_res.json()["detail"]

@pytest.mark.asyncio
async def test_public_verify_alias_route(admin_token):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        stu_res = await client.get("/api/students", headers={"Authorization": f"Bearer {admin_token}"})
        students = stu_res.json()["items"]
        stu_code = students[0]["student_code"]

        verify_res = await client.get(f"/api/public/verify/{stu_code}")
        assert verify_res.status_code == 200
        assert verify_res.json()["verified"] is True

@pytest.mark.asyncio
async def test_student_detail_contains_latest_admission_number(admin_token):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        stu_res = await client.get("/api/students", headers={"Authorization": f"Bearer {admin_token}"})
        students = stu_res.json()["items"]
        student_with_adm = next((s for s in students if s.get("latest_admission_number")), None)
        assert student_with_adm is not None

        # Fetch detail
        detail_res = await client.get(f"/api/students/{student_with_adm['id']}", headers={"Authorization": f"Bearer {admin_token}"})
        assert detail_res.status_code == 200
        detail = detail_res.json()
        assert detail["latest_admission_number"] is not None
        assert detail["latest_admission_number"] == student_with_adm["latest_admission_number"]

@pytest.mark.asyncio
async def test_public_id_card_active_student(admin_token):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        stu_res = await client.get("/api/students", headers={"Authorization": f"Bearer {admin_token}"})
        assert stu_res.status_code == 200
        students = stu_res.json()["items"]
        
        # Find active student with admission number
        active_student = None
        for s in students:
            if s.get("latest_admission_number") and s.get("status") == "ACTIVE":
                res = await client.get(f"/api/public/id-card/{s['latest_admission_number']}")
                if res.status_code == 200:
                    active_student = s
                    break
        assert active_student is not None, "Should find at least one student with active ID card"
        
        adm_no = active_student["latest_admission_number"]
        card_res = await client.get(f"/api/public/id-card/{adm_no}")
        assert card_res.status_code == 200
        data = card_res.json()
        assert data["verified"] is True
        assert data["is_valid"] is True
        assert data["student"]["name"] == active_student["name"]
        assert data["student"]["student_code"] == active_student["student_code"]
        assert data["student"]["admission_number"] == adm_no
        assert len(data["active_courses"]) > 0
        assert data["total_active_courses"] == len(data["active_courses"])
        assert "THAKURDWARA COACHING INSTITUTE" in data["institute_name"]
        
        # Test alias route /api/id-card/{identifier}
        alias_res = await client.get(f"/api/id-card/{adm_no}")
        assert alias_res.status_code == 200
        assert alias_res.json()["student"]["admission_number"] == adm_no
        
        # Test query parameter format
        query_res = await client.get(f"/api/public/id-card?admission_no={adm_no}")
        assert query_res.status_code == 200
        assert query_res.json()["student"]["name"] == active_student["name"]

        # Test lookup by STUDENT ID (student_code)
        student_code = active_student["student_code"]
        stu_id_res = await client.get(f"/api/public/id-card/{student_code}")
        assert stu_id_res.status_code == 200
        assert stu_id_res.json()["student"]["name"] == active_student["name"]
        assert stu_id_res.json()["student"]["student_code"] == student_code

        # Test lookup by Student ID query param
        stu_id_q_res = await client.get(f"/api/public/id-card?student_id={student_code}")
        assert stu_id_q_res.status_code == 200
        assert stu_id_q_res.json()["student"]["student_code"] == student_code

        # Test lookup by REGISTERED PHONE NUMBER (mobile)
        if active_student.get("mobile"):
            mob = active_student["mobile"]
            phone_res = await client.get(f"/api/public/id-card/{mob}")
            assert phone_res.status_code == 200
            assert phone_res.json()["student"]["name"] == active_student["name"]

            # With country code prefix (+91)
            phone_prefix_res = await client.get(f"/api/public/id-card/+91{mob}")
            assert phone_prefix_res.status_code == 200
            assert phone_prefix_res.json()["student"]["name"] == active_student["name"]

            # Via query param (?phone=...)
            phone_q_res = await client.get(f"/api/public/id-card?phone={mob}")
            assert phone_q_res.status_code == 200
            assert phone_q_res.json()["student"]["name"] == active_student["name"]

@pytest.mark.asyncio
async def test_public_id_card_no_sensitive_data(admin_token):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        stu_res = await client.get("/api/students", headers={"Authorization": f"Bearer {admin_token}"})
        students = stu_res.json()["items"]
        student_with_adm = next((s for s in students if s.get("latest_admission_number")), None)
        assert student_with_adm is not None
        
        res = await client.get(f"/api/public/id-card/{student_with_adm['latest_admission_number']}")
        if res.status_code == 200:
            data = res.json()
            # Verify no sensitive data leaked
            assert "password" not in data
            assert "password_hash" not in data
            assert "mobile" not in data["student"]
            assert "email" not in data["student"]
            assert "dues" not in data
            assert "payments" not in data
            assert "discount" not in data

@pytest.mark.asyncio
async def test_public_id_card_expired_student_fails_with_404(admin_token):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # ENR-2026-0002 has no active courses
        res = await client.get("/api/public/id-card/ENR-2026-0002")
        assert res.status_code == 404
        assert res.json()["detail"] == "No matching student or admission record found"
        # Never leak student name or details
        assert "Ananya" not in res.text
        assert "student" not in res.json()

@pytest.mark.asyncio
async def test_public_id_card_not_found():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/public/id-card/NONEXISTENT-CODE-99999")
        assert res.status_code == 404
        assert "No matching student" in res.json()["detail"]
        assert "student" not in res.json()

@pytest.mark.asyncio
async def test_rate_limiter_blocks_abuse():
    import uuid
    from app.core.rate_limit import RateLimiter, reset_rate_limits, reset_rate_limits_async
    
    unique_prefix = f"test_abuse_{uuid.uuid4().hex[:8]}"
    unique_ip = f"198.51.100.{uuid.uuid4().int % 200 + 10}"
    reset_rate_limits()
    await reset_rate_limits_async(unique_prefix)
    limiter = RateLimiter(times=3, seconds=60, prefix=unique_prefix)
    
    class MockRequest:
        headers = {"x-forwarded-for": unique_ip}
        client = None
    
    req = MockRequest()
    await limiter(req)
    await limiter(req)
    await limiter(req)
    
    with pytest.raises(Exception) as excinfo:
        await limiter(req)
    assert "Rate limit exceeded" in str(excinfo.value.detail)

@pytest.mark.asyncio
async def test_public_id_card_active_demos_included(admin_token):
    from datetime import date, timedelta
    import uuid
    from app.database.session import AsyncSessionLocal
    from app.modules.enquiries.models import EnquiryDemoItem
    from sqlalchemy import select

    headers = {"Authorization": f"Bearer {admin_token}"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Fetch subjects
        sub_res = await client.get("/api/subjects", headers=headers)
        assert sub_res.status_code == 200
        subjects = sub_res.json().get("items", sub_res.json())
        assert len(subjects) >= 2
        subj_active = subjects[0]
        subj_expired = subjects[1]

        # 2. Register student FIRST (register-first flow), then create enquiry with 2 demos: 1 active, 1 expired
        unique_suffix = str(uuid.uuid4().int)[:6]
        phone = f"9871{unique_suffix}"
        today = date.today()
        today_str = today.isoformat()

        reg_res = await client.post("/api/enquiries/register-student", json={
            "name": f"Demo Card Test {unique_suffix}",
            "mobile": phone,
            "father_name": f"Demo Father {unique_suffix}",
            "school_college": "Demo Test School",
        }, headers=headers)
        assert reg_res.status_code == 200, reg_res.text
        reg_data = reg_res.json()
        student_id = reg_data["student_id"]
        student_code = reg_data["student_code"]

        enq_payload = {
            "student_id": student_id,
            "student_name": f"Demo Card Test {unique_suffix}",
            "mobile": phone,
            "father_name": f"Demo Father {unique_suffix}",
            "school_college": "Demo Test School",
            "purpose": "ID Card Demo Trial Test",
            "interested_subject": f"{subj_active['name']}, {subj_expired['name']}",
            "demo_start_date": today_str,
            "demo_duration_days": 3,
            "status": "ACTIVE_DEMO",
            "demo_items": [
                {
                    "subject_id": subj_active["id"],
                    "teacher_id": subj_active.get("teacher_id"),
                    "demo_duration_days": 3,
                    "demo_start_date": today_str,
                    "notes": "Active demo trial"
                },
                {
                    "subject_id": subj_expired["id"],
                    "teacher_id": subj_expired.get("teacher_id"),
                    "demo_duration_days": 3,
                    "demo_start_date": (today - timedelta(days=10)).isoformat(),
                    "notes": "Past demo trial"
                }
            ]
        }

        create_res = await client.post("/api/enquiries", json=enq_payload, headers=headers)
        assert create_res.status_code == 201, create_res.text
        enq_data = create_res.json()
        enquiry_id = enq_data["id"]

        # Directly update the second demo item to have an expired demo_end_date in the past
        async with AsyncSessionLocal() as session:
            stmt = select(EnquiryDemoItem).where(
                EnquiryDemoItem.enquiry_id == uuid.UUID(enquiry_id),
                EnquiryDemoItem.subject_id == uuid.UUID(subj_expired["id"])
            )
            expired_item = (await session.execute(stmt)).scalar_one()
            expired_item.demo_start_date = today - timedelta(days=10)
            expired_item.demo_end_date = today - timedelta(days=7)
            expired_item.status = "EXPIRED"
            await session.commit()

        # 4. Query public ID card by student_code
        card_res = await client.get(f"/api/public/id-card/{student_code}")
        assert card_res.status_code == 200, card_res.text
        card_data = card_res.json()

        assert card_data["verified"] is True
        assert card_data["student"]["student_code"] == student_code
        assert "active_demos" in card_data
        assert card_data["total_active_demos"] == 1
        assert len(card_data["active_demos"]) == 1

        active_d = card_data["active_demos"][0]
        assert active_d["subject_name"] == subj_active["name"]
        assert active_d["status"] == "SCHEDULED"
        assert active_d["demo_reference_number"].startswith("DEM-")
        assert active_d["days_remaining"] >= 0

        # Expired demo must NOT be in active_demos
        expired_refs = [d["subject_name"] for d in card_data["active_demos"]]
        assert subj_expired["name"] not in expired_refs

