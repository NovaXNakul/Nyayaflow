# app/services/llm_service.py
#
# LLM gateway — Groq primary, automatic fallback to smaller model.
# All callers receive a str | None; they must handle None.

import json
import re
import logging
from datetime import datetime
from dotenv import load_dotenv
from openai import OpenAI, OpenAIError
import os

load_dotenv(override=True)
logger = logging.getLogger(__name__)

GROQ_API_KEY   = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL     = os.getenv("GROQ_MODEL",    "llama-3.3-70b-versatile")
FALLBACK_MODEL = os.getenv("FALLBACK_MODEL", "llama-3.1-8b-instant")

# Lazy client — created once on first call
_client: OpenAI | None = None

def _get_client() -> OpenAI:
    global _client
    if _client is None:
        key = os.getenv("GROQ_API_KEY", "")
        if not key or key.startswith("gsk_replace"):
            raise RuntimeError(
                "GROQ_API_KEY is missing or still set to the placeholder value. "
                "Set it in your .env file."
            )
        _client = OpenAI(api_key=key, base_url="https://api.groq.com/openai/v1")
    return _client


def call_llm(prompt: str, system_prompt: str = "") -> str | None:
    """
    Call the primary Groq model with automatic fallback.
    Returns the response text or None on complete failure.
    """
    client   = _get_client()
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    for model in (GROQ_MODEL, FALLBACK_MODEL):
        try:
            response = client.chat.completions.create(
                model=model,
                temperature=0,
                messages=messages,
                max_tokens=2048,
            )
            text = response.choices[0].message.content
            logger.debug("call_llm (%s): %.150s", model, text)
            return text
        except OpenAIError as e:
            logger.warning("call_llm model=%s failed: %s", model, e)
        except Exception as e:
            logger.error("call_llm unexpected error model=%s: %s", model, e)

    logger.error("call_llm: both models failed — returning None")
    return None


def _strip_fences(text: str) -> str:
    """Remove markdown code fences around JSON responses."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$",          "", text)
    return text.strip()


def generate_summary(text: str) -> dict | None:
    """Generate a structured summary of the court judgment."""
    system_prompt = (
        "Summarize the court judgment into key facts, court decision, "
        "required action, and deadlines.\n\n"
        "Return ONLY valid JSON matching this EXACT structure — no preamble, "
        "no markdown fences:\n"
        '{"key_facts": "...", "court_decision": "...", '
        '"required_action": "...", "deadlines": "..."}'
    )
    response_text = call_llm(
        prompt=f"Summarize the following court judgment:\n\n{text[:8000]}",
        system_prompt=system_prompt,
    )
    if not response_text:
        logger.error("generate_summary: LLM returned None")
        return None
    try:
        return json.loads(_strip_fences(response_text))
    except Exception as e:
        logger.error("generate_summary: JSON parse failed: %s\nRaw: %s", e, response_text[:300])
        return None