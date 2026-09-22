import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


DB_PASSWORD_FILE = Path("/run/secrets/db_password")


def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL")

    if DB_PASSWORD_FILE.exists():
        password = DB_PASSWORD_FILE.read_text().strip()

        database_url = (
            f"postgresql+psycopg://jobuser:{password}"
            "@postgres:5432/jobdb"
        )

    if database_url:
        return database_url

    return (
        "postgresql+psycopg://jobuser:jobpassword"
        "@localhost:5432/jobdb"
    )


DATABASE_URL = get_database_url()

engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)