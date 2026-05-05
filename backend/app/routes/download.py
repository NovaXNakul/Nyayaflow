from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse, JSONResponse
import os
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.models.case_document import CaseDocument
from app.services.pdf_service import generate_pdf
from app.core.security import get_current_user

router = APIRouter(tags=["Reports"])

@router.get("/report/{case_id}")
def get_report_data(case_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Returns the report data in JSON format for previewing on the dashboard."""
    case = db.query(CaseDocument).filter(CaseDocument.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    return {
        "case_id": case.id,
        "filename": case.filename,
        "status": case.status,
        "extracted_data": case.extracted_json,
        "action_plan": case.action_plan,
        "created_at": case.created_at.isoformat()
    }

@router.get("/download/{case_id}")
def download_pdf(case_id: int, lang: str = "en", current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    case = db.query(CaseDocument).filter(CaseDocument.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    if case.status not in ["approved", "action_generated", "extracted"]:
        raise HTTPException(status_code=403, detail="Report not ready for download")
        
    file_path = generate_pdf(case, lang)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=500, detail="Failed to generate PDF")
        
    return FileResponse(
        file_path,
        media_type="application/pdf",
        filename=f"Legal_Analysis_Report_{case.id}.pdf",
        headers={
            "Content-Disposition": f'attachment; filename="Legal_Analysis_Report_{case.id}.pdf"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

@router.get("/view-doc/{case_id}")
def view_original_doc(case_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Serves the original uploaded document for previewing."""
    case = db.query(CaseDocument).filter(CaseDocument.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    if not os.path.exists(case.file_path):
        raise HTTPException(status_code=404, detail="Original file not found")
        
    return FileResponse(
        case.file_path,
        media_type="application/pdf" if case.filename.lower().endswith(".pdf") else "application/octet-stream",
        filename=case.filename
    )
