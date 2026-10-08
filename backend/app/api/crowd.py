from fastapi import APIRouter, HTTPException
from app.streaming.processor import CrowdProcessor

router = APIRouter(prefix="/api/crowd", tags=["crowd"])

# Initialize processor (uses env: CROWD_VIDEO_PATH, CROWD_CAPACITY)
processor = CrowdProcessor()


@router.get("/live")
def get_live():
    data = processor.get_latest()
    if data.get("error"):
        raise HTTPException(status_code=503, detail=data["error"])
    return data


@router.get("/health")
def health():
    return {"status": "ok"}
