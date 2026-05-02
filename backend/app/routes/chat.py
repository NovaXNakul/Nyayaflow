# app/routers/chat.py
#
# FastAPI chat endpoint.
# Handles: entity-safe HyDE, RAG prompting, two-pass enriched fallback,
# structured fallback, and hard keyword fallback.
#
# FIXES vs original:
#   - HyDE skipped for entity queries (was already there but now strictly enforced)
#   - LLM system prompt explicitly tells model: "do NOT say NOT_FOUND if the
#     chunk contains a partial match — extract what IS there"
#   - Pass-2 enriched prompt is more explicit about scanning entity_anchor chunk
#   - _is_not_found check tightened (false positives were swallowing good answers)

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database.session import SessionLocal
from app.models.case_document import CaseDocument
from app.services.llm_service import call_llm
from app.services.rag_service import (
    debug_retrieval,
    is_entity_query,
    retrieve_chunks,
)

router = APIRouter()
logger = logging.getLogger(__name__)

# ── Signals that mean "answer not found" ──────────────────────────────────────
# IMPORTANT: Keep this list tight — false positives here suppress real answers.
_NOT_FOUND_SIGNALS = [
    "not found in retrieved",
    "not mentioned in document",
    "not present in",
    "cannot find",
    "no information",
    "does not mention",
    "not available in",
]

def _is_not_found(text: str) -> bool:
    t = text.lower().strip()
    if t == "not_found":
        return True
    return any(sig in t for sig in _NOT_FOUND_SIGNALS)


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


class DebugRequest(BaseModel):
    document_id: int
    question:    str


# ══════════════════════════════════════════════════════════════════════════════
# HyDE
# ══════════════════════════════════════════════════════════════════════════════

def _hyde_query(question: str) -> str:
    """
    Expand the query with a hypothetical answer passage for retrieval.
    STRICTLY SKIPPED for entity queries: a hallucinated borrower name would
    push the embedding vector away from the real answer chunk.
    """
    if is_entity_query(question):
        logger.info("HyDE skipped — entity query detected")
        return question

    try:
        hypothesis = call_llm(
            prompt=question,
            system_prompt=(
                "Write a concise factual passage (3–5 sentences) that would "
                "directly answer the following question about a legal document. "
                "Write in the declarative style of a legal order or judgment. "
                "Do NOT hedge — produce a plausible specific answer."
            ),
        )
        if hypothesis:
            logger.debug("HyDE hypothesis: %.150s", hypothesis)
            return f"{question}\n{hypothesis}"
    except Exception as exc:
        logger.warning("HyDE failed: %s", exc)

    return question


# ══════════════════════════════════════════════════════════════════════════════
# PROMPT BUILDERS
# ══════════════════════════════════════════════════════════════════════════════

_SYSTEM_STRICT = """\
You are a precise legal document analyst.

Rules:
1. Answer ONLY from the provided document excerpts below.
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
8. If you find a PARTIAL match (e.g. only the first name), report what you found
   rather than saying NOT_FOUND.
9. Only respond with exactly NOT_FOUND (and nothing else) if you have scanned
   every single excerpt and the answer is genuinely absent."""


def _build_rag_prompt(question: str, chunks: List[str]) -> str:
    numbered = "\n\n".join(
        f"[Excerpt {i + 1}]\n{chunk}" for i, chunk in enumerate(chunks)
    )
    return (
        f"Document Excerpts:\n\n{numbered}\n\n"
        f"{'─' * 60}\n"
        f"Question: {question}\n\n"
        f"Instructions: Scan every excerpt above for names, amounts, dates, "
        f"and party details. Extract the exact text — do not paraphrase numbers "
        f"or names. If you find partial information, report it.\n\n"
        f"Answer (cite excerpt numbers):"
    )


def _build_enriched_prompt(
    question:   str,
    chunks:     List[str],
    structured: Dict[str, Any],
) -> str:
    """
    Pass-2 prompt: RAG excerpts + structured JSON fields side-by-side.
    Used when pass-1 returns NOT_FOUND.
    """
    numbered = "\n\n".join(
        f"[Excerpt {i + 1}]\n{chunk}" for i, chunk in enumerate(chunks)
    )
    structured_text = json.dumps(structured, indent=2, ensure_ascii=False)
    return (
        f"Structured fields already extracted from this document:\n"
        f"```json\n{structured_text}\n```\n\n"
        f"IMPORTANT: The JSON above contains an 'entity_anchor' or "
        f"'extracted_fields' section with party names and loan amounts. "
        f"Check that section first.\n\n"
        f"Document Excerpts:\n\n{numbered}\n\n"
        f"{'─' * 60}\n"
        f"Question: {question}\n\n"
        f"Answer (use structured fields AND excerpts; extract exact names and "
        f"amounts; cite your source):"
    )


def _build_structured_only_prompt(
    question:   str,
    structured: Dict[str, Any],
) -> str:
    """Fallback when RAG returns no chunks at all."""
    return (
        f"Structured data extracted from the document:\n"
        f"```json\n{json.dumps(structured, indent=2, ensure_ascii=False)}\n```\n\n"
        f"Question: {question}\n\n"
        f"Answer using only the data above. Extract exact names, amounts, and "
        f"party details. If truly not present, say 'Not mentioned in document'."
    )


# ══════════════════════════════════════════════════════════════════════════════
# MAIN ENDPOINT
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    with SessionLocal() as db:
        doc = db.query(CaseDocument).filter(
            CaseDocument.id == req.document_id
        ).first()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        question          = req.question.strip()
        retrieved_chunks: List[str] = []
        retrieval_mode    = "fallback"

        # ── Build structured context (used in pass-2 and structured fallback) ──
        structured_ctx: Dict[str, Any] = {}
        if doc.extracted_json:
            structured_ctx["extracted_fields"] = doc.extracted_json
        if doc.action_plan:
            structured_ctx["action_plan"] = doc.action_plan

        try:
            # ── STAGE 1: Retrieval ─────────────────────────────────────────────
            retrieval_query  = _hyde_query(question)
            retrieved_chunks = retrieve_chunks(
                req.document_id,
                retrieval_query,
                k=6,
            )
            logger.info(
                "chat: retrieved %d chunks for '%s'",
                len(retrieved_chunks), question,
            )
            for i, c in enumerate(retrieved_chunks):
                logger.debug("  CHUNK[%d]: %.200s", i, c)

            if not retrieved_chunks:
                logger.warning("Empty retrieval — falling back to structured-only")
                raise ValueError("empty_retrieval")

            # ── STAGE 2: Pass-1 RAG answer ────────────────────────────────────
            answer = call_llm(
                prompt=_build_rag_prompt(question, retrieved_chunks),
                system_prompt=_SYSTEM_STRICT,
            )
            if not answer:
                raise RuntimeError("LLM returned empty response on pass-1")

            retrieval_mode = "rag"
            logger.info("Pass-1 answer: %.200s", answer)

            # ── STAGE 3: Pass-2 enriched retry ───────────────────────────────
            if answer.strip() == "NOT_FOUND" or _is_not_found(answer):
                logger.info("Pass-1 NOT_FOUND — retrying with structured context")

                if structured_ctx:
                    answer_v2 = call_llm(
                        prompt=_build_enriched_prompt(
                            question, retrieved_chunks, structured_ctx
                        ),
                        system_prompt=_SYSTEM_STRICT,
                    )
                    if answer_v2:
                        answer         = answer_v2
                        retrieval_mode = "rag+structured"
                        logger.info("Pass-2 answer: %.200s", answer_v2)
                else:
                    logger.warning("No structured context available for pass-2")

            # Clean up literal sentinel
            if answer.strip() == "NOT_FOUND":
                answer = "The requested information was not found in the document excerpts."

        except ValueError as ve:
            if str(ve) == "empty_retrieval":
                # ── STAGE 4: Pure structured fallback ─────────────────────────
                if structured_ctx:
                    answer = call_llm(
                        prompt=_build_structured_only_prompt(question, structured_ctx),
                        system_prompt=(
                            "You are a legal document analyst. Answer using ONLY the "
                            "provided structured data. Extract exact names, amounts, "
                            "and party details. If not present, say "
                            "'Not mentioned in document'."
                        ),
                    ) or "Could not retrieve an answer."
                    retrieval_mode = "structured"
                else:
                    answer         = "No document content available to answer this question."
                    retrieval_mode = "fallback"
            else:
                raise

        except Exception as exc:
            logger.error("chat endpoint error: %s", exc, exc_info=True)

            # ── STAGE 5: Last-resort keyword fallback ─────────────────────────
            q_lower = question.lower()
            if any(kw in q_lower for kw in ("deadline", "timeline", "due date")):
                val    = (doc.extracted_json or {}).get("timeline", "Not specified")
                answer = f"Timeline: {val}"
            elif any(kw in q_lower for kw in ("action", "next step", "what should")):
                step = (
                    (doc.action_plan or {})
                    .get("plan", {})
                    .get("steps", [{}])[0]
                    .get("step", "Generate action plan first.")
                )
                answer = f"Recommended action: {step}"
            else:
                answer = "System error — please try again or rephrase your question."
            retrieval_mode = "fallback"

        return ChatResponse(
            answer=answer,
            context_snippets=retrieved_chunks[:3],
            total_chunks_retrieved=len(retrieved_chunks),
            retrieval_mode=retrieval_mode,
        )


# ══════════════════════════════════════════════════════════════════════════════
# DEBUG ENDPOINT
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/chat/debug")
def chat_debug(req: DebugRequest) -> Dict:
    """
    Returns full retrieval diagnostics without calling the LLM.

    How to read the output:
      final_chunks      → what the LLM actually sees
      semantic_top10    → top semantic hits (check if correct chunk is here)
      bm25_top10        → top BM25 hits (check if exact term appears here)
      keyword_top10     → brute-force scan results
      diagnosis         → quick verdict: retrieval OK or suspect
      total_indexed     → sanity-check that all chunks were indexed
      bm25_in_memory    → False means BM25 was rebuilt from Chroma (cold start)

    Debugging flow:
      1. Is the answer in final_chunks?  Yes → LLM prompt issue, not retrieval.
      2. Is it in semantic_top10 but not final_chunks? → Reranker is dropping it.
      3. Is it in bm25_top10 but not semantic? → Embedding model can't match this query.
      4. Is it in keyword_top10 but not bm25? → BM25 tokeniser issue.
      5. Not in any of the above? → Chunking is splitting the answer across boundaries.
    """
    return debug_retrieval(req.document_id, req.question)