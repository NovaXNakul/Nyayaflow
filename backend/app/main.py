import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database.session import engine, Base

# Import models before creating tables
from app.models.case_document import CaseDocument

# Create tables
Base.metadata.create_all(bind=engine)

# Setup logging
logging.basicConfig(level=logging.INFO)

# Import routers
from app.routes import upload, extract, verify, download, dashboard, chat, translate

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
app.include_router(translate.router)
print("[DEBUG] Translate router included successfully")

@app.get("/")
def root():
    # Force uvicorn to reload again
    return {"message": "Court Decision Intelligence API - Refactored!"}
