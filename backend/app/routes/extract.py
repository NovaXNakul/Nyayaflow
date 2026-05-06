from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
import logging
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from app.database.session import get_db
from app.models.case_document import CaseDocument
from app.services.pdf_service import extract_pdf_text
from app.services.extraction_service import (
    llm_extract,
    heuristic_extract,
    risk_assessment,
    generate_action_plan_llm,
    push_entities_to_index,
)
from app.core.security import get_current_user

router = APIRouter(tags=["Extraction"])
logger = logging.getLogger(__name__)

class ExtractRequest(BaseModel):
    document_id: int
    language: str = "English"

class ActionRequest(BaseModel):
    document_id: int
    language: str = "English"

@router.post("/extract")
def extract_doc(req: ExtractRequest, background_tasks: BackgroundTasks, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    logger.info(f"Extracting document {req.document_id} with language {req.language}")
    doc = db.query(CaseDocument).filter(CaseDocument.id == req.document_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")

    text, pages = (
        extract_pdf_text(doc.file_path)
        if doc.filename.lower().endswith(".pdf")
        else ("Excel input uploaded.", [{"page": 1, "text": "Excel input"}])
    )

    extraction_method = "llm"
    try:
        extracted = llm_extract(text, req.language)
        source_ref = extracted.get("source_reference", "page 1")
        highlights = [
            {"field": "directive", "text": d, "source_reference": source_ref}
            for d in extracted.get("directives", [])[:3]
        ]
    except Exception as e:
        logger.warning(f"LLM extraction failed, falling back to heuristic: {e}")
        extracted, highlights = heuristic_extract(text, pages)
        extraction_method = "heuristic"

    doc.raw_text = text
    doc.extracted_json = extracted
    doc.status = "extracted"
    db.commit()
    
    background_tasks.add_task(push_entities_to_index, document_id=doc.id, extracted=extracted)

    similar_cases = []
    try:
        similar_cases = [
            {
                "document_id": d.id,
                "department": (d.extracted_json or {}).get("department", "Unknown"),
                "priority": (d.extracted_json or {}).get("priority", "Unknown"),
            }
            for d in db.query(CaseDocument).filter(CaseDocument.id != doc.id).all()[:3]
        ]
    except Exception as e:
        logger.error(f"Failed to fetch similar cases: {e}")

    simplified_text = "Simple summary: "
    if text:
        simplified_text += " ".join(text.split()[:90]) + "..."
    
    return {
        "document_id": doc.id,
        "status": doc.status,
        "extraction_method": extraction_method,
        "extracted_data": extracted,
        "highlights": highlights,
        "similar_cases": similar_cases,
        "simplified_text": simplified_text,
    }

@router.post("/generate-action")
def generate_action(req: ActionRequest, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    logger.info(f"Generating action plan for {req.document_id} in {req.language}")
    doc = db.query(CaseDocument).filter(CaseDocument.id == req.document_id).first()
    if not doc or not doc.extracted_json:
        raise HTTPException(404, "Document not extracted")

    risk = risk_assessment(doc.raw_text or "")
    
    try:
        plan = generate_action_plan_llm(doc.extracted_json, req.language)
    except Exception as e:
        logger.error(f"Action plan generation failed: {e}")
        plan = {
            "steps": [
                {
                    "step": "Assign nodal officer",
                    "owner": doc.extracted_json.get("department", "Administration"),
                    "due_date": datetime.utcnow().strftime("%Y-%m-%d"),
                    "evidence_required": "Assignment memo",
                }
            ],
            "compliance_notes": "Track timestamps and proof docs.",
            "escalation_path": "Nodal Officer -> Department Head",
        }

    doc.action_plan = {"plan": plan, "risk_assessment": risk}
    doc.status = "action_generated"
    db.commit()
    return {"document_id": doc.id, "plan": plan, "risk_assessment": risk}