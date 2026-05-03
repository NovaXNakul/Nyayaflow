from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Any, Optional
from datetime import datetime
from sqlalchemy.orm.attributes import flag_modified
from app.database.session import SessionLocal
from app.models.case_document import CaseDocument
from app.services.llm_service import generate_summary
from app.core.security import get_admin_user

router = APIRouter()

class VerifyRequest(BaseModel):
    document_id: int
    decision: str
    payload: Optional[dict[str, Any]] = None

@router.post("/verify")
def verify(req: VerifyRequest, current_user=Depends(get_admin_user)):
    with SessionLocal() as db:
        doc = db.query(CaseDocument).filter(CaseDocument.id == req.document_id).first()
        if not doc:
            raise HTTPException(404, "Document not found")
        if req.decision not in {"approve", "edit", "reject"}:
            raise HTTPException(400, "decision must be approve/edit/reject")
            
        if req.payload and req.decision in {"approve", "edit"}:
            doc.extracted_json = req.payload
            flag_modified(doc, "extracted_json")
            
        if req.decision == "approve":
            doc.status = "approved"
            
            # Generate and store summary if approved
            if doc.raw_text and "summary" not in (doc.extracted_json or {}):
                summary = generate_summary(doc.raw_text)
                if summary:
                    if not doc.extracted_json:
                        doc.extracted_json = {}
                    updated_json = dict(doc.extracted_json)
                    updated_json["summary"] = summary
                    doc.extracted_json = updated_json
                    flag_modified(doc, "extracted_json")
                    
        elif req.decision == "edit":
            doc.status = "edited"
        else:
            doc.status = "rejected"
            
        if doc.action_plan and req.decision in {"approve", "edit"}:
            updated_plan = dict(doc.action_plan)
            updated_plan["compliance_proof"] = {
                "actions_taken": updated_plan.get("plan", {}).get("steps", []),
                "timestamps": [{"event": "verified", "time": datetime.utcnow().isoformat()}],
                "responsibility": updated_plan.get("plan", {}).get("escalation_path", ""),
            }
            doc.action_plan = updated_plan
            flag_modified(doc, "action_plan")
            
        db.commit()
        return {"document_id": doc.id, "verification_status": doc.status}
