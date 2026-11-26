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
                if params and params.get("public_id", "").endswith(".jpg"):
                    return HttpxResponse(404)
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

    # Legacy key with .jpg extension falls back to extensionless public_id
    downloaded_ext = await provider.download(f"{key}.jpg")
    assert downloaded_ext == (b"private-image-bytes", "image/jpeg")

    deleted = await provider.delete(key)
    assert deleted is True
    destroy_url, destroy_data, _ = captured["posts"][1]
    assert destroy_url == "https://api.cloudinary.com/v1_1/demo_cloud/image/destroy"
    assert destroy_data["type"] == "private"

    # Delete returns False if Cloudinary does not confirm "ok"
    assert await provider.delete("") is False


@pytest.mark.asyncio
async def test_uploads_endpoint_requires_jwt_and_serves_local_and_cloud(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
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

        # 7. Teacher upload path also stays JWT-only (401 without token)
        t_photo_url = t_res.json()["photo_url"]
        assert (await client.get(t_photo_url)).status_code == 401
        assert (await client.get(t_photo_url, headers=headers)).status_code == 200


@pytest.mark.asyncio
async def test_public_institute_logo_endpoint_behavior(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login_res = await client.post("/api/auth/login", json={"username": "ADM001", "password": "Admin@1234"})
        assert login_res.status_code == 200
        headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}

        # Preserve original logo_url so we restore cleanly
        orig_res = await client.get("/api/settings/institute", headers=headers)
        assert orig_res.status_code == 200
        orig_logo_url = orig_res.json().get("logo_url")

        try:
            # 1. No logo configured -> 404
            del_res = await client.delete("/api/settings/institute/logo", headers=headers)
            assert del_res.status_code == 200
            no_logo_res = await client.get("/api/public/institute-logo")
            assert no_logo_res.status_code == 404

            # 2. Upload logo in local mode -> unauthenticated GET returns 200 + bytes
            raw_img = _make_sample_jpeg()
            up_res = await client.post(
                "/api/settings/institute/logo",
                files={"file": ("coaching_logo.jpg", raw_img, "image/jpeg")},
                headers=headers,
            )
            assert up_res.status_code == 200
            saved_logo_url = up_res.json()["logo_url"]
            assert saved_logo_url.startswith("/api/v1/uploads/institute/")

            pub_res = await client.get("/api/public/institute-logo")
            assert pub_res.status_code == 200
            assert pub_res.headers["content-type"].startswith("image/jpeg")
            assert len(pub_res.content) > 0

            # Matches authenticated protected fetch bytes
            prot_res = await client.get(saved_logo_url, headers=headers)
            assert prot_res.status_code == 200
            assert pub_res.content == prot_res.content

            # 3. Subpaths or query params cannot serve other files
            subpath_res = await client.get("/api/public/institute-logo/students/secret.jpg")
            assert subpath_res.status_code == 404
            query_res = await client.get("/api/public/institute-logo?path=students/secret.jpg")
            assert query_res.status_code == 200
            assert query_res.content == pub_res.content

            # 4. Cloudinary storage mode serves private asset server-side without auth
            monkeypatch.setattr(settings, "STORAGE_PROVIDER", "cloudinary")
            monkeypatch.setattr(settings, "CLOUDINARY_CLOUD_NAME", "demo_cloud")
            monkeypatch.setattr(settings, "CLOUDINARY_API_KEY", "demo_key")
            monkeypatch.setattr(settings, "CLOUDINARY_API_SECRET", "demo_secret")

            async def fake_cloud_download(self, storage_key: str):
                if storage_key == "institute/cloud_logo_123":
                    return b"cloud-logo-png-bytes", "image/png"
                return None

            monkeypatch.setattr(CloudinaryStorageProvider, "download", fake_cloud_download)

            put_cloud = await client.put(
                "/api/settings/institute",
                json={"logo_url": "/api/v1/uploads/institute/cloud_logo_123"},
                headers=headers,
            )
            assert put_cloud.status_code == 200

            cloud_logo_res = await client.get("/api/public/institute-logo")
            assert cloud_logo_res.status_code == 200
            assert cloud_logo_res.headers["content-type"].startswith("image/png")
            assert cloud_logo_res.content == b"cloud-logo-png-bytes"

            # 5. Refuses to serve non-institute paths or external URLs even if stored in logo_url
            for bad_url in (
                "/api/v1/uploads/students/stu_1.jpg",
                "https://res.cloudinary.com/demo/image/upload/v1/x.png",
            ):
                await client.put("/api/settings/institute", json={"logo_url": bad_url}, headers=headers)
                assert (await client.get("/api/public/institute-logo")).status_code == 404
        finally:
            await client.put(
                "/api/settings/institute",
                json={"logo_url": orig_logo_url or ""},
                headers=headers,
            )
