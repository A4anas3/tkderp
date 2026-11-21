import sys
import asyncio
from decimal import Decimal
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from app.database.session import AsyncSessionLocal
from app.database.models import Admission, AdmissionItem, PaymentAllocation, Refund
from app.modules.ledger.service import recompute_admission_totals
from app.services.daily_jobs import run_daily_expiration_job, refresh_statuses
from datetime import datetime

async def verify_ledger(fix: bool = False):
    print("Verifying ledger against cached values across all admissions...")
    mismatches = []
    async with AsyncSessionLocal() as session:
        stmt = select(Admission).options(selectinload(Admission.items))
        res = await session.execute(stmt)
        admissions = res.scalars().all()

        for adm in admissions:
            item_ids = [itm.id for itm in adm.items]
            if not item_ids:
                continue

            pa_res = await session.execute(
                select(PaymentAllocation).where(PaymentAllocation.admission_item_id.in_(item_ids))
            )
            allocations = pa_res.scalars().all()

            alloc_sums = {iid: Decimal("0.00") for iid in item_ids}
            for pa in allocations:
                alloc_sums[pa.admission_item_id] += pa.allocated_amount

            has_diff = False
            is_void = getattr(adm, "document_status", "VALID") == "VOID"
            for itm in adm.items:
                true_collected = max(Decimal("0.00"), alloc_sums.get(itm.id, Decimal("0.00")))
                w_off = itm.written_off_amount or Decimal("0.00")
                true_due = Decimal("0.00") if is_void else max(Decimal("0.00"), itm.net_price - true_collected - w_off)

                if itm.amount_collected != true_collected:
                    has_diff = True
                    mismatches.append(
                        f"Item {itm.id} ({itm.item_name_snapshot}): amount_collected cache {itm.amount_collected} != ledger {true_collected}"
                    )
                if itm.balance_due != true_due:
                    has_diff = True
                    mismatches.append(
                        f"Item {itm.id} ({itm.item_name_snapshot}): balance_due cache {itm.balance_due} != ledger {true_due}"
                    )

            total_collected = sum((itm.amount_collected for itm in adm.items), Decimal("0.00"))
            total_written_off = sum((itm.written_off_amount or Decimal("0.00") for itm in adm.items), Decimal("0.00"))
            true_adm_due = Decimal("0.00") if is_void else max(Decimal("0.00"), adm.total_payable - total_collected - total_written_off)

            if adm.amount_paid != total_collected:
                has_diff = True
                mismatches.append(
                    f"Admission {adm.admission_number}: amount_paid cache {adm.amount_paid} != ledger {total_collected}"
                )
            if adm.balance_due != true_adm_due:
                has_diff = True
                mismatches.append(
                    f"Admission {adm.admission_number}: balance_due cache {adm.balance_due} != ledger {true_adm_due}"
                )

            if has_diff and fix:
                await recompute_admission_totals(adm, session)

        if fix and mismatches:
            await session.commit()
            print(f"Repaired {len(mismatches)} mismatch(es) across admissions.")

    if mismatches and not fix:
        print(f"FAILED: Found {len(mismatches)} ledger mismatch(es):")
        for m in mismatches:
            print(f"  - {m}")
        return len(mismatches)
    else:
        print("SUCCESS: 0 mismatches found. Allocation ledger and cached totals are 100% in sync.")
        return 0

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "verify_ledger":
        fix = "--fix" in sys.argv
        count = asyncio.run(verify_ledger(fix=fix))
        sys.exit(count)
    elif len(sys.argv) > 1 and sys.argv[1] in ("refresh_statuses", "run_daily_job"):
        target_date = None
        for i, arg in enumerate(sys.argv):
            if arg == "--date" and i + 1 < len(sys.argv):
                target_date = datetime.strptime(sys.argv[i + 1], "%Y-%m-%d").date()

        async def _run():
            summary = await refresh_statuses(today=target_date)
            print("refresh_statuses summary:", summary)
        asyncio.run(_run())
        sys.exit(0)
    else:
        print("Usage: python -m app.cli [verify_ledger [--fix] | refresh_statuses [--date YYYY-MM-DD]]")
        sys.exit(1)

if __name__ == "__main__":
    main()
