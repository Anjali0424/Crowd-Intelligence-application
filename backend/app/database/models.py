"""ORM models for staff-entered darshan data and generated predictions."""

from datetime import date, datetime

import json

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import validates

from app.database.database import Base

CROWD_LEVELS = ("LOW", "MODERATE", "HIGH", "CRITICAL")
DATA_SOURCES = ("staff", "camera", "historical", "hybrid")

# Spot observations can come from staff data entry or the camera/drone pipeline.
SPOT_SOURCES = ("staff", "cctv", "drone", "other")


def utcnow() -> datetime:
    return datetime.utcnow()


class DarshanRecord(Base):
    """One staff-entered or camera-derived observation for a time slot.

    ``passes_issued`` is the number of darshan passes authorized for the slot.
    It is deliberately separate from ``actual_entries`` because issued passes
    are not the same as people who actually entered.
    """

    __tablename__ = "darshan_records"
    __table_args__ = (
        UniqueConstraint("record_date", "slot_time", name="uq_record_date_slot"),
    )

    id = Column(Integer, primary_key=True)

    record_date = Column(Date, index=True, nullable=False, default=date.today)
    slot_time = Column(String(5), nullable=False)  # "HH:MM" 24-hour

    source = Column(String(16), nullable=False, default="staff")
    staff_name = Column(String(80), nullable=True)

    # Available / issued passes (authorized, not attendance).
    passes_issued = Column(Integer, nullable=True)

    # Measured movement.
    actual_entries = Column(Integer, nullable=True)
    actual_exits = Column(Integer, nullable=True)

    # Crowd state as recorded by staff or the camera pipeline.
    people_inside = Column(Integer, nullable=True)
    queue_population = Column(Integer, nullable=True)
    completed_per_hour = Column(Integer, nullable=True)
    camera_count = Column(Integer, nullable=True)
    crowd_level = Column(String(16), nullable=True)

    # Ground-truth durations, when known. Used to train the model and to
    # back-test the baseline.
    observed_wait_minutes = Column(Integer, nullable=True)
    observed_darshan_minutes = Column(Integer, nullable=True)

    notes = Column(Text, nullable=True)

    recorded_at = Column(DateTime, nullable=False, default=utcnow, index=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    @validates(
        "passes_issued",
        "actual_entries",
        "actual_exits",
        "people_inside",
        "queue_population",
        "completed_per_hour",
        "camera_count",
        "observed_wait_minutes",
        "observed_darshan_minutes",
    )
    def _non_negative(self, key, value):
        if value is None:
            return value
        if value < 0:
            raise ValueError(f"{key} cannot be negative")
        return value

    def to_dict(self):
        return {
            "id": self.id,
            "record_date": self.record_date.isoformat() if self.record_date else None,
            "slot_time": self.slot_time,
            "source": self.source,
            "staff_name": self.staff_name,
            "passes_issued": self.passes_issued,
            "actual_entries": self.actual_entries,
            "actual_exits": self.actual_exits,
            "people_inside": self.people_inside,
            "queue_population": self.queue_population,
            "completed_per_hour": self.completed_per_hour,
            "camera_count": self.camera_count,
            "crowd_level": self.crowd_level,
            "observed_wait_minutes": self.observed_wait_minutes,
            "observed_darshan_minutes": self.observed_darshan_minutes,
            "notes": self.notes,
            "recorded_at": self.recorded_at.isoformat() if self.recorded_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class DarshanPrediction(Base):
    """A stored prediction result, kept for history and trend charts."""

    __tablename__ = "darshan_predictions"

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, nullable=False, default=utcnow, index=True)

    source = Column(String(16), nullable=False, default="staff")  # data source used
    method = Column(String(24), nullable=False)  # queue-baseline | historical-ml | combined

    queue_population = Column(Integer, nullable=True)
    people_inside = Column(Integer, nullable=True)
    processing_rate_per_hour = Column(Float, nullable=True)
    entry_rate_per_hour = Column(Float, nullable=True)

    crowd_level = Column(String(16), nullable=True)

    wait_minutes = Column(Float, nullable=True)
    darshan_minutes = Column(Float, nullable=True)
    total_minutes = Column(Float, nullable=True)

    range_low_minutes = Column(Float, nullable=True)
    range_high_minutes = Column(Float, nullable=True)
    confidence = Column(String(12), nullable=True)

    expected_completion = Column(DateTime, nullable=True)

    historical_records = Column(Integer, nullable=True)
    model_mae_minutes = Column(Float, nullable=True)

    details = Column(Text, nullable=True)  # JSON string with extra context

    def to_dict(self):
        details = None
        if self.details:
            try:
                details = json.loads(self.details)
            except (ValueError, TypeError):
                details = None

        return {
            "id": self.id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "source": self.source,
            "method": self.method,
            "queue_population": self.queue_population,
            "people_inside": self.people_inside,
            "processing_rate_per_hour": self.processing_rate_per_hour,
            "entry_rate_per_hour": self.entry_rate_per_hour,
            "crowd_level": self.crowd_level,
            "wait_minutes": self.wait_minutes,
            "darshan_minutes": self.darshan_minutes,
            "total_minutes": self.total_minutes,
            "range_low_minutes": self.range_low_minutes,
            "range_high_minutes": self.range_high_minutes,
            "confidence": self.confidence,
            "expected_completion": (
                self.expected_completion.isoformat() if self.expected_completion else None
            ),
            "historical_records": self.historical_records,
            "model_mae_minutes": self.model_mae_minutes,
            "details": details,
        }


class CrowdSpot(Base):
    """A specific Tirumala location where crowd is observed (staff or camera).

    ``capacity`` is only set when a verified maximum capacity is known. It is
    never invented: when it is ``None`` the density and crowd colour cannot be
    computed and the spot is reported as ``NO_DATA``.
    """

    __tablename__ = "crowd_spots"

    id = Column(String(64), primary_key=True)  # stable slug, e.g. "main-gate"
    name = Column(String(120), nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)

    capacity = Column(Integer, nullable=True)  # verified max capacity, if known
    verified = Column(Boolean, nullable=False, default=False)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "lat": self.lat,
            "lng": self.lng,
            "capacity": self.capacity,
            "verified": bool(self.verified),
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class CrowdObservation(Base):
    """One crowd reading for a spot, captured at a point in time."""

    __tablename__ = "crowd_observations"

    id = Column(Integer, primary_key=True)
    spot_id = Column(String(64), ForeignKey("crowd_spots.id"), nullable=False, index=True)

    people_count = Column(Integer, nullable=False)
    capacity = Column(Integer, nullable=True)  # capacity snapshot used to classify
    source = Column(String(16), nullable=False, default="staff")
    notes = Column(Text, nullable=True)

    observed_at = Column(DateTime, nullable=False, default=utcnow, index=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "spot_id": self.spot_id,
            "people_count": self.people_count,
            "capacity": self.capacity,
            "source": self.source,
            "notes": self.notes,
            "observed_at": self.observed_at.isoformat() if self.observed_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class CrowdPath(Base):
    """A mapped walking segment whose colour reflects nearby spot crowd.

    ``geometry`` holds verified route geometry (ordered ``[lat, lng]`` pairs)
    produced by pedestrian routing over OpenStreetMap. ``waypoints`` are the
    named points the geometry is resolved from. ``status_spot_ids`` lists the
    spots whose observations decide this segment's colour.
    """

    __tablename__ = "crowd_paths"

    id = Column(String(64), primary_key=True)
    name = Column(String(160), nullable=False)

    start_spot_id = Column(String(64), nullable=True)
    end_spot_id = Column(String(64), nullable=True)

    status_spot_ids = Column(Text, nullable=True)  # JSON list of spot ids
    waypoints = Column(Text, nullable=True)  # JSON list of [lat, lng]
    geometry = Column(Text, nullable=True)  # JSON list of [lat, lng]
    geometry_source = Column(String(32), nullable=True)  # "osrm-foot" | "manual"

    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    @staticmethod
    def _load(raw):
        if not raw:
            return []
        try:
            value = json.loads(raw)
        except (TypeError, ValueError):
            return []
        if not isinstance(value, list):
            return []
        return value

    def status_spot_id_list(self):
        return [str(v) for v in self._load(self.status_spot_ids)]

    def waypoint_list(self):
        return self._load(self.waypoints)

    def geometry_list(self):
        return self._load(self.geometry)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "start_spot_id": self.start_spot_id,
            "end_spot_id": self.end_spot_id,
            "status_spot_ids": self.status_spot_id_list(),
            "waypoints": self.waypoint_list(),
            "geometry": self.geometry_list(),
            "geometry_source": self.geometry_source,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
