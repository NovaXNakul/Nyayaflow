from fastapi import APIRouter
from app.database.session import SessionLocal
from app.models.case_document import CaseDocument

router = APIRouter()

@router.get("/dashboard")
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

@router.get("/cases")
def get_cases():
    with SessionLocal() as db:
        cases = db.query(CaseDocument).order_by(CaseDocument.created_at.desc()).all()
        return [
            {
                "document_id": c.id,
                "file_name": c.filename,
                "status": c.status,
                "department": (c.extracted_json or {}).get("department", "Unknown"),
                "priority": (c.extracted_json or {}).get("priority", "Unknown"),
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in cases
        ]

@router.get("/case/{id}")
def get_case(id: int):
    with SessionLocal() as db:
        doc = db.query(CaseDocument).filter(CaseDocument.id == id).first()
        if not doc:
            from fastapi import HTTPException
            raise HTTPException(404, "Case not found")
        return {
            "document_id": doc.id,
            "file_name": doc.filename,
            "status": doc.status,
            "extracted_data": doc.extracted_json,
            "action_plan": doc.action_plan,
            "verification_status": doc.status,
            "created_at": doc.created_at.isoformat() if doc.created_at else None,
        }
