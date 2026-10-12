from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.crowd import router as crowd_router

app = FastAPI(title="Temple Civic Intelligence - Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(crowd_router)

@app.get("/api/health")
def root_health():
    return {"status": "ok"}

@app.get("/")
def root():
    return {"message": "Temple Civic Intelligence API"}
