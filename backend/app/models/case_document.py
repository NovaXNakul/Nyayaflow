from sqlalchemy import JSON, Column, DateTime, Integer, String, Text
from datetime import datetime
from app.database.session import Base

class CaseDocument(Base):
    __tablename__ = "case_documents"
    id = Column(Integer, primary_key=True)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    raw_text = Column(Text, nullable=True)
    extracted_json = Column(JSON, nullable=True)
    action_plan = Column(JSON, nullable=True)
    status = Column(String(50), default="uploaded")
    created_by = Column(Integer, nullable=True)
    assigned_to = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
