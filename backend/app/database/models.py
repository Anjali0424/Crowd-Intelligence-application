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

# Operator-settable exit statuses. A missing/unknown status is represented as
# "UNKNOWN" in the API payload and is never invented as OPEN.
EXIT_STATUSES = ("OPEN", "BUSY", "CLOSED")


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


class BarricadeGateConfig(Base):
    """Configuration for an AI-monitored temple barricade / queue gate."""

    __tablename__ = "barricade_gates"

    id = Column(String(64), primary_key=True)  # e.g. "CAM-01"
    name = Column(String(120), nullable=False)
    zone_id = Column(String(64), nullable=True)
    zone_name = Column(String(120), nullable=True)
    camera_id = Column(String(64), nullable=False)

    # Normalized line coordinates [0.0 - 1.0] across video width/height
    line_x1 = Column(Float, nullable=False, default=0.1)
    line_y1 = Column(Float, nullable=False, default=0.5)
    line_x2 = Column(Float, nullable=False, default=0.9)
    line_y2 = Column(Float, nullable=False, default=0.5)

    # Valid movement direction: "top_to_bottom", "bottom_to_top", "left_to_right", "right_to_left", "bidirectional"
    direction_mode = Column(String(32), nullable=False, default="top_to_bottom")

    # Safety thresholds
    max_occupancy = Column(Integer, nullable=False, default=15)
    wrong_way_enabled = Column(Boolean, nullable=False, default=True)
    blocked_exit_enabled = Column(Boolean, nullable=False, default=True)
    block_duration_sec = Column(Float, nullable=False, default=5.0)
    cooldown_seconds = Column(Integer, nullable=False, default=60)

    # Assigned guard ID
    assigned_guard_id = Column(String(64), nullable=True)

    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "zone_id": self.zone_id,
            "zone_name": self.zone_name,
            "camera_id": self.camera_id,
            "line_x1": self.line_x1,
            "line_y1": self.line_y1,
            "line_x2": self.line_x2,
            "line_y2": self.line_y2,
            "direction_mode": self.direction_mode,
            "max_occupancy": self.max_occupancy,
            "wrong_way_enabled": bool(self.wrong_way_enabled),
            "blocked_exit_enabled": bool(self.blocked_exit_enabled),
            "block_duration_sec": self.block_duration_sec,
            "cooldown_seconds": self.cooldown_seconds,
            "assigned_guard_id": self.assigned_guard_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class SecurityGuard(Base):
    """Guard / staff member assigned to temple barricades and gates."""

    __tablename__ = "security_guards"

    id = Column(String(64), primary_key=True)  # e.g. "STAFF-12"
    name = Column(String(120), nullable=False)
    role = Column(String(80), nullable=False, default="Crowd Controller")
    assigned_zone = Column(String(120), nullable=True)
    assigned_gate = Column(String(120), nullable=True)
    phone = Column(String(32), nullable=True)
    on_duty = Column(Boolean, nullable=False, default=True)
    notification_channel = Column(String(32), nullable=False, default="in-app")
    last_seen = Column(DateTime, nullable=False, default=utcnow)
    created_at = Column(DateTime, nullable=False, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "role": self.role,
            "assigned_zone": self.assigned_zone,
            "assigned_gate": self.assigned_gate,
            "phone": self.phone,
            "on_duty": bool(self.on_duty),
            "notification_channel": self.notification_channel,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class BarricadeSafetyEvent(Base):
    """Actionable safety event detected at an AI-monitored barricade or gate."""

    __tablename__ = "barricade_safety_events"

    id = Column(String(64), primary_key=True)  # e.g. "EVT-BAR-20261016-123456"
    camera_id = Column(String(64), nullable=False, index=True)
    gate_name = Column(String(120), nullable=False)
    zone_name = Column(String(120), nullable=True)

    # Event types: "OVERCROWDING", "WRONG_WAY_MOVEMENT", "BLOCKED_EXIT", "CAMERA_OFFLINE"
    event_type = Column(String(32), nullable=False, index=True)
    severity = Column(String(16), nullable=False)  # "CRITICAL", "HIGH", "MEDIUM", "LOW"

    title = Column(String(160), nullable=False)
    reason = Column(Text, nullable=False)
    recommended_action = Column(Text, nullable=False)
    people_count = Column(Integer, nullable=True)

    # Assigned guard details
    assigned_guard_id = Column(String(64), nullable=True)
    assigned_guard_name = Column(String(120), nullable=True)

    # Status tracking
    delivery_status = Column(String(24), nullable=False, default="DELIVERED")  # SENT, DELIVERED, FAILED
    status = Column(String(24), nullable=False, default="PENDING")  # PENDING, ACKNOWLEDGED, RESOLVED

    acknowledged_at = Column(DateTime, nullable=True)
    acknowledged_by = Column(String(80), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    resolved_by = Column(String(80), nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, default=utcnow, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "camera_id": self.camera_id,
            "gate_name": self.gate_name,
            "zone_name": self.zone_name,
            "event_type": self.event_type,
            "severity": self.severity,
            "title": self.title,
            "reason": self.reason,
            "recommended_action": self.recommended_action,
            "people_count": self.people_count,
            "assigned_guard_id": self.assigned_guard_id,
            "assigned_guard_name": self.assigned_guard_name,
            "delivery_status": self.delivery_status,
            "status": self.status,
            "acknowledged_at": self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            "acknowledged_by": self.acknowledged_by,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "resolved_by": self.resolved_by,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ExitPoint(Base):
    """A temple exit gate with an operator-managed open/busy/closed status.

    ``status`` and ``closure_reason`` are set by staff/operators (never invented
    by the API). ``spot_id`` optionally links the exit to a :class:`CrowdSpot`
    so live crowd count/capacity/density can be shown alongside it. When no
    status has been recorded the API reports ``UNKNOWN``.
    """

    __tablename__ = "exit_points"

    id = Column(String(64), primary_key=True)  # stable slug, e.g. "exit-main"
    name = Column(String(120), nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)

    status = Column(String(16), nullable=True)  # OPEN | BUSY | CLOSED | null
    closure_reason = Column(Text, nullable=True)

    spot_id = Column(String(64), ForeignKey("crowd_spots.id"), nullable=True)
    capacity = Column(Integer, nullable=True)  # verified max capacity, if known
    wait_minutes = Column(Integer, nullable=True)  # operator-provided, if known

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
            "status": self.status,
            "closure_reason": self.closure_reason,
            "spot_id": self.spot_id,
            "capacity": self.capacity,
            "wait_minutes": self.wait_minutes,
            "verified": bool(self.verified),
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

