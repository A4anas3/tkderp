import hashlib
import io
import os
import pytest
from PIL import Image
from httpx import AsyncClient, ASGITransport, Response as HttpxResponse

from app.core.config import settings
from app.main import app
from app.storage.cloudinary import CloudinaryStorageProvider


def _make_sample_jpeg(width: int = 300, height: int = 300) -> bytes:
    noise_bytes = os.urandom(width * height * 3)
    img = Image.frombytes("RGB", (width, height), noise_bytes)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    return buf.getvalue()


@pytest.mark.asyncio
async def test_cloudinary_provider_signed_private_upload_download_delete(monkeypatch):
    monkeypatch.setattr(settings, "CLOUDINARY_CLOUD_NAME", "demo_cloud")
    monkeypatch.setattr(settings, "CLOUDINARY_API_KEY", "demo_key")
    monkeypatch.setattr(settings, "CLOUDINARY_API_SECRET", "demo_secret")

    captured = {}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, data=None, files=None):
            captured.setdefault("posts", []).append((url, data, files))
            if url.endswith("/image/upload"):
                return HttpxResponse(
                    200,
                    json={"public_id": data["public_id"], "type": data["type"]},
                )
            if url.endswith("/image/destroy"):
                result = "ok" if data.get("type") == "private" else "not found"
                return HttpxResponse(200, json={"result": result})
            return HttpxResponse(404, json={})

        async def get(self, url, params=None):
            captured.setdefault("gets", []).append((url, params))
            if url.endswith("/image/download"):
                return HttpxResponse(
                    200,
                    content=b"private-image-bytes",
                    headers={"content-type": "image/jpeg"},
                )
            return HttpxResponse(404)

    monkeypatch.setattr("app.storage.cloudinary.httpx.AsyncClient", FakeAsyncClient)

    provider = CloudinaryStorageProvider()
    assert provider._configured is True

    key, backend_url = await provider.upload(b"jpeg-bytes", "stu_stu001_ab.jpg", folder="students")
    assert key.startswith("students/stu_stu001_ab_")
    assert backend_url == f"/api/v1/uploads/{key}"
    assert "res.cloudinary.com" not in backend_url
    assert "res.cloudinary.com" not in (provider.get_url(key) or "")

    upload_url, upload_data, _ = captured["posts"][0]
    assert upload_url == "https://api.cloudinary.com/v1_1/demo_cloud/image/upload"
    assert upload_data["type"] == "private"
    assert upload_data["api_key"] == "demo_key"
    expected_to_sign = (
        f"public_id={upload_data['public_id']}&timestamp={upload_data['timestamp']}&type=private"
        "demo_secret"
    )
    assert upload_data["signature"] == hashlib.sha1(expected_to_sign.encode("utf-8")).hexdigest()

    downloaded = await provider.download(key)
    assert downloaded == (b"private-image-bytes", "image/jpeg")
    dl_url, dl_params = captured["gets"][0]
    assert dl_url == "https://api.cloudinary.com/v1_1/demo_cloud/image/download"
    assert dl_params["type"] == "private"

    deleted = await provider.delete(key)
    assert deleted is True
    destroy_url, destroy_data, _ = captured["posts"][1]
    assert destroy_url == "https://api.cloudinary.com/v1_1/demo_cloud/image/destroy"
    assert destroy_data["type"] == "private"


@pytest.mark.asyncio
async def test_uploads_endpoint_requires_jwt_and_serves_local_and_cloud(monkeypatch):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login_res = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert login_res.status_code == 200
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Upload student photo using default local provider in test env
        raw_img = _make_sample_jpeg()
        up_res = await client.post(
            "/api/students/upload-photo",
            files={"file": ("avatar.jpg", raw_img, "image/jpeg")},
            headers=headers,
        )
        assert up_res.status_code == 200
        up_data = up_res.json()
        assert up_data["size_kb"] <= 20.0
        photo_url = up_data["photo_url"]
        assert photo_url.startswith("/api/v1/uploads/students/")

        # 2. Unauthenticated fetch MUST fail with 401
        unauth_res = await client.get(photo_url)
        assert unauth_res.status_code == 401

        # 3. Authenticated fetch MUST return the image bytes
        auth_res = await client.get(photo_url, headers=headers)
        assert auth_res.status_code == 200
        assert auth_res.headers["content-type"].startswith("image/jpeg")
        assert len(auth_res.content) <= 20 * 1024

        # 4. Path traversal rejected
        bad_res = await client.get("/api/v1/uploads/students/../../etc/passwd", headers=headers)
        assert bad_res.status_code in (400, 404)

        # 5. Teacher standalone upload and Institute logo upload also return /api/v1/uploads/...
        t_res = await client.post(
            "/api/teachers/upload-photo",
            files={"file": ("teacher.jpg", raw_img, "image/jpeg")},
            headers=headers,
        )
        assert t_res.status_code == 200
        assert t_res.json()["photo_url"].startswith("/api/v1/uploads/teachers/")
        assert t_res.json()["size_kb"] <= 20.0

        logo_res = await client.post(
            "/api/settings/institute/logo",
            files={"file": ("logo.jpg", raw_img, "image/jpeg")},
            headers=headers,
        )
        assert logo_res.status_code == 200
        logo_url = logo_res.json()["logo_url"]
        assert logo_url.startswith("/api/v1/uploads/institute/")

        # 6. Cloudinary fallback serve when local file does not exist
        monkeypatch.setattr(settings, "CLOUDINARY_CLOUD_NAME", "demo_cloud")
        monkeypatch.setattr(settings, "CLOUDINARY_API_KEY", "demo_key")
        monkeypatch.setattr(settings, "CLOUDINARY_API_SECRET", "demo_secret")

        async def fake_download(self, storage_key: str):
            if storage_key == "students/remote_cloud_key":
                return b"cloud-jpeg-bytes", "image/jpeg"
            return None

        monkeypatch.setattr(CloudinaryStorageProvider, "download", fake_download)

        cloud_unauth = await client.get("/api/v1/uploads/students/remote_cloud_key")
        assert cloud_unauth.status_code == 401

        cloud_auth = await client.get("/api/v1/uploads/students/remote_cloud_key", headers=headers)
        assert cloud_auth.status_code == 200
        assert cloud_auth.content == b"cloud-jpeg-bytes"
        assert cloud_auth.headers["content-type"].startswith("image/jpeg")
