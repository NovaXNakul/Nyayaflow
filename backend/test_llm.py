from app.services.llm_service import call_llm
import os
from dotenv import load_dotenv

load_dotenv()

def test_llm():
    try:
        print("Testing LLM...")
        res = call_llm("Say hello", "You are a helpful assistant")
        print(f"Result: {res}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_llm()
