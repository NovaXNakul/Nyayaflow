from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import logging
from datetime import datetime
from sqlalchemy.orm.attributes import flag_modified
from app.database.session import SessionLocal
from app.models.case_document import CaseDocument
from app.services.pdf_service import extract_pdf_text
from app.services.extraction_service import (
    llm_extract,
    heuristic_extract,
    risk_assessment,
    generate_action_plan_llm,
    push_entities_to_index,   # ← was never imported before
)

router = APIRouter()
logger = logging.getLogger(__name__)


class ExtractRequest(BaseModel):
    document_id: int


class ActionRequest(BaseModel):
    document_id: int


@router.post("/extract")
def extract(req: ExtractRequest):
    print(f"Extracting document {req.document_id}")
    with SessionLocal() as db:
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
            extracted = llm_extract(text)
            source_ref = extracted.get("source_reference", "page 1")
            highlights = [
                {"field": "directive", "text": d, "source_reference": source_ref}
                for d in extracted.get("directives", [])[:3]
            ]
        except Exception as e:
            logger.warning(f"LLM extraction failed, falling back to heuristic: {e}")
            extracted, highlights = heuristic_extract(text, pages)
            extraction_method = "heuristic"

        doc.raw_text      = text
        doc.extracted_json = extracted
        doc.status        = "extracted"
        db.commit()

        # ── CRITICAL: push named entities into the RAG entity-anchor chunk ────
        # Without this, queries like "who is the borrower?" miss the answer
        # because chunking may have split that sentence at an inconvenient boundary.
        push_entities_to_index(document_id=doc.id, extracted=extracted)

        similar_cases = [
            {
                "document_id": d.id,
                "department":  (d.extracted_json or {}).get("department", "Unknown"),
                "priority":    (d.extracted_json or {}).get("priority",   "Unknown"),
            }
            for d in db.query(CaseDocument)
                       .filter(CaseDocument.id != doc.id)
                       .all()[:3]
        ]
        print(f"Extracted data: {extracted}")

        return {
            "document_id":      doc.id,
            "status":           doc.status,
            "extraction_method": extraction_method,
            "extracted_data":   extracted,
            "highlights":       highlights,
            "similar_cases":    similar_cases,
            "simplified_text":  "Simple summary: " + " ".join(text.split()[:90]) + "...",
        }


@router.post("/generate-action")
def generate_action(req: ActionRequest):
    with SessionLocal() as db:
        doc = db.query(CaseDocument).filter(CaseDocument.id == req.document_id).first()
        if not doc or not doc.extracted_json:
            raise HTTPException(404, "Document not extracted")

        risk = risk_assessment(doc.raw_text or "")

        updated_json             = dict(doc.extracted_json)
        updated_json["priority"] = risk["priority"]
        doc.extracted_json       = updated_json
        flag_modified(doc, "extracted_json")

        try:
            plan = generate_action_plan_llm(doc.extracted_json)
        except Exception as e:
            logger.error(f"Action plan generation failed: {e}")
            plan = {
                "steps": [
                    {
                        "step":              "Assign nodal officer",
                        "owner":             doc.extracted_json.get("department", "Administration"),
                        "due_date":          datetime.utcnow().strftime("%Y-%m-%d"),
                        "evidence_required": "Assignment memo",
                    },
                    {
                        "step":              "Draft compliance response",
                        "owner":             "Legal Cell",
                        "due_date":          datetime.utcnow().strftime("%Y-%m-%d"),
                        "evidence_required": "Draft report",
                    },
                    {
                        "step":              "Submit action taken report",
                        "owner":             "Department Head",
                        "due_date":          datetime.utcnow().strftime("%Y-%m-%d"),
                        "evidence_required": "Signed ATR",
                    },
                ],
                "compliance_notes":  "Track timestamps and proof docs.",
                "escalation_path":   "Nodal Officer -> Department Head -> Chief Secretary",
            }

        doc.action_plan = {"plan": plan, "risk_assessment": risk}
        doc.status      = "action_generated"
        db.commit()
        return {"document_id": doc.id, "plan": plan, "risk_assessment": risk}