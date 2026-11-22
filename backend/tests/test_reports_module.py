import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_reports_suite_all_10_reports():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Login as Admin
        login_res = await client.post("/api/auth/login", json={
            "username": "ADM001",
            "password": "Admin@1234"
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Test Collections Report (JSON + CSV)
        res = await client.get("/api/reports/collections", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert "summary" in data
        assert "gross_collected" in data["summary"]
        assert "by_mode" in data
        assert "by_cashier" in data
        assert "transactions" in data
        csv_res = await client.get("/api/reports/collections?format=csv", headers=headers)
        assert csv_res.status_code == 200
        assert "text/csv" in csv_res.headers.get("content-type", "")
        assert "Payment Number" in csv_res.text

        # 3. Test Dues & Ageing Report (JSON + CSV)
        res = await client.get("/api/reports/dues-ageing", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert "summary" in data
        assert "total_due" in data["summary"]
        assert "buckets" in data["summary"]
        assert "0-30" in data["summary"]["buckets"]
        assert "90+" in data["summary"]["buckets"]
        assert "items" in data
        csv_res = await client.get("/api/reports/dues-ageing?format=csv", headers=headers)
        assert csv_res.status_code == 200
        assert "text/csv" in csv_res.headers.get("content-type", "")
        assert "Student Name" in csv_res.text

        # 4. Test Subject-wise Breakup (JSON + CSV)
        res = await client.get("/api/reports/subject-breakup", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert "items" in data
        assert "summary" in data
        assert "total_booked_all" in data["summary"]
        assert "total_collected_all" in data["summary"]
        assert "total_balance_all" in data["summary"]
        csv_res = await client.get("/api/reports/subject-breakup?format=csv", headers=headers)
        assert csv_res.status_code == 200
        assert "text/csv" in csv_res.headers.get("content-type", "")
        assert "Subject Name" in csv_res.text

        # 5. Test Teacher-wise Breakup (JSON + CSV)
        res = await client.get("/api/reports/teacher-breakup", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert len(data) > 0
        assert "teacher_name" in data[0]
        assert "collections" in data[0]
        csv_res = await client.get("/api/reports/teacher-breakup?format=csv", headers=headers)
        assert csv_res.status_code == 200
        assert "text/csv" in csv_res.headers.get("content-type", "")
        assert "Teacher Name" in csv_res.text

        # 6. Test Batch-wise Report (JSON + CSV)
        res = await client.get("/api/reports/batch-breakup", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert len(data) > 0
        assert "batch_name" in data[0]
        assert "collections" in data[0]
        csv_res = await client.get("/api/reports/batch-breakup?format=csv", headers=headers)
        assert csv_res.status_code == 200
        assert "text/csv" in csv_res.headers.get("content-type", "")
        assert "Batch Name" in csv_res.text

        # 7. Test Admissions & Conversion Report (JSON + CSV)
        res = await client.get("/api/reports/admissions-conversion", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert "summary" in data
        assert "overall_conversion_rate" in data["summary"]
        assert "by_subject" in data
        assert "by_source" in data
        assert "items" in data
        csv_res = await client.get("/api/reports/admissions-conversion?format=csv", headers=headers)
        assert csv_res.status_code == 200
        assert "text/csv" in csv_res.headers.get("content-type", "")
        assert "Enquiry Code" in csv_res.text

        # 8. Test Waivers Report (JSON + CSV)
        res = await client.get("/api/reports/waivers", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert "summary" in data
        assert "total_waived_amount" in data["summary"]
        assert "items" in data
        csv_res = await client.get("/api/reports/waivers?format=csv", headers=headers)
        assert csv_res.status_code == 200
        assert "text/csv" in csv_res.headers.get("content-type", "")
        assert "Waiver Number" in csv_res.text

        # 9. Test Refunds Report (JSON + CSV)
        res = await client.get("/api/reports/refunds", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert "summary" in data
        assert "total_refunded_amount" in data["summary"]
        assert "items" in data
        csv_res = await client.get("/api/reports/refunds?format=csv", headers=headers)
        assert csv_res.status_code == 200
        assert "text/csv" in csv_res.headers.get("content-type", "")
        assert "Refund Number" in csv_res.text

        # 10. Test Expenses Report (JSON + CSV)
        res = await client.get("/api/reports/expenses", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert "summary" in data
        assert "total_expenses" in data["summary"]
        assert "by_category" in data
        assert "by_mode" in data
        assert "items" in data
        csv_res = await client.get("/api/reports/expenses?format=csv", headers=headers)
        assert csv_res.status_code == 200
        assert "text/csv" in csv_res.headers.get("content-type", "")
        assert "Category" in csv_res.text or "Reference / Voucher" in csv_res.text

        # 11. Test Daily/Monthly Summary Dashboard (JSON + CSV)
        res = await client.get("/api/reports/summary-dashboard?period=monthly", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert "summary" in data
        assert "total_billed" in data["summary"]
        assert "total_collected" in data["summary"]
        assert "net_cash" in data["summary"]
        assert "intervals" in data
        csv_res = await client.get("/api/reports/summary-dashboard?period=monthly&format=csv", headers=headers)
        assert csv_res.status_code == 200
        assert "text/csv" in csv_res.headers.get("content-type", "")
        assert "Period" in csv_res.text
