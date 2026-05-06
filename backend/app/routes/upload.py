import os
import logging
from pathlib import Path
from fastapi import APIRouter, File, UploadFile, HTTPException, Depends
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.models.case_document import CaseDocument
from app.models.user import User
from app.core.security import get_current_user

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

router = APIRouter(tags=["Upload"])
logger = logging.getLogger(__name__)

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...), 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    logger.info(f"User {current_user.email} uploading file: {file.filename}")

    if not file.filename.lower().endswith(".pdf"):
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

    # Index PDF chunks into the RAG vector store
    try:
        from app.services.rag_service import index_document
        index_document(document_id=document_id, file_path=file_path)
        logger.info(f"RAG indexing complete for doc {document_id}")
        rag_status = "indexed"
    except Exception as exc:
        logger.error(f"RAG indexing failed for doc {document_id}: {exc}")
        rag_status = "index_failed"

    return {
        "document_id": document_id,
        "filename": file.filename,
        "status": "uploaded",
        "rag_status": rag_status,
    }