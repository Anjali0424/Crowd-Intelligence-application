"""Darshan data-entry and prediction API.

Admin/staff endpoints require an ``X-Admin-Token`` header **only when** the
``ADMIN_API_TOKEN`` environment variable is set. This keeps the existing
open (token-less) behaviour intact for local development while allowing a real
token to be enforced in production.
"""

from __future__ import annotations

import os
import re
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.database.models import CROWD_LEVELS, DarshanRecord
from app.services import darshan_service as svc

router = APIRouter(prefix="/api/darshan", tags=["darshan"])


def require_admin(x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token")):
    expected = os.getenv("ADMIN_API_TOKEN")
    if expected and x_admin_token != expected:
        raise HTTPException(status_code=401, detail="Admin authorization required")


_SLOT_RE = re.compile(r"^(\d{1,2}):(\d{2})\s*(AM|PM)?$", re.IGNORECASE)


def normalize_slot(value: str) -> str:
    """Accept ``"HH:MM"`` or ``"H:MM AM/PM"`` and return 24-hour ``"HH:MM"``."""
    if not value:
        raise ValueError("slot_time is required")

    match = _SLOT_RE.match(value.strip())
    if not match:
        raise ValueError(f"Invalid slot_time: {value!r}")

    hours = int(match.group(1))
    minutes = int(match.group(2))
    meridiem = match.group(3)

    if meridiem:
        meridiem = meridiem.upper()
        if hours < 1 or hours > 12:
            raise ValueError(f"Invalid hour in slot_time: {value!r}")
        if meridiem == "PM" and hours != 12:
            hours += 12
        if meridiem == "AM" and hours == 12:
            hours = 0

    if hours < 0 or hours > 23 or minutes < 0 or minutes > 59:
        raise ValueError(f"Invalid slot_time: {value!r}")

    return f"{hours:02d}:{minutes:02d}"


class RecordIn(BaseModel):
    record_date: Optional[date] = None
    slot_time: str
    source: str = "staff"
    staff_name: Optional[str] = None
    passes_issued: Optional[int] = Field(default=None, ge=0)
    actual_entries: Optional[int] = Field(default=None, ge=0)
    actual_exits: Optional[int] = Field(default=None, ge=0)
    people_inside: Optional[int] = Field(default=None, ge=0)
    queue_population: Optional[int] = Field(default=None, ge=0)
    completed_per_hour: Optional[int] = Field(default=None, ge=0)
    camera_count: Optional[int] = Field(default=None, ge=0)
    crowd_level: Optional[str] = None
    observed_wait_minutes: Optional[int] = Field(default=None, ge=0)
    observed_darshan_minutes: Optional[int] = Field(default=None, ge=0)
    notes: Optional[str] = None


class PredictIn(BaseModel):
    queue_population: Optional[int] = Field(default=None, ge=0)
    people_inside: Optional[int] = Field(default=None, ge=0)
    processing_rate_per_hour: Optional[float] = Field(default=None, gt=0)
    entry_rate_per_hour: Optional[float] = Field(default=None, ge=0)
    passes_issued: Optional[int] = Field(default=None, ge=0)
    actual_entries: Optional[int] = Field(default=None, ge=0)
    camera_count: Optional[int] = Field(default=None, ge=0)
    use_live: bool = True
    persist: bool = True
    # Planned-arrival fields used by the devotee time picker. When arrival_time
    # is present, the CSV-trained model is used instead of the queue baseline.
    arrival_time: Optional[str] = None
    arrival_date: Optional[date] = None
    darshan_type: Optional[str] = None


def _predict_planned_arrival(body: PredictIn) -> dict:
    """Predict from the selected arrival without inventing crowd context."""
    if not body.darshan_type or not body.darshan_type.strip():
        raise HTTPException(
            status_code=422,
            detail="darshan_type is required when arrival_time is provided.",
        )
    raw_time = (body.arrival_time or "").strip()
    pieces = raw_time.split(":")
    if len(pieces) == 3 and all(piece.isdigit() for piece in pieces):
        raw_time = f"{pieces[0]}:{pieces[1]}"
    try:
        slot = normalize_slot(raw_time)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    try:
        from ml.predict import InvalidPredictionInput, ModelNotAvailable, predict_for_request
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"The Darshan time model could not be loaded: {exc}",
        )

    try:
        return predict_for_request(
            arrival_time=slot,
            darshan_type=body.darshan_type,
            arrival_date=body.arrival_date,
        )
    except ModelNotAvailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except InvalidPredictionInput as exc:
        raise HTTPException(status_code=422, detail=str(exc))


def _validate_level(level: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    upper = value.upper()
    if upper not in CROWD_LEVELS:
        raise HTTPException(
            status_code=422,
            detail=f"crowd_level must be one of {', '.join(CROWD_LEVELS)}",
        )
    return upper


@router.get("/health")
def health():
    return {"status": "ok", "database": "sqlite"}


# ---------------------------------------------------------------------------
# Records
# ---------------------------------------------------------------------------

@router.post("/records")
def upsert_record(payload: RecordIn, db: Session = Depends(get_db),
                  _admin: None = Depends(require_admin)):
    try:
        slot = normalize_slot(payload.slot_time)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    if payload.crowd_level and payload.crowd_level.upper() not in CROWD_LEVELS:
        raise HTTPException(
            status_code=422,
            detail=f"crowd_level must be one of {', '.join(CROWD_LEVELS)}",
        )

    record_date = payload.record_date or date.today()

    row = (
        db.query(DarshanRecord)
        .filter(
            DarshanRecord.record_date == record_date,
            DarshanRecord.slot_time == slot,
        )
        .first()
    )
    created = row is None
    if created:
        row = DarshanRecord(record_date=record_date, slot_time=slot)
        db.add(row)

    row.source = payload.source or "staff"
    row.staff_name = payload.staff_name
    row.passes_issued = payload.passes_issued
    row.actual_entries = payload.actual_entries
    row.actual_exits = payload.actual_exits
    row.people_inside = payload.people_inside
    row.queue_population = payload.queue_population
    row.completed_per_hour = payload.completed_per_hour
    row.camera_count = payload.camera_count
    row.crowd_level = payload.crowd_level.upper() if payload.crowd_level else None
    row.observed_wait_minutes = payload.observed_wait_minutes
    row.observed_darshan_minutes = payload.observed_darshan_minutes
    row.notes = payload.notes
    row.recorded_at = datetime.now()

    db.commit()
    db.refresh(row)
    return {"created": created, "record": row.to_dict()}


@router.get("/records")
def list_records(
    record_date: Optional[date] = Query(default=None, alias="date"),
    limit: int = Query(default=100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    query = db.query(DarshanRecord)
    if record_date:
        query = query.filter(DarshanRecord.record_date == record_date)
    records = (
        query.order_by(DarshanRecord.record_date.desc(), DarshanRecord.slot_time.desc())
        .limit(limit)
        .all()
    )
    return {"records": [r.to_dict() for r in records]}


@router.delete("/records/{record_id}")
def delete_record(record_id: int, db: Session = Depends(get_db),
                  _admin: None = Depends(require_admin)):
    row = db.get(DarshanRecord, record_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Record not found")
    db.delete(row)
    db.commit()
    return {"deleted": True, "id": record_id}


# ---------------------------------------------------------------------------
# Prediction
# ---------------------------------------------------------------------------

@router.get("/status")
def status(db: Session = Depends(get_db)):
    return svc.get_current_status(db)


@router.get("/prediction")
def prediction(
    queue_population: Optional[int] = Query(default=None, ge=0),
    people_inside: Optional[int] = Query(default=None, ge=0),
    processing_rate_per_hour: Optional[float] = Query(default=None, gt=0),
    entry_rate_per_hour: Optional[float] = Query(default=None, ge=0),
    use_live: bool = Query(default=True),
    db: Session = Depends(get_db),
):
    """Compute a prediction without storing it (safe for polling)."""
    live = svc.get_current_status(db) if use_live else {}

    if queue_population is None:
        queue_population = live.get("queue_population")
    if people_inside is None:
        people_inside = live.get("people_inside")
    if processing_rate_per_hour is None:
        processing_rate_per_hour = live.get("processing_rate_per_hour")

    result = svc.predict(
        db,
        queue=queue_population,
        people_inside=people_inside,
        processing_rate=processing_rate_per_hour,
        entry_rate=entry_rate_per_hour,
        camera_count=live.get("camera_count"),
        persist=False,
    )
    result["live"] = live
    return result


@router.post("/predict")
def predict(body: PredictIn, db: Session = Depends(get_db)):
    """Compute and store a prediction.

    A planned ``arrival_time`` uses the CSV-trained demonstration model. The
    existing queue, camera, and staff fields keep the previous baseline
    contract for the admin forecast screen.
    """
    if body.arrival_time and body.arrival_time.strip():
        return _predict_planned_arrival(body)

    live = svc.get_current_status(db) if body.use_live else {}

    queue = body.queue_population if body.queue_population is not None else live.get("queue_population")
    inside = body.people_inside if body.people_inside is not None else live.get("people_inside")
    rate = (
        body.processing_rate_per_hour
        if body.processing_rate_per_hour is not None
        else live.get("processing_rate_per_hour")
    )

    result = svc.predict(
        db,
        queue=queue,
        people_inside=inside,
        processing_rate=rate,
        entry_rate=body.entry_rate_per_hour,
        passes_issued=body.passes_issued,
        actual_entries=body.actual_entries,
        camera_count=body.camera_count if body.camera_count is not None else live.get("camera_count"),
        persist=body.persist,
    )
    result["live"] = live
    return result


@router.get("/history")
def history(
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return {"predictions": [p.to_dict() for p in svc.prediction_history(db, limit)]}


@router.post("/train")
def train(db: Session = Depends(get_db), _admin: None = Depends(require_admin)):
    return svc.train_model(db)


@router.get("/model")
def model(db: Session = Depends(get_db)):  # noqa: ARG001 - db unused but consistent
    return svc.model_metrics()


@router.get("/current")
def current(db: Session = Depends(get_db)):
    """Convenience endpoint for the devotee home card."""
    live = svc.get_current_status(db)
    result = svc.predict(
        db,
        queue=live.get("queue_population"),
        people_inside=live.get("people_inside"),
        processing_rate=live.get("processing_rate_per_hour"),
        camera_count=live.get("camera_count"),
        persist=False,
    )
    return {"status": live, "prediction": result}
