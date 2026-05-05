from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from datetime import datetime
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.models.task import Task
from app.models.case_document import CaseDocument
from app.models.user import User
from app.core.security import get_admin_user, get_current_user, get_officer_user

router = APIRouter(tags=["Tasks"])

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
def create_task(req: CreateTaskRequest, user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
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
    return task

@router.get("/tasks")
def list_tasks(user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    return db.query(Task).order_by(Task.deadline.asc()).all()

@router.get("/tasks/my")
def get_my_tasks(user: User = Depends(get_officer_user), db: Session = Depends(get_db)):
    return db.query(Task).filter(Task.assigned_to == user.id).order_by(Task.deadline.asc()).all()

@router.patch("/tasks/update-status")
def update_task_status(req: TaskStatusRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == req.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if current_user.role == "officer" and task.assigned_to != current_user.id:
        raise HTTPException(status_code=403, detail="Only assigned officer can update this task")
    task.status = req.status
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task

@router.patch("/cases/assign")
def assign_case(req: AssignCaseRequest, user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    case = db.query(CaseDocument).filter(CaseDocument.id == req.document_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    officer = db.query(User).filter(User.id == req.assigned_to, User.role == "officer").first()
    if not officer:
        raise HTTPException(status_code=404, detail="Officer not found")
    case.assigned_to = req.assigned_to
    db.commit()
    return {"document_id": case.id, "assigned_to": case.assigned_to}
