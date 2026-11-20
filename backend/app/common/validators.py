import re
from typing import Optional

def normalize_mobile(mobile: Optional[str]) -> Optional[str]:
    """
    Normalizes Indian mobile numbers:
    - Strips all non-digit characters.
    - Strips leading Indian country code (+91 or 91) if 12 digits.
    - Strips leading 0 if 11 digits.
    Returns cleaned digits string or None.
    """
    if mobile is None:
        return None
    val_str = str(mobile).strip()
    if not val_str:
        return None

    digits = re.sub(r"\D", "", val_str)
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]

    return digits or None

def validate_mobile_10_digits(v: Optional[str], required: bool = False) -> Optional[str]:
    """
    Validates that a mobile number is strictly 10 numeric digits.
    Normalizes prefixes (+91, 0) before validating.
    Raises ValueError if invalid.
    """
    if v is None:
        if required:
            raise ValueError("Mobile number is required")
        return None

    val_str = str(v).strip()
    if not val_str:
        if required:
            raise ValueError("Mobile number is required")
        return None

    norm = normalize_mobile(val_str)
    if not norm or not re.match(r"^\d{10}$", norm):
        raise ValueError("Mobile number must be exactly 10 numeric digits")

    return norm
