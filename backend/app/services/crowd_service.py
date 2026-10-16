"""Spot-wise crowd classification, persistence and map payloads.

This module is the single source of truth for crowd classification. It is used
both by the admin spot-entry API and the devotee map, so a spot's colour on the
map can never disagree with its admin status.

Crowd level is derived from a *normalised density percentage*
(``people_count / capacity * 100``). A raw people count is never treated as a
percentage. When the capacity is unknown or invalid the density is unavailable
and the level is ``NO_DATA`` (gray) - capacities are never invented.
"""

from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.database.models import CrowdObservation, CrowdPath, CrowdSpot

# --- Canonical crowd classification ---------------------------------------

CROWD_LEVEL_COLORS = {
    "LOW": "#22C55E",
    "MODERATE": "#EAB308",
    "HIGH": "#F97316",
    "CRITICAL": "#DC2626",
    "NO_DATA": "#9CA3AF",
}

CROWD_LEVEL_LABELS = {
    "LOW": "Less crowded",
    "MODERATE": "Busy",
    "HIGH": "Very busy",
    "CRITICAL": "Too crowded",
    "NO_DATA": "No information",
}

CROWD_THRESHOLDS = [
    {"level": "LOW", "label": CROWD_LEVEL_LABELS["LOW"], "color": CROWD_LEVEL_COLORS["LOW"], "min": 0, "max": 40},
    {"level": "MODERATE", "label": CROWD_LEVEL_LABELS["MODERATE"], "color": CROWD_LEVEL_COLORS["MODERATE"], "min": 41, "max": 70},
    {"level": "HIGH", "label": CROWD_LEVEL_LABELS["HIGH"], "color": CROWD_LEVEL_COLORS["HIGH"], "min": 71, "max": 90},
    {"level": "CRITICAL", "label": CROWD_LEVEL_LABELS["CRITICAL"], "color": CROWD_LEVEL_COLORS["CRITICAL"], "min": 91, "max": 100},
    {"level": "NO_DATA", "label": CROWD_LEVEL_LABELS["NO_DATA"], "color": CROWD_LEVEL_COLORS["NO_DATA"], "min": None, "max": None},
]

_LEVEL_RANK = {"LOW": 1, "MODERATE": 2, "HIGH": 3, "CRITICAL": 4, "NO_DATA": 0}

MAP_NOTE = (
    "Crowd status uses staff-entered or camera-derived observations and may "
    "differ from actual conditions."
)

OSRM_FOOT_URL = "https://routing.openstreetmap.de/routed-foot/route/v1/driving"
STALE_MINUTES_DEFAULT = 30
GEOMETRY_TIMEOUT_SECONDS = 6.0


def _level(people: int, capacity: int) -> str:
    density = round(people / capacity * 100)
    if density <= 40:
        return "LOW"
    if density <= 70:
        return "MODERATE"
    if density <= 90:
        return "HIGH"
    return "CRITICAL"


def classify_crowd(people_count: Any, capacity: Any) -> Dict[str, Any]:
    """Classify a spot from a people count and (verified) capacity.

    Returns a dict with ``people_count``, ``capacity``, ``density_percent``,
    ``level``, ``color`` and ``label``. Invalid input yields ``NO_DATA``.
    """
    try:
        people = int(people_count)
    except (TypeError, ValueError):
        return _no_data()

    if people < 0:
        return _no_data()

    if capacity is None or capacity == "":
        return _no_data(people)

    try:
        cap = int(capacity)
    except (TypeError, ValueError):
        return _no_data(people)

    if cap <= 0:
        return _no_data(people)

    level = _level(people, cap)
    return {
        "people_count": people,
        "capacity": cap,
        "density_percent": round(people / cap * 100),
        "level": level,
        "color": CROWD_LEVEL_COLORS[level],
        "label": CROWD_LEVEL_LABELS[level],
    }


def _no_data(people: Optional[int] = None) -> Dict[str, Any]:
    return {
        "people_count": people,
        "capacity": None,
        "density_percent": None,
        "level": "NO_DATA",
        "color": CROWD_LEVEL_COLORS["NO_DATA"],
        "label": CROWD_LEVEL_LABELS["NO_DATA"],
    }


def _iso_utc(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def _stale_minutes() -> int:
    import os

    try:
        return max(1, int(os.environ.get("CROWD_STALE_MINUTES", STALE_MINUTES_DEFAULT)))
    except (TypeError, ValueError):
        return STALE_MINUTES_DEFAULT


# --- Live camera counts (fallback source when no staff observation) --------

def latest_camera_zone_counts() -> Dict[str, Dict[str, Any]]:
    """Latest camera-derived count per crowd zone, or ``{}`` when unavailable.

    Overlapping cameras that report the same ``zone_id`` are de-duplicated by
    keeping the highest single reading (never summed).
    """
    try:
        from app.api.cameras import ORDER, _get_session
    except Exception:
        return {}

    zones: Dict[str, Dict[str, Any]] = {}
    for cid in ORDER:
        try:
            data = _get_session(cid).latest()
        except Exception:
            continue
        if not data.get("available") or not data.get("has_count"):
            continue
        zone_id = data.get("zone_id")
        if not zone_id:
            continue
        people = int(data.get("people_count") or 0)
        current = zones.get(zone_id)
        if current is None or people > current["people_count"]:
            zones[zone_id] = {
                "people_count": people,
                "capacity": data.get("capacity"),
                "timestamp": float(data.get("timestamp") or 0),
            }
    return zones


def latest_observations(db: Session) -> Dict[str, CrowdObservation]:
    """Most recent observation per spot id."""
    rows = (
        db.query(CrowdObservation)
        .order_by(CrowdObservation.observed_at.desc(), CrowdObservation.id.desc())
        .all()
    )
    result: Dict[str, CrowdObservation] = {}
    for row in rows:
        result.setdefault(row.spot_id, row)
    return result


# --- Payload builders ------------------------------------------------------

def build_spot_payload(
    spot: CrowdSpot,
    observation: Optional[CrowdObservation],
    cctv: Optional[Dict[str, Any]],
    now: datetime,
    stale_minutes: int,
) -> Dict[str, Any]:
    people: Optional[int] = None
    capacity = spot.capacity
    source = None
    observed_at = None

    if observation is not None:
        people = observation.people_count
        if observation.capacity is not None:
            capacity = observation.capacity
        source = observation.source
        observed_at = observation.observed_at
    elif cctv is not None:
        people = cctv["people_count"]
        capacity = cctv.get("capacity") or spot.capacity
        source = "cctv"
        if cctv.get("timestamp"):
            observed_at = datetime.utcfromtimestamp(cctv["timestamp"])

    classification = classify_crowd(people, capacity)

    age_seconds = None
    stale = False
    if observed_at is not None:
        age_seconds = max(0, int((now - observed_at).total_seconds()))
        stale = age_seconds > _stale_minutes() * 60

    has_data = people is not None and not stale
    level = classification["level"] if has_data else "NO_DATA"

    return {
        "id": spot.id,
        "name": spot.name,
        "lat": spot.lat,
        "lng": spot.lng,
        "capacity": capacity,
        "verified": bool(spot.verified),
        "people_count": people,
        "density_percent": classification["density_percent"] if has_data else None,
        "level": level,
        "color": CROWD_LEVEL_COLORS[level],
        "label": CROWD_LEVEL_LABELS[level],
        "source": source,
        "observed_at": _iso_utc(observed_at),
        "age_seconds": age_seconds,
        "stale": bool(stale),
        "has_data": bool(has_data),
    }


def spot_status(
    spot: CrowdSpot,
    observation: Any = None,
    cctv: Any = None,
) -> Dict[str, Any]:
    """Status payload for a single spot (uses current time / staleness)."""
    return build_spot_payload(spot, observation, cctv, datetime.utcnow(), _stale_minutes())


def _path_payload(path: CrowdPath, spot_payloads: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    mapped = [spot_payloads[sid] for sid in path.status_spot_id_list() if sid in spot_payloads]
    valid = [s for s in mapped if s["has_data"]]

    if valid:
        best = max(valid, key=lambda s: _LEVEL_RANK.get(s["level"], 0))
        level = best["level"]
        density = best["density_percent"]
        people = best["people_count"]
        observed = max((s["observed_at"] for s in valid if s["observed_at"]), default=None)
        age = max((s["age_seconds"] for s in valid if s["age_seconds"] is not None), default=None)
        stale = False
    else:
        level = "NO_DATA"
        density = None
        people = None
        observed = max((s["observed_at"] for s in mapped if s["observed_at"]), default=None)
        age = max((s["age_seconds"] for s in mapped if s["age_seconds"] is not None), default=None)
        stale = bool(mapped)

    return {
        "id": path.id,
        "name": path.name,
        "start_spot_id": path.start_spot_id,
        "end_spot_id": path.end_spot_id,
        "status_spot_ids": path.status_spot_id_list(),
        "geometry": path.geometry_list(),
        "waypoints": path.waypoint_list(),
        "geometry_source": path.geometry_source,
        "level": level,
        "color": CROWD_LEVEL_COLORS[level],
        "label": CROWD_LEVEL_LABELS[level],
        "density_percent": density,
        "people_count": people,
        "observed_at": observed,
        "age_seconds": age,
        "stale": stale,
        "status_spots": mapped,
    }


def build_map_payload(db: Session, resolve_geometry: bool = True) -> Dict[str, Any]:
    now = datetime.utcnow()
    spots = db.query(CrowdSpot).order_by(CrowdSpot.name).all()
    paths = db.query(CrowdPath).all()
    observations = latest_observations(db)
    cctv = latest_camera_zone_counts()
    stale_minutes = _stale_minutes()

    spot_payloads: Dict[str, Dict[str, Any]] = {}
    for spot in spots:
        spot_payloads[spot.id] = build_spot_payload(
            spot, observations.get(spot.id), cctv.get(spot.id), now, stale_minutes
        )

    if resolve_geometry and any(not p.geometry_list() for p in paths):
        kick_geometry_resolution()

    return {
        "spots": list(spot_payloads.values()),
        "paths": [_path_payload(p, spot_payloads) for p in paths],
        "thresholds": CROWD_THRESHOLDS,
        "stale_minutes": stale_minutes,
        "generated_at": _iso_utc(datetime.utcnow()),
        "note": MAP_NOTE,
    }


# --- Geometry resolution ---------------------------------------------------

_geom_lock = threading.Lock()
_geom_running = False


def _osrm_foot_geometry(waypoints: List[List[float]]) -> Optional[List[List[float]]]:
    """Resolve road-snapped pedestrian geometry for a list of ``[lat, lng]``."""
    if len(waypoints) < 2:
        return None
    coords = ";".join(f"{round(float(lng), 6)},{round(float(lat), 6)}" for lat, lng in waypoints)
    url = f"{OSRM_FOOT_URL}/{coords}"
    try:
        import httpx

        response = httpx.get(
            url,
            params={"overview": "full", "geometries": "geojson"},
            timeout=GEOMETRY_TIMEOUT_SECONDS,
        )
        data = response.json()
        if data.get("code") != "Ok":
            return None
        geometry = data["routes"][0]["geometry"]["coordinates"]
        snapped = [[round(lat, 6), round(lng, 6)] for lng, lat in geometry]
        return snapped if len(snapped) >= 2 else None
    except Exception:
        return None


def _resolve_all_geometry() -> None:
    global _geom_running
    try:
        from app.database.database import SessionLocal

        db = SessionLocal()
        try:
            for path in db.query(CrowdPath).all():
                if path.geometry_list():
                    continue
                geometry = _osrm_foot_geometry(path.waypoint_list())
                if geometry:
                    path.geometry = json.dumps(geometry)
                    path.geometry_source = "osrm-foot"
                    db.commit()
        finally:
            db.close()
    except Exception:
        pass
    finally:
        with _geom_lock:
            _geom_running = False


def kick_geometry_resolution() -> None:
    """Resolve missing path geometry in the background (non-blocking)."""
    global _geom_running
    with _geom_lock:
        if _geom_running:
            return
        _geom_running = True
    threading.Thread(target=_resolve_all_geometry, daemon=True).start()


# --- Default data (seeded once) -------------------------------------------

DEFAULT_SPOTS = [
    {"id": "main-gate", "name": "Main Darshan Gate", "lat": 13.6835, "lng": 79.3473, "capacity": 300, "verified": True},
    {"id": "queue-area", "name": "Queue Area", "lat": 13.6833, "lng": 79.3472, "capacity": 250, "verified": True},
    {"id": "darshan-area", "name": "Darshan Area", "lat": 13.6830, "lng": 79.3471, "capacity": 200, "verified": True},
    {"id": "exit-area", "name": "Exit Area", "lat": 13.6828, "lng": 79.3469, "capacity": 150, "verified": True},
    {"id": "gopuram", "name": "Main Gopuram", "lat": 13.6832, "lng": 79.3471, "capacity": None, "verified": False},
    {"id": "laddu-counter", "name": "Laddu Prasadam Counter", "lat": 13.6834, "lng": 79.3476, "capacity": None, "verified": False},
    {"id": "vqc-1", "name": "Vaikuntam Queue Complex", "lat": 13.6819, "lng": 79.3462, "capacity": None, "verified": False},
]

DEFAULT_PATHS = [
    {"id": "p-gopuram-gate", "name": "Gopuram to Main Darshan Gate", "start_spot_id": "gopuram", "end_spot_id": "main-gate", "status_spot_ids": ["gopuram", "main-gate"]},
    {"id": "p-gate-queue", "name": "Main Darshan Gate to Queue Area", "start_spot_id": "main-gate", "end_spot_id": "queue-area", "status_spot_ids": ["main-gate", "queue-area"]},
    {"id": "p-vqc-queue", "name": "Vaikuntam Queue Complex to Queue Area", "start_spot_id": "vqc-1", "end_spot_id": "queue-area", "status_spot_ids": ["vqc-1", "queue-area"]},
    {"id": "p-queue-darshan", "name": "Queue Area to Darshan Area", "start_spot_id": "queue-area", "end_spot_id": "darshan-area", "status_spot_ids": ["queue-area", "darshan-area"]},
    {"id": "p-darshan-exit", "name": "Darshan Area to Exit Area", "start_spot_id": "darshan-area", "end_spot_id": "exit-area", "status_spot_ids": ["darshan-area", "exit-area"]},
    {"id": "p-gopuram-laddu", "name": "Gopuram to Laddu Counter", "start_spot_id": "gopuram", "end_spot_id": "laddu-counter", "status_spot_ids": ["gopuram", "laddu-counter"]},
]


def seed_defaults(db: Session) -> None:
    """Idempotently seed the demo spots/paths. Never overwrites admin data."""
    if db.query(CrowdSpot).count() == 0:
        for spot in DEFAULT_SPOTS:
            db.add(CrowdSpot(**spot))
        db.commit()

    if db.query(CrowdPath).count() == 0:
        coords = {s["id"]: [s["lat"], s["lng"]] for s in DEFAULT_SPOTS}
        for spec in DEFAULT_PATHS:
            waypoints = [
                coords[sid]
                for sid in (spec["start_spot_id"], spec["end_spot_id"])
                if sid in coords
            ]
            db.add(
                CrowdPath(
                    id=spec["id"],
                    name=spec["name"],
                    start_spot_id=spec["start_spot_id"],
                    end_spot_id=spec["end_spot_id"],
                    status_spot_ids=json.dumps(spec["status_spot_ids"]),
                    waypoints=json.dumps(waypoints),
                    geometry=None,
                    geometry_source=None,
                )
            )
        db.commit()
