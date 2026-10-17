"""Exit-point status, persistence and devotee payloads.

Exit gate status (``OPEN`` / ``BUSY`` / ``CLOSED``) and the closure reason are
operator-provided values stored in the database. This module never invents a
status: an exit with no recorded status is reported as ``UNKNOWN``.

Crowd count / capacity / density are joined from the linked :class:`CrowdSpot`
observations (the same source the crowd map uses) so the numbers shown next to
an exit are the real recorded values, not estimates.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.database.models import EXIT_STATUSES, ExitPoint
from app.services import crowd_service

# Statuses reported to clients. "UNKNOWN" is never stored — it is derived when
# no operator has set a status yet.
EXIT_STATUS_VALUES = ("OPEN", "BUSY", "CLOSED", "UNKNOWN")

EXIT_STATUS_LABELS = {
    "OPEN": "Open",
    "BUSY": "Busy",
    "CLOSED": "Closed",
    "UNKNOWN": "Status unknown",
}

EXIT_STATUS_COLORS = {
    "OPEN": "#22C55E",
    "BUSY": "#EAB308",
    "CLOSED": "#DC2626",
    "UNKNOWN": "#9CA3AF",
}


def _iso_utc(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def _clean_status(status: Optional[str]) -> str:
    if status and status.upper() in EXIT_STATUSES:
        return status.upper()
    return "UNKNOWN"


def build_exit_payload(
    exit_point: ExitPoint,
    spot_payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Single exit payload, joining live crowd data when a spot is linked."""
    status = _clean_status(exit_point.status)

    crowd_count: Optional[int] = None
    capacity = exit_point.capacity
    density: Optional[int] = None
    level = "NO_DATA"
    observed_at = None
    age_seconds = None
    stale = False
    has_crowd_data = False

    if spot_payload is not None:
        if spot_payload.get("capacity") is not None:
            capacity = spot_payload["capacity"]
        if spot_payload.get("has_data"):
            crowd_count = spot_payload.get("people_count")
            density = spot_payload.get("density_percent")
            level = spot_payload.get("level") or "NO_DATA"
            observed_at = spot_payload.get("observed_at")
            age_seconds = spot_payload.get("age_seconds")
            stale = bool(spot_payload.get("stale"))
            has_crowd_data = True

    wait_minutes = None
    if exit_point.wait_minutes is not None and exit_point.wait_minutes >= 0:
        wait_minutes = exit_point.wait_minutes

    return {
        "id": exit_point.id,
        "name": exit_point.name,
        "lat": exit_point.lat,
        "lng": exit_point.lng,
        "status": status,
        "status_label": EXIT_STATUS_LABELS[status],
        "color": EXIT_STATUS_COLORS[status],
        "closure_reason": exit_point.closure_reason if status == "CLOSED" else None,
        "spot_id": exit_point.spot_id,
        "capacity": capacity,
        "crowd_count": crowd_count,
        "density_percent": density,
        "level": level,
        "has_crowd_data": has_crowd_data,
        "observed_at": observed_at,
        "age_seconds": age_seconds,
        "stale": stale,
        "wait_minutes": wait_minutes,
        "verified": bool(exit_point.verified),
        "notes": exit_point.notes,
        "updated_at": _iso_utc(exit_point.updated_at),
    }


def build_exits_payload(db: Session) -> Dict[str, Any]:
    """All exits plus a status summary for the devotee page."""
    exits = db.query(ExitPoint).order_by(ExitPoint.name).all()

    crowd = crowd_service.build_map_payload(db, resolve_geometry=False)
    spots_by_id = {spot["id"]: spot for spot in crowd.get("spots", [])}

    payloads: List[Dict[str, Any]] = [
        build_exit_payload(exit_point, spots_by_id.get(exit_point.spot_id))
        for exit_point in exits
    ]

    summary = {status: 0 for status in EXIT_STATUS_VALUES}
    for item in payloads:
        summary[item["status"]] = summary.get(item["status"], 0) + 1

    return {
        "exits": payloads,
        "summary": summary,
        "stale_minutes": crowd.get("stale_minutes"),
        "generated_at": _iso_utc(datetime.utcnow()),
        "note": (
            "Exit status is set by temple staff and may change. Crowd numbers "
            "come from recorded observations."
        ),
    }


# --- Default data (seeded once) -------------------------------------------

DEFAULT_EXITS = [
    {"id": "exit-main", "name": "Main Exit Gate", "lat": 13.6826, "lng": 79.3468, "spot_id": "exit-area", "verified": True},
    {"id": "exit-north", "name": "North Exit Gate", "lat": 13.6850, "lng": 79.3480, "spot_id": None, "verified": False},
    {"id": "exit-south", "name": "South Exit Gate", "lat": 13.6826, "lng": 79.3463, "spot_id": None, "verified": False},
    {"id": "exit-east", "name": "East Exit Gate", "lat": 13.6843, "lng": 79.3485, "spot_id": None, "verified": False},
    {"id": "exit-west", "name": "West Exit Gate", "lat": 13.6841, "lng": 79.3456, "spot_id": None, "verified": False},
]


def seed_exit_defaults(db: Session) -> None:
    """Idempotently seed default exit gates. Never overwrites operator data."""
    if db.query(ExitPoint).count() > 0:
        return
    for spec in DEFAULT_EXITS:
        db.add(ExitPoint(**spec))
    db.commit()
