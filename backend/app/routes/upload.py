import os
import logging
from pathlib import Path
from fastapi import APIRouter, File, UploadFile, HTTPException
from app.database.session import SessionLocal
from app.models.case_document import CaseDocument

router = APIRouter()
logger = logging.getLogger(__name__)

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/upload")
async def upload(file: UploadFile = File(...)):
    print(f"Uploading file: {file.filename}")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF supported")

    target = UPLOAD_DIR / file.filename
    target.write_bytes(await file.read())
    print(f"File saved to {target}")

    # ── 1. Persist document record ────────────────────────────────────────────
    with SessionLocal() as db:
        doc = CaseDocument(
            filename=file.filename,
            file_path=str(target),
            status="uploaded",
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        document_id = doc.id
        file_path   = doc.file_path
        print(f"Document created with id {document_id}")

    # ── 2. Index PDF chunks into the RAG vector store ─────────────────────────
    # This is the CRITICAL step that was missing — without it the chatbot
    # has nothing to retrieve and answers blindly.
    try:
        from app.services.rag_service import index_document
        index_document(document_id=document_id, file_path=file_path)
        logger.info("upload: RAG indexing complete for doc %d", document_id)
        rag_status = "indexed"
    except Exception as exc:
        # Non-fatal: the document is uploaded; RAG can be re-indexed later.
        logger.error(
            "upload: RAG indexing failed for doc %d: %s — chatbot will have "
            "reduced accuracy until the document is re-indexed.",
            document_id, exc,
        )
        rag_status = "index_failed"

    return {
        "document_id": document_id,
        "filename":    file.filename,
        "status":      "uploaded",
        "rag_status":  rag_status,   # surface this so the frontend can warn the user
    }