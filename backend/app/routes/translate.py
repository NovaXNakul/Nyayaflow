from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import json
import logging
from app.database.session import SessionLocal
from app.models.case_document import CaseDocument
from app.services.extraction_service import translate_structured_data

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/translate-test")
def translate_test():
    return {"status": "ok", "message": "Translate router is working!"}

@router.get("/translate/{case_id}")
def translate_case_data(case_id: int, language: str = "kannada"):
    print(f"[DEBUG] Received translate request for case {case_id} with language {language}")
    # Handle case-insensitive language
    lang_lower = language.lower()
    
    if lang_lower not in {"english", "kannada"}:
         raise HTTPException(400, "Unsupported language")

    with SessionLocal() as db:
        doc = db.query(CaseDocument).filter(CaseDocument.id == case_id).first()
        if not doc:
            raise HTTPException(404, "Case not found")
        if not doc.extracted_json:
            raise HTTPException(400, "Document not yet extracted")

        payload = {
            "recommended_action": doc.extracted_json.get("action_required", "Compliance required"),
            "directives": doc.extracted_json.get("directives", []),
            "summary": doc.extracted_json.get("case_details", ""),
            "timeline": doc.extracted_json.get("timeline", ""),
            "deadline_date": doc.extracted_json.get("deadline_date", ""),
            "priority": doc.extracted_json.get("priority", "Medium"),
            "department": doc.extracted_json.get("department", "General Administration"),
            "action_steps": []
        }

        # 2. Add action plan steps if available
        if doc.action_plan and "plan" in doc.action_plan and "steps" in doc.action_plan["plan"]:
            for step in doc.action_plan["plan"]["steps"]:
                payload["action_steps"].append({
                    "action": step.get("step", ""),
                    "evidence_required": step.get("evidence_required", ""),
                    "department": step.get("owner", ""),
                    "due_date": step.get("due_date", "")
                })

        target_lang = "English" if lang_lower == "english" else "Kannada"
        translated = translate_structured_data(payload, target_lang)
        return translated
