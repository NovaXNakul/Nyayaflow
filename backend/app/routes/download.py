from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
import os
from app.database.session import SessionLocal
from app.models.case_document import CaseDocument
from app.services.pdf_service import generate_pdf

router = APIRouter()

@router.get("/download/{case_id}")
def download_pdf(case_id: int):
    with SessionLocal() as db:
        case = db.query(CaseDocument).filter(CaseDocument.id == case_id).first()
        if not case:
            raise HTTPException(status_code=404, detail="Case not found")
        if case.status != "approved":
            raise HTTPException(status_code=403, detail="Only verified cases can be downloaded")
            
        file_path = generate_pdf(case)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=500, detail="Failed to generate PDF")
            
        return FileResponse(
            file_path,
            media_type="application/pdf",
            filename=f"case_report_{case.id}.pdf"
        )
