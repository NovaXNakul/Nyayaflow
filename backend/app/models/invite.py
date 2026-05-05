from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, func
from app.database.session import Base
import datetime

class Invite(Base):
    __tablename__ = "invites"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    role = Column(String, default="officer")
    token = Column(Text, unique=True, index=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

    def is_expired(self):
        return datetime.datetime.utcnow() > self.expires_at
