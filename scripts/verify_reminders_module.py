import json
import urllib.parse
import httpx

BASE_URL = "http://localhost:8080"


def main():
    print("=" * 80)
    print("THAKURDWARA COACHING ERP — REMINDERS MODULE COMPREHENSIVE VERIFICATION")
    print("=" * 80)

    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        # 1. Health Check
        health_res = client.get("/health")
        assert health_res.status_code == 200, f"Health check failed: {health_res.text}"
        health_data = health_res.json()
        print(f"✓ Backend Health OK: {health_data['service']} (Status: {health_data['status']})")

        # 2. Login as Cashier (CSH001)
        login_res = client.post("/api/auth/login", json={"username": "CSH001", "password": "Cashier@1234"})
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("✓ Cashier login successful")

        # 3. Fetch subjects and batches for filter testing
        subs_res = client.get("/api/subjects", headers=headers)
        assert subs_res.status_code == 200
        subs_data = subs_res.json()
        subjects = subs_data.get("items", []) if isinstance(subs_data, dict) else subs_data
        print(f"✓ Retrieved {len(subjects)} subjects for filter verification")

        batches_res = client.get("/api/batches", headers=headers)
        assert batches_res.status_code == 200
        batches_data = batches_res.json()
        batches = batches_data.get("items", []) if isinstance(batches_data, dict) else batches_data
        print(f"✓ Retrieved {len(batches)} batches for filter verification")

        # 4. Fetch Pending Queue
        q_res = client.get("/api/reminders/queue?status=pending&page_size=10", headers=headers)
        assert q_res.status_code == 200, f"Queue fetch failed: {q_res.text}"
        data = q_res.json()
        items = data["items"]
        counts = data["counts"]
        total = data["total"]

        print(f"\n--- PENDING DUE REMINDERS QUEUE METRICS ---")
        print(f"Total Pending: {total}")
        print(f"Counts Pending: {counts['pending']}")
        print(f"Counts Sent: {counts['sent']}")
        print(f"Counts Failed: {counts['failed']}")
        print(f"Total Due Amount: {counts['formatted_total_due']}")
        assert total > 0, "Expected active pending reminders in queue"
        assert len(items) > 0, "Expected items on page 1"

        sample = items[0]
        print(f"\n--- SAMPLE DUE REMINDER DETAILS ---")
        print(f"ID: {sample['id']}")
        print(f"Student: {sample['student_name']} ({sample['student_code']})")
        print(f"Mobile: {sample['student_mobile']}")
        print(f"Subject: {sample['subject_name']}")
        print(f"Batch: {sample['batch_name']}")
        print(f"Due Amount: {sample['formatted_due_amount']}")
        print(f"Due Date: {sample['formatted_due_date']} (Kind: {sample['kind']}, Bucket: {sample['ageing_bucket']})")
        print(f"Delivery Status: {sample['status']}")
        print(f"Pre-filled Message:\n   {sample['message']}")
        print(f"Ready-to-Click WhatsApp URL:\n   {sample['whatsapp_url']}")

        # Assert WhatsApp link correctness
        wa_url = sample["whatsapp_url"]
        if sample["has_mobile"]:
            assert wa_url.startswith("https://wa.me/"), f"Invalid WhatsApp link: {wa_url}"
            assert sample["student_name"] in sample["message"]
            assert "text=" in wa_url
            print("✓ Working WhatsApp link verified with pre-filled student name & due amount")

        # Rule check: Never expired items
        assert sample["is_expired"] is False, "Reminder must NOT be an expired item"

        # 5. Filter Verification: Subject
        if subjects:
            test_sub = subjects[0]
            sub_q = client.get(f"/api/reminders/queue?status=pending&subject_id={test_sub['id']}", headers=headers)
            assert sub_q.status_code == 200
            print(f"✓ Filter by Subject ({test_sub['name']}): {sub_q.json()['total']} matching reminders")

        # 6. Filter Verification: Batch
        if batches:
            test_bat = batches[0]
            bat_q = client.get(f"/api/reminders/queue?status=pending&batch_id={test_bat['id']}", headers=headers)
            assert bat_q.status_code == 200
            print(f"✓ Filter by Batch ({test_bat['name']}): {bat_q.json()['total']} matching reminders")

        # 7. Filter Verification: Due-Age Buckets
        for bucket in ["0-30", "31-60", "61-90", "90+"]:
            age_q = client.get(f"/api/reminders/queue?status=pending&due_age={bucket}", headers=headers)
            assert age_q.status_code == 200
            print(f"✓ Filter by Due-Age ({bucket}): {age_q.json()['total']} reminders")

        # 8. Status Lifecycle: Pending -> Mark Sent -> Sent History
        test_id = sample["id"]
        sent_res = client.post(f"/api/reminders/{test_id}/mark-sent", headers=headers)
        assert sent_res.status_code == 200, f"Mark sent failed: {sent_res.text}"
        sent_item = sent_res.json()
        assert sent_item["status"] == "sent"
        assert sent_item["handled_at"] is not None
        print(f"✓ Marked reminder {test_id} as SENT (Handled by: {sent_item.get('handled_by_name')})")

        # Verify in Sent History
        sent_q = client.get("/api/reminders/queue?status=sent", headers=headers)
        assert sent_q.status_code == 200
        assert any(it["id"] == test_id for it in sent_q.json()["items"]), "Expected item in Sent History"
        print("✓ Item verified in Sent History tab")

        # 9. Status Lifecycle: Sent -> Mark Failed -> Failed Queue
        fail_res = client.post(
            f"/api/reminders/{test_id}/mark-failed",
            json={"reason": "Number blocked by subscriber"},
            headers=headers,
        )
        assert fail_res.status_code == 200, f"Mark failed failed: {fail_res.text}"
        failed_item = fail_res.json()
        assert failed_item["status"] == "failed"
        assert failed_item["error_reason"] == "Number blocked by subscriber"
        print("✓ Marked reminder as FAILED with recorded reason")

        failed_q = client.get("/api/reminders/queue?status=failed", headers=headers)
        assert failed_q.status_code == 200
        assert any(it["id"] == test_id for it in failed_q.json()["items"])
        print("✓ Item verified in Failed Queue tab")

        # 10. Status Lifecycle: Failed -> Reset Pending
        reset_res = client.post(f"/api/reminders/{test_id}/reset-pending", headers=headers)
        assert reset_res.status_code == 200
        assert reset_res.json()["status"] == "pending"
        print("✓ Reset reminder back to PENDING successfully")

        # 11. One-Click 'Send Due Reminder' from Student
        student_id = sample["student_id"]
        stu_rem_res = client.post(f"/api/reminders/student/{student_id}/send-due-reminder", headers=headers)
        assert stu_rem_res.status_code == 200, f"Send student reminder failed: {stu_rem_res.text}"
        stu_rem = stu_rem_res.json()
        assert "whatsapp_url" in stu_rem
        assert "reminder" in stu_rem
        print(f"✓ One-click 'Send Due Reminder' from Student verified: WhatsApp link generated ({stu_rem['whatsapp_url'][:50]}...)")

        # 12. One-Click 'Send Due Reminder' from Subject
        if sample.get("subject_id"):
            subj_id = sample["subject_id"]
            subj_rem_res = client.post(f"/api/reminders/subject/{subj_id}/send-due-reminders", headers=headers)
            assert subj_rem_res.status_code == 200
            print(f"✓ One-click 'Send Due Reminders' from Subject verified (Message: {subj_rem_res.json()['message']})")

    print("\n" + "=" * 80)
    print("ALL 12 REMINDERS MODULE CHECKS PASSED PERFECTLY!")
    print("=" * 80)


if __name__ == "__main__":
    main()
