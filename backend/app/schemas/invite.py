from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class InviteCreate(BaseModel):
    email: EmailStr
    name: Optional[str] = None

class InviteResponse(BaseModel):
    id: int
    email: str
    name: Optional[str]
    role: str
    expires_at: datetime
    used: bool
    created_at: datetime

    class Config:
        from_attributes = True

class InviteTokenValidate(BaseModel):
    token: str

class InviteTokenResponse(BaseModel):
    email: str
    name: Optional[str]
    role: str
    valid: bool
