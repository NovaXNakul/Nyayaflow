from sqlalchemy import Column, DateTime, Integer, String
from datetime import datetime
from app.database.session import Base

class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True)
    case_id = Column(Integer, nullable=False)
    assigned_to = Column(Integer, nullable=False)
    status = Column(String(50), nullable=False, default="pending")
    deadline = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
