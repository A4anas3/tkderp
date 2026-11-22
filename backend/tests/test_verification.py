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
        assert "No active enrolment" in res.json()["detail"]
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
    from app.core.rate_limit import RateLimiter, reset_rate_limits
    
    reset_rate_limits()
    limiter = RateLimiter(times=3, seconds=60, prefix="test_abuse")
    
    class MockRequest:
        headers = {"x-forwarded-for": "198.51.100.1"}
        client = None
    
    req = MockRequest()
    await limiter(req)
    await limiter(req)
    await limiter(req)
    
    with pytest.raises(Exception) as excinfo:
        await limiter(req)
    assert "Rate limit exceeded" in str(excinfo.value.detail)

