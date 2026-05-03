from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import json
import logging
from app.database.session import SessionLocal
from app.models.case_document import CaseDocument
from app.services.llm_service import call_llm

router = APIRouter()
logger = logging.getLogger(__name__)

class ChatRequest(BaseModel):
    document_id: int
    question: str
    language: str = "English"

@router.post("/chat")
def chat(req: ChatRequest):
    with SessionLocal() as db:
        doc = db.query(CaseDocument).filter(CaseDocument.id == req.document_id).first()
        if not doc or not doc.extracted_json:
            raise HTTPException(404, "Document not ready")
        
        q = req.question.strip()
        
        try:
            system_prompt = (
                "You are a helpful legal AI assistant for a Government Decision Intelligence System. "
                f"You MUST respond in {req.language}. "
                "You answer questions based strictly on the provided context (case details, action plan, extracted directives). "
                "Do NOT hallucinate. If the answer is not in the context, say so. Keep answers concise."
            )
            context = json.dumps({
                "extracted_data": doc.extracted_json,
                "action_plan": doc.action_plan,
            })
            answer = call_llm(prompt=f"Context:\n{context}\n\nQuestion: {q}", system_prompt=system_prompt)
            if not answer:
                raise RuntimeError("LLM chat failed")
        except Exception as e:
            logger.error(f"Chat failed: {e}")
            # Fallback logic if LLM fails
            q_lower = q.lower()
            if "deadline" in q_lower:
                answer = f"Timeline: {doc.extracted_json.get('timeline', 'Not specified')}"
            elif "what should we do" in q_lower or "action" in q_lower:
                first = ((doc.action_plan or {}).get("plan", {}).get("steps", [{}])[0]).get("step", "Generate action plan first.")
                answer = f"Recommended action: {first}"
            else:
                answer = "Refer verified directives and action plan. (AI API unavailable)"
                
        return {"answer": answer, "context_snippets": doc.extracted_json.get("directives", [])[:3]}
