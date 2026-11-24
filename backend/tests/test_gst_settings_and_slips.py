import pytest
from decimal import Decimal
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
async def test_institute_settings_get_and_update(admin_token):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # 1. GET institute settings
        res = await client.get("/api/settings/institute", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert "gstin" in data
        assert "gst_rate" in data

        # 2. PUT update institute settings
        update_payload = {
            "institute_name": "Thakurdwara Institute of Technology",
            "gstin": "09ABCDE1234F1Z5",
            "gst_rate": 18.0,
            "address": "Opposite Civil Hospital, Thakurdwara, Moradabad, UP - 244601",
            "phone": "+91 98765 43210",
            "email": "accounts@thakurdwara.edu.in",
        }
        put_res = await client.put("/api/settings/institute", json=update_payload, headers=headers)
        assert put_res.status_code == 200
        saved = put_res.json()
        assert saved["gstin"] == "09ABCDE1234F1Z5"
        assert float(saved["gst_rate"]) == 18.0
        assert saved["institute_name"] == "Thakurdwara Institute of Technology"

        # 3. GET to verify updated settings persist
        get_res = await client.get("/api/settings/institute", headers=headers)
        assert get_res.status_code == 200
        data2 = get_res.json()
        assert data2["gstin"] == "09ABCDE1234F1Z5"
        assert float(data2["gst_rate"]) == 18.0

@pytest.mark.asyncio
async def test_admission_gst_patch_and_slips(admin_token):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = {"Authorization": f"Bearer {admin_token}"}

        # 1. Fetch admissions list to find an existing admission
        list_res = await client.get("/api/admissions?page=1&page_size=5", headers=headers)
        assert list_res.status_code == 200
        admissions = list_res.json()["items"]
        assert len(admissions) > 0
        target_adm = admissions[0]
        adm_id = target_adm["id"]

        # 2. Patch GST details on this admission
        patch_res = await client.patch(
            f"/api/admissions/{adm_id}/gst",
            json={
                "gst_enabled": True,
                "gst_rate": 18.0,
                "gst_number": "09ABCDE1234F1Z5",
            },
            headers=headers
        )
        assert patch_res.status_code == 200
        patched = patch_res.json()
        assert patched["gst_enabled"] is True
        assert float(patched["gst_rate"]) == 18.0
        assert patched["gst_number"] == "09ABCDE1234F1Z5"

        # 3. Fetch slips and verify GST details are returned
        slips_res = await client.get(f"/api/admissions/{adm_id}/slips", headers=headers)
        assert slips_res.status_code == 200
        slips_data = slips_res.json()
        assert slips_data["gst_enabled"] is True
        assert float(slips_data["gst_rate"]) == 18.0
        assert slips_data["gst_number"] == "09ABCDE1234F1Z5"

        # 4. Turn GST off and verify
        patch_off_res = await client.patch(
            f"/api/admissions/{adm_id}/gst",
            json={
                "gst_enabled": False,
            },
            headers=headers
        )
        assert patch_off_res.status_code == 200
        patched_off = patch_off_res.json()
        assert patched_off["gst_enabled"] is False

        # Verify slips again
        slips_res2 = await client.get(f"/api/admissions/{adm_id}/slips", headers=headers)
        assert slips_res2.status_code == 200
        assert slips_res2.json()["gst_enabled"] is False
