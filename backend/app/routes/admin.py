import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.models.user import User
from app.models.invite import Invite
from app.schemas.invite import InviteCreate, InviteResponse, InviteTokenValidate, InviteTokenResponse
from app.core.security import get_admin_user
from app.services.email_service import send_invite_email

router = APIRouter(prefix="/admin", tags=["Admin"])

from fastapi import APIRouter, HTTPException, Depends, status, BackgroundTasks
import os

@router.post("/invite", response_model=InviteResponse)
def create_invite(req: InviteCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    # 1. Check if user already exists
    existing_user = db.query(User).filter(User.email == req.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    # 2. Check if an active invite already exists
    active_invite = db.query(Invite).filter(
        Invite.email == req.email, 
        Invite.used == False, 
        Invite.expires_at > datetime.utcnow()
    ).first()
    
    if active_invite:
        # Optionally resend or return error
        raise HTTPException(status_code=400, detail="An active invite already exists for this email")

    # 3. Generate secure token
    token = secrets.token_urlsafe(32)
    expiry = datetime.utcnow() + timedelta(hours=24)

    # 4. Store invite
    invite = Invite(
        email=req.email,
        name=req.name,
        token=token,
        expires_at=expiry,
        role="officer" # Force officer role for this flow
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)

    # 5. Send Invite Email asynchronously
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
    invite_link = f"{frontend_url}/register?token={token}"
    background_tasks.add_task(send_invite_email, invite.email, invite.name or "Officer", invite_link)

    return invite

@router.post("/validate-invite", response_model=InviteTokenResponse)
def validate_invite(req: InviteTokenValidate, db: Session = Depends(get_db)):
    invite = db.query(Invite).filter(Invite.token == req.token).first()
    
    if not invite:
        raise HTTPException(status_code=404, detail="Invalid invite token")
    
    if invite.used:
        raise HTTPException(status_code=400, detail="Invite already used")
        
    if invite.is_expired():
        raise HTTPException(status_code=400, detail="Invite expired")
        
    return {
        "email": invite.email,
        "name": invite.name,
        "role": invite.role,
        "valid": True
    }
