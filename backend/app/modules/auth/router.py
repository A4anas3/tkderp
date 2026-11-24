import logging
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.database.session import get_db
from app.modules.users.models import User
from app.modules.auth.schemas import LoginRequest, TokenResponse, UserResponse
from app.core.security import verify_password, create_access_token
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

    access_token = create_access_token(
        subject=str(user.id),
        claims={
            "employee_id": user.employee_id,
            "role": user.role,
            "name": user.full_name
        }
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)
