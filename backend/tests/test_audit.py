import uuid
from datetime import date
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


@pytest.fixture
async def cashier_token():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/auth/login", json={
            "username": "CSH001",
            "password": "Cashier@1234"
        })
        assert res.status_code == 200
        return res.json()["access_token"]


@pytest.mark.asyncio
async def test_audit_list_admin_only(admin_token, cashier_token):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Admin can list audit logs
        admin_res = await client.get(
            "/api/audit",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert admin_res.status_code == 200
        data = admin_res.json()
        assert "items" in data
        assert "total" in data
        assert isinstance(data["items"], list)

        # Cashier is forbidden from viewing full audit log
        cashier_res = await client.get(
            "/api/audit",
            headers={"Authorization": f"Bearer {cashier_token}"}
        )
        assert cashier_res.status_code == 403


@pytest.mark.asyncio
async def test_audit_filter_by_action_and_entity(admin_token):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Filter by action
        res = await client.get(
            "/api/audit?action=PAYMENT_RECORDED&page_size=5",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res.status_code == 200
        items = res.json()["items"]
        for itm in items:
            assert itm["action"] == "PAYMENT_RECORDED"

        # Filter by entity_type
        res_entity = await client.get(
            "/api/audit?entity_type=PAYMENT&page_size=5",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res_entity.status_code == 200
        for itm in res_entity.json()["items"]:
            assert itm["entity_type"] == "PAYMENT"


@pytest.mark.asyncio
async def test_audit_actions_and_entity_types(admin_token):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        act_res = await client.get(
            "/api/audit/actions",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert act_res.status_code == 200
        actions = act_res.json()
        assert isinstance(actions, list)
        assert "PAYMENT_RECORDED" in actions

        ent_res = await client.get(
            "/api/audit/entity-types",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert ent_res.status_code == 200
        entities = ent_res.json()
        assert isinstance(entities, list)
        assert "PAYMENT" in entities


@pytest.mark.asyncio
async def test_audit_stats(admin_token):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        stats_res = await client.get(
            "/api/audit/stats",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert stats_res.status_code == 200
        stats = stats_res.json()
        assert "total_events" in stats
        assert "financial_events" in stats
        assert "student_events" in stats
        assert stats["total_events"] > 0


@pytest.mark.asyncio
async def test_student_lifecycle_audit_recording(admin_token, cashier_token):
    unique_suffix = uuid.uuid4().hex[:6]
    test_mobile = f"98{uuid.uuid4().int % 100000000:08d}"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Create a student
        stu_res = await client.post(
            "/api/students",
            json={
                "name": f"Audit Test Student {unique_suffix}",
                "mobile": test_mobile,
                "father_name": "Test Father",
                "registration_date": str(date.today()),
                "status": "ACTIVE"
            },
            headers={"Authorization": f"Bearer {cashier_token}"}
        )
        assert stu_res.status_code == 201
        student = stu_res.json()
        student_id = student["id"]

        # 2. Update the student
        upd_res = await client.put(
            f"/api/students/{student_id}",
            json={"address": "123 Test Street, Thakurdwara"},
            headers={"Authorization": f"Bearer {cashier_token}"}
        )
        assert upd_res.status_code == 200

        # 3. Query per-student audit logs via /api/audit/student/{student_id}
        audit_res = await client.get(
            f"/api/audit/student/{student_id}",
            headers={"Authorization": f"Bearer {cashier_token}"}
        )
        assert audit_res.status_code == 200
        audit_data = audit_res.json()
        actions = [a["action"] for a in audit_data["items"]]
        assert "STUDENT_CREATED" in actions
        assert "STUDENT_UPDATED" in actions

        # 4. Also verify alias route /api/students/{student_id}/audit
        alias_res = await client.get(
            f"/api/students/{student_id}/audit",
            headers={"Authorization": f"Bearer {cashier_token}"}
        )
        assert alias_res.status_code == 200
        assert len(alias_res.json()["items"]) == len(audit_data["items"])

        # 5. Revoke student and check REVOKE_STUDENT audit
        rev_res = await client.post(
            f"/api/students/{student_id}/revoke",
            json={"reason": "Audit verification revocation test"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert rev_res.status_code == 200

        # Check updated student audit
        audit_after_revoke = await client.get(
            f"/api/audit/student/{student_id}",
            headers={"Authorization": f"Bearer {cashier_token}"}
        )
        assert audit_after_revoke.status_code == 200
        actions_after = [a["action"] for a in audit_after_revoke.json()["items"]]
        assert "REVOKE_STUDENT" in actions_after


@pytest.mark.asyncio
async def test_expense_audit_recording(cashier_token, admin_token):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Get category
        cat_res = await client.get("/api/expenses/categories", headers={"Authorization": f"Bearer {cashier_token}"})
        assert cat_res.status_code == 200
        categories = cat_res.json()
        assert len(categories) > 0
        cat_id = categories[0]["id"]

        unique_title = f"Audit Expense Test {uuid.uuid4().hex[:6]}"
        exp_res = await client.post(
            "/api/expenses",
            json={
                "category_id": cat_id,
                "title": unique_title,
                "amount": 450.0,
                "expense_date": str(date.today()),
                "payment_mode": "CASH",
                "notes": "Testing expense audit recording"
            },
            headers={"Authorization": f"Bearer {cashier_token}"}
        )
        assert exp_res.status_code == 201

        # Check full audit log for this expense
        audit_res = await client.get(
            f"/api/audit?action=EXPENSE_CREATED&search={unique_title}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert audit_res.status_code == 200
        items = audit_res.json()["items"]
        assert len(items) >= 1
        assert items[0]["action"] == "EXPENSE_CREATED"
        assert items[0]["entity_type"] == "EXPENSE"
