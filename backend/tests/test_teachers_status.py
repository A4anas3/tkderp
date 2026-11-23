import uuid
import json
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
async def test_teacher_status_and_audit(admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Create a new teacher (should default to ACTIVE)
        suffix = uuid.uuid4().hex[:6]
        mobile = f"98{uuid.uuid4().int % 100000000:08d}"
        create_res = await client.post("/api/teachers", headers=headers, json={
            "name": f"Teacher Status Test {suffix}",
            "mobile": mobile,
            "qualification": "M.Sc Physics",
            "specialization": "Physics Faculty",
            "joining_date": "2026-01-01"
        })
        assert create_res.status_code == 201
        tch = create_res.json()
        tch_id = tch["id"]
        assert tch["status"] == "ACTIVE"

        # 2. Test status filter in list
        list_active = await client.get("/api/teachers?status=ACTIVE&search=Status+Test", headers=headers)
        assert list_active.status_code == 200
        active_ids = [t["id"] for t in list_active.json()["items"]]
        assert tch_id in active_ids

        # 3. Create a subject with this active teacher (should succeed)
        sub_code = f"TCH-{suffix[:4].upper()}"
        sub_res = await client.post("/api/subjects", headers=headers, json={
            "subject_code": sub_code,
            "name": f"Physics Course {suffix}",
            "default_fee": 1200.0,
            "teacher_id": tch_id,
            "hall_number": "Hall 10"
        })
        assert sub_res.status_code == 201
        sub_id = sub_res.json()["id"]

        # 4. Toggle teacher status to INACTIVE via PATCH /api/teachers/{teacher_id}/status
        toggle_res = await client.patch(f"/api/teachers/{tch_id}/status", headers=headers, json={
            "status": "INACTIVE",
            "reason": "On sabbatical leave"
        })
        assert toggle_res.status_code == 200
        assert toggle_res.json()["status"] == "INACTIVE"

        # Verify teacher is now INACTIVE in GET /{teacher_id}
        get_res = await client.get(f"/api/teachers/{tch_id}", headers=headers)
        assert get_res.status_code == 200
        assert get_res.json()["status"] == "INACTIVE"

        # 5. Check AuditLog entry created for status change
        audit_res = await client.get(f"/api/audit?entity_type=TEACHER&action=TEACHER_STATUS_UPDATED", headers=headers)
        assert audit_res.status_code == 200
        audit_items = audit_res.json()["items"]
        matching_audit = [a for a in audit_items if a["entity_id"] == tch_id]
        assert len(matching_audit) > 0
        details = json.loads(matching_audit[0]["details"])
        assert details["old_status"] == "ACTIVE"
        assert details["new_status"] == "INACTIVE"
        assert details["teacher_code"] == tch["teacher_code"]

        # 6. Verify filter behavior:
        # Active list should NOT contain this teacher
        list_active_after = await client.get("/api/teachers?status=ACTIVE&search=Status+Test", headers=headers)
        assert tch_id not in [t["id"] for t in list_active_after.json()["items"]]

        # Inactive list SHOULD contain this teacher
        list_inactive = await client.get("/api/teachers?status=INACTIVE&search=Status+Test", headers=headers)
        assert tch_id in [t["id"] for t in list_inactive.json()["items"]]

        # status_filter parameter should also work identically
        list_inactive_sf = await client.get("/api/teachers?status_filter=INACTIVE&search=Status+Test", headers=headers)
        assert tch_id in [t["id"] for t in list_inactive_sf.json()["items"]]

        # /api/teachers/all should NOT contain inactive teacher
        all_active = await client.get("/api/teachers/all", headers=headers)
        assert all_active.status_code == 200
        assert tch_id not in [t["id"] for t in all_active.json()]

        # 7. An Inactive teacher must NOT be assignable to a new subject
        new_sub_fail = await client.post("/api/subjects", headers=headers, json={
            "name": f"Invalid Course {suffix}",
            "default_fee": 1000.0,
            "teacher_id": tch_id,
        })
        assert new_sub_fail.status_code == 400
        assert "inactive" in new_sub_fail.json()["detail"].lower()

        # 8. An Inactive teacher must NOT be assignable to an existing subject
        sub2_res = await client.post("/api/subjects", headers=headers, json={
            "name": f"Valid Course 2 {suffix}",
            "default_fee": 1000.0,
        })
        assert sub2_res.status_code == 201
        sub2_id = sub2_res.json()["id"]

        update_sub_fail = await client.put(f"/api/subjects/{sub2_id}", headers=headers, json={
            "teacher_id": tch_id
        })
        assert update_sub_fail.status_code == 400
        assert "inactive" in update_sub_fail.json()["detail"].lower()

        # 8b. An Inactive teacher must NOT be assignable to a new admission
        stu_res = await client.post("/api/students", headers=headers, json={
            "name": f"Test Student {suffix}",
            "mobile": f"90{uuid.uuid4().int % 100000000:08d}"
        })
        assert stu_res.status_code == 201
        stu_id = stu_res.json()["id"]

        adm_fail = await client.post("/api/admissions", headers=headers, json={
            "student_id": stu_id,
            "items": [{
                "item_type": "SUBJECT",
                "subject_id": sub2_id,
                "teacher_id": tch_id,
                "item_name_snapshot": f"Valid Course 2 {suffix}",
                "fee_billed": 1000.0
            }],
            "payment": {
                "amount": 1000.0,
                "payment_mode": "CASH"
            }
        })
        assert adm_fail.status_code == 400
        assert "inactive" in adm_fail.json()["detail"].lower()

        # 9. Existing assignment of that teacher stays untouched
        sub1_check = await client.get(f"/api/subjects/{sub_id}", headers=headers)
        assert sub1_check.status_code == 200
        assert sub1_check.json()["teacher_id"] == tch_id

        # 10. Existing history and roster stay accessible
        roster_res = await client.get(f"/api/teachers/{tch_id}/roster", headers=headers)
        assert roster_res.status_code == 200

        earnings_res = await client.get(f"/api/teachers/{tch_id}/earnings", headers=headers)
        assert earnings_res.status_code == 200

        # 11. Toggle teacher back to ACTIVE
        toggle_back = await client.patch(f"/api/teachers/{tch_id}/status", headers=headers, json={
            "status": "ACTIVE",
            "reason": "Returned from leave"
        })
        assert toggle_back.status_code == 200
        assert toggle_back.json()["status"] == "ACTIVE"

        # Now can be assigned to subject
        assign_ok = await client.put(f"/api/subjects/{sub2_id}", headers=headers, json={
            "teacher_id": tch_id
        })
        assert assign_ok.status_code == 200
        assert assign_ok.json()["teacher_id"] == tch_id
