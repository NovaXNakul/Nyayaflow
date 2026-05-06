import os
import logging
from pathlib import Path
from fastapi import APIRouter, File, UploadFile, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from app.database.session import get_db, SessionLocal
from app.models.case_document import CaseDocument
from app.models.user import User
from app.core.security import get_current_user

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

router = APIRouter(tags=["Upload"])
logger = logging.getLogger(__name__)

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

def run_indexing(document_id: int, file_path: str):
    """Background task for RAG indexing and database status update."""
    from app.services.rag_service import index_document
    db = SessionLocal()
    try:
        logger.info(f"Background indexing started for doc {document_id}")
        index_document(document_id=document_id, file_path=file_path)
        
        # Update document status to 'indexed'
        doc = db.query(CaseDocument).filter(CaseDocument.id == document_id).first()
        if doc:
            doc.status = "indexed"
            db.commit()
            logger.info(f"RAG indexing complete and status updated for doc {document_id}")
    except Exception as exc:
        logger.error(f"Background RAG indexing failed for doc {document_id}: {exc}")
    finally:
        db.close()

@router.post("/upload")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...), 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"PDF upload started: user={current_user.email} file={file.filename}")

    if not file.filename.lower().endswith(".pdf"):
        logger.warning(f"Upload rejected: non-PDF file attempted: {file.filename}")
        raise HTTPException(400, "Only PDF supported")

    target = UPLOAD_DIR / file.filename
    with open(target, "wb") as f:
        total = 0
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                raise HTTPException(413, "PDF exceeds maximum upload size of 10MB")
            f.write(chunk)
    
    logger.info(f"File saved to {target}")

    # Persist document record
    doc = CaseDocument(
        filename=file.filename,
        file_path=str(target),
        status="uploaded",
        created_by=current_user.id
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    
    document_id = doc.id
    file_path = doc.file_path

    # Start background indexing
    background_tasks.add_task(run_indexing, document_id, file_path)

    return {
        "document_id": document_id,
        "filename": file.filename,
        "status": "uploaded",
        "rag_status": "indexing_started",
    }