from fastapi.middleware.cors import CORSMiddleware
from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.jobs import router as jobs_router
from app.database.connection import create_tables, get_db


create_tables()


app = FastAPI(
    title="Distributed Job Processing Platform",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:8081",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(jobs_router)


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "backend",
    }


@app.get("/db-health")
def database_health(db: Session = Depends(get_db)):
    result = db.execute(text("SELECT 1"))
    value = result.scalar()

    return {
        "database": "connected",
        "test_result": value,
    }
