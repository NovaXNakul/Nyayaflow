# AI Court Decision Intelligence System

Production-ready hackathon prototype for converting court judgments into verified and actionable government decisions.

## What is implemented

- FastAPI backend with required APIs:
  - `POST /upload`
  - `POST /extract`
  - `POST /generate-action`
  - `POST /verify`
  - `GET /dashboard`
  - `POST /chat` (RAG-style legal assistant)
- End-to-end workflow:
  1. Upload PDF/Excel
  2. Extract text (PyMuPDF, OCR-ready architecture)
  3. Structured extraction JSON
  4. Action plan generation
  5. Confidence + source highlights
  6. Human verification (approve/edit/reject)
  7. Dashboard uses only approved cases
- Risk Assessment Engine (High/Medium/Low)
- Case Similarity Intelligence (prototype view from indexed records)
- Legal Chatbot (retrieval from extracted case data)
- Multilingual simplification placeholder via plain-language simplification
- Compliance proof generation embedded in verified action plan
- React + Tailwind dark dashboard UI

## Output JSON format (strict)

```json
{
  "case_details": "",
  "date_of_order": "",
  "directives": [],
  "timeline": "",
  "action_required": "",
  "department": "",
  "priority": "",
  "confidence_score": 0.0,
  "source_reference": "paragraph/page"
}
```

## Project structure

- `backend/app/main.py` - full API and pipeline logic
- `backend/requirements.txt` - backend dependencies
- `backend/sample_data/sample_judgment.pdf` - sample test PDF
- `frontend/src/App.jsx` - full dashboard UI
- `frontend/src/api.js` - API integration

## Run locally

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Optional frontend env:

```env
VITE_API_URL=http://localhost:8000
```

## Demo file

Upload:

- `backend/sample_data/sample_judgment.pdf`

Then execute flow:

1. Upload
2. Extract
3. Generate Action
4. Verify (Approve/Edit/Reject)
5. Refresh Dashboard
