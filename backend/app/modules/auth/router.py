from datetime import datetime, timedelta, timezone
import logging
from typing import Optional
import uuid
from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, update

from app.database.session import get_db
from app.modules.users.models import User
from app.modules.auth.models import RefreshToken
from app.modules.auth.schemas import (
    LoginRequest,
    LogoutRequest,
    LogoutResponse,
    RefreshRequest,
    TokenResponse,
    UserResponse,
)
from app.core.config import settings
from app.core.security import (
    verify_password,
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    hash_refresh_token,
)
from app.core.dependencies import get_current_user
from app.core.rate_limit import RateLimiter, get_client_ip

logger = logging.getLogger("app.auth")

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# Max 5 failed login attempts per 15 minutes per IP address and per username
LOGIN_RATE_LIMIT_TIMES = 5
LOGIN_RATE_LIMIT_SECONDS = 15 * 60
login_ip_limiter = RateLimiter(
    times=LOGIN_RATE_LIMIT_TIMES,
    seconds=LOGIN_RATE_LIMIT_SECONDS,
    prefix="login_ip",
)
login_user_limiter = RateLimiter(
    times=LOGIN_RATE_LIMIT_TIMES,
    seconds=LOGIN_RATE_LIMIT_SECONDS,
    prefix="login_user",
)


async def _record_failed_login(client_ip: str, identifier: str, username_key: str, reason: str) -> None:
    """Record failed login against IP and username limiters and emit a warning log."""
    ip_attempts = await login_ip_limiter.record(client_ip)
    user_attempts = await login_user_limiter.record(username_key)
    logger.warning(
        "Failed login attempt for identifier=%r from ip=%s (reason=%s, ip_attempts=%d, user_attempts=%d)",
        identifier,
        client_ip,
        reason,
        ip_attempts,
        user_attempts,
    )


async def revoke_all_user_refresh_tokens(
    db: AsyncSession,
    user_id: uuid.UUID,
    now: Optional[datetime] = None,
) -> None:
    """Revoke all active refresh tokens belonging to the given user."""
    revoked_at = now or datetime.now(timezone.utc)
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked.is_(False))
        .values(revoked=True, revoked_at=revoked_at)
    )


async def _issue_token_pair(
    db: AsyncSession,
    user: User,
    now: Optional[datetime] = None,
) -> TokenResponse:
    """Create an 8-hour access token and store a hashed 30-day refresh token."""
    issued_at = now or datetime.now(timezone.utc)
    access_token = create_access_token(
        subject=str(user.id),
        claims={
            "employee_id": user.employee_id,
            "role": user.role,
            "name": user.full_name,
        },
    )
    raw_refresh_token = generate_refresh_token()
    db.add(
        RefreshToken(
            token_hash=hash_refresh_token(raw_refresh_token),
            user_id=user.id,
            expires_at=issued_at + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            revoked=False,
        )
    )
    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


async def _resolve_user_id_from_request(request: Request, db: AsyncSession) -> Optional[uuid.UUID]:
    """Extract user_id from a valid Bearer access token if present."""
    auth_header = request.headers.get("authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        return None
    bearer_token = auth_header.split(" ", 1)[1].strip()
    if not bearer_token:
        return None

    payload = decode_access_token(bearer_token)
    if payload is not None:
        sub = payload.get("sub")
        if sub:
            try:
                return uuid.UUID(str(sub))
            except ValueError:
                return None
        return None

    from app.core.firebase import verify_firebase_token
    fb_claims = verify_firebase_token(bearer_token)
    if fb_claims and fb_claims.get("email"):
        fb_user = (
            await db.execute(select(User).where(User.email.ilike(fb_claims["email"])))
        ).scalar_one_or_none()
        if fb_user:
            return fb_user.id
    return None


@router.post("/login", response_model=TokenResponse)
async def login(request: Request, login_data: LoginRequest, db: AsyncSession = Depends(get_db)):
    # Support login with Employee ID or Email
    client_ip = get_client_ip(request)
    identifier = login_data.username.strip()
    username_key = identifier.lower() or "_empty"

    try:
        await login_ip_limiter.check(client_ip)
        await login_user_limiter.check(username_key)
    except HTTPException:
        logger.warning(
            "Login attempt blocked due to rate limit/lockout for identifier=%r from ip=%s",
            identifier,
            client_ip,
        )
        raise

    stmt = select(User).where(
        or_(
            User.employee_id.ilike(identifier),
            User.email.ilike(identifier)
        )
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not verify_password(login_data.password, user.password_hash):
        await _record_failed_login(client_ip, identifier, username_key, reason="invalid_credentials")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect Employee ID / Email or Password"
        )

    if user.status != "ACTIVE":
        await _record_failed_login(client_ip, identifier, username_key, reason="inactive_account")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your staff account has been deactivated. Contact Admin."
        )

    response = await _issue_token_pair(db, user)
    await db.commit()
    return response


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    refresh_data: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    """Validate and rotate a refresh token, returning a fresh access + refresh token pair."""
    raw_token = (refresh_data.refresh_token or "").strip()
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_hash = hash_refresh_token(raw_token)
    stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash).with_for_update()
    token_record = (await db.execute(stmt)).scalar_one_or_none()

    if token_record is None or token_record.revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    now = datetime.now(timezone.utc)
    expires_at = token_record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= now:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = (await db.execute(select(User).where(User.id == token_record.user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user.status != "ACTIVE":
        token_record.revoked = True
        token_record.revoked_at = now
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your staff account has been deactivated. Contact Admin.",
        )

    token_record.revoked = True
    token_record.revoked_at = now
    response = await _issue_token_pair(db, user, now=now)
    await db.commit()
    return response


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    request: Request,
    logout_data: Optional[LogoutRequest] = Body(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Revoke the caller's refresh token and all active refresh tokens for that user."""
    user_id = await _resolve_user_id_from_request(request, db)
    raw_refresh = (logout_data.refresh_token or "").strip() if logout_data and logout_data.refresh_token else ""

    if user_id is not None:
        await revoke_all_user_refresh_tokens(db, user_id)
        await db.commit()
        return LogoutResponse(success=True, message="Logged out successfully")

    if not raw_refresh:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_hash = hash_refresh_token(raw_refresh)
    token_record = (
        await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    ).scalar_one_or_none()

    if token_record is not None:
        await revoke_all_user_refresh_tokens(db, token_record.user_id)
        await db.commit()

    return LogoutResponse(success=True, message="Logged out successfully")


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)
