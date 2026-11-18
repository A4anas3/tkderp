import logging
from typing import Optional, Dict, Any
from app.core.config import settings

logger = logging.getLogger("app.firebase")

_firebase_initialized = False

def init_firebase() -> bool:
    """
    Initializes Firebase Admin SDK if credentials or project id are provided.
    Returns True if initialized, False otherwise.
    """
    global _firebase_initialized
    if _firebase_initialized:
        return True

    if not settings.FIREBASE_PROJECT_ID and not settings.FIREBASE_CREDENTIALS_PATH:
        return False

    try:
        import firebase_admin
        from firebase_admin import credentials

        if settings.FIREBASE_CREDENTIALS_PATH:
            cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
            firebase_admin.initialize_app(cred)
        else:
            firebase_admin.initialize_app(options={"projectId": settings.FIREBASE_PROJECT_ID})

        _firebase_initialized = True
        logger.info("Firebase Admin SDK initialized successfully")
        return True
    except Exception as e:
        logger.warning(f"Could not initialize Firebase Admin SDK: {e}")
        return False

def verify_firebase_token(id_token: str) -> Optional[Dict[str, Any]]:
    """
    Verifies a Firebase ID token and returns decoded claims.
    Returns None if verification fails or Firebase is not configured.
    """
    if not init_firebase():
        return None

    try:
        from firebase_admin import auth
        decoded_token = auth.verify_id_token(id_token)
        return decoded_token
    except Exception as e:
        logger.debug(f"Firebase token verification failed: {e}")
        return None

def get_employee_internal_email(employee_id: str) -> str:
    """
    Maps an employee ID to a controlled internal email alias for Firebase identity.
    e.g. ADM001 -> adm001@thakurdwara.local
    """
    clean_id = employee_id.strip().lower()
    return f"{clean_id}@thakurdwara.local"
