from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.case_document import CaseDocument
import os

DATABASE_URL = "sqlite:///./sql_app.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def check_db():
    db = SessionLocal()
    try:
        cases = db.query(CaseDocument).order_by(CaseDocument.id.desc()).limit(5).all()
        for c in cases:
            print(f"ID: {c.id}, Filename: {c.filename}, Status: {c.status}")
    finally:
        db.close()

if __name__ == "__main__":
    check_db()
