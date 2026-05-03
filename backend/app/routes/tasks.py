from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from datetime import datetime
from app.database.session import SessionLocal
from app.models.task import Task
from app.models.case_document import CaseDocument
from app.models.user import User
from app.core.security import get_admin_user, get_current_user, get_officer_user

router = APIRouter()

class CreateTaskRequest(BaseModel):
    case_id: int
    assigned_to: int
    status: str = "pending"
    deadline: str | None = None

class TaskStatusRequest(BaseModel):
    task_id: int
    status: str

class AssignCaseRequest(BaseModel):
    document_id: int
    assigned_to: int

@router.post("/tasks/create")
def create_task(req: CreateTaskRequest, user: User = Depends(get_admin_user)):
    with SessionLocal() as db:
        case = db.query(CaseDocument).filter(CaseDocument.id == req.case_id).first()
        if not case:
            raise HTTPException(status_code=404, detail="Case not found")
        officer = db.query(User).filter(User.id == req.assigned_to, User.role == "officer").first()
        if not officer:
            raise HTTPException(status_code=404, detail="Officer not found")

        task = Task(
            case_id=req.case_id,
            assigned_to=req.assigned_to,
            status=req.status,
            deadline=req.deadline,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return {
            "id": task.id,
            "case_id": task.case_id,
            "assigned_to": task.assigned_to,
            "status": task.status,
            "deadline": task.deadline,
            "created_at": task.created_at.isoformat() if task.created_at else None,
            "updated_at": task.updated_at.isoformat() if task.updated_at else None,
        }

@router.get("/tasks")
def list_tasks(user: User = Depends(get_admin_user)):
    with SessionLocal() as db:
        tasks = db.query(Task).order_by(Task.deadline.asc()).all()
        return [
            {
                "id": t.id,
                "case_id": t.case_id,
                "assigned_to": t.assigned_to,
                "status": t.status,
                "deadline": t.deadline,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "updated_at": t.updated_at.isoformat() if t.updated_at else None,
            }
            for t in tasks
        ]

@router.get("/tasks/my")
def get_my_tasks(user: User = Depends(get_officer_user)):
    with SessionLocal() as db:
        tasks = db.query(Task).filter(Task.assigned_to == user.id).order_by(Task.deadline.asc()).all()
        return [
            {
                "id": t.id,
                "case_id": t.case_id,
                "assigned_to": t.assigned_to,
                "status": t.status,
                "deadline": t.deadline,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "updated_at": t.updated_at.isoformat() if t.updated_at else None,
            }
            for t in tasks
        ]

@router.patch("/tasks/update-status")
def update_task_status(req: TaskStatusRequest, current_user: User = Depends(get_current_user)):
    with SessionLocal() as db:
        task = db.query(Task).filter(Task.id == req.task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if current_user.role == "officer" and task.assigned_to != current_user.id:
            raise HTTPException(status_code=403, detail="Only assigned officer can update this task")
        task.status = req.status
        task.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(task)
        return {
            "id": task.id,
            "case_id": task.case_id,
            "assigned_to": task.assigned_to,
            "status": task.status,
            "deadline": task.deadline,
            "created_at": task.created_at.isoformat() if task.created_at else None,
            "updated_at": task.updated_at.isoformat() if task.updated_at else None,
        }

@router.patch("/cases/assign")
def assign_case(req: AssignCaseRequest, user: User = Depends(get_admin_user)):
    with SessionLocal() as db:
        case = db.query(CaseDocument).filter(CaseDocument.id == req.document_id).first()
        if not case:
            raise HTTPException(status_code=404, detail="Case not found")
        officer = db.query(User).filter(User.id == req.assigned_to, User.role == "officer").first()
        if not officer:
            raise HTTPException(status_code=404, detail="Officer not found")
        case.assigned_to = req.assigned_to
        db.commit()
        return {"document_id": case.id, "assigned_to": case.assigned_to}
