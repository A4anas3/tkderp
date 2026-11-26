"""
Migrate existing local files under UPLOAD_DIR (institute, students, teachers)
to Cloudinary as private assets and update matching DB references
(institute_settings.logo_url, students.photo_url, teachers.photo_url).
"""
import asyncio
import hashlib
import mimetypes
import os
import time
from typing import Dict

import httpx
from sqlalchemy import select

from app.core.cache import (
    invalidate_settings_cache,
    invalidate_student_cache,
    invalidate_teacher_cache,
)
from app.core.config import settings
from app.database.session import AsyncSessionLocal
from app.modules.settings.models import InstituteSetting
from app.modules.students.models import Student
from app.modules.teachers.models import Teacher


def _sign_params(params: Dict[str, str], api_secret: str) -> str:
    to_sign = "&".join(f"{k}={params[k]}" for k in sorted(params)) + api_secret
    return hashlib.sha1(to_sign.encode("utf-8")).hexdigest()


async def _upload_one(
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    cloud_name: str,
    api_key: str,
    api_secret: str,
    folder: str,
    filepath: str,
) -> tuple[str, str]:
    filename = os.path.basename(filepath)
    stem = os.path.splitext(filename)[0]
    public_id = f"{folder}/{stem}"
    mime_type, _ = mimetypes.guess_type(filepath)
    content_type = mime_type or "image/jpeg"

    with open(filepath, "rb") as f:
        file_bytes = f.read()

    async with sem:
        timestamp = str(int(time.time()))
        sign_params = {
            "public_id": public_id,
            "timestamp": timestamp,
            "type": "private",
        }
        signature = _sign_params(sign_params, api_secret)
        resp = await client.post(
            f"https://api.cloudinary.com/v1_1/{cloud_name}/image/upload",
            data={**sign_params, "api_key": api_key, "signature": signature},
            files={"file": (filename, file_bytes, content_type)},
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Failed {filepath}: {resp.status_code} {resp.text[:200]}")
        stored_public_id = resp.json()["public_id"]
        return f"{folder}/{filename}", f"/api/v1/uploads/{stored_public_id}"


async def main() -> None:
    cloud_name = (settings.CLOUDINARY_CLOUD_NAME or "").strip()
    api_key = (settings.CLOUDINARY_API_KEY or "").strip()
    api_secret = (settings.CLOUDINARY_API_SECRET or "").strip()
    if not (cloud_name and api_key and api_secret):
        raise SystemExit("CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET must be set.")

    upload_root = os.path.abspath(settings.UPLOAD_DIR)
    targets = []
    for folder in ("institute", "students", "teachers"):
        folder_dir = os.path.join(upload_root, folder)
        if not os.path.isdir(folder_dir):
            continue
        for entry in sorted(os.listdir(folder_dir)):
            full_path = os.path.join(folder_dir, entry)
            if os.path.isfile(full_path):
                targets.append((folder, full_path))

    print(f"Found {len(targets)} local files under {upload_root} to migrate.")
    sem = asyncio.Semaphore(10)
    mapping: Dict[str, str] = {}
    failures = 0

    async with httpx.AsyncClient(timeout=30.0) as client:
        tasks = [
            _upload_one(client, sem, cloud_name, api_key, api_secret, folder, path)
            for folder, path in targets
        ]
        for coro in asyncio.as_completed(tasks):
            try:
                old_rel, new_url = await coro
                mapping[f"/uploads/{old_rel}"] = new_url
                mapping[f"/api/v1/uploads/{old_rel}"] = new_url
                mapping[old_rel] = new_url
            except Exception as exc:
                failures += 1
                print(f"ERROR: {exc}")

    print(f"Uploaded {len(mapping) // 3} files to Cloudinary as private (failures={failures}).")

    updated_settings = 0
    updated_students = 0
    updated_teachers = 0

    async with AsyncSessionLocal() as db:
        for setting in (await db.execute(select(InstituteSetting))).scalars().all():
            if setting.logo_url and setting.logo_url in mapping:
                setting.logo_url = mapping[setting.logo_url]
                updated_settings += 1

        for student in (await db.execute(select(Student))).scalars().all():
            if student.photo_url and student.photo_url in mapping:
                student.photo_url = mapping[student.photo_url]
                updated_students += 1

        for teacher in (await db.execute(select(Teacher))).scalars().all():
            if teacher.photo_url and teacher.photo_url in mapping:
                teacher.photo_url = mapping[teacher.photo_url]
                updated_teachers += 1

        await db.commit()

    await invalidate_settings_cache()
    await invalidate_student_cache()
    await invalidate_teacher_cache()

    print(
        f"DB updated: institute_settings={updated_settings}, "
        f"students={updated_students}, teachers={updated_teachers}"
    )


if __name__ == "__main__":
    asyncio.run(main())
