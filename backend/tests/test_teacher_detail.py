import uuid
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
async def test_teacher_detail_page_endpoints(admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Use existing seeded teacher TCH001 (K.K. Chauhan)
        tch_id = "22222222-2222-2222-2222-222222222201"

        # (a) Teacher Details endpoint
        t_res = await client.get(f"/api/teachers/{tch_id}", headers=headers)
        assert t_res.status_code == 200
        teacher = t_res.json()
        assert teacher["name"] == "K.K. Chauhan"
        assert teacher["teacher_code"] == "TCH001"
        assert teacher["status"] in ("ACTIVE", "INACTIVE")
        assert "subjects_taught" in teacher
        assert isinstance(teacher["subjects_taught"], list)

        # (b) Teacher Breakup endpoint
        b_res = await client.get(f"/api/teachers/{tch_id}/breakup", headers=headers)
        assert b_res.status_code == 200
        breakup = b_res.json()
        assert breakup["teacher_id"] == tch_id
        assert breakup["teacher_name"] == "K.K. Chauhan"
        assert "students_enrolled" in breakup
        assert "total_fees_billed" in breakup
        assert "total_collected" in breakup
        assert "total_due" in breakup
        assert "total_waived" in breakup
        assert "total_refunded" in breakup
        assert "subjects" in breakup
        assert isinstance(breakup["subjects"], list)
        assert len(breakup["subjects"]) > 0

        # Verify subject items structure
        first_sub = breakup["subjects"][0]
        assert "subject_id" in first_sub
        assert "subject_code" in first_sub
        assert "subject_name" in first_sub
        assert "fees_billed" in first_sub
        assert "collected" in first_sub
        assert "due" in first_sub
        assert "waived" in first_sub
        assert "refunded" in first_sub

        # (c) Teacher History endpoint
        h_res = await client.get(f"/api/teachers/{tch_id}/history", headers=headers)
        assert h_res.status_code == 200
        history = h_res.json()
        assert history["teacher_id"] == tch_id
        assert "total_events" in history
        assert "admissions_count" in history
        assert "renewals_count" in history
        assert "expiries_count" in history
        assert "changes_count" in history
        assert "cancellations_count" in history
        assert "events" in history
        assert isinstance(history["events"], list)
        assert len(history["events"]) > 0

        # Verify event ordering is chronological (descending)
        events = history["events"]
        for i in range(len(events) - 1):
            assert events[i]["timestamp"] >= events[i + 1]["timestamp"]

        # Verify event types filter
        adm_only = await client.get(f"/api/teachers/{tch_id}/history?event_type=ADMISSION", headers=headers)
        assert adm_only.status_code == 200
        for ev in adm_only.json()["events"]:
            assert ev["event_type"] == "ADMISSION"

        # (d) Teacher Collections endpoint
        c_res = await client.get(f"/api/teachers/{tch_id}/collections", headers=headers)
        assert c_res.status_code == 200
        coll = c_res.json()
        assert coll["teacher_id"] == tch_id
        assert "total_collected" in coll
        assert "collections_count" in coll
        assert "items" in coll
        assert isinstance(coll["items"], list)

@pytest.mark.asyncio
async def test_teacher_not_found(admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    fake_id = str(uuid.uuid4())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r1 = await client.get(f"/api/teachers/{fake_id}/breakup", headers=headers)
        assert r1.status_code == 404
        r2 = await client.get(f"/api/teachers/{fake_id}/history", headers=headers)
        assert r2.status_code == 404
        r3 = await client.get(f"/api/teachers/{fake_id}/collections", headers=headers)
        assert r3.status_code == 404
