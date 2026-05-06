import logging
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from app.database.session import engine, Base
from app.models.user import User
from app.models.case_document import CaseDocument
from app.models.task import Task
from app.models.password_reset import PasswordResetToken
from app.models.invite import Invite

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

logger.info("Starting FastAPI app...")

# Create tables and verify schema
try:
    logger.info("Initializing database connection...")
    Base.metadata.create_all(bind=engine)
    
    # Dynamic schema update for existing tables
    inspector = inspect(engine)
    
    # Handle users table columns
    if inspector.has_table("users"):
        existing_columns = {col["name"] for col in inspector.get_columns("users")}
        with engine.connect() as conn:
            # Handle username -> name rename
            if "username" in existing_columns and "name" not in existing_columns:
                conn.execute(text("ALTER TABLE users RENAME COLUMN username TO name"))
                logger.info("Renamed users.username to users.name")
            elif "name" not in existing_columns:
                 conn.execute(text("ALTER TABLE users ADD COLUMN name VARCHAR"))
                 logger.info("Added users.name column")
                 
            # CRITICAL: Handle hashed_password -> password_hash rename (compatibility fix)
            if "hashed_password" in existing_columns and "password_hash" not in existing_columns:
                conn.execute(text("ALTER TABLE users RENAME COLUMN hashed_password TO password_hash"))
                logger.info("Renamed users.hashed_password to users.password_hash")
            elif "password_hash" not in existing_columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN password_hash VARCHAR"))
                logger.info("Added users.password_hash column")

            # Ensure hashed_password is NULLABLE if it still exists (to prevent NOT NULL constraint errors)
            if "hashed_password" in existing_columns:
                conn.execute(text("ALTER TABLE users ALTER COLUMN hashed_password DROP NOT NULL"))
                logger.info("Dropped NOT NULL constraint from hashed_password")

            # Handle missing fields
            if "role" not in existing_columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR DEFAULT 'officer'"))
                logger.info("Added users.role column")
            if "is_active" not in existing_columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE"))
                logger.info("Added users.is_active column")
            if "created_at" not in existing_columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"))
                logger.info("Added users.created_at column")
            conn.commit()

    # Handle case_documents table columns
    if inspector.has_table("case_documents"):
        existing_columns = {col["name"] for col in inspector.get_columns("case_documents")}
        with engine.connect() as conn:
            if "created_by" not in existing_columns:
                conn.execute(text("ALTER TABLE case_documents ADD COLUMN created_by INTEGER REFERENCES users(id)"))
                logger.info("Added case_documents.created_by column")
            if "assigned_to" not in existing_columns:
                conn.execute(text("ALTER TABLE case_documents ADD COLUMN assigned_to INTEGER REFERENCES users(id)"))
                logger.info("Added case_documents.assigned_to column")
            conn.commit()
            
    logger.info("Database tables and schema verified successfully.")
except Exception as e:
    logger.error(f"Error initializing database: {e}")

logger.info("Database verification complete")

# Import routers
logger.info("Importing route modules...")
from app.routes import upload, extract, verify, download, dashboard, chat, tasks, translate, auth, admin
logger.info("Route modules imported successfully")

logger.info("Creating FastAPI app...")
app = FastAPI(
    title="Court Decision Intelligence System",
    description="Production-grade backend for legal document analysis",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware, 
    allow_origins=["*"], 
    allow_methods=["*"], 
    allow_headers=["*"], 
    allow_credentials=True
)

# Include routers
app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(extract.router)
app.include_router(verify.router)
app.include_router(download.router)
app.include_router(dashboard.router)
app.include_router(chat.router)
app.include_router(tasks.router)
app.include_router(translate.router)
app.include_router(admin.router)
logger.info("Routers included successfully")

logger.info("FastAPI app initialization complete")

logger.info("Startup complete - ready to accept connections")

@app.get("/")
def root():
    return {"message": "CCMS Backend Running Successfully"}

@app.get("/api/health")
def health_check():
    return {"status": "OK"}

# Entry point for local development
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 5000))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)

# Alias for uvicorn app.main:main
main = app
