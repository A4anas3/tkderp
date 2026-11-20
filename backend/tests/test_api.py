import uuid
from datetime import date
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
        headers = {"Authorization": f"Bearer {token}"}

        # Create an active demo to ensure an upcoming deadline is present
        await client.post("/api/enquiries", json={
            "student_name": "Test Upcoming Demo Student",
            "mobile": "9876543210",
            "purpose": "Physics Test Demo",
            "interested_subject": "Physics",
            "demo_start_date": "2026-11-20",
            "demo_duration_days": 3,
            "status": "ACTIVE_DEMO"
        }, headers=headers)

        res = await client.get(
            "/api/enquiries/upcoming-deadlines",
            headers=headers
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

        # 6. Verify All Slips endpoint for this admission (Multiple slips: invoice, partial payment, 2nd payment)
        slips_res = await client.get(f"/api/admissions/{admission['id']}/slips", headers=headers)
        assert slips_res.status_code == 200
        slips_data = slips_res.json()
        assert len(slips_data["slips"]) >= 3
        slip_types = [s["slip_type"] for s in slips_data["slips"]]
        assert "ADMISSION_INVOICE" in slip_types
        assert slip_types.count("PAYMENT_RECEIPT") >= 2

        # 7. Verify unified transactions ledger endpoint with search and pagination
        txn_res = await client.get(
            f"/api/payments/transactions?student_id={student['id']}&page=1&page_size=10",
            headers=headers
        )
        assert txn_res.status_code == 200
        txn_data = txn_res.json()
        assert txn_data["total"] >= 2
        assert len(txn_data["items"]) >= 2

        # Verify search filter in transactions ledger
        search_res = await client.get(
            f"/api/payments/transactions?student_id={student['id']}&search=Final",
            headers=headers
        )
        assert search_res.status_code == 200
        assert search_res.json()["total"] == 1

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

@pytest.mark.asyncio
async def test_student_revocation_and_restoration():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        admin_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        token = admin_login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create a test student
        stu_res = await client.post("/api/students", json={
            "name": "Revoke Test Student",
            "mobile": "9811199999",
            "status": "ACTIVE"
        }, headers=headers)
        assert stu_res.status_code == 201
        student = stu_res.json()
        student_id = student["id"]
        assert student["status"] == "ACTIVE"

        # 2. Revoke student
        revoke_res = await client.post(f"/api/students/{student_id}/revoke", json={
            "reason": "Left institute voluntarily for relocation"
        }, headers=headers)
        assert revoke_res.status_code == 200
        revoked_stu = revoke_res.json()
        assert revoked_stu["status"] == "REVOKED"
        assert revoked_stu["revoke_reason"] == "Left institute voluntarily for relocation"
        assert revoked_stu["revoked_at"] is not None

        # 3. Restore student
        restore_res = await client.post(f"/api/students/{student_id}/restore", headers=headers)
        assert restore_res.status_code == 200
        restored_stu = restore_res.json()
        assert restored_stu["status"] == "ACTIVE"
        assert restored_stu["revoke_reason"] is None


@pytest.mark.asyncio
async def test_refund_and_payment_edit_flow():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        admin_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        token = admin_login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create student
        stu_res = await client.post("/api/students", json={
            "name": "Refund Flow Student",
            "mobile": "9876500001",
            "status": "ACTIVE"
        }, headers=headers)
        student_id = stu_res.json()["id"]

        # 2. Get subject
        sub_res = await client.get("/api/subjects", headers=headers)
        sub_id = sub_res.json()["items"][0]["id"]
        sub_fee = sub_res.json()["items"][0]["default_fee"]

        # 3. Create admission with initial payment
        adm_res = await client.post("/api/admissions", json={
            "student_id": student_id,
            "items": [{
                "item_type": "BATCH_SUBJECT",
                "subject_id": sub_id,
                "item_name_snapshot": "Mathematics Advanced",
                "original_price": 5000.0,
                "discount_type": "NONE",
                "discount_value": 0,
                "teacher_name_snapshot": "Dr. R.K. Sharma",
                "hall_number_snapshot": "Hall 4B"
            }],
            "overall_discount_type": "NONE",
            "overall_discount_value": 0,
            "initial_payment": {
                "amount": 2000.0,
                "payment_mode": "CASH",
                "notes": "Initial deposit"
            }
        }, headers=headers)
        assert adm_res.status_code == 201
        adm_data = adm_res.json()
        adm_id = adm_data["id"]
        assert float(adm_data["amount_paid"]) == 2000.0
        assert adm_data["items"][0]["teacher_name_snapshot"] == "Dr. R.K. Sharma"
        assert adm_data["items"][0]["hall_number_snapshot"] == "Hall 4B"

        # 4. Fetch the payment record
        pay_res = await client.get(f"/api/payments?admission_id={adm_id}", headers=headers)
        assert pay_res.status_code == 200
        payments = pay_res.json()["items"]
        assert len(payments) == 1
        payment_id = payments[0]["id"]

        # 5. Edit payment (cashier changed notes & mode, and updated amount to 2500)
        edit_res = await client.put(f"/api/payments/{payment_id}", json={
            "amount": 2500.0,
            "payment_mode": "UPI",
            "transaction_reference": "UPI987654321",
            "notes": "Corrected cash to UPI and updated received amount",
            "edit_reason": "Receipt correction after bank credit check"
        }, headers=headers)
        assert edit_res.status_code == 200
        edited_pay = edit_res.json()
        assert float(edited_pay["amount"]) == 2500.0
        assert edited_pay["payment_mode"] == "UPI"
        assert edited_pay["transaction_reference"] == "UPI987654321"

        # Verify admission updated
        check_adm = await client.get(f"/api/admissions?student_id={student_id}", headers=headers)
        assert float(check_adm.json()["items"][0]["amount_paid"]) == 2500.0

        # 6. Issue a partial fee refund of ₹500
        ref_res = await client.post("/api/payments/refund", json={
            "admission_id": adm_id,
            "payment_id": payment_id,
            "amount": 500.0,
            "refund_mode": "CASH",
            "reason": "Class timing conflict with college exams",
            "notes": "Approved by Director"
        }, headers=headers)
        assert ref_res.status_code == 201
        ref_data = ref_res.json()
        assert float(ref_data["amount"]) == 500.0
        assert ref_data["refund_number"].startswith("REF")
        ref_id = ref_data["id"]

        # 7. Get Refund Receipt
        rec_res = await client.get(f"/api/payments/refunds/{ref_id}/receipt", headers=headers)
        assert rec_res.status_code == 200
        rec_data = rec_res.json()
        assert float(rec_data["amount"]) == 500.0
        assert float(rec_data["net_amount_paid_after_refund"]) == 2000.0

        # 8. List refunds
        list_refs = await client.get("/api/payments/refunds", headers=headers)
        assert list_refs.status_code == 200
        assert list_refs.json()["total"] >= 1

        # 9. Issue full refund with revoke_admission=True
        full_ref_res = await client.post("/api/payments/refund", json={
            "admission_id": adm_id,
            "amount": 2000.0,
            "refund_mode": "CASH",
            "reason": "Student dropped course permanently",
            "revoke_admission": True
        }, headers=headers)
        assert full_ref_res.status_code == 201
        full_ref_data = full_ref_res.json()
        assert full_ref_data["revoked"] is True
        assert full_ref_data["admission_status"] == "REVOKED"

        # Verify admission status is revoked and balance due is 0
        adm_check = await client.get(f"/api/admissions/{adm_id}", headers=headers)
        assert adm_check.status_code == 200
        assert adm_check.json()["status"] == "REVOKED"
        assert float(adm_check.json()["balance_due"]) == 0.0


@pytest.mark.asyncio
async def test_date_range_reports():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        admin_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        token = admin_login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        today_str = date.today().isoformat()
        # Subject revenue with date range
        s_res = await client.get(f"/api/reports/subject-revenue?from_date={today_str}&to_date={today_str}", headers=headers)
        assert s_res.status_code == 200
        s_data = s_res.json()
        assert "summary" in s_data
        assert s_data["filters"]["from_date"] == today_str

        # Cash movement with date range
        c_res = await client.get(f"/api/reports/cash-movement?from_date={today_str}&to_date={today_str}", headers=headers)
        assert c_res.status_code == 200
        c_data = c_res.json()
        assert "total_inflows" in c_data
        assert "total_refunds" in c_data
        assert "breakdown" in c_data

@pytest.mark.asyncio
async def test_batch_purchase_revocation_and_restoration():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        admin_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        token = admin_login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create a student
        stu_res = await client.post("/api/students", json={
            "name": "Batch Revoke Test Student",
            "mobile": "9812300000",
            "status": "ACTIVE"
        }, headers=headers)
        student_id = stu_res.json()["id"]

        # 2. Get subject
        sub_res = await client.get("/api/subjects", headers=headers)
        sub_id = sub_res.json()["items"][0]["id"]

        # 3. Create a course purchase / admission for this batch
        adm_res = await client.post("/api/admissions", json={
            "student_id": student_id,
            "items": [{
                "item_type": "BATCH_SUBJECT",
                "subject_id": sub_id,
                "item_name_snapshot": "Physics Batch Revoke Test",
                "original_price": 4000.0,
                "discount_type": "NONE",
                "discount_value": 0,
            }],
            "initial_payment": {
                "amount": 1000.0,
                "payment_mode": "CASH",
                "notes": "Initial batch deposit"
            }
        }, headers=headers)
        assert adm_res.status_code == 201
        adm_data = adm_res.json()
        adm_id = adm_data["id"]
        assert adm_data["status"] == "ACTIVE"
        assert float(adm_data["balance_due"]) == 3000.0

        # Check student profile totals
        st_profile_before = await client.get(f"/api/students/{student_id}", headers=headers)
        assert float(st_profile_before.json()["total_balance_due"]) == 3000.0

        # 4. Revoke this specific batch purchase (e.g. student takes back this batch with partial refund of 500)
        revoke_res = await client.post(f"/api/admissions/{adm_id}/revoke", json={
            "reason": "Student taking back this batch due to school timetable clash",
            "refund_amount": 500.0,
            "refund_mode": "CASH"
        }, headers=headers)
        assert revoke_res.status_code == 200
        revoked_adm = revoke_res.json()
        assert revoked_adm["status"] == "REVOKED"
        assert revoked_adm["revocation_reason"] == "Student taking back this batch due to school timetable clash"
        assert float(revoked_adm["balance_due"]) == 0.0
        assert float(revoked_adm["amount_paid"]) == 500.0

        # Check student profile totals now - revoked batch is excluded from active due!
        st_profile_after = await client.get(f"/api/students/{student_id}", headers=headers)
        assert float(st_profile_after.json()["total_balance_due"]) == 0.0

        # 5. Restore the batch purchase
        restore_res = await client.post(f"/api/admissions/{adm_id}/restore", headers=headers)
        assert restore_res.status_code == 200
        restored_adm = restore_res.json()
        assert restored_adm["status"] == "ACTIVE"
        assert restored_adm["revocation_reason"] is None
        assert float(restored_adm["balance_due"]) == 3500.0  # 4000 total - 500 retained paid = 3500 due
        assert float(restored_adm["amount_paid"]) == 500.0
        assert float(restored_adm["items"][0]["amount_collected"]) == 500.0
        assert float(restored_adm["items"][0]["balance_due"]) == 3500.0

@pytest.mark.asyncio
async def test_student_photo_compression_and_last_batch_period():
    from PIL import Image
    import io
    import os
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        admin_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        token = admin_login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Test standalone photo compression (under 20 KB)
        noise_bytes = os.urandom(300 * 300 * 3)
        large_img = Image.frombytes("RGB", (300, 300), noise_bytes)
        buf = io.BytesIO()
        large_img.save(buf, format="JPEG", quality=95)
        raw_img_bytes = buf.getvalue()
        assert len(raw_img_bytes) > 20480  # original is bigger than 20 KB

        upload_res = await client.post(
            "/api/students/upload-photo",
            files={"file": ("test_avatar.jpg", raw_img_bytes, "image/jpeg")},
            headers=headers
        )
        assert upload_res.status_code == 200
        u_data = upload_res.json()
        assert u_data["size_kb"] <= 20.0
        assert u_data["photo_url"].startswith("/uploads/students/")

        # 2. Create student and attach photo
        stu_res = await client.post("/api/students", json={
            "name": "Photo Test Student",
            "mobile": "9812344444",
            "photo_url": u_data["photo_url"],
            "status": "ACTIVE"
        }, headers=headers)
        assert stu_res.status_code == 201
        student = stu_res.json()
        student_id = student["id"]
        assert student["photo_url"] == u_data["photo_url"]

        # 3. Test direct student photo upload endpoint
        attach_res = await client.post(
            f"/api/students/{student_id}/photo",
            files={"file": ("profile.jpg", raw_img_bytes, "image/jpeg")},
            headers=headers
        )
        assert attach_res.status_code == 200
        updated_stu = attach_res.json()
        assert updated_stu["photo_url"].startswith("/uploads/students/stu_")

        # 4. Enroll student in a batch with date-to-date validity (2026-11-01 to 2026-11-30)
        subj_res = await client.post("/api/subjects", json={"name": "Photo Test Physics", "code": "PTP99", "standard_fee": 1500.0}, headers=headers)
        subj_id = subj_res.json()["id"]
        batch_res = await client.post("/api/batches", json={
            "name": "Nov Photo Batch",
            "hall_number": "Hall 1",
            "subjects": [{"subject_id": subj_id, "fee": 1500.0}]
        }, headers=headers)
        assert batch_res.status_code == 201
        batch_id = batch_res.json()["id"]

        adm_res = await client.post("/api/admissions", json={
            "student_id": student_id,
            "admission_date": "2026-11-01",
            "valid_from": "2026-11-01",
            "valid_to": "2026-11-30",
            "items": [{
                "item_type": "BATCH_SUBJECT",
                "batch_id": batch_id,
                "subject_id": subj_id,
                "item_name_snapshot": "Nov Photo Batch - Physics",
                "original_price": 1500.0,
                "valid_from": "2026-11-01",
                "valid_to": "2026-11-30"
            }]
        }, headers=headers)
        assert adm_res.status_code == 201
        adm_data = adm_res.json()
        assert adm_data["valid_from"] == "2026-11-01"
        assert adm_data["valid_to"] == "2026-11-30"
        assert adm_data["items"][0]["valid_from"] == "2026-11-01"
        assert adm_data["items"][0]["valid_to"] == "2026-11-30"

        # 5. Query last batch period suggestion for next month
        period_res = await client.get(
            f"/api/students/{student_id}/last-batch-period?batch_id={batch_id}",
            headers=headers
        )
        assert period_res.status_code == 200
        p_data = period_res.json()
        assert p_data["has_previous"] is True
        assert p_data["last_end_date"] == "2026-11-30"
        # Suggested start is next day (2026-12-01)
        assert p_data["suggested_start_date"] == "2026-12-01"
        # Suggested end is 30 days later (2026-12-31)
        assert p_data["suggested_end_date"] == "2026-12-31"


@pytest.mark.asyncio
async def test_comprehensive_backend_role_checks():
    """
    Validates backend role-based access control (RBAC):
    - Cashier CANNOT perform admin actions (student revoke, batch revoke, fee refund, payment edit, revenue reports).
    - Teacher CANNOT record payments, enroll students, or access admin analytics.
    - Admin has full authorization across all endpoints.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Log in as Cashier
        c_login = await client.post("/api/auth/login", json={"username": "CSH001", "password": "Cashier@1234"})
        assert c_login.status_code == 200
        c_token = c_login.json()["access_token"]
        c_headers = {"Authorization": f"Bearer {c_token}"}

        # 2. Log in as Teacher
        t_login = await client.post("/api/auth/login", json={"username": "TCH001", "password": "Teacher@1234"})
        assert t_login.status_code == 200
        t_token = t_login.json()["access_token"]
        t_headers = {"Authorization": f"Bearer {t_token}"}

        # 3. Log in as Admin
        a_login = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert a_login.status_code == 200
        a_token = a_login.json()["access_token"]
        a_headers = {"Authorization": f"Bearer {a_token}"}

        dummy_uuid = str(uuid.uuid4())

        # Cashier Tests:
        # A) Cashier cannot access Admin Dashboard
        res = await client.get("/api/dashboard/admin", headers=c_headers)
        assert res.status_code == 403
        assert "Required roles: ADMIN" in res.json()["detail"]

        # B) Cashier can access Cashier Dashboard
        res = await client.get("/api/dashboard/cashier", headers=c_headers)
        assert res.status_code == 200

        # C) Cashier cannot access Subject Revenue Report
        res = await client.get("/api/reports/subject-revenue", headers=c_headers)
        assert res.status_code == 403
        assert "Required roles: ADMIN" in res.json()["detail"]

        # D) Cashier cannot access Cash Movement Report
        res = await client.get("/api/reports/cash-movement", headers=c_headers)
        assert res.status_code == 403
        assert "Required roles: ADMIN" in res.json()["detail"]

        # E) Cashier cannot revoke student
        res = await client.post(f"/api/students/{dummy_uuid}/revoke", json={"reason": "Test"}, headers=c_headers)
        assert res.status_code == 403
        assert "Required roles: ADMIN" in res.json()["detail"]

        # F) Cashier cannot restore student
        res = await client.post(f"/api/students/{dummy_uuid}/restore", headers=c_headers)
        assert res.status_code == 403
        assert "Required roles: ADMIN" in res.json()["detail"]

        # G) Cashier cannot revoke batch purchase
        res = await client.post(f"/api/admissions/{dummy_uuid}/revoke", json={"reason": "Test"}, headers=c_headers)
        assert res.status_code == 403
        assert "Required roles: ADMIN" in res.json()["detail"]

        # H) Cashier cannot restore batch purchase
        res = await client.post(f"/api/admissions/{dummy_uuid}/restore", headers=c_headers)
        assert res.status_code == 403
        assert "Required roles: ADMIN" in res.json()["detail"]

        # I) Cashier cannot process fee refund
        res = await client.post("/api/payments/refund", json={
            "admission_id": dummy_uuid,
            "amount": 500.0,
            "refund_mode": "CASH",
            "reason": "Test refund"
        }, headers=c_headers)
        assert res.status_code == 403
        assert "Required roles: ADMIN" in res.json()["detail"]

        # J) Cashier cannot edit past payment
        res = await client.put(f"/api/payments/{dummy_uuid}", json={"amount": 1000.0}, headers=c_headers)
        assert res.status_code == 403
        assert "Required roles: ADMIN" in res.json()["detail"]

        # K) Cashier cannot create batch or subject
        res = await client.post("/api/batches", json={"name": "Test"}, headers=c_headers)
        assert res.status_code == 403
        res = await client.post("/api/subjects", json={"name": "Test", "default_fee": 100}, headers=c_headers)
        assert res.status_code == 403

        # Teacher Tests:
        # A) Teacher cannot record payments
        res = await client.post("/api/payments", json={
            "admission_id": dummy_uuid,
            "amount": 500.0,
            "payment_mode": "CASH"
        }, headers=t_headers)
        assert res.status_code == 403
        assert "Required roles: ADMIN, CASHIER" in res.json()["detail"]

        # B) Teacher cannot create admissions
        res = await client.post("/api/admissions", json={
            "student_id": dummy_uuid,
            "items": []
        }, headers=t_headers)
        assert res.status_code == 403

        # C) Teacher can access Teacher Dashboard
        res = await client.get("/api/dashboard/teacher", headers=t_headers)
        assert res.status_code == 200

        # Admin Tests:
        # Admin can access revenue reports and dashboards
        res = await client.get("/api/reports/subject-revenue", headers=a_headers)
        assert res.status_code == 200
        res = await client.get("/api/dashboard/admin", headers=a_headers)
        assert res.status_code == 200


@pytest.mark.asyncio
async def test_student_edit_and_rolling_cycle_rosters():
    """
    Tests:
    1. Student information editing (Name, Mobile, Father Name, Notes, Registration Date).
    2. Subject revenue report returns students with date-to-date rolling cycle details and cycle status.
    3. Teacher revenue report returns students with date-to-date rolling cycle details.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Admin login
        login_res = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create a test student
        unique_suffix = str(uuid.uuid4())[:6]
        create_res = await client.post("/api/students", json={
            "name": f"Rolling Cycle Student {unique_suffix}",
            "mobile": f"98{str(uuid.uuid4().int)[:8]}",
            "father_name": "Test Father",
            "email": f"rolling_{unique_suffix}@example.com",
            "address": "123 Test Street",
            "dob": "2008-05-15",
            "registration_date": "2026-11-14",
            "notes": "Initial enrollment notes"
        }, headers=headers)
        assert create_res.status_code == 201
        student = create_res.json()
        student_id = student["id"]

        # 2. Edit Student Information including registration_date
        update_res = await client.put(f"/api/students/{student_id}", json={
            "name": f"Updated Cycle Student {unique_suffix}",
            "father_name": "Updated Father",
            "mobile": "9812345678",
            "email": f"updated_{unique_suffix}@example.com",
            "address": "456 Updated Address",
            "dob": "2008-05-15",
            "registration_date": "2026-11-14",
            "notes": "Updated notes"
        }, headers=headers)
        assert update_res.status_code == 200
        updated = update_res.json()
        assert updated["name"] == f"Updated Cycle Student {unique_suffix}"
        assert updated["father_name"] == "Updated Father"
        assert updated["registration_date"] == "2026-11-14"

        # 3. Create Subject & Teacher & Admission with custom rolling cycle dates (14 Nov to 13 Dec)
        t_res = await client.post("/api/teachers", json={
            "name": f"Prof. Verma {unique_suffix}",
            "mobile": f"97{str(uuid.uuid4().int)[:8]}",
            "specialization": "Physics"
        }, headers=headers)
        teacher_id = t_res.json()["id"]

        s_res = await client.post("/api/subjects", json={
            "name": f"Rolling Physics {unique_suffix}",
            "subject_code": f"RPHY_{unique_suffix}".upper(),
            "default_fee": 3000.0,
            "teacher_id": teacher_id,
            "hall_number": "Hall 105"
        }, headers=headers)
        subject_id = s_res.json()["id"]

        # Create admission with cycle 14 Nov 2026 -> 13 Dec 2026
        adm_res = await client.post("/api/admissions", json={
            "student_id": student_id,
            "admission_date": "2026-11-14",
            "valid_from": "2026-11-14",
            "valid_to": "2026-12-13",
            "items": [{
                "item_type": "BATCH_SUBJECT",
                "subject_id": subject_id,
                "teacher_id": teacher_id,
                "item_name_snapshot": f"Rolling Physics {unique_suffix}",
                "original_price": 3000.0,
                "valid_from": "2026-11-14",
                "valid_to": "2026-12-13"
            }]
        }, headers=headers)
        assert adm_res.status_code == 201

        # 4. Check Subject Revenue Report
        sub_rep_res = await client.get("/api/reports/subject-revenue", headers=headers)
        assert sub_rep_res.status_code == 200
        sub_rep = sub_rep_res.json()
        found_sub = next((s for s in sub_rep["items"] if s["subject_id"] == subject_id), None)
        assert found_sub is not None
        assert found_sub["enrolled_count"] >= 1
        assert len(found_sub["students"]) >= 1
        stu_entry = next((s for s in found_sub["students"] if s["student_id"] == student_id), None)
        assert stu_entry is not None
        assert stu_entry["billing_day"] == 14
        assert stu_entry["valid_from"] == "2026-11-14"
        assert stu_entry["valid_to"] == "2026-12-13"
        assert "14 Nov 2026" in stu_entry["cycle_label"]
        assert stu_entry["cycle_status"] in ["ACTIVE", "DUE_SOON", "OVERDUE", "UPCOMING", "RENEWAL_DUE"]

        # 5. Check Teacher Revenue Report
        tch_rep_res = await client.get("/api/reports/teacher-revenue", headers=headers)
        assert tch_rep_res.status_code == 200
        tch_rep = tch_rep_res.json()
        found_tch = next((t for t in tch_rep if t["teacher_id"] == teacher_id), None)
        assert found_tch is not None
        assert found_tch["enrolled_count"] >= 1
        assert len(found_tch["students"]) >= 1
        t_stu_entry = next((s for s in found_tch["students"] if s["student_id"] == student_id), None)
        assert t_stu_entry is not None
        assert t_stu_entry["billing_day"] == 14
        assert t_stu_entry["valid_from"] == "2026-11-14"
        assert t_stu_entry["valid_to"] == "2026-12-13"

@pytest.mark.asyncio
async def test_10_digit_numeric_mobile_validation():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Admin login
        login_res = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        unique_digits = str(uuid.uuid4().int)[:6]
        # 1. Valid 10-digit mobile
        res1 = await client.post("/api/students", json={
            "name": "Mobile Ten Digit Student",
            "mobile": f"9876{unique_digits}"
        }, headers=headers)
        assert res1.status_code == 201
        assert res1.json()["mobile"] == f"9876{unique_digits}"

        # 2. Leading 0 normalizes to 10 digits
        res2 = await client.post("/api/students", json={
            "name": "Mobile Zero Prefix Student",
            "mobile": f"09875{unique_digits}"
        }, headers=headers)
        assert res2.status_code == 201
        assert res2.json()["mobile"] == f"9875{unique_digits}"

        # 3. Leading +91 normalizes to 10 digits
        res3 = await client.post("/api/students", json={
            "name": "Mobile Country Code Student",
            "mobile": f"+919874{unique_digits}"
        }, headers=headers)
        assert res3.status_code == 201
        assert res3.json()["mobile"] == f"9874{unique_digits}"

        # 4. Invalid mobile (< 10 digits) fails
        res_invalid_short = await client.post("/api/students", json={
            "name": "Short Mobile Student",
            "mobile": "98765"
        }, headers=headers)
        assert res_invalid_short.status_code in [400, 422]

        # 5. Invalid mobile (alphanumeric / letters) fails
        res_invalid_alpha = await client.post("/api/students", json={
            "name": "Alpha Mobile Student",
            "mobile": "98765ABCDE"
        }, headers=headers)
        assert res_invalid_alpha.status_code in [400, 422]

        # 6. Invalid mobile (> 10 digits not prefixed by 0 or 91) fails
        res_invalid_long = await client.post("/api/students", json={
            "name": "Long Mobile Student",
            "mobile": "1234567890123"
        }, headers=headers)
        assert res_invalid_long.status_code in [400, 422]

        # 7. Check-mobile endpoint verifies 10-digit requirement
        chk_short = await client.get("/api/students/check-mobile/12345", headers=headers)
        assert chk_short.status_code == 200
        assert chk_short.json()["valid"] is False

        chk_valid = await client.get(f"/api/students/check-mobile/9876{unique_digits}", headers=headers)
        assert chk_valid.status_code == 200
        assert chk_valid.json()["valid"] is True
        assert chk_valid.json()["exists"] is True

        # 8. Enquiry invalid mobile fails
        enq_invalid = await client.post("/api/enquiries", json={
            "student_name": "Invalid Enq Student",
            "mobile": "12345",
            "interested_subject": "Math"
        }, headers=headers)
        assert enq_invalid.status_code in [400, 422]

        # 9. Teacher invalid mobile fails
        tch_invalid = await client.post("/api/teachers", json={
            "name": "Invalid Phone Teacher",
            "mobile": "9876",
            "qualification": "B.Sc"
        }, headers=headers)
        assert tch_invalid.status_code in [400, 422]


@pytest.mark.asyncio
async def test_subject_lifecycle_and_renewal_flow():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Login as Admin
        admin_login = await client.post("/api/auth/login", json={
            "username": "ADM001",
            "password": "Admin@1234"
        })
        assert admin_login.status_code == 200
        headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        # 2. Create student
        suffix = uuid.uuid4().hex[:6]
        stu_res = await client.post("/api/students", json={
            "name": f"Lifecycle Student {suffix}",
            "mobile": f"9876{uuid.uuid4().int % 1000000:06d}",
            "father_name": "Test Father"
        }, headers=headers)
        assert stu_res.status_code == 201
        student = stu_res.json()
        student_id = student["id"]

        # 3. Create subject
        sub_res = await client.post("/api/subjects", json={
            "name": f"Lifecycle Physics {suffix}",
            "code": f"LP{suffix[:4].upper()}",
            "default_fee": 2000.00
        }, headers=headers)
        assert sub_res.status_code == 201
        subject = sub_res.json()
        subject_id = subject["id"]

        # 4. Enroll student in the subject
        today = date.today()
        from datetime import timedelta
        end_date = today + timedelta(days=30)
        adm_res = await client.post("/api/admissions", json={
            "student_id": student_id,
            "admission_date": today.isoformat(),
            "items": [
                {
                    "item_type": "SUBJECT",
                    "subject_id": subject_id,
                    "item_name_snapshot": subject["name"],
                    "original_price": 2000.00,
                    "valid_from": today.isoformat(),
                    "valid_to": end_date.isoformat()
                }
            ]
        }, headers=headers)
        assert adm_res.status_code == 201
        adm_data = adm_res.json()
        assert len(adm_data["items"]) == 1
        item_id = adm_data["items"][0]["id"]

        # 5. Check active enrollment endpoint
        enr_res = await client.get(f"/api/students/{student_id}/active-enrollment", headers=headers)
        assert enr_res.status_code == 200
        enr_data = enr_res.json()
        assert enr_data["is_student_active"] is True
        assert enr_data["enrollment_number"].startswith("ENR-")
        assert len(enr_data["active_subjects"]) == 1
        assert len(enr_data["historical_subjects"]) == 0
        assert enr_data["active_totals"]["total_fee"] == 2000.00

        # 6. Test item-level validity adjustment
        new_end = today + timedelta(days=45)
        val_res = await client.patch(f"/api/admissions/items/{item_id}/validity", json={
            "valid_to": new_end.isoformat(),
            "notes": "Medical extension"
        }, headers=headers)
        assert val_res.status_code == 200
        assert val_res.json()["valid_to"] == new_end.isoformat()

        # 7. Test item-level suspension
        sus_res = await client.post(f"/api/admissions/items/{item_id}/suspend", json={
            "action": "SUSPEND",
            "reason": "Student traveling"
        }, headers=headers)
        assert sus_res.status_code == 200
        assert sus_res.json()["status"] == "SUSPENDED"

        # Check active enrollment after suspension: subject moved to history
        enr_sus = await client.get(f"/api/students/{student_id}/active-enrollment", headers=headers)
        assert enr_sus.status_code == 200
        assert enr_sus.json()["is_student_active"] is False
        assert len(enr_sus.json()["active_subjects"]) == 0
        assert len(enr_sus.json()["historical_subjects"]) == 1
        assert enr_sus.json()["historical_subjects"][0]["status"] == "SUSPENDED"

        # 8. Test item-level resume
        res_res = await client.post(f"/api/admissions/items/{item_id}/resume", headers=headers)
        assert res_res.status_code == 200
        assert res_res.json()["status"] == "ACTIVE"

        enr_resumed = await client.get(f"/api/students/{student_id}/active-enrollment", headers=headers)
        assert enr_resumed.json()["is_student_active"] is True
        assert len(enr_resumed.json()["active_subjects"]) == 1

        # 9. Test item-level discontinuation
        disc_res = await client.post(f"/api/admissions/items/{item_id}/discontinue", json={
            "action": "DISCONTINUE",
            "reason": "Shifted to morning timings"
        }, headers=headers)
        assert disc_res.status_code == 200
        assert disc_res.json()["status"] == "DISCONTINUED"

        enr_disc = await client.get(f"/api/students/{student_id}/active-enrollment", headers=headers)
        assert enr_disc.json()["is_student_active"] is False
        assert len(enr_disc.json()["active_subjects"]) == 0
        assert len(enr_disc.json()["historical_subjects"]) == 1

        # 10. Test subject renewal endpoint with initial payment
        ren_from = today + timedelta(days=1)
        ren_to = ren_from + timedelta(days=30)
        renew_res = await client.post("/api/admissions/renew-subject", json={
            "student_id": student_id,
            "subject_id": subject_id,
            "valid_from": ren_from.isoformat(),
            "valid_to": ren_to.isoformat(),
            "fee": 2500.00,
            "initial_payment": {
                "amount": 1500.00,
                "payment_mode": "CASH"
            },
            "notes": "Renewed for next term"
        }, headers=headers)
        assert renew_res.status_code == 201
        renew_data = renew_res.json()
        assert float(renew_data["total_payable"]) == 2500.00
        assert float(renew_data["amount_paid"]) == 1500.00
        assert float(renew_data["balance_due"]) == 1000.00
        assert renew_data["payment_status"] == "PARTIALLY_PAID"

        # 11. Final active enrollment check: 1 active renewal item, 1 historical discontinued item
        final_enr = await client.get(f"/api/students/{student_id}/active-enrollment", headers=headers)
        assert final_enr.status_code == 200
        final_data = final_enr.json()
        assert final_data["is_student_active"] is True
        assert len(final_data["active_subjects"]) == 1
        assert len(final_data["historical_subjects"]) == 1
        assert float(final_data["active_totals"]["total_fee"]) == 2500.00
        assert float(final_data["active_totals"]["total_paid"]) == 1500.00
        assert float(final_data["active_totals"]["total_due"]) == 1000.00




