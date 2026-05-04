import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from app.database.session import engine, Base
from app.models.case_document import CaseDocument
from app.models.user import User
from app.models.task import Task

# Ensure tables and new columns exist
inspector = inspect(engine)
if inspector.has_table("case_documents"):
    existing_columns = {col["name"] for col in inspector.get_columns("case_documents")}
    with engine.connect() as conn:
        if "created_by" not in existing_columns:
            conn.execute(text("ALTER TABLE case_documents ADD COLUMN created_by INTEGER"))
        if "assigned_to" not in existing_columns:
            conn.execute(text("ALTER TABLE case_documents ADD COLUMN assigned_to INTEGER"))

<<<<<<< nakul
=======
# Import models before creating tables
from app.models.case_document import CaseDocument

# Create tables
>>>>>>> dev
Base.metadata.create_all(bind=engine)

# Setup logging
logging.basicConfig(level=logging.INFO)

# Import routers
<<<<<<< nakul
from app.routes import upload, extract, verify, download, dashboard, chat, auth, tasks
=======
from app.routes import upload, extract, verify, download, dashboard, chat, translate
>>>>>>> dev

app = FastAPI(title="Court Decision Intelligence System")

app.add_middleware(
    CORSMiddleware, 
    allow_origins=["*"], 
    allow_methods=["*"], 
    allow_headers=["*"], 
    allow_credentials=True
)

app.include_router(upload.router)
app.include_router(extract.router)
app.include_router(verify.router)
app.include_router(download.router)
app.include_router(dashboard.router)
app.include_router(chat.router)
<<<<<<< nakul
app.include_router(auth.router)
app.include_router(tasks.router)
=======
app.include_router(translate.router)
print("[DEBUG] Translate router included successfully")
>>>>>>> dev

@app.get("/")
def root():
    return {"message": "Court Decision Intelligence API - Refactored!"}
