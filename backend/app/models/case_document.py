import os
from sqlalchemy import JSON, Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
from app.database.session import Base

class CaseDocument(Base):
    __tablename__ = "case_documents"
    id = Column(Integer, primary_key=True)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    raw_text = Column(Text, nullable=True)
    extracted_json = Column(JSONB if os.getenv("DATABASE_URL", "").startswith("postgre") else JSON, nullable=True)
    action_plan = Column(JSONB if os.getenv("DATABASE_URL", "").startswith("postgre") else JSON, nullable=True)
    status = Column(String(50), default="uploaded")
    created_at = Column(DateTime, default=datetime.utcnow)
