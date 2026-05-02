# app/services/extraction_service.py
#
# Structured extraction from legal document text.
# CRITICAL ADDITION: calls rag_service.update_entity_anchor() after extraction
# so that entity queries ALWAYS find borrower names, loan amounts, etc. via
# the dedicated entity anchor chunk — even if chunking split the raw PDF text
# at an inconvenient boundary.

import json
import re
import logging
from datetime import datetime, timedelta
from typing import Any
from app.services.llm_service import call_llm

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def infer_department(text: str) -> str:
    t = text.lower()
    if "education" in t:
        return "Education Department"
    if "revenue" in t:
        return "Revenue Department"
    return "General Administration"


def risk_assessment(text: str) -> dict:
    t = text.lower()
    score = 0
    for kw in ["contempt", "penalty", "immediate", "within 7 days"]:
        if kw in t:
            score += 2
    if "within 30 days" in t:
        score += 1
    if score >= 5:
        return {"priority": "High",   "score": score}
    if score >= 2:
        return {"priority": "Medium", "score": score}
    return      {"priority": "Low",   "score": score}


def _strip_fences(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$",          "", text)
    return text.strip()


# ══════════════════════════════════════════════════════════════════════════════
# HEURISTIC EXTRACTION  (no LLM — used as fallback)
# ══════════════════════════════════════════════════════════════════════════════

def heuristic_extract(text: str, pages: list[dict[str, Any]]) -> tuple[dict, list]:
    directives = [
        ln.strip() for ln in text.splitlines()
        if any(k in ln.lower() for k in ["directed", "shall", "within", "must"])
    ]
    directives = directives[:6] or ["Manual review required."]

    date_match     = re.search(r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})", text)
    timeline_match = re.search(r"within\s+(\d+)\s+days", text.lower())

    timeline_str      = timeline_match.group(0) if timeline_match else "Timeline not explicit"
    deadline_date_str = ""
    if timeline_match:
        days              = int(timeline_match.group(1))
        deadline_date_str = (datetime.utcnow() + timedelta(days=days)).strftime("%Y-%m-%d")

    out = {
        "case_details":     "Judgment parsed for actionable directives.",
        "date_of_order":    date_match.group(1) if date_match else datetime.utcnow().strftime("%d/%m/%Y"),
        "directives":       directives,
        "timeline":         timeline_str,
        "deadline_date":    deadline_date_str,
        "action_required":  directives[0] if directives else "",
        "department":       infer_department(text),
        "priority":         "Medium",
        "confidence_score": 0.74,
        "source_reference": f"page {pages[0]['page'] if pages else 1}",
    }
    highlights = [
        {"field": "directive", "text": d, "source_reference": out["source_reference"]}
        for d in directives[:3]
    ]
    return out, highlights


# ══════════════════════════════════════════════════════════════════════════════
# LLM EXTRACTION
# ══════════════════════════════════════════════════════════════════════════════

def llm_extract(text: str) -> dict:
    today = datetime.utcnow().strftime("%Y-%m-%d")
    system_prompt = (
        "You are a legal document analysis AI specialising in Indian court "
        "judgments and government orders.\n\n"
        "Return ONLY valid JSON with this EXACT structure — no preamble, "
        "no markdown fences:\n"
        "{\n"
        '  "case_details": "Brief factual summary of the case",\n'
        '  "date_of_order": "Date found in the document (DD/MM/YYYY)",\n'
        '  "directives": ["Only actionable sentences – orders, directions, mandates"],\n'
        '  "timeline": "Compliance timeline phrase (e.g. within 30 days)",\n'
        '  "deadline_date": "Actual deadline YYYY-MM-DD computed from today ' + today + '",\n'
        '  "action_required": "Compliance required OR Consider appeal",\n'
        '  "department": "Inferred department/authority from context",\n'
        '  "priority": "High / Medium / Low",\n'
        '  "confidence_score": 0.85,\n'
        '  "source_reference": "page/paragraph reference",\n'
        '  "borrower": "Full name of borrower/petitioner (extract exactly as written)",\n'
        '  "co_borrowers": ["List of co-borrowers/guarantors with full names"],\n'
        '  "loan_amount": "Exact loan amount with denomination (e.g. Rs.18,50,000/-)"\n'
        "}\n\n"
        "CRITICAL: For borrower, co_borrowers, and loan_amount — extract the "
        "EXACT text as it appears in the document. Do not paraphrase or omit "
        "relationship markers (S/o, W/o, D/o)."
    )

    prompt        = f"Extract structured data from this legal document:\n\n{text[:8000]}"
    response_text = call_llm(prompt=prompt, system_prompt=system_prompt)

    if not response_text:
        raise RuntimeError("LLM extraction failed (returned None)")

    parsed = json.loads(_strip_fences(response_text))

    # Apply defaults for missing keys
    defaults: dict = {
        "case_details":     "",
        "date_of_order":    "",
        "directives":       [],
        "timeline":         "",
        "deadline_date":    "",
        "action_required":  "",
        "department":       "",
        "priority":         "Medium",
        "confidence_score": 0.0,
        "source_reference": "",
        "borrower":         "",
        "co_borrowers":     [],
        "loan_amount":      "",
    }
    for key, default in defaults.items():
        parsed.setdefault(key, default)

    if not isinstance(parsed["directives"], list):
        parsed["directives"] = [str(parsed["directives"])]
    if not isinstance(parsed["co_borrowers"], list):
        parsed["co_borrowers"] = [str(parsed["co_borrowers"])] if parsed["co_borrowers"] else []

    parsed["confidence_score"] = float(parsed["confidence_score"])
    return parsed


# ══════════════════════════════════════════════════════════════════════════════
# ACTION PLAN GENERATION
# ══════════════════════════════════════════════════════════════════════════════

def generate_action_plan_llm(doc_json: dict) -> dict:
    system_prompt = (
        "You are a Government workflow AI. Generate a step-by-step action plan "
        "based on the following case data.\n\n"
        "Output ONLY valid JSON matching this structure — no preamble, no fences:\n"
        "{\n"
        '  "steps": [\n'
        '    {"step": "Detailed step description", "owner": "Department or Role", '
        '"due_date": "YYYY-MM-DD", "evidence_required": "Document needed"}\n'
        "  ],\n"
        '  "compliance_notes": "Decision on compliance vs appeal and reasoning",\n'
        '  "escalation_path": "Escalation hierarchy (e.g. Officer -> Head -> Secretary)"\n'
        "}\n"
    )

    user_content = json.dumps({
        "directives":      doc_json.get("directives", []),
        "department":      doc_json.get("department", ""),
        "timeline":        doc_json.get("timeline", ""),
        "deadline_date":   doc_json.get("deadline_date", ""),
        "action_required": doc_json.get("action_required", ""),
    })

    response_text = call_llm(prompt=user_content, system_prompt=system_prompt)
    if not response_text:
        raise RuntimeError("LLM action plan generation failed")

    return json.loads(_strip_fences(response_text))


# ══════════════════════════════════════════════════════════════════════════════
# POST-EXTRACTION ENTITY ANCHOR UPDATE
# ══════════════════════════════════════════════════════════════════════════════

def push_entities_to_index(document_id: int, extracted: dict) -> None:
    """
    After LLM extraction, push the key entities into the RAG entity anchor chunk.
    This ensures that queries like "who is the borrower?" ALWAYS find this chunk.

    Call this from your upload/processing endpoint immediately after llm_extract().
    """
    try:
        from app.services.rag_service import update_entity_anchor
        entity_fields = {
            "borrower":     extracted.get("borrower", ""),
            "co_borrowers": extracted.get("co_borrowers", []),
            "loan_amount":  extracted.get("loan_amount", ""),
            "department":   extracted.get("department", ""),
            "date_of_order":extracted.get("date_of_order", ""),
            "case_details": extracted.get("case_details", ""),
            "priority":     extracted.get("priority", ""),
        }
        update_entity_anchor(document_id, entity_fields)
        logger.info(
            "push_entities_to_index: updated entity anchor for doc %d — borrower='%s' amount='%s'",
            document_id,
            entity_fields.get("borrower", ""),
            entity_fields.get("loan_amount", ""),
        )
    except Exception as exc:
        # Non-fatal: RAG will still work from raw PDF chunks
        logger.error("push_entities_to_index failed for doc %d: %s", document_id, exc)