import json
import re
import logging
from datetime import datetime, timedelta
from typing import Any
from app.services.llm_service import call_llm

logger = logging.getLogger(__name__)

def infer_department(text: str):
    t = text.lower()
    if "education" in t:
        return "Education Department"
    if "revenue" in t:
        return "Revenue Department"
    return "General Administration"

def heuristic_extract(text: str, pages: list[dict[str, Any]]):
    directives = [ln.strip() for ln in text.splitlines() if any(k in ln.lower() for k in ["directed", "shall", "within", "must"])]
    directives = directives[:6] or ["Manual review required."]
    date_match = re.search(r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})", text)
    timeline_match = re.search(r"within\s+(\d+)\s+days", text.lower())
    
    timeline_str = timeline_match.group(0) if timeline_match else "Timeline not explicit"
    deadline_date_str = ""
    if timeline_match:
        days = int(timeline_match.group(1))
        deadline_date_str = (datetime.utcnow() + timedelta(days=days)).strftime("%Y-%m-%d")

    out = {
        "case_details": "Judgment parsed for actionable directives.",
        "date_of_order": date_match.group(1) if date_match else datetime.utcnow().strftime("%d/%m/%Y"),
        "directives": directives,
        "timeline": timeline_str,
        "deadline_date": deadline_date_str,
        "action_required": directives[0] if directives else "",
        "department": infer_department(text),
        "priority": "Medium",
        "confidence_score": 0.74,
        "source_reference": f"page {pages[0]['page'] if pages else 1}",
    }
    highlights = [{"field": "directive", "text": d, "source_reference": out["source_reference"]} for d in directives[:3]]
    return out, highlights

def risk_assessment(text: str):
    t = text.lower()
    score = 0
    for kw in ["contempt", "penalty", "immediate", "within 7 days"]:
        if kw in t:
            score += 2
    if "within 30 days" in t:
        score += 1
    if score >= 5:
        return {"priority": "High", "score": score}
    if score >= 2:
        return {"priority": "Medium", "score": score}
    return {"priority": "Low", "score": score}

def llm_extract(text: str) -> dict:
    today = datetime.utcnow().strftime("%Y-%m-%d")
    system_prompt = (
        "You are a legal document analysis AI specialising in Indian court judgments and government orders.\n\n"
        "Return ONLY valid JSON with this EXACT structure:\n"
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
        '  "source_reference": "page/paragraph reference"\n'
        "}"
    )

    prompt = f"Extract structured data from this legal document:\n\n{text[:8000]}"
    
    response_text = call_llm(prompt=prompt, system_prompt=system_prompt)
    if not response_text:
        raise RuntimeError("LLM extraction failed (returned None)")

    raw = response_text.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

    parsed = json.loads(raw)

    defaults = {
        "case_details": "",
        "date_of_order": "",
        "directives": [],
        "timeline": "",
        "deadline_date": "",
        "action_required": "",
        "department": "",
        "priority": "Medium",
        "confidence_score": 0.0,
        "source_reference": "",
    }
    for key, default in defaults.items():
        parsed.setdefault(key, default)

    if not isinstance(parsed["directives"], list):
        parsed["directives"] = [str(parsed["directives"])]
    parsed["confidence_score"] = float(parsed["confidence_score"])

    return parsed

def generate_action_plan_llm(doc_json: dict) -> dict:
    system_prompt = (
        "You are a Government workflow AI. Generate a step-by-step action plan based on the following case data.\n\n"
        "Output ONLY valid JSON matching this structure:\n"
        "{\n"
        '  "steps": [\n'
        '    {"step": "Detailed step description", "owner": "Department or Role", "due_date": "YYYY-MM-DD", "evidence_required": "Document needed"}\n'
        "  ],\n"
        '  "compliance_notes": "Decision on compliance vs appeal and reasoning",\n'
        '  "escalation_path": "Escalation hierarchy (e.g. Officer -> Head -> Secretary)"\n'
        "}\n"
    )
    
    user_content = json.dumps({
        "directives": doc_json.get("directives", []),
        "department": doc_json.get("department", ""),
        "timeline": doc_json.get("timeline", ""),
        "deadline_date": doc_json.get("deadline_date", ""),
        "action_required": doc_json.get("action_required", "")
    })
    
    response_text = call_llm(prompt=user_content, system_prompt=system_prompt)
    if not response_text:
        raise RuntimeError("LLM action plan generation failed")
        
    raw = response_text.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)
