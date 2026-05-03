# app/routers/chat.py
#
# OPTIMIZED — target latency: 2–5 s
#
# KEY CHANGES vs original:
#   OPT-1  HyDE removed entirely  (-2–5 s per non-entity query)
#   OPT-2  Single LLM call always  (-2–5 s eliminated pass-2)
#   OPT-3  k reduced 6 → 4  (shorter prompt → faster LLM inference)
#   OPT-4  Structured context always injected in pass-1 prompt
#          (eliminates the NOT_FOUND → retry loop that caused pass-2)
#   OPT-5  Per-stage timing logged at INFO level for production debugging
#   OPT-6  Keyword hard-fallback kept but no LLM call needed for it

from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database.session import SessionLocal
from app.models.case_document import CaseDocument
from app.services.llm_service import call_llm
from app.services.rag_service import is_entity_query, retrieve_chunks, debug_retrieval

router = APIRouter()
logger = logging.getLogger(__name__)

# ── Retrieval config ──────────────────────────────────────────────────────────
_TOP_K = 4   # OPT-3: was 6; 4 chunks keep the prompt tight


# ══════════════════════════════════════════════════════════════════════════════
# REQUEST / RESPONSE MODELS
# ══════════════════════════════════════════════════════════════════════════════

class ChatRequest(BaseModel):
    document_id: int
    question:    str


class ChatResponse(BaseModel):
    answer:                 str
    context_snippets:       List[str]
    total_chunks_retrieved: int
    retrieval_mode:         str   # "rag" | "rag+structured" | "structured" | "fallback"
    latency_ms:             int   # OPT-5: always expose latency


class DebugRequest(BaseModel):
    document_id: int
    question:    str


# ══════════════════════════════════════════════════════════════════════════════
# SYSTEM PROMPT  (unchanged — accuracy preserved)
# ══════════════════════════════════════════════════════════════════════════════

_SYSTEM = """\
You are a precise legal document analyst.

Rules:
1. Answer ONLY from the provided document excerpts and structured fields below.
2. Scan EVERY excerpt carefully — party names, amounts, dates, and account
   numbers are often embedded inside longer sentences. Extract them exactly
   as written in the text.
3. For party/name questions: list ALL names found — borrowers, co-borrowers,
   guarantors, petitioners, respondents, and any related persons.
   Include their relationship markers (S/o, W/o, D/o) and addresses if present.
4. For amount questions: state the exact figure including denomination
   (e.g. Rs.18,50,000/-). Do NOT round or paraphrase amounts.
5. Cite the excerpt number where you found the information, e.g. [Excerpt 2].
6. If the same information appears in multiple excerpts, synthesise and confirm.
7. NEVER use prior knowledge, infer, or guess.
8. If you find a PARTIAL match (e.g. only the first name), report what you
   found rather than saying NOT_FOUND.
9. Only say "Not mentioned in document" if you have checked every excerpt
   AND every structured field and the answer is genuinely absent."""


# ══════════════════════════════════════════════════════════════════════════════
# PROMPT BUILDERS
# ══════════════════════════════════════════════════════════════════════════════

def _build_prompt(
    question:       str,
    chunks:         List[str],
    structured_ctx: Dict[str, Any],
) -> str:
    """
    OPT-2 / OPT-4: Single combined prompt — RAG excerpts + structured JSON.
    This replaces the original two-pass (pass-1 RAG, pass-2 enriched) approach.
    The LLM sees everything in one shot → one LLM call, not two.
    """
    parts: List[str] = []

    # ── Structured fields first (entity anchor, extracted JSON) ───────────────
    if structured_ctx:
        # Emit only the fields that are directly useful for Q&A
        useful_keys = {
            "borrower", "co_borrowers", "loan_amount", "department",
            "date_of_order", "deadline_date", "timeline", "action_required",
            "priority", "directives", "case_details", "summary",
        }
        slim: Dict[str, Any] = {}
        for k, v in (structured_ctx.get("extracted_fields") or {}).items():
            if k in useful_keys and v:
                slim[k] = v
        # Also surface action plan steps if asked about actions / deadlines
        plan_steps = (
            (structured_ctx.get("action_plan") or {})
            .get("plan", {})
            .get("steps", [])
        )

        if slim or plan_steps:
            parts.append("=== STRUCTURED FIELDS EXTRACTED FROM DOCUMENT ===")
            if slim:
                parts.append(json.dumps(slim, indent=2, ensure_ascii=False))
            if plan_steps:
                parts.append("\nAction plan steps:")
                for s in plan_steps:
                    parts.append(
                        f"  • {s.get('step')} — owner: {s.get('owner')}, "
                        f"due: {s.get('due_date')}"
                    )
            parts.append("")

    # ── RAG excerpts ──────────────────────────────────────────────────────────
    if chunks:
        parts.append("=== DOCUMENT EXCERPTS (retrieved) ===")
        for i, chunk in enumerate(chunks):
            parts.append(f"[Excerpt {i + 1}]\n{chunk}")
            parts.append("")

    parts.append("─" * 60)
    parts.append(f"Question: {question}")
    parts.append("")
    parts.append(
        "Instructions: Check structured fields first, then scan every excerpt "
        "for names, amounts, dates, and party details. Extract exact text — "
        "do not paraphrase numbers or names. Cite your source."
    )
    parts.append("")
    parts.append("Answer:")

    return "\n".join(parts)


def _build_structured_only_prompt(
    question:       str,
    structured_ctx: Dict[str, Any],
) -> str:
    """Used only when RAG retrieval returns zero chunks."""
    return (
        f"Structured data extracted from the document:\n"
        f"```json\n{json.dumps(structured_ctx, indent=2, ensure_ascii=False)}\n```\n\n"
        f"Question: {question}\n\n"
        f"Answer using only the data above. Extract exact names, amounts, and "
        f"party details. If truly not present, say 'Not mentioned in document'."
    )


# ══════════════════════════════════════════════════════════════════════════════
# KEYWORD-ONLY HARD FALLBACK  (no LLM call needed)
# ══════════════════════════════════════════════════════════════════════════════

def _keyword_answer(question: str, doc: Any) -> str | None:
    """
    OPT-6: Zero-latency keyword fallback for the most common structured queries.
    Returns a pre-formed answer string, or None if not applicable.
    No LLM call needed — answer comes directly from DB fields.
    """
    q = question.lower()
    ex = doc.extracted_json or {}
    plan = (doc.action_plan or {}).get("plan", {})

    if any(kw in q for kw in ("deadline", "timeline", "due date", "when")):
        val = ex.get("deadline_date") or ex.get("timeline")
        if val:
            return f"Deadline / Timeline: {val}"

    if any(kw in q for kw in ("department", "authority", "which dept")):
        val = ex.get("department")
        if val:
            return f"Department: {val}"

    if any(kw in q for kw in ("priority", "urgency", "how urgent")):
        val = ex.get("priority")
        if val:
            return f"Priority: {val}"

    if any(kw in q for kw in ("action", "next step", "what should")):
        steps = plan.get("steps", [])
        if steps:
            return f"Recommended action: {steps[0].get('step', '')}"

    return None


# ══════════════════════════════════════════════════════════════════════════════
# MAIN ENDPOINT
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    t_start = time.perf_counter()

    with SessionLocal() as db:
        doc = db.query(CaseDocument).filter(
            CaseDocument.id == req.document_id
        ).first()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        question = req.question.strip()

        # ── Structured context (built once, used everywhere) ──────────────────
        structured_ctx: Dict[str, Any] = {}
        if doc.extracted_json:
            structured_ctx["extracted_fields"] = doc.extracted_json
        if doc.action_plan:
            structured_ctx["action_plan"] = doc.action_plan

        # ── OPT-6: Try zero-latency keyword answer first ──────────────────────
        kw_answer = _keyword_answer(question, doc)
        if kw_answer and not is_entity_query(question):
            elapsed = int((time.perf_counter() - t_start) * 1000)
            logger.info("chat: keyword shortcut in %d ms", elapsed)
            return ChatResponse(
                answer=kw_answer,
                context_snippets=[],
                total_chunks_retrieved=0,
                retrieval_mode="fallback",
                latency_ms=elapsed,
            )

        # ── STAGE 1: Retrieval  (OPT-1: no HyDE — use raw question) ──────────
        t_ret = time.perf_counter()
        try:
            retrieved_chunks = retrieve_chunks(
                req.document_id,
                question,   # OPT-1: raw question, no HyDE expansion
                k=_TOP_K,   # OPT-3: 4 instead of 6
            )
        except Exception as exc:
            logger.error("Retrieval error: %s", exc)
            retrieved_chunks = []

        t_ret_done = time.perf_counter()
        logger.info(
            "chat: retrieval=%.2fs  chunks=%d  entity=%s  query='%s'",
            t_ret_done - t_ret,
            len(retrieved_chunks),
            is_entity_query(question),
            question,
        )

        retrieval_mode = "fallback"

        # ── STAGE 2: Single LLM call  (OPT-2: always one call, never two) ────
        t_llm = time.perf_counter()
        answer: str

        if retrieved_chunks:
            # OPT-4: structured context always in the FIRST (and only) prompt
            prompt = _build_prompt(question, retrieved_chunks, structured_ctx)
            retrieval_mode = "rag+structured" if structured_ctx else "rag"
        elif structured_ctx:
            prompt = _build_structured_only_prompt(question, structured_ctx)
            retrieval_mode = "structured"
        else:
            elapsed = int((time.perf_counter() - t_start) * 1000)
            return ChatResponse(
                answer="No document content available to answer this question.",
                context_snippets=[],
                total_chunks_retrieved=0,
                retrieval_mode="fallback",
                latency_ms=elapsed,
            )

        raw_answer = call_llm(prompt=prompt, system_prompt=_SYSTEM)
        t_llm_done = time.perf_counter()
        logger.info("chat: llm=%.2fs", t_llm_done - t_llm)

        if not raw_answer:
            answer = "Could not generate an answer — please try again."
        elif raw_answer.strip() == "NOT_FOUND":
            answer = "The requested information was not found in the document."
        else:
            answer = raw_answer

        elapsed_ms = int((time.perf_counter() - t_start) * 1000)
        logger.info(
            "chat: TOTAL=%d ms  mode=%s  doc=%d",
            elapsed_ms, retrieval_mode, req.document_id,
        )

        return ChatResponse(
            answer=answer,
            context_snippets=retrieved_chunks[:3],
            total_chunks_retrieved=len(retrieved_chunks),
            retrieval_mode=retrieval_mode,
            latency_ms=elapsed_ms,
        )


# ══════════════════════════════════════════════════════════════════════════════
# DEBUG ENDPOINT  (unchanged — useful for diagnosing retrieval issues)
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/chat/debug")
def chat_debug(req: DebugRequest) -> Dict:
    """
    Returns full retrieval diagnostics without calling the LLM.

    Interpretation:
      final_chunks    → what the LLM actually sees; if answer is here, debug prompt
      semantic_top10  → top semantic hits
      bm25_top10      → top BM25 hits
      keyword_top10   → brute-force scan results
      diagnosis       → quick verdict
    """
    return debug_retrieval(req.document_id, req.question)