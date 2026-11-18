from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.database.session import get_db
from app.modules.users.models import User
from app.modules.auth.schemas import LoginRequest, TokenResponse, UserResponse
from app.core.security import verify_password, create_access_token
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/login", response_model=TokenResponse)
async def login(login_data: LoginRequest, db: AsyncSession = Depends(get_db)):
    # Support login with Employee ID or Email
    identifier = login_data.username.strip()
    stmt = select(User).where(
        or_(
            User.employee_id.ilike(identifier),
            User.email.ilike(identifier)
        )
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect Employee ID / Email or Password"
        )

    if user.status != "ACTIVE":
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
