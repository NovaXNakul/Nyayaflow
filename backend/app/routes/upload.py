import os
from pathlib import Path
from fastapi import APIRouter, File, UploadFile, HTTPException
from app.database.session import SessionLocal
from app.models.case_document import CaseDocument

router = APIRouter()

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
    
    with SessionLocal() as db:
        doc = CaseDocument(filename=file.filename, file_path=str(target), status="uploaded")
        db.add(doc)
        db.commit()
        db.refresh(doc)
        print(f"Document created with id {doc.id}")
        return {"document_id": doc.id, "filename": doc.filename, "status": doc.status}
