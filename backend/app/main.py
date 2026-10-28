import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.crowd import router as crowd_router
from app.api.cameras import router as cameras_router
from app.api.chatbot import router as chatbot_router
from app.api.darshan import router as darshan_router
from app.api.barricade import router as barricade_router, guards_router
from app.api.exits import router as exits_router
from app.database.database import init_db, SessionLocal
from app.services.crowd_service import seed_defaults
from app.services.barricade_service import seed_barricade_defaults
from app.services.exit_service import seed_exit_defaults
from pathlib import Path
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

app = FastAPI(title="Temple Civic Intelligence - Backend")


def _cors_origins():
    origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]
    configured = os.getenv("CORS_ORIGINS", "")
    for item in configured.split(","):
        origin = item.strip().rstrip("/")
        if origin.startswith(("http://", "https://")) and origin not in origins:
            origins.append(origin)
    return origins


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

_seed_db = SessionLocal()
try:
    seed_defaults(_seed_db)
    seed_barricade_defaults(_seed_db)
    seed_exit_defaults(_seed_db)
finally:
    _seed_db.close()

app.include_router(crowd_router)
app.include_router(cameras_router)
app.include_router(chatbot_router)
app.include_router(darshan_router)
app.include_router(barricade_router)
app.include_router(guards_router)
app.include_router(exits_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"message": "Temple Civic Intelligence API"}
