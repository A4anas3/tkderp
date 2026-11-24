from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List
import uuid

from app.database.session import get_db
from app.core.security import decode_access_token
from app.modules.users.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # 1. Try local access token
    payload = decode_access_token(token)
    user = None

    if payload is not None:
        user_id_str: str = payload.get("sub")
        if user_id_str is not None:
            try:
                user_id = uuid.UUID(user_id_str)
                stmt = select(User).where(User.id == user_id)
                res = await db.execute(stmt)
                user = res.scalar_one_or_none()
            except ValueError:
                pass
    else:
        # 2. Try Firebase ID token verification
        from app.core.firebase import verify_firebase_token
        fb_claims = verify_firebase_token(token)
        if fb_claims:
            fb_email = fb_claims.get("email")
            if fb_email:
                stmt = select(User).where(User.email.ilike(fb_email))
                res = await db.execute(stmt)
                user = res.scalar_one_or_none()

    if user is None:
        raise credentials_exception
    if user.status != "ACTIVE":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is deactivated")
        
    return user

def require_roles(allowed_roles: List[str]):
    upper_roles = {r.strip().upper() for r in allowed_roles}
    upper_roles.add("ADMIN")  # Admin always has complete administrative access
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        user_role = (current_user.role or "").strip().upper()
        if user_role not in upper_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation not permitted. Required roles: {', '.join(allowed_roles)}. Your role is '{current_user.role}'."
            )
        return current_user
    return role_checker

require_admin = require_roles(["ADMIN"])
require_cashier_or_admin = require_roles(["ADMIN", "CASHIER"])
require_teacher_or_admin = require_roles(["ADMIN", "TEACHER"])
require_staff = require_roles(["ADMIN", "CASHIER", "TEACHER", "STAFF"])
