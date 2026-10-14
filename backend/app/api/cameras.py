import threading
from pathlib import Path
from typing import Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, Response, StreamingResponse

from app.streaming.camera import (
    CameraSession,
    list_camera_info,
    normalize_id,
    video_path,
)

router = APIRouter(prefix="/api/cameras", tags=["cameras"])

_sessions: Dict[str, CameraSession] = {}
_lock = threading.Lock()

CHUNK_SIZE = 1024 * 512


def _get_session(camera_id: str) -> CameraSession:
    cid = normalize_id(camera_id) or camera_id
    with _lock:
        if cid not in _sessions:
            _sessions[cid] = CameraSession(cid)
        return _sessions[cid]


def _iter_file(path: Path, start: int, length: int):
    remaining = length
    with open(path, "rb") as handle:
        handle.seek(start)
        while remaining > 0:
            chunk = handle.read(min(CHUNK_SIZE, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


@router.get("")
def list_cameras():
    return {"cameras": list_camera_info()}


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/{camera_id}/stream")
def stream(camera_id: str, request: Request):
    path = video_path(camera_id)
    if path is None:
        raise HTTPException(status_code=404, detail=f"Video not available for {camera_id}")

    file_size = path.stat().st_size
    range_header = request.headers.get("range")
    if range_header and range_header.startswith("bytes="):
        try:
            spec = range_header.split("=", 1)[1].split(",")[0]
            start_raw, _, end_raw = spec.partition("-")
            start = int(start_raw) if start_raw else 0
            end = int(end_raw) if end_raw else file_size - 1
        except ValueError:
            start, end = 0, file_size - 1

        if start >= file_size or start > end:
            return Response(
                status_code=416,
                headers={"Content-Range": f"bytes */{file_size}"},
            )
        end = min(end, file_size - 1)
        length = end - start + 1
        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(length),
            "Cache-Control": "no-store",
        }
        return StreamingResponse(
            _iter_file(path, start, end - start + 1),
            status_code=206,
            media_type="video/mp4",
            headers=headers,
        )

    return FileResponse(
        path,
        media_type="video/mp4",
        headers={"Accept-Ranges": "bytes"},
    )


@router.post("/{camera_id}/count/start")
def start_count(camera_id: str):
    session = _get_session(camera_id)
    try:
        session.start()
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True, "camera_id": session.camera_id, "processing": True}


@router.post("/{camera_id}/count/stop")
def stop_count(camera_id: str):
    session = _get_session(camera_id)
    session.stop()
    return {"ok": True, "camera_id": session.camera_id, "processing": False}


@router.get("/{camera_id}/count")
def get_count(camera_id: str):
    session = _get_session(camera_id)
    return session.latest()
