import json
import re
import logging
from datetime import datetime
from dotenv import load_dotenv
from openai import OpenAI
import os

load_dotenv(override=True)
logger = logging.getLogger(__name__)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
FALLBACK_MODEL = os.getenv("FALLBACK_MODEL", "llama-3.1-8b-instant")

def call_llm(prompt: str, system_prompt: str = "") -> str:
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key or groq_key == "gsk_replace_me_with_actual_key":
        raise RuntimeError(f"GROQ_API_KEY is not valid. Current key: {groq_key[:4]}...")

    client = OpenAI(
        api_key=groq_key,
        base_url="https://api.groq.com/openai/v1"
    )
        
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})
    
    try:
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            temperature=0,
            messages=messages
        )
        return response.choices[0].message.content

    except Exception as e:
        logger.warning(f"Primary model {GROQ_MODEL} failed: {e}")
        try:
            response = client.chat.completions.create(
                model=FALLBACK_MODEL,
                temperature=0,
                messages=messages
            )
            return response.choices[0].message.content
        except Exception as e2:
            logger.error(f"Fallback model {FALLBACK_MODEL} also failed: {e2}")
            return None

def generate_summary(text: str) -> dict:
    """Generate a structured summary of the court judgment."""
    system_prompt = (
        "Summarize the court judgment into:\n"
        "- Key facts\n"
        "- Court decision\n"
        "- Required action\n"
        "- Deadlines\n\n"
        "Return ONLY valid JSON matching this EXACT structure:\n"
        "{\n"
        '  "key_facts": "...",\n'
        '  "court_decision": "...",\n'
        '  "required_action": "...",\n'
        '  "deadlines": "..."\n'
        "}"
    )
    
    prompt = f"Summarize the following court judgment:\n\n{text[:8000]}"
    
    response_text = call_llm(prompt=prompt, system_prompt=system_prompt)
    if not response_text:
        return None
        
    try:
        raw = response_text.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
        return json.loads(raw)
    except Exception as e:
        logger.error(f"Failed to parse LLM summary JSON: {e}")
        return None
