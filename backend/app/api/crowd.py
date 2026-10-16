"""Crowd API: live camera count, spot-wise crowd entry and the map payload.

Devotee endpoints are read-only. Admin/staff write endpoints require an
``X-Admin-Token`` header **only when** the ``ADMIN_API_TOKEN`` environment
variable is set (same convention as the darshan API).
"""

from __future__ import annotations

import json
import os
import re
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.database.models import CrowdObservation, CrowdPath, CrowdSpot, SPOT_SOURCES
from app.services import crowd_service as svc
from app.streaming.processor import CrowdProcessor

router = APIRouter(prefix="/api/crowd", tags=["crowd"])

# Initialize processor (uses env: CROWD_VIDEO_PATH, CROWD_CAPACITY)
processor = CrowdProcessor()


def require_admin(x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token")):
    expected = os.getenv("ADMIN_API_TOKEN")
    if expected and x_admin_token != expected:
        raise HTTPException(status_code=401, detail="Admin authorization required")


# --- Schemas ---------------------------------------------------------------

class SpotIn(BaseModel):
    id: Optional[str] = None
    name: str = Field(min_length=1, max_length=120)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    capacity: Optional[int] = Field(default=None, gt=0)
    verified: bool = False
    notes: Optional[str] = None


class SpotUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lng: Optional[float] = Field(default=None, ge=-180, le=180)
    capacity: Optional[int] = Field(default=None, gt=0)
    verified: Optional[bool] = None
    notes: Optional[str] = None


class ObservationIn(BaseModel):
    people_count: int = Field(ge=0)
    capacity: Optional[int] = Field(default=None, gt=0)
    source: str = "staff"
    notes: Optional[str] = None


class GeometryIn(BaseModel):
    geometry: List[List[float]]
    geometry_source: Optional[str] = None


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return slug or "spot"


def _validate_source(source: str) -> str:
    value = (source or "staff").strip().lower()
    if value not in SPOT_SOURCES:
        raise HTTPException(
            status_code=422,
            detail=f"source must be one of {', '.join(SPOT_SOURCES)}",
        )
    return value


def _validate_geometry(geometry: List[List[float]]) -> List[List[float]]:
    if not geometry or len(geometry) < 2:
        raise HTTPException(status_code=422, detail="geometry needs at least two [lat, lng] points")
    cleaned: List[List[float]] = []
    for point in geometry:
        if not isinstance(point, (list, tuple)) or len(point) != 2:
            raise HTTPException(status_code=422, detail="each geometry point must be [lat, lng]")
        lat, lng = float(point[0]), float(point[1])
        if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
            raise HTTPException(status_code=422, detail=f"invalid coordinate: {point}")
        cleaned.append([round(lat, 6), round(lng, 6)])
    return cleaned


# --- Live (existing) -------------------------------------------------------

@router.get("/live")
def get_live():
    data = processor.get_latest()
    if data.get("error"):
        raise HTTPException(status_code=503, detail=data["error"])
    return data


@router.get("/health")
def health():
    return {"status": "ok", "database": "sqlite"}


# --- Map (devotee read) ----------------------------------------------------

@router.get("/map")
def crowd_map(db: Session = Depends(get_db)):
    """Full map payload: spots + crowd-coloured paths + thresholds."""
    return svc.build_map_payload(db)


# --- Spots ---------------------------------------------------------------

@router.get("/spots")
def list_spots(db: Session = Depends(get_db)):
    payload = svc.build_map_payload(db, resolve_geometry=False)
    return {"spots": payload["spots"], "stale_minutes": payload["stale_minutes"]}


@router.post("/spots")
def create_spot(
    body: SpotIn,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_admin),
):
    spot_id = _slugify(body.id or body.name)
    if db.get(CrowdSpot, spot_id) is not None:
        suffix = 2
        while db.get(CrowdSpot, f"{spot_id}-{suffix}") is not None:
            suffix += 1
        spot_id = f"{spot_id}-{suffix}"

    spot = CrowdSpot(
        id=spot_id,
        name=body.name.strip(),
        lat=body.lat,
        lng=body.lng,
        capacity=body.capacity,
        verified=body.verified,
        notes=body.notes,
    )
    db.add(spot)
    db.commit()
    db.refresh(spot)
    return {"created": True, "spot": spot.to_dict()}


@router.put("/spots/{spot_id}")
def update_spot(
    spot_id: str,
    body: SpotUpdate,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_admin),
):
    spot = db.get(CrowdSpot, spot_id)
    if spot is None:
        raise HTTPException(status_code=404, detail="Spot not found")

    data = body.model_dump(exclude_unset=True)
    if "name" in data and data["name"]:
        spot.name = data["name"].strip()
    if "lat" in data and data["lat"] is not None:
        spot.lat = data["lat"]
    if "lng" in data and data["lng"] is not None:
        spot.lng = data["lng"]
    if "capacity" in data:
        spot.capacity = data["capacity"]
    if "verified" in data and data["verified"] is not None:
        spot.verified = data["verified"]
    if "notes" in data:
        spot.notes = data["notes"]

    db.commit()
    db.refresh(spot)
    return {"updated": True, "spot": spot.to_dict()}


@router.post("/spots/{spot_id}/observations")
def add_observation(
    spot_id: str,
    body: ObservationIn,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_admin),
):
    spot = db.get(CrowdSpot, spot_id)
    if spot is None:
        raise HTTPException(status_code=404, detail="Spot not found")

    source = _validate_source(body.source)
    capacity = body.capacity if body.capacity is not None else spot.capacity

    observation = CrowdObservation(
        spot_id=spot.id,
        people_count=body.people_count,
        capacity=capacity,
        source=source,
        notes=body.notes,
    )
    db.add(observation)
    db.commit()
    db.refresh(observation)

    preview = svc.spot_status(spot, observation)
    return {"created": True, "observation": observation.to_dict(), "status": preview}


# --- Paths ---------------------------------------------------------------

@router.get("/paths")
def list_paths(db: Session = Depends(get_db)):
    payload = svc.build_map_payload(db)
    return {"paths": payload["paths"]}


@router.post("/paths/{path_id}/geometry")
def save_geometry(
    path_id: str,
    body: GeometryIn,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_admin),
):
    path = db.get(CrowdPath, path_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Path not found")

    geometry = _validate_geometry(body.geometry)
    path.geometry = json.dumps(geometry)
    path.geometry_source = body.geometry_source or "staff"
    db.commit()
    db.refresh(path)
    return {"updated": True, "path": path.to_dict()}
