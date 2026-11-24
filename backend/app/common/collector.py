import re
from typing import Optional, Any

_ROLE_ONLY_NAMES = {
    "cashier",
    "admin",
    "administrator",
    "system admin",
    "system administrator",
    "super admin",
    "staff",
    "system",
    "system staff",
    "teacher",
    "faculty",
    "accounts desk",
    "accounts section",
    "authorized officer",
    "disbursement officer",
    "—",
    "-",
}

_TRAILING_ROLE_RE = re.compile(
    r"\s*[\(\[\-–—]\s*(?:cashier|admin|administrator|staff|teacher|faculty)\s*[\)\]]?\s*$",
    re.IGNORECASE,
)


def sanitize_collector_name(raw_name: Optional[str]) -> Optional[str]:
    """
    Return the collector's human name, stripping trailing role tags such as
    '(Cashier)' and returning None for empty or role-only placeholders.
    """
    if not raw_name:
        return None
    cleaned = _TRAILING_ROLE_RE.sub("", str(raw_name)).strip()
    if not cleaned or cleaned.lower() in _ROLE_ONLY_NAMES:
        return None
    return cleaned


def resolve_payment_collector_name(payment: Any) -> Optional[str]:
    """
    Resolve the collecting staff member's name from a Payment record,
    preferring the snapshot and falling back to the linked User if loaded.
    """
    if not payment:
        return None
    name = sanitize_collector_name(getattr(payment, "collector_name_snapshot", None))
    if name:
        return name
    collector_user = getattr(payment, "__dict__", {}).get("collector_user")
    if collector_user:
        return sanitize_collector_name(getattr(collector_user, "full_name", None))
    return None
