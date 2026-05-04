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

def llm_extract(text: str, language: str = "English") -> dict:
    today = datetime.utcnow().strftime("%Y-%m-%d")
    
    # Step 1: Extract in English first for maximum reliability
    system_prompt = (
<<<<<<< HEAD
        f"You are a legal document analysis AI specialising in Indian court judgments and government orders.\n"
        f"Extract the following information from the text. Return ONLY valid JSON.\n\n"
        "Return ONLY valid JSON with this EXACT structure:\n"
=======
        "You are a legal document analysis AI specialising in Indian court "
        "judgments and government orders.\n\n"
        "Return ONLY valid JSON with this EXACT structure — no preamble, "
        "no markdown fences:\n"
>>>>>>> ce1ac875ba943c9b0fcd915674b8341a044b5c1f
        "{\n"
        '  "case_details": "Brief factual summary of the case",\n'
        '  "date_of_order": "Date found in the document (DD/MM/YYYY)",\n'
        '  "directives": ["Only actionable sentences – orders, directions, mandates"],\n'
        '  "timeline": "Compliance timeline phrase (e.g. within 30 days)",\n'
        '  "deadline_date": "Actual deadline YYYY-MM-DD computed from today ' + today + '",\n'
        '  "action_required": "Short action phrase (e.g. Compliance required)",\n'
        '  "department": "Inferred department/authority",\n'
        '  "priority": "High" or "Medium" or "Low",\n'
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

<<<<<<< HEAD
    prompt = f"Analyze the following court judgment text and extract the details:\n\n{text[:8000]}"
    
=======
    prompt        = f"Extract structured data from this legal document:\n\n{text[:8000]}"
>>>>>>> ce1ac875ba943c9b0fcd915674b8341a044b5c1f
    response_text = call_llm(prompt=prompt, system_prompt=system_prompt)

    if not response_text:
        raise RuntimeError("LLM extraction failed (returned None)")

    parsed = json.loads(_strip_fences(response_text))

<<<<<<< HEAD
    parsed = json.loads(raw)

    # Step 2: Translate values if language is not English
    if language != "English":
        print(f"Translating extracted results to {language}...")
        parsed = translate_structured_data(parsed, language)

    # Ensure all keys exist
    defaults = {
        "case_details": "",
        "date_of_order": "",
        "directives": [],
        "timeline": "",
        "deadline_date": "",
        "action_required": "",
        "department": "",
        "priority": "Medium",
=======
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
>>>>>>> ce1ac875ba943c9b0fcd915674b8341a044b5c1f
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

<<<<<<< HEAD
def generate_action_plan_llm(doc_json: dict, language: str = "English") -> dict:
    # Step 1: Generate plan in English
    system_prompt = (
        f"You are a Government workflow AI. Generate a step-by-step action plan in {language} based on the following case data.\n"
        f"Use the native script for {language}. "
        "Output ONLY valid JSON matching this structure:\n"
        "{\n"
        '  "steps": [\n'
        '    {"step": "Detailed step description", "owner": "Department or Role", "due_date": "YYYY-MM-DD", "evidence_required": "Document needed"}\n'
        '  ],\n'
=======

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
>>>>>>> ce1ac875ba943c9b0fcd915674b8341a044b5c1f
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
<<<<<<< HEAD
        
    raw = response_text.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    plan = json.loads(raw)
    return plan

def translate_structured_data(data: dict, target_lang: str) -> dict:
    """Translates only the string values in a JSON structure using a single batch LLM call."""
    if not data or not target_lang:
        return data

    target_lang = target_lang.strip().title()

    # 1. Collect all translatable strings into an ordered list with simple numeric keys
    translatable_list = []
    
    def collect_strings(obj):
        if isinstance(obj, str) and len(obj.strip()) > 1:
            if re.match(r"^[\d\s\.\/\-\(\),:]+$", obj.strip()):
                return obj
            
            idx = len(translatable_list)
            translatable_list.append(obj)
            return f"__TR_{idx}__"
        
        elif isinstance(obj, dict):
            return {k: collect_strings(v) for k, v in obj.items()}
        
        elif isinstance(obj, list):
            return [collect_strings(v) for v in obj]
        
        return obj

    # Create a placeholder structure and the map to translate
    placeholder_structure = collect_strings(data)
    translatable_map = {f"__TR_{i}__": val for i, val in enumerate(translatable_list)}
    
    if not translatable_map:
        return data

    # 2. Translate all strings in one batch using a numbered list (more stable than JSON)
    system_prompt = (
        f"You are a legal translator. Translate every line into {target_lang} exactly. "
        "Keep technical legal terms, dates, and names accurate. "
        "Return ONLY the translations, one per line, starting with the same index numbers (e.g., 0. [translation])."
    )

    numbered_lines = [f"{i}. {val}" for i, val in enumerate(translatable_list)]
    batch_prompt = "\n".join(numbered_lines)
    
    try:
        response_text = call_llm(batch_prompt, system_prompt)
        if not response_text:
            return data
            
        # Parse the numbered lines back into a map
        translated_map = {}
        for line in response_text.strip().split('\n'):
            match = re.match(r"^(\d+)\.\s*(.*)", line.strip())
            if match:
                idx = match.group(1)
                text = match.group(2).strip()
                translated_map[f"__TR_{idx}__"] = text
    except Exception as e:
        logger.error(f"Batch translation failed: {e}")
        return data

    # 3. Put translated strings back into the structure
    def apply_translations(obj):
        if isinstance(obj, str) and obj.startswith("__TR_") and obj.endswith("__"):
            val = translated_map.get(obj, translatable_map.get(obj, ""))
            
            # Defensive cleaning for nested artifacts
            if isinstance(val, dict):
                for k in ["TEXT", "text", "translation", "value"]:
                    if k in val:
                        val = val[k]
                        break
                if isinstance(val, dict):
                    val = next(iter(val.values())) if val else ""
            
            return str(val) if val else translatable_map.get(obj, "")
        
        if isinstance(obj, dict):
            return {k: apply_translations(v) for k, v in obj.items()}
        
        if isinstance(obj, list):
            return [apply_translations(v) for v in obj]
        
        return obj

    return apply_translations(placeholder_structure)
=======

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
>>>>>>> ce1ac875ba943c9b0fcd915674b8341a044b5c1f
