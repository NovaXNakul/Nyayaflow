from fastapi.testclient import TestClient
import sys
from pathlib import Path
import json

sys.path.append(str(Path(r"e:\Suyog\ai_for_bharat\backend")))

from app.main import app, SessionLocal, Base, engine

Base.metadata.create_all(bind=engine)

client = TestClient(app)

def run_tests():
    print("Testing /upload")
    file_content = b"fake pdf content"
    response = client.post("/upload", files={"file": ("test.pdf", file_content, "application/pdf")})
    print(response.status_code, response.json())
    doc_id = response.json()["document_id"]

    print("\nTesting /extract")
    response = client.post("/extract", json={"document_id": doc_id})
    print(response.status_code, response.json())
    if response.status_code != 200:
        return

    print("\nTesting /generate-action")
    response = client.post("/generate-action", json={"document_id": doc_id})
    print(response.status_code, response.json())
    if response.status_code != 200:
        return
        
    print("\nTesting /verify")
    response = client.post("/verify", json={"document_id": doc_id, "decision": "approve"})
    print(response.status_code, response.json())
    if response.status_code != 200:
        return

    print("\nTesting /dashboard")
    response = client.get("/dashboard")
    print(response.status_code, response.json())

    print("\nTesting /chat")
    response = client.post("/chat", json={"document_id": doc_id, "question": "deadline?"})
    print(response.status_code, response.json())

if __name__ == "__main__":
    run_tests()
