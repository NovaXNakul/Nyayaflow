import secrets
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.database.session import get_db
from app.models.user import User
from app.models.password_reset import PasswordResetToken
from app.schemas.user import UserCreate, UserResponse, Token, LoginRequest, ForgotPasswordRequest, ResetPasswordRequest
from app.core.security import get_password_hash, verify_password, create_access_token, get_current_user, get_admin_user, get_current_user_optional
from app.services.email_service import send_reset_email, send_welcome_email

router = APIRouter(prefix="/auth", tags=["Authentication"])

from app.models.invite import Invite

@router.post("/register", response_model=UserResponse)
def register(req: UserCreate, db: Session = Depends(get_db), current_user: Optional[User] = Depends(get_current_user_optional)):
    # 1. Check if any user exists
    any_user = db.query(User).first()

    # 2. First-time setup: If no users exist, allow creating the first Admin
    if not any_user:
        if req.role != "admin":
             raise HTTPException(status_code=400, detail="The first user must be an admin.")
        
        user = User(
            name=req.name or req.username or "System Admin",
            email=req.email,
            password_hash=get_password_hash(req.password),
            role="admin",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        try:
            send_welcome_email(user.email, user.name, user.role)
        except Exception:
            pass
        return user

    # 3. Handle Invite-Based Registration (for Officers)
    if req.token:
        invite = db.query(Invite).filter(Invite.token == req.token).first()
        if not invite:
            raise HTTPException(status_code=400, detail="Invalid invite token")
        if invite.used:
            raise HTTPException(status_code=400, detail="Invite already used")
        if invite.is_expired():
            raise HTTPException(status_code=400, detail="Invite expired")
        
        # Check if email already registered (redundancy check)
        existing_user = db.query(User).filter(User.email == invite.email).first()
        if existing_user:
             invite.used = True
             db.commit()
             raise HTTPException(status_code=400, detail="User already exists")

        # Create user using invite details (security: ignore role/email from req)
        user = User(
            name=req.name or invite.name or "Officer",
            email=invite.email,
            password_hash=get_password_hash(req.password),
            role=invite.role,
        )
        invite.used = True
        db.add(user)
        db.commit()
        db.refresh(user)
        
        # Send welcome email
        try:
            send_welcome_email(user.email, user.name, user.role)
        except Exception:
            pass
            
        return user

    # 4. Handle Admin-Led Registration (Admin creating another user manually)
    if current_user and current_user.role == "admin":
        # Check if email already registered
        existing_user = db.query(User).filter(User.email == req.email).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="Email already registered")

        user = User(
            name=req.name or req.username or "New User",
            email=req.email,
            password_hash=get_password_hash(req.password),
            role=req.role if req.role in {"admin", "officer"} else "officer",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        try:
            send_welcome_email(user.email, user.name, user.role)
        except Exception:
            pass
        return user

    # 5. Default: Registration is closed
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, 
        detail="Registration is restricted. Use an invite link or contact an admin."
    )

@router.post("/login", response_model=Token)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Account is deactivated")

    access_token = create_access_token(data={"sub": str(user.id), "role": user.role})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if user:
        token = secrets.token_urlsafe(32)
        expiry = datetime.utcnow() + timedelta(minutes=15)
        
        reset_token = PasswordResetToken(
            email=req.email,
            token=token,
            expires_at=expiry
        )
        db.add(reset_token)
        db.commit()
        
        reset_link = f"http://localhost:3000/reset-password?token={token}"
        send_reset_email(user.email, reset_link)
        
    return {"message": "If this email is registered, you will receive a reset link shortly."}

@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    reset_token = db.query(PasswordResetToken).filter(PasswordResetToken.token == req.token).first()
    
    if not reset_token or reset_token.is_expired:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    
    user = db.query(User).filter(User.email == reset_token.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.password_hash = get_password_hash(req.new_password)
    db.delete(reset_token)
    db.commit()
    
    return {"message": "Password updated successfully"}

@router.get("/users", response_model=list[UserResponse])
def list_users(current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    return db.query(User).all()
