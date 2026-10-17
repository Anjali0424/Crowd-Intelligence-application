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
    _add_missing_columns()


def _add_missing_columns() -> None:
    """Add columns that exist on the models but are missing from SQLite.

    ``create_all`` never alters existing tables, so when a model gains a column
    an existing database would break. This adds any missing nullable columns so
    upgrades stay additive and non-destructive.
    """
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue
            present = {col["name"] for col in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in present:
                    continue
                col_type = column.type.compile(dialect=engine.dialect)
                conn.execute(
                    text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {col_type}')
                )



def get_db():
    """FastAPI dependency yielding a scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
