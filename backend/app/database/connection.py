import os

from sqlalchemy import create_engine # type: ignore
from sqlalchemy.orm import DeclarativeBase, sessionmaker # type: ignore


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://jobuser:jobpassword@localhost:5432/jobdb",
)

engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    pass