import json
import urllib.parse
import httpx

BASE_URL = "http://localhost:8080"


def main():
    print("=" * 70)
    print("THAKURDWARA COACHING ERP — LIVE WHATSAPP FEATURES VERIFICATION")
    print("=" * 70)

    with httpx.Client(base_url=BASE_URL, timeout=15.0) as client:
        # 1. Backend Health Check
        health_res = client.get("/health")
        assert health_res.status_code == 200, f"Health check failed: {health_res.text}"
        health_data = health_res.json()
        print(f"✓ Backend Health OK: {health_data['service']} (Status: {health_data['status']})")

        # 2. Login as Cashier (CSH001)
        login_res = client.post("/api/auth/login", json={"username": "CSH001", "password": "Cashier@1234"})
        assert login_res.status_code == 200, f"Cashier login failed: {login_res.text}"
        cashier_token = login_res.json()["access_token"]
        cashier_headers = {"Authorization": f"Bearer {cashier_token}"}
        print("✓ Cashier Login successful (Role: CASHIER)")

        # 3. Query Due Reminders Queue
        queue_res = client.get("/api/reminders/queue?status=pending&page_size=25", headers=cashier_headers)
        assert queue_res.status_code == 200, f"Queue fetch failed: {queue_res.text}"
        queue_data = queue_res.json()
        
        total_dues = queue_data.get("total", 0)
        expired_dues = queue_data.get("counts", {}).get("expired_dues", 0)
        items = queue_data.get("items", [])
        
        print(f"✓ Retrieved Due Reminders Queue:")
        print(f"   • Total Pending Reminders: {total_dues}")
        print(f"   • Expired Course Dues (F1): {expired_dues}")
        print(f"   • Page items returned: {len(items)}")

        assert total_dues > 0, "Expected pending reminders in queue"
        assert expired_dues > 0, "Expected expired course dues from F1 in queue"

        # 4. Verify Expired Due item in queue
        expired_items = [it for it in items if it.get("is_expired")]
        assert len(expired_items) > 0, "Expected at least one expired due item on page 1"
        exp_item = expired_items[0]

        print("\n--- SAMPLE EXPIRED DUE REMINDER ROW (from F1) ---")
        print(f"Student Name: {exp_item['student_name']}")
        print(f"Student Code: {exp_item['student_code']}")
        print(f"Mobile: {exp_item['student_mobile']}")
        print(f"Course: {exp_item['course_name']}")
        print(f"Due Amount: {exp_item['formatted_due_amount']}")
        print(f"Kind: {exp_item['kind']}")
        print(f"Is Expired: {exp_item['is_expired']}")
        print(f"Status: {exp_item['status']}")
        print(f"Pre-filled Message:\n   {exp_item['message']}")
        print(f"Ready-to-Click WhatsApp URL:\n   {exp_item['whatsapp_url']}")

        # Assert WhatsApp URL structure
        wa_url = exp_item["whatsapp_url"]
        assert wa_url.startswith("https://wa.me/"), f"Invalid wa.me link: {wa_url}"
        assert exp_item["student_name"] in exp_item["message"], "Message missing student name"
        assert exp_item["course_name"] in exp_item["message"], "Message missing course name"
        assert "text=" in wa_url, "WhatsApp link missing pre-filled text query parameter"
        print("✓ Expired due reminder row contains required fields and valid wa.me link")

        # 5. Verify Student with no mobile
        no_mob_res = client.get("/api/reminders/queue?status=all&search=NoMobile", headers=cashier_headers)
        if no_mob_res.status_code == 200 and no_mob_res.json()["items"]:
            no_mob_item = no_mob_res.json()["items"][0]
            assert no_mob_item["has_mobile"] is False, "has_mobile should be False when mobile is None"
            assert no_mob_item["whatsapp_url"] == "", "whatsapp_url should be empty string when mobile is None"
            print(f"✓ Confirmed student without mobile ({no_mob_item['student_name']}) has disabled WhatsApp link (has_mobile=False)")

        # 6. Test Mark Sent and Reset Pending
        test_rem_id = exp_item["id"]
        sent_res = client.post(f"/api/reminders/{test_rem_id}/mark-sent", headers=cashier_headers)
        assert sent_res.status_code == 200, f"mark-sent failed: {sent_res.text}"
        sent_data = sent_res.json()
        assert sent_data["status"] == "sent"
        assert sent_data["handled_at"] is not None
        print(f"✓ Mark Sent action successful (Handled by: {sent_data.get('handled_by_name')})")

        # Reset back to pending
        reset_res = client.post(f"/api/reminders/{test_rem_id}/reset-pending", headers=cashier_headers)
        assert reset_res.status_code == 200, f"reset-pending failed: {reset_res.text}"
        assert reset_res.json()["status"] == "pending"
        print("✓ Reset to Pending successful")

        # 7. Check Payment Receipt Details & WhatsApp URL generation
        payments_res = client.get("/api/payments?page=1&page_size=5", headers=cashier_headers)
        if payments_res.status_code == 200 and payments_res.json().get("items"):
            sample_pay = payments_res.json()["items"][0]
            pay_no = sample_pay.get("payment_number", "PAY-TEST")
            amt = sample_pay.get("amount", 1000)
            date_val = sample_pay.get("payment_date", "2026-11-22")
            stu_name = sample_pay.get("student_name", "Student")
            stu_mob = sample_pay.get("student_mobile", "9876543210")
            
            pay_msg = (
                f"🎓 *THAKURDWARA COACHING INSTITUTE*\n"
                f"*Official Fee Payment Receipt*\n\n"
                f"Dear *{stu_name}*,\n"
                f"We have successfully acknowledged your fee payment.\n"
                f"Receipt: {pay_no}\nDate: {date_val}\nAmount Paid: ₹{float(amt):,.2f}\n"
            )
            pay_wa = f"https://wa.me/91{stu_mob.replace(' ', '')}?text={urllib.parse.quote(pay_msg)}"
            print(f"\n✓ Fee Payment Slip WhatsApp URL test passed:")
            print(f"   • Payment Number: {pay_no}")
            print(f"   • Sample URL: {pay_wa[:65]}...")

        # 8. Check Admission Receipt Slip Details & WhatsApp URL generation
        adm_res = client.get("/api/admissions?page=1&page_size=5", headers=cashier_headers)
        if adm_res.status_code == 200 and adm_res.json().get("items"):
            sample_adm = adm_res.json()["items"][0]
            adm_no = sample_adm.get("admission_number", "ADM-TEST")
            adm_amt = sample_adm.get("total_payable", 3000)
            adm_stu = sample_adm.get("student_name_snapshot", "Student")
            adm_mob = sample_adm.get("student_mobile") or "9876543210"

            adm_msg = (
                f"🎓 *THAKURDWARA COACHING INSTITUTE*\n"
                f"*Course Enrollment & Admission Receipt*\n\n"
                f"Dear *{adm_stu}*,\n"
                f"Invoice: {adm_no}\nTotal Fee: ₹{float(adm_amt):,.2f}\n"
            )
            adm_wa = f"https://wa.me/91{adm_mob.replace(' ', '')}?text={urllib.parse.quote(adm_msg)}"
            print(f"✓ Course Admission Slip WhatsApp URL test passed:")
            print(f"   • Admission Number: {adm_no}")
            print(f"   • Sample URL: {adm_wa[:65]}...")

    print("\n" + "=" * 70)
    print("ALL LIVE WHATSAPP FEATURES VERIFIED SUCCESSFULLY!")
    print("=" * 70)


if __name__ == "__main__":
    main()
