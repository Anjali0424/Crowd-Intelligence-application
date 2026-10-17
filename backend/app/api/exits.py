"""Exit-point API: read exit status for devotees, update it for staff/admin.

Devotee endpoints are read-only. Admin/staff write endpoints require an
``X-Admin-Token`` header **only when** the ``ADMIN_API_TOKEN`` environment
variable is set (same convention as the crowd and darshan APIs).
"""

from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.database.models import EXIT_STATUSES, ExitPoint
from app.services import exit_service as svc

router = APIRouter(prefix="/api/exits", tags=["exits"])


def require_admin(x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token")):
    expected = os.getenv("ADMIN_API_TOKEN")
    if expected and x_admin_token != expected:
        raise HTTPException(status_code=401, detail="Admin authorization required")


class ExitUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lng: Optional[float] = Field(default=None, ge=-180, le=180)
    status: Optional[str] = None
    closure_reason: Optional[str] = None
    spot_id: Optional[str] = Field(default=None, max_length=64)
    capacity: Optional[int] = Field(default=None, gt=0)
    wait_minutes: Optional[int] = Field(default=None, ge=0)
    verified: Optional[bool] = None
    notes: Optional[str] = None


def _validate_status(status: Optional[str]) -> Optional[str]:
    if status is None:
        return None
    value = status.upper()
    if value not in EXIT_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"status must be one of {', '.join(EXIT_STATUSES)}",
        )
    return value


@router.get("")
def list_exits(db: Session = Depends(get_db)):
    """All exit points with their status and joined crowd data."""
    return svc.build_exits_payload(db)


@router.get("/{exit_id}")
def get_exit(exit_id: str, db: Session = Depends(get_db)):
    exit_point = db.get(ExitPoint, exit_id)
    if exit_point is None:
        raise HTTPException(status_code=404, detail="Exit point not found")

    crowd = svc.crowd_service.build_map_payload(db, resolve_geometry=False)
    spots_by_id = {spot["id"]: spot for spot in crowd.get("spots", [])}
    return {"exit": svc.build_exit_payload(exit_point, spots_by_id.get(exit_point.spot_id))}


@router.put("/{exit_id}")
def update_exit(
    exit_id: str,
    body: ExitUpdate,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_admin),
):
    exit_point = db.get(ExitPoint, exit_id)
    if exit_point is None:
        raise HTTPException(status_code=404, detail="Exit point not found")

    data = body.model_dump(exclude_unset=True)

    if "status" in body.model_fields_set:
        status = _validate_status(body.status)
        exit_point.status = status
        if status != "CLOSED":
            exit_point.closure_reason = None

    if "closure_reason" in data:
        exit_point.closure_reason = body.closure_reason
    if "name" in data and body.name is not None:
        exit_point.name = body.name.strip()
    if body.lat is not None:
        exit_point.lat = body.lat
    if body.lng is not None:
        exit_point.lng = body.lng
    if "spot_id" in body.model_fields_set:
        exit_point.spot_id = body.spot_id
    if "capacity" in body.model_fields_set:
        exit_point.capacity = body.capacity
    if "wait_minutes" in body.model_fields_set:
        exit_point.wait_minutes = body.wait_minutes
    if body.verified is not None:
        exit_point.verified = body.verified
    if body.notes is not None:
        exit_point.notes = body.notes

    db.commit()
    db.refresh(exit_point)
    return {"updated": True, "exit": exit_point.to_dict()}
