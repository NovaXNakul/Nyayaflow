from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.exc import IntegrityError
from app.database.session import SessionLocal
from app.models.user import User
from app.core.security import get_password_hash, verify_password, create_access_token, get_current_user, get_current_user_optional

router = APIRouter()

class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: str = "officer"

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

@router.post("/auth/register", response_model=UserResponse)
def register(req: RegisterRequest):
    if req.role not in {"admin", "officer"}:
        raise HTTPException(status_code=400, detail="role must be admin or officer")

    with SessionLocal() as db:
        existing = db.query(User).filter(User.email == req.email).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")

        all_users = db.query(User).count()
        if req.role == "admin" and all_users > 0:
            raise HTTPException(status_code=403, detail="Admin registration is restricted after initial setup")

        user = User(
            username=req.username,
            email=req.email,
            hashed_password=get_password_hash(req.password),
            role=req.role,
        )
        db.add(user)
        try:
            db.commit()
            db.refresh(user)
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=400, detail="Could not create user")
        return user

@router.post("/auth/login", response_model=TokenResponse)
def login(req: LoginRequest):
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == req.email).first()
        if not user or not verify_password(req.password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

        token = create_access_token({"sub": str(user.id), "role": user.role, "email": user.email})
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "role": user.role,
            },
        }

@router.get("/auth/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "role": current_user.role,
    }

@router.get("/users", response_model=list[UserResponse])
def list_users(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    with SessionLocal() as db:
        officers = db.query(User).filter(User.role == "officer").all()
        return [
            {"id": u.id, "username": u.username, "email": u.email, "role": u.role}
            for u in officers
        ]
