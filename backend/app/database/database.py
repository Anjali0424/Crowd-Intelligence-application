"""Database setup for the Darshan prediction system.

Uses a local SQLite file by default so staff-entered darshan records and
generated predictions persist between server restarts. The location can be
overridden with the ``DARSHAN_DB_PATH`` environment variable.
"""

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent

DEFAULT_DB_DIR = BACKEND_DIR / "data"
DEFAULT_DB_PATH = DEFAULT_DB_DIR / "darshan.db"


def _database_url() -> str:
    configured = os.getenv("DARSHAN_DB_PATH")
    if configured:
        db_path = Path(configured)
        if not db_path.is_absolute():
            db_path = BACKEND_DIR / db_path
    else:
        db_path = DEFAULT_DB_PATH

    db_path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{db_path.as_posix()}"


engine = create_engine(
    _database_url(),
    connect_args={"check_same_thread": False},
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

Base = declarative_base()


def init_db() -> None:
    """Create all tables. Safe to call multiple times."""
    from app.database import models  # noqa: F401  (register models on Base)

    Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI dependency yielding a scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
