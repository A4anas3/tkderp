import uuid
from datetime import date, timedelta
from decimal import Decimal
import pytest
from freezegun import freeze_time
from httpx import AsyncClient, ASGITransport
from sqlalchemy import event, select
from sqlalchemy.orm import selectinload

from app.main import app
from app.database.session import AsyncSessionLocal, engine
from app.database.models import Admission, AdmissionItem, Student
from app.services.daily_jobs import run_daily_expiration_job
from app.common.active_lines import today_kolkata, is_active_line

@pytest.mark.asyncio
async def test_freezegun_expiration_job():
    """
    Test: Freezegun at valid_to + 1 flips status from ACTIVE to EXPIRED.
    Also verifies idempotency when run twice.
    """
    async with AsyncSessionLocal() as session:
        # Create student
        st = Student(
            name="Expiry Test Student",
            student_code=f"EXP-{uuid.uuid4().hex[:6].upper()}",
            mobile=f"91{uuid.uuid4().int % 100000000:08d}",
            status="ACTIVE"
        )
        session.add(st)
        await session.flush()

        # Create admission with validity ending on 2026-01-31
        item_valid_to = date(2026, 1, 31)
        adm = Admission(
            admission_number=f"ADM-TEST-{uuid.uuid4().hex[:6].upper()}",
            student_id=st.id,
            student_name_snapshot=st.name,
            admission_date=date(2026, 1, 1),
            total_payable=Decimal("1000.00"),
            amount_paid=Decimal("0.00"),
            balance_due=Decimal("1000.00"),
            payment_status="UNPAID",
            access_status="ACTIVE",
            valid_from=date(2026, 1, 1),
            valid_to=item_valid_to
        )
        session.add(adm)
        await session.flush()

        item = AdmissionItem(
            admission=adm,
            student_id=st.id,
            item_type="BATCH_SUBJECT",
            item_name_snapshot="Mathematics",
            original_price=Decimal("1000.00"),
            net_price=Decimal("1000.00"),
            amount_collected=Decimal("0.00"),
            balance_due=Decimal("1000.00"),
            valid_from=date(2026, 1, 1),
            valid_to=item_valid_to,
            access_status="ACTIVE",
            status="ACTIVE"
        )
        session.add(item)
        await session.commit()
        item_id = item.id
        adm_id = adm.id

    # 1. Before expiry (on 2026-01-20), item should be active
    with freeze_time("2026-01-20 00:05:00"):
        async with AsyncSessionLocal() as session:
            db_item = (await session.execute(select(AdmissionItem).where(AdmissionItem.id == item_id))).scalar_one()
            assert is_active_line(db_item, date(2026, 1, 20)) is True

    # 2. Freeze time at valid_to + 1 day: 2026-02-01 00:05:00
    with freeze_time("2026-02-01 00:05:00"):
        frozen_today = date(2026, 2, 1)
        async with AsyncSessionLocal() as session:
            summary1 = await run_daily_expiration_job(session, run_date=frozen_today)
            assert summary1["expired_items_count"] >= 1
            assert summary1["expired_admissions_count"] >= 1

            # Verify in DB
            db_item = (await session.execute(select(AdmissionItem).where(AdmissionItem.id == item_id))).scalar_one()
            assert db_item.access_status == "EXPIRED"
            assert db_item.status == "EXPIRED"

            db_adm = (await session.execute(select(Admission).where(Admission.id == adm_id))).scalar_one()
            assert db_adm.access_status == "EXPIRED"

            # 3. Idempotency: run again on same date
            summary2 = await run_daily_expiration_job(session, run_date=frozen_today)
            # Item is already expired, so should not re-expire
            db_item_again = (await session.execute(select(AdmissionItem).where(AdmissionItem.id == item_id))).scalar_one()
            assert db_item_again.access_status == "EXPIRED"


@pytest.mark.asyncio
async def test_student_profile_maths_expired_gk_active():
    """
    Test: A slip with Maths expired and GK active shows the student ACTIVE with Maths in expired[] and GK in active[].
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        # Create student
        st_res = await client.post("/api/students", json={
            "name": "Maths Exp GK Act Student",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        assert st_res.status_code == 201
        st = st_res.json()
        student_id = st["id"]

        # Fetch batches/subjects
        b_res = await client.get("/api/batches/all", headers=admin_headers)
        batches = b_res.json()
        sub = batches[0]["subjects"][0]

        today = today_kolkata()
        maths_to = today - timedelta(days=2)
        gk_to = today + timedelta(days=20)

        # Create admission with 2 items: Maths expired, GK active
        adm_res = await client.post("/api/admissions", json={
            "student_id": student_id,
            "admission_date": str(today - timedelta(days=32)),
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batches[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": "Mathematics",
                    "original_price": 1000.0,
                    "discount_type": "NONE",
                    "discount_value": 0.0,
                    "valid_from": str(today - timedelta(days=32)),
                    "valid_to": str(maths_to)
                },
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batches[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": "General Knowledge",
                    "original_price": 1200.0,
                    "discount_type": "NONE",
                    "discount_value": 0.0,
                    "valid_from": str(today),
                    "valid_to": str(gk_to)
                }
            ],
            "initial_payment": 2200.0,
            "payment_mode": "CASH"
        }, headers=admin_headers)
        assert adm_res.status_code == 201

        # Fetch student profile
        profile_res = await client.get(f"/api/students/{student_id}", headers=admin_headers)
        assert profile_res.status_code == 200
        profile = profile_res.json()

        # Student status must be ACTIVE because GK is active
        assert profile["status"] == "ACTIVE"

        # Maths must be in expired[]
        expired_names = [itm["subject_name"] for itm in profile["expired"]]
        assert "Mathematics" in expired_names

        # GK must be in active[]
        active_names = [itm["subject_name"] for itm in profile["active"]]
        assert "General Knowledge" in active_names


@pytest.mark.asyncio
async def test_updating_gk_validity_does_not_change_maths():
    """
    Test: Updating GK validity does not change Maths validity.
    Admission valid_from / valid_to are derived.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        # Create student
        st_res = await client.post("/api/students", json={
            "name": "Validity Update Test Student",
            "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
        }, headers=admin_headers)
        assert st_res.status_code == 201
        st = st_res.json()

        b_res = await client.get("/api/batches/all", headers=admin_headers)
        batches = b_res.json()
        sub = batches[0]["subjects"][0]

        maths_to = date(2026, 3, 31)
        gk_to = date(2026, 4, 30)

        adm_res = await client.post("/api/admissions", json={
            "student_id": st["id"],
            "admission_date": "2026-03-01",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batches[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": "Mathematics",
                    "original_price": 1000.0,
                    "discount_type": "NONE",
                    "discount_value": 0.0,
                    "valid_from": "2026-03-01",
                    "valid_to": str(maths_to)
                },
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batches[0]["id"],
                    "subject_id": sub["subject_id"],
                    "item_name_snapshot": "General Knowledge",
                    "original_price": 1000.0,
                    "discount_type": "NONE",
                    "discount_value": 0.0,
                    "valid_from": "2026-03-01",
                    "valid_to": str(gk_to)
                }
            ]
        }, headers=admin_headers)
        assert adm_res.status_code == 201
        adm = adm_res.json()

        maths_item = next(i for i in adm["items"] if i["item_name_snapshot"] == "Mathematics")
        gk_item = next(i for i in adm["items"] if i["item_name_snapshot"] == "General Knowledge")

        new_gk_to = date(2026, 5, 31)

        # Update ONLY GK item
        patch_res = await client.patch(f"/api/admissions/{adm['id']}/validity", json={
            "item_ids": [gk_item["id"]],
            "valid_to": str(new_gk_to),
            "notes": "Extension for GK only"
        }, headers=admin_headers)
        assert patch_res.status_code == 200
        updated_adm = patch_res.json()

        updated_maths = next(i for i in updated_adm["items"] if i["id"] == maths_item["id"])
        updated_gk = next(i for i in updated_adm["items"] if i["id"] == gk_item["id"])

        # Maths valid_to MUST remain unchanged
        assert updated_maths["valid_to"] == str(maths_to)

        # GK valid_to MUST be updated
        assert updated_gk["valid_to"] == str(new_gk_to)

        # Admission boundaries derived: valid_from min = 2026-03-01, valid_to max = 2026-05-31
        assert updated_adm["valid_to"] == str(new_gk_to)


@pytest.mark.asyncio
async def test_enrollments_filter_expiring_in_5_days_constant_queries():
    """
    Test: Subject + 'expiring in 5 days' filter returns correct lines with a constant number of queries.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        adm_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert adm_login.status_code == 200
        admin_headers = {"Authorization": f"Bearer {adm_login.json()['access_token']}"}

        # Create unique subject
        sub_res = await client.post("/api/subjects", json={
            "name": f"P3 Const Query Subj {uuid.uuid4().hex[:6]}",
            "code": f"P3-{uuid.uuid4().hex[:4].upper()}",
            "default_fee": 1500.0
        }, headers=admin_headers)
        assert sub_res.status_code == 201
        test_sub = sub_res.json()
        subject_id = test_sub["id"]

        today = today_kolkata()

        # Create 3 students with lines: 2 expiring in <= 5 days, 1 expiring in 15 days
        offsets = [2, 4, 15]
        for offset in offsets:
            st_res = await client.post("/api/students", json={
                "name": f"Const Query Student {offset}",
                "mobile": f"91{uuid.uuid4().int % 100000000:08d}"
            }, headers=admin_headers)
            assert st_res.status_code == 201
            st = st_res.json()

            adm_res = await client.post("/api/admissions", json={
                "student_id": st["id"],
                "admission_date": str(today),
                "items": [
                    {
                        "item_type": "BATCH_SUBJECT",
                        "subject_id": subject_id,
                        "item_name_snapshot": test_sub["name"],
                        "original_price": 1500.0,
                        "discount_type": "NONE",
                        "discount_value": 0.0,
                        "valid_from": str(today - timedelta(days=25)),
                        "valid_to": str(today + timedelta(days=offset))
                    }
                ],
                "initial_payment": 500.0,
                "payment_mode": "CASH"
            }, headers=admin_headers)
            assert adm_res.status_code == 201

        # Track SQL queries executed during the GET /enrollments request
        queries = []
        def query_listener(conn, cursor, statement, parameters, context, executemany):
            # Ignore savepoints and internal transaction plumbing
            stmt_clean = statement.strip().upper()
            if not stmt_clean.startswith("ROLLBACK") and not stmt_clean.startswith("SAVEPOINT"):
                queries.append(statement)

        event.listen(engine.sync_engine, "before_cursor_execute", query_listener)
        try:
            enr_res = await client.get(
                f"/api/enrollments?subject_id={subject_id}&expiring_in_days=5",
                headers=admin_headers
            )
        finally:
            event.remove(engine.sync_engine, "before_cursor_execute", query_listener)

        assert enr_res.status_code == 200
        data = enr_res.json()

        # Exactly the 2 lines with offset 2 and 4 days must be returned
        assert data["total"] == 2
        assert len(data["items"]) == 2
        returned_days = {item["days_left"] for item in data["items"]}
        assert returned_days == {2, 4}

        # Verify query count is constant:
        # Auth check (1) + count (1) + paginated items (1) + payment allocations (1) = 4 queries total (O(1))
        select_queries = [q for q in queries if q.strip().upper().startswith("SELECT")]
        assert len(select_queries) <= 5, f"Expected <= 5 SELECT queries, but got {len(select_queries)}: {select_queries}"
