import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_health_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/health")
        assert res.status_code == 200
        assert res.json()["status"] == "healthy"

@pytest.mark.asyncio
async def test_auth_login_success():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Admin login using Employee ID
        res = await client.post("/api/auth/login", json={
            "username": "ADM001",
            "password": "Admin@1234"
        })
        assert res.status_code == 200
        data = res.json()
        assert "access_token" == "access_token" in data and data["access_token"]
        assert data["user"]["role"] == "ADMIN"
        assert data["user"]["employee_id"] == "ADM001"

@pytest.mark.asyncio
async def test_auth_login_invalid_password():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/auth/login", json={
            "username": "ADM001",
            "password": "WrongPassword999"
        })
        assert res.status_code == 401

@pytest.mark.asyncio
async def test_auth_me_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Login
        login_res = await client.post("/api/auth/login", json={
            "username": "ADM001",
            "password": "Admin@1234"
        })
        token = login_res.json()["access_token"]

        me_res = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert me_res.status_code == 200
        assert me_res.json()["employee_id"] == "ADM001"

@pytest.mark.asyncio
async def test_role_restriction():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Teacher login
        teacher_login = await client.post("/api/auth/login", json={
            "username": "TCH001",
            "password": "Teacher@1234"
        })
        t_token = teacher_login.json()["access_token"]

        # Teacher should NOT be allowed to access admin-only users list
        user_res = await client.get(
            "/api/users",
            headers={"Authorization": f"Bearer {t_token}"}
        )
        assert user_res.status_code == 403

@pytest.mark.asyncio
async def test_student_registration_without_email():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login_res = await client.post("/api/auth/login", json={
            "username": "CSH001",
            "password": "Cashier@1234"
        })
        token = login_res.json()["access_token"]

        stu_data = {
            "name": "Manish Tyagi",
            "mobile": "9998887771",
            "father_name": "Suresh Tyagi",
            "address": "Mohalla Kazi, Thakurdwara"
            # No email provided
        }
        res = await client.post(
            "/api/students",
            json=stu_data,
            headers={"Authorization": f"Bearer {token}"}
        )
        assert res.status_code == 201
        data = res.json()
        assert data["name"] == "Manish Tyagi"
        assert data["email"] is None
        assert data["student_code"].startswith("STU")

@pytest.mark.asyncio
async def test_upcoming_demo_deadlines():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login_res = await client.post("/api/auth/login", json={
            "username": "CSH001",
            "password": "Cashier@1234"
        })
        token = login_res.json()["access_token"]

        res = await client.get(
            "/api/enquiries/upcoming-deadlines",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert res.status_code == 200
        deadlines = res.json()
        assert isinstance(deadlines, list)
        assert len(deadlines) >= 1


@pytest.mark.asyncio
async def test_enquiry_creation_and_conversion():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login_res = await client.post("/api/auth/login", json={
            "username": "CSH001",
            "password": "Cashier@1234"
        })
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create Enquiry
        enq_data = {
            "student_name": "Aman Verma",
            "mobile": "9811223344",
            "purpose": "Class 10 Board prep",
            "interested_subject": "Mathematics",
            "demo_start_date": "2026-11-20",
            "demo_duration_days": 3,
            "status": "ACTIVE_DEMO"
        }
        res = await client.post("/api/enquiries", json=enq_data, headers=headers)
        assert res.status_code == 201
        enq = res.json()
        assert enq["student_name"] == "Aman Verma"
        assert enq["demo_deadline"] == "2026-11-23"

        # Convert Enquiry
        conv_res = await client.post(f"/api/enquiries/{enq['id']}/convert", headers=headers)
        assert conv_res.status_code == 200
        assert conv_res.json()["status"] == "CONVERTED"

@pytest.mark.asyncio
async def test_admission_preview_calculation():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login_res = await client.post("/api/auth/login", json={
            "username": "CSH001",
            "password": "Cashier@1234"
        })
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        payload = {
            "items": [
                {
                    "item_name_snapshot": "Mathematics",
                    "original_price": 1000.0,
                    "discount_type": "FIXED",
                    "discount_value": 100.0
                },
                {
                    "item_name_snapshot": "Physics",
                    "original_price": 1500.0,
                    "discount_type": "PERCENTAGE",
                    "discount_value": 10.0
                }
            ],
            "overall_discount_type": "FIXED",
            "overall_discount_value": 50.0,
            "gst_enabled": True,
            "gst_rate": 18.0
        }
        res = await client.post("/api/admissions/preview", json=payload, headers=headers)
        assert res.status_code == 200
        calc = res.json()
        assert calc["subtotal"] == 2500.0
        assert calc["individual_discount_total"] == 250.0 # 100 + 150
        assert calc["overall_discount_amount"] == 50.0
        assert calc["total_discount"] == 300.0
        assert calc["total_payable"] == 2200.0
        # Inclusive GST check
        assert round(calc["taxable_base"] + calc["gst_amount"], 2) == 2200.0

@pytest.mark.asyncio
async def test_multi_batch_admission_and_payment():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Cashier login
        login_res = await client.post("/api/auth/login", json={
            "username": "CSH001",
            "password": "Cashier@1234"
        })
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Register student
        stu_res = await client.post("/api/students", json={
            "name": "Pooja Gupta",
            "mobile": "9711223344"
        }, headers=headers)
        assert stu_res.status_code == 201
        student = stu_res.json()

        # 2. Get active batches
        b_res = await client.get("/api/batches/all", headers=headers)
        batches = b_res.json()
        assert len(batches) >= 1
        batch1 = batches[0]
        sub1 = batch1["subjects"][0]

        # 3. Create Multi-item admission with partial payment
        adm_payload = {
            "student_id": student["id"],
            "admission_date": "2026-11-20",
            "items": [
                {
                    "item_type": "BATCH_SUBJECT",
                    "batch_id": batch1["id"],
                    "subject_id": sub1["subject_id"],
                    "item_name_snapshot": f"{batch1['name']} - {sub1['subject_name']}",
                    "original_price": float(sub1["fee"]),
                    "discount_type": "NONE",
                    "discount_value": 0.0
                }
            ],
            "overall_discount_type": "NONE",
            "overall_discount_value": 0.0,
            "gst_enabled": False,
            "initial_payment": {
                "amount": 500.0,
                "payment_mode": "UPI",
                "transaction_reference": "UPI12345678",
                "notes": "Partial advance"
            }
        }
        adm_res = await client.post("/api/admissions", json=adm_payload, headers=headers)
        assert adm_res.status_code == 201
        admission = adm_res.json()
        assert admission["payment_status"] == "PARTIALLY_PAID"
        assert float(admission["amount_paid"]) == 500.0
        assert float(admission["balance_due"]) == float(sub1["fee"]) - 500.0

        # 4. Settle remaining balance with second payment
        remaining_due = admission["balance_due"]
        pay_res = await client.post("/api/payments", json={
            "admission_id": admission["id"],
            "amount": remaining_due,
            "payment_mode": "CASH",
            "notes": "Final settlement"
        }, headers=headers)
        assert pay_res.status_code == 201
        payment = pay_res.json()
        assert payment["payment_number"].startswith("PAY")

        # 5. Fetch official receipt
        receipt_res = await client.get(f"/api/payments/{payment['id']}/receipt", headers=headers)
        assert receipt_res.status_code == 200
        receipt = receipt_res.json()
        assert receipt["student_name"] == "Pooja Gupta"
        assert float(receipt["remaining_balance_due"]) == 0.0

@pytest.mark.asyncio
async def test_subject_revenue_report_and_cash_flow():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login_res = await client.post("/api/auth/login", json={
            "username": "ADM001",
            "password": "Admin@1234"
        })
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Subject revenue report
        rev_res = await client.get("/api/reports/subject-revenue", headers=headers)
        assert rev_res.status_code == 200
        rev_data = rev_res.json()
        assert "summary" in rev_data
        assert "items" in rev_data
        assert rev_data["summary"]["total_booked_all"] >= 0

        # Cash movement report
        cash_res = await client.get("/api/reports/cash-movement?year=2026", headers=headers)
        assert cash_res.status_code == 200
        cash_data = cash_res.json()
        assert "monthly_breakdown" in cash_data
        assert len(cash_data["monthly_breakdown"]) == 12

@pytest.mark.asyncio
async def test_teacher_dashboard_access():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login_res = await client.post("/api/auth/login", json={
            "username": "TCH001",
            "password": "Teacher@1234"
        })
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Teacher can access their own dashboard
        dash_res = await client.get("/api/dashboard/teacher", headers=headers)
        assert dash_res.status_code == 200
        dash = dash_res.json()
        assert "batches" in dash
        assert dash["teacher_name"] == "K.K. Chauhan"

@pytest.mark.asyncio
async def test_batch_creation_with_teacher_snapshot():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Admin login
        admin_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        token = admin_login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Get teachers
        t_res = await client.get("/api/teachers", headers=headers)
        teacher = t_res.json()["items"][0]

        # Get subjects
        s_res = await client.get("/api/subjects/all", headers=headers)
        subject = s_res.json()[0]

        # Create Batch
        payload = {
            "name": "NEET Crash Course 2026",
            "teacher_id": teacher["id"],
            "class_category": "Class 12+",
            "hall_number": "Hall 5",
            "schedule": "Daily 5PM - 8PM",
            "start_date": "2026-12-01",
            "status": "ACTIVE",
            "subjects": [
                {
                    "subject_id": subject["id"],
                    "fee": 4500.0
                }
            ]
        }
        res = await client.post("/api/batches", json=payload, headers=headers)
        assert res.status_code == 201
        batch = res.json()
        assert batch["name"] == "NEET Crash Course 2026"
        assert batch["teacher_name_snapshot"] == teacher["name"]
        assert batch["teacher_mobile_snapshot"] == teacher["mobile"]
        assert len(batch["subjects"]) == 1

@pytest.mark.asyncio
async def test_green_card_product_and_admission():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cashier_login = await client.post("/api/auth/login", json={"username": "CSH001", "password": "Cashier@1234"})
        token = cashier_login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Register student
        s_res = await client.post("/api/students", json={"name": "Rohit Verma", "mobile": "9812345678"}, headers=headers)
        student = s_res.json()

        # 2. Get Green Card active product
        gc_res = await client.get("/api/green-card/active", headers=headers)
        gc_product = gc_res.json()
        assert gc_product is not None
        assert float(gc_product["price"]) > 0

        # 3. Create Admission for Green Card with discount
        adm_res = await client.post("/api/admissions", json={
            "student_id": student["id"],
            "admission_date": "2026-11-20",
            "items": [
                {
                    "item_type": "GREEN_CARD",
                    "green_card_product_id": gc_product["id"],
                    "item_name_snapshot": gc_product["name"],
                    "original_price": float(gc_product["price"]),
                    "discount_type": "FIXED",
                    "discount_value": 1000.0
                }
            ],
            "overall_discount_type": "NONE",
            "overall_discount_value": 0.0,
            "gst_enabled": False,
            "initial_payment": {
                "amount": 5000.0,
                "payment_mode": "BANK_TRANSFER",
                "transaction_reference": "NEFT12345678"
            }
        }, headers=headers)
        assert adm_res.status_code == 201
        adm = adm_res.json()
        assert float(adm["total_payable"]) == float(gc_product["price"]) - 1000.0
        assert adm["payment_status"] == "PARTIALLY_PAID"

        # 4. Verify student profile updated with green card flag
        st_profile = await client.get(f"/api/students/{student['id']}", headers=headers)
        assert st_profile.status_code == 200
        assert st_profile.json()["has_green_card"] is True

@pytest.mark.asyncio
async def test_expense_and_salary_flow():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Admin login
        admin_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        token = admin_login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create category
        cat_res = await client.post("/api/expenses/categories", json={
            "name": f"Library & Books {uuid.uuid4().hex[:6]}",
            "description": "Library acquisitions"
        }, headers=headers)
        assert cat_res.status_code == 201
        cat = cat_res.json()

        # 2. Record daily expense
        exp_res = await client.post("/api/expenses", json={
            "category_id": cat["id"],
            "title": "Purchase of NCERT Exemplar sets",
            "amount": 2200.0,
            "expense_date": "2026-11-19",
            "payment_mode": "CASH"
        }, headers=headers)
        assert exp_res.status_code == 201
        assert float(exp_res.json()["amount"]) == 2200.0

        # 3. Create monthly salary record
        sal_res = await client.post("/api/expenses/salaries", json={
            "employee_id": str(uuid.uuid4()),
            "employee_type": "STAFF",
            "employee_name_snapshot": "Ramesh Chandra (Lab Assistant)",
            "month_year": "2026-11",
            "salary_amount": 14000.0,
            "due_date": "2026-12-05"
        }, headers=headers)
        assert sal_res.status_code == 201
        sal = sal_res.json()
        assert sal["status"] == "PENDING"

        # 4. Pay salary partially
        pay_res = await client.post(f"/api/expenses/salaries/{sal['id']}/pay", json={
            "paid_amount": 7000.0,
            "payment_date": "2026-11-20",
            "payment_mode": "BANK_TRANSFER",
            "notes": "50% mid-month advance"
        }, headers=headers)
        assert pay_res.status_code == 200
        assert pay_res.json()["status"] == "PARTIALLY_PAID"

@pytest.mark.asyncio
async def test_teacher_revenue_report_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        admin_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        token = admin_login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        res = await client.get("/api/reports/teacher-revenue", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert "teacher_name" in data[0]
        assert "total_booked" in data[0]

@pytest.mark.asyncio
async def test_storage_abstraction_providers():
    from app.storage.base import get_storage_provider
    from app.storage.local import LocalStorageProvider
    from app.storage.cloudinary import CloudinaryStorageProvider
    from app.storage.oracle import OracleObjectStorageProvider

    # Default provider is local
    provider = get_storage_provider()
    assert isinstance(provider, LocalStorageProvider)

    # Test upload and delete on local provider
    sample_bytes = b"fake-image-bytes-thakurdwara"
    key, url = await provider.upload(sample_bytes, "student_photo.jpg", folder="test_students")
    assert key.startswith("test_students/")
    assert url.startswith("/api/v1/uploads/")
    assert provider.get_url(key) == url

    # Delete
    deleted = await provider.delete(key)
    assert deleted is True

    # Cloudinary & Oracle providers instantiate cleanly
    c_provider = CloudinaryStorageProvider()
    o_provider = OracleObjectStorageProvider()
    assert c_provider is not None
    assert o_provider is not None
