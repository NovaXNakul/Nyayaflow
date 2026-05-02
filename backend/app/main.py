from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

from dotenv import load_dotenv
import os

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
USE_LLM = os.getenv("USE_LLM", "true").lower() == "true"


import fitz
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field
from sqlalchemy import JSON, Column, DateTime, Integer, String, Text, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.orm.attributes import flag_modified

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
DB_URL = os.getenv("DATABASE_URL", "sqlite:///./court_intelligence.db")
OPENAI_MODEL = "gpt-4o-mini"

if "sqlite" in DB_URL:
    engine = create_engine(DB_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DB_URL)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()
client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None


class CaseDocument(Base):
    __tablename__ = "case_documents"
    id = Column(Integer, primary_key=True)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    raw_text = Column(Text, nullable=True)
    extracted_json = Column(JSON, nullable=True)
    action_plan = Column(JSON, nullable=True)
    status = Column(String(50), default="uploaded")
    created_at = Column(DateTime, default=datetime.utcnow)


Base.metadata.create_all(bind=engine)


class ExtractRequest(BaseModel):
    document_id: int


class ActionRequest(BaseModel):
    document_id: int


class VerifyRequest(BaseModel):
    document_id: int
    decision: str
    payload: dict[str, Any] | None = None


class ChatRequest(BaseModel):
    document_id: int
    question: str


class StructuredOutput(BaseModel):
    case_details: str = ""
    date_of_order: str = ""
    directives: list[str] = Field(default_factory=list)
    timeline: str = ""
    deadline_date: str = ""
    action_required: str = ""
    department: str = ""
    priority: str = ""
    confidence_score: float = 0.0
    source_reference: str = "paragraph/page"


app = FastAPI(title="Court Decision Intelligence System")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"], allow_credentials=True)


def extract_pdf_text(file_path: str):
    try:
        doc = fitz.open(file_path)
    except Exception as e:
        raise HTTPException(422, f"Failed to read PDF: {e}")
    pages = []
    for i, page in enumerate(doc):
        pages.append({"page": i + 1, "text": page.get_text("text") or ""})
    doc.close()
    merged = "\n\n".join([f"[Page {p['page']}]\n{p['text']}" for p in pages])
    return merged, pages



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
    timeline_match = re.search(r"within\s+\d+\s+days", text.lower())
    out = StructuredOutput(
        case_details="Judgment parsed for actionable directives.",
        date_of_order=date_match.group(1) if date_match else datetime.utcnow().strftime("%d/%m/%Y"),
        directives=directives,
        timeline=timeline_match.group(0) if timeline_match else "Timeline not explicit",
        action_required=directives[0],
        department=infer_department(text),
        priority="Medium",
        confidence_score=0.74,
        source_reference=f"page {pages[0]['page'] if pages else 1}",
    ).model_dump()
    highlights = [{"field": "directive", "text": d, "source_reference": out["source_reference"]} for d in directives[:3]]
    return out, highlights


def llm_extract(text: str) -> dict:
    """Extract structured data from legal judgment text using OpenAI GPT-4o-mini.

    Returns a dict matching the StructuredOutput schema with an additional
    ``deadline_date`` field computed by the LLM from today's date.
    Raises on any failure so the caller can fall back to heuristic extraction.
    """
    if not client:
        raise RuntimeError("OpenAI client not configured (OPENAI_API_KEY missing)")

    today = datetime.utcnow().strftime("%Y-%m-%d")

    system_prompt = (
        "You are a legal document analysis AI specialising in Indian court "
        "judgments and government orders.\n\n"
        "Return ONLY valid JSON (no markdown fences, no explanation) with "
        "this EXACT structure:\n"
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
        "}\n\n"
        "RULES:\n"
        "- directives: ONLY actionable sentences. NO filler or background.\n"
        "- timeline: detect phrases like 'within 30 days', 'within 2 weeks', "
        "'forthwith', 'immediately'.\n"
        "- deadline_date: convert the timeline into an actual calendar date "
        "from today (" + today + "). If no timeline found, use 'Not specified'.\n"
        "- action_required: 'Compliance required' for mandatory orders; "
        "'Consider appeal' if the order is adverse and challengeable.\n"
        "- department: infer from mentions of respondent, authority, department, "
        "ministry, or named entities.\n"
        "- priority: High → strict deadline OR penalties/contempt. "
        "Medium → normal directive. Low → informational only.\n"
        "- confidence_score: float 0.0-1.0 reflecting extraction confidence.\n"
        "- Return ONLY the JSON object."
    )

    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": (
                    "Extract structured data from this legal document:\n\n"
                    + text[:8000]
                ),
            },
        ],
        temperature=0.1,
        max_tokens=2000,
    )

    raw = response.choices[0].message.content.strip()

    # Strip markdown fences if the model wrapped the JSON
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

    parsed: dict = json.loads(raw)

    # Ensure every required key exists with a sensible default
    defaults: dict[str, Any] = {
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

    # Type guards
    if not isinstance(parsed["directives"], list):
        parsed["directives"] = [str(parsed["directives"])]
    parsed["confidence_score"] = float(parsed["confidence_score"])

    return parsed


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


@app.get("/")
def root():
    return {"message": "Court Decision Intelligence API"}


@app.post("/upload")
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


@app.post("/extract")
def extract(req: ExtractRequest):
    print(f"Extracting document {req.document_id}")
    with SessionLocal() as db:
        doc = db.query(CaseDocument).filter(CaseDocument.id == req.document_id).first()
        if not doc:
            raise HTTPException(404, "Document not found")
        text, pages = extract_pdf_text(doc.file_path) if doc.filename.lower().endswith(".pdf") else ("Excel input uploaded.", [{"page": 1, "text": "Excel input"}])

        # Try LLM extraction first if enabled, fallback to heuristic
        extraction_method = "heuristic"
        if USE_LLM:
            try:
                extracted = llm_extract(text)
                extraction_method = "llm"
                source_ref = extracted.get("source_reference", "page 1")
                highlights = [
                    {"field": "directive", "text": d, "source_reference": source_ref}
                    for d in extracted.get("directives", [])[:3]
                ]
            except Exception as e:
                logger.warning("LLM extraction failed, falling back to heuristic: %s", e)
                extracted, highlights = heuristic_extract(text, pages)
        else:
            extracted, highlights = heuristic_extract(text, pages)

        doc.raw_text = text
        doc.extracted_json = extracted
        doc.status = "extracted"
        db.commit()
        similar_cases = [{"document_id": d.id, "department": (d.extracted_json or {}).get("department", "Unknown"), "priority": (d.extracted_json or {}).get("priority", "Unknown")} for d in db.query(CaseDocument).filter(CaseDocument.id != doc.id).all()[:3]]
        print(f"Extracted data: {extracted}")
        return {
            "document_id": doc.id,
            "status": doc.status,
            "extraction_method": extraction_method,
            "extracted_data": extracted,
            "highlights": highlights,
            "similar_cases": similar_cases,
            "simplified_text": "Simple summary: " + " ".join(text.split()[:90]) + "...",
        }


@app.post("/generate-action")
def generate_action(req: ActionRequest):
    with SessionLocal() as db:
        doc = db.query(CaseDocument).filter(CaseDocument.id == req.document_id).first()
        if not doc or not doc.extracted_json:
            raise HTTPException(404, "Document not extracted")
        risk = risk_assessment(doc.raw_text or "")
        # Copy to avoid in-place mutation not tracked by SQLAlchemy
        updated_json = dict(doc.extracted_json)
        updated_json["priority"] = risk["priority"]
        doc.extracted_json = updated_json
        flag_modified(doc, "extracted_json")
        plan = {
            "steps": [
                {"step": "Assign nodal officer", "owner": doc.extracted_json.get("department"), "due_date": datetime.utcnow().strftime("%Y-%m-%d"), "evidence_required": "Assignment memo"},
                {"step": "Draft compliance response", "owner": "Legal Cell", "due_date": datetime.utcnow().strftime("%Y-%m-%d"), "evidence_required": "Draft report"},
                {"step": "Submit action taken report", "owner": "Department Head", "due_date": datetime.utcnow().strftime("%Y-%m-%d"), "evidence_required": "Signed ATR"},
            ],
            "compliance_notes": "Track timestamps and proof docs.",
            "escalation_path": "Nodal Officer -> Department Head -> Chief Secretary",
        }
        doc.action_plan = {"plan": plan, "risk_assessment": risk}
        doc.status = "action_generated"
        db.commit()
        return {"document_id": doc.id, "action_plan": plan, "risk_assessment": risk}


@app.post("/verify")
def verify(req: VerifyRequest):
    with SessionLocal() as db:
        doc = db.query(CaseDocument).filter(CaseDocument.id == req.document_id).first()
        if not doc:
            raise HTTPException(404, "Document not found")
        if req.decision not in {"approve", "edit", "reject"}:
            raise HTTPException(400, "decision must be approve/edit/reject")
        if req.decision == "edit" and req.payload:
            doc.extracted_json = req.payload
            doc.status = "edited"
        elif req.decision == "approve":
            doc.status = "approved"
        else:
            doc.status = "rejected"
        if doc.action_plan and req.decision in {"approve", "edit"}:
            updated_plan = dict(doc.action_plan)
            updated_plan["compliance_proof"] = {
                "actions_taken": updated_plan["plan"]["steps"],
                "timestamps": [{"event": "verified", "time": datetime.utcnow().isoformat()}],
                "responsibility": updated_plan["plan"]["escalation_path"],
            }
            doc.action_plan = updated_plan
            flag_modified(doc, "action_plan")
        db.commit()
        return {"document_id": doc.id, "verification_status": doc.status}


@app.get("/dashboard")
def dashboard():
    with SessionLocal() as db:
        approved = db.query(CaseDocument).filter(CaseDocument.status == "approved").all()
        approved_cases = []
        department_breakdown = {}
        priority_breakdown = {}
        deadlines = []
        for d in approved:
            ex = d.extracted_json or {}
            approved_cases.append({
                "document_id": d.id,
                "department": ex.get("department", "Unknown"),
                "priority": ex.get("priority", "Unknown"),
                "timeline": ex.get("timeline", ""),
                "action_required": ex.get("action_required", ""),
            })
            dept = ex.get("department", "Unknown")
            pr = ex.get("priority", "Unknown")
            department_breakdown[dept] = department_breakdown.get(dept, 0) + 1
            priority_breakdown[pr] = priority_breakdown.get(pr, 0) + 1
            deadlines.append({"document_id": d.id, "timeline": ex.get("timeline", "NA")})
        return {
            "approved_cases": approved_cases,
            "department_breakdown": department_breakdown,
            "deadlines": deadlines,
            "priority_breakdown": priority_breakdown,
        }


@app.post("/chat")
def chat(req: ChatRequest):
    with SessionLocal() as db:
        doc = db.query(CaseDocument).filter(CaseDocument.id == req.document_id).first()
        if not doc or not doc.extracted_json:
            raise HTTPException(404, "Document not ready")
        q = req.question.lower()
        if "deadline" in q:
            answer = f"Timeline: {doc.extracted_json.get('timeline', 'Not specified')}"
        elif "what should we do" in q or "action" in q:
            first = ((doc.action_plan or {}).get("plan", {}).get("steps", [{}])[0]).get("step", "Generate action plan first.")
            answer = f"Recommended action: {first}"
        else:
            answer = "Refer verified directives and action plan."
        return {"answer": answer, "context_snippets": doc.extracted_json.get("directives", [])[:3]}
