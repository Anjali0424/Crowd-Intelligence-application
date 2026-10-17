import asyncio
import os
import time
from typing import Any, Dict, List, Optional

from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.database.models import BarricadeGateConfig, BarricadeSafetyEvent, SecurityGuard
from app.services.barricade_service import manager
from app.streaming.camera import normalize_id

router = APIRouter(prefix="/api/barricade", tags=["barricade"])


def require_admin(x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token")):
    expected = os.getenv("ADMIN_API_TOKEN")
    if expected and x_admin_token != expected:
        raise HTTPException(status_code=401, detail="Admin authorization required")


# --- Request Schemas --------------------------------------------------------

class MonitoringRequest(BaseModel):
    camera_id: str


class GateConfigUpdate(BaseModel):
    name: Optional[str] = None
    zone_name: Optional[str] = None
    line_x1: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    line_y1: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    line_x2: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    line_y2: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    direction_mode: Optional[str] = None
    max_occupancy: Optional[int] = Field(default=None, gt=0)
    wrong_way_enabled: Optional[bool] = None
    blocked_exit_enabled: Optional[bool] = None
    block_duration_sec: Optional[float] = Field(default=None, gt=0.0)
    cooldown_seconds: Optional[int] = Field(default=None, gt=0)
    assigned_guard_id: Optional[str] = None


class AcknowledgeRequest(BaseModel):
    staff_name: Optional[str] = "Admin / Security Staff"
    notes: Optional[str] = None


class ResolveRequest(BaseModel):
    resolved_by: Optional[str] = "Admin / Security Staff"
    notes: Optional[str] = "Incident resolved and crowd cleared"


class GuardAssignmentUpdate(BaseModel):
    guard_id: str
    assigned_gate: Optional[str] = None
    assigned_zone: Optional[str] = None
    on_duty: Optional[bool] = None


# --- Endpoints -------------------------------------------------------------

@router.get("/cameras")
def list_barricade_cameras(db: Session = Depends(get_db)):
    """Lists all configured barricade cameras with current monitoring status."""
    return {"cameras": manager.list_cameras_status(db)}


@router.get("/cameras/{camera_id}/status")
def get_camera_status(camera_id: str, db: Session = Depends(get_db)):
    session = manager.get_session(camera_id, db)
    return session.get_status()


@router.post("/cameras/{camera_id}/config")
def update_camera_config(
    camera_id: str,
    body: GateConfigUpdate,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_admin),
):
    cid = normalize_id(camera_id) or camera_id
    config = db.query(BarricadeGateConfig).filter(BarricadeGateConfig.id == cid).first()
    if not config:
        raise HTTPException(status_code=404, detail=f"Gate configuration not found for {camera_id}")

    data = body.model_dump(exclude_unset=True)
    for field, val in data.items():
        if val is not None:
            setattr(config, field, val)

    db.commit()
    db.refresh(config)

    session = manager.get_session(cid, db)
    session.update_config(config)

    return {"ok": True, "config": config.to_dict()}


@router.post("/monitoring/start")
def start_monitoring(
    body: MonitoringRequest,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_admin),
):
    cid = normalize_id(body.camera_id) or body.camera_id
    session = manager.get_session(cid, db)
    try:
        session.start()
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True, "camera_id": cid, "processing": True}


@router.post("/monitoring/stop")
def stop_monitoring(
    body: MonitoringRequest,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_admin),
):
    cid = normalize_id(body.camera_id) or body.camera_id
    session = manager.get_session(cid, db)
    session.stop()
    return {"ok": True, "camera_id": cid, "processing": False}


@router.post("/monitoring/replay")
@router.post("/cameras/{camera_id}/replay")
def replay_monitoring(
    camera_id: Optional[str] = None,
    body: Optional[MonitoringRequest] = None,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_admin),
):
    cid_raw = (body.camera_id if body and body.camera_id else camera_id) or "CAM-TEMPLE"
    cid = normalize_id(cid_raw) or cid_raw
    session = manager.get_session(cid, db)
    try:
        session.replay()
    except (RuntimeError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True, "camera_id": cid, "processing": True, "replayed": True}


@router.get("/cameras/{camera_id}/counts")
def get_camera_counts(camera_id: str, response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    session = manager.get_session(camera_id, db)
    return {
        "camera_id": session.camera_id,
        "gate_name": session.gate_config.name,
        "people_count": session.people_count,
        "entries_count": session.counter.entries_count,
        "exits_count": session.counter.exits_count,
        "current_inside": session.counter.current_inside,
        "fps": session.fps,
        "last_frame_time": session.last_frame_time,
        "processing": session._processing,
        "active_alert": session.active_alert_banner,
        "active_alert_severity": session.active_alert_severity,
    }


def _make_loading_jpeg(message: str = "INITIALIZING AI BARRICADE DETECTOR...") -> bytes:
    import numpy as np
    import cv2
    img = np.zeros((360, 640, 3), dtype=np.uint8)
    img[:] = (15, 23, 42)
    cv2.putText(img, "TEMPLE CIVIC INTELLIGENCE", (160, 150), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (52, 211, 153), 2, cv2.LINE_AA)
    cv2.putText(img, message, (130, 200), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    cv2.putText(img, "Starting YOLOv11 & ByteTrack Pipeline...", (170, 230), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (148, 163, 184), 1, cv2.LINE_AA)
    _, buffer = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return buffer.tobytes()


def _mjpeg_generator(session):
    """Yields multipart JPEG frames for the live browser stream."""
    loading_frame = _make_loading_jpeg()
    while True:
        frame_bytes = session.get_frame_jpeg(timeout=1.0)
        out_bytes = frame_bytes if frame_bytes is not None else loading_frame
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + out_bytes + b"\r\n"
        )
        time.sleep(0.035)


@router.get("/cameras/{camera_id}/feed")
def get_live_mjpeg_feed(camera_id: str, db: Session = Depends(get_db)):
    """Serves real-time annotated camera stream with green bounding boxes and line crossing."""
    session = manager.get_session(camera_id, db)
    if not session._processing:
        # Automatically start session if not already running
        try:
            session.start()
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    return StreamingResponse(
        _mjpeg_generator(session),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


# --- Safety Events ---------------------------------------------------------

@router.get("/events")
def list_safety_events(
    camera_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(BarricadeSafetyEvent)
    if camera_id:
        cid = normalize_id(camera_id) or camera_id
        query = query.filter(BarricadeSafetyEvent.camera_id == cid)
    if status:
        query = query.filter(BarricadeSafetyEvent.status == status.upper())

    events = (
        query.order_by(BarricadeSafetyEvent.created_at.desc())
        .limit(limit)
        .all()
    )
    return {"events": [e.to_dict() for e in events]}


@router.post("/events/{event_id}/acknowledge")
def acknowledge_safety_event(
    event_id: str,
    body: AcknowledgeRequest,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_admin),
):
    event = db.query(BarricadeSafetyEvent).filter(BarricadeSafetyEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Safety event not found")

    event.status = "ACKNOWLEDGED"
    event.acknowledged_at = datetime.utcnow()
    event.acknowledged_by = body.staff_name or "Security Staff"
    if body.notes:
        event.notes = f"{event.notes or ''}\nAck Note: {body.notes}".strip()

    db.commit()
    db.refresh(event)

    # Broadcast updated event
    manager.broadcast_event(event.to_dict())

    return {"ok": True, "event": event.to_dict()}


@router.post("/events/{event_id}/resolve")
def resolve_safety_event(
    event_id: str,
    body: ResolveRequest,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_admin),
):
    event = db.query(BarricadeSafetyEvent).filter(BarricadeSafetyEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Safety event not found")

    event.status = "RESOLVED"
    event.resolved_at = datetime.utcnow()
    event.resolved_by = body.resolved_by or "Security Staff"
    if body.notes:
        event.notes = f"{event.notes or ''}\nResolve Note: {body.notes}".strip()

    db.commit()
    db.refresh(event)

    manager.broadcast_event(event.to_dict())

    return {"ok": True, "event": event.to_dict()}


# --- Guard Assignments -----------------------------------------------------

guards_router = APIRouter(prefix="/api/guards", tags=["guards"])


@guards_router.get("/assignments")
@router.get("/guards")
def list_guards(db: Session = Depends(get_db)):
    guards = db.query(SecurityGuard).all()
    return {"guards": [g.to_dict() for g in guards]}


@guards_router.post("/assignments")
@router.post("/guards/assignments")
def update_guard_assignment(
    body: GuardAssignmentUpdate,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_admin),
):
    guard = db.query(SecurityGuard).filter(SecurityGuard.id == body.guard_id).first()
    if not guard:
        raise HTTPException(status_code=404, detail="Guard not found")

    if body.assigned_gate is not None:
        guard.assigned_gate = body.assigned_gate
    if body.assigned_zone is not None:
        guard.assigned_zone = body.assigned_zone
    if body.on_duty is not None:
        guard.on_duty = body.on_duty

    db.commit()
    db.refresh(guard)
    return {"ok": True, "guard": guard.to_dict()}


# --- WebSocket Live Telemetry ---------------------------------------------

@router.websocket("/ws")
async def barricade_websocket(websocket: WebSocket):
    """Real-time WebSocket endpoint for barricade telemetry and guard alert pushes."""
    await websocket.accept()
    manager.register_ws(websocket)
    try:
        while True:
            # Keep-alive ping/pong
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.unregister_ws(websocket)
    except Exception:
        manager.unregister_ws(websocket)
