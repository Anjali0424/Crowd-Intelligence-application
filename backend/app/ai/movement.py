import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from app.ai.counter import CrossingEvent
from app.ai.tracker import TrackedPerson


@dataclass
class SafetyEventCandidate:
    event_type: str  # "OVERCROWDING", "WRONG_WAY_MOVEMENT", "BLOCKED_EXIT", "CAMERA_OFFLINE"
    severity: str  # "CRITICAL", "HIGH", "MEDIUM", "LOW"
    title: str
    reason: str
    recommended_action: str
    people_count: int


class SafetyRuleEngine:
    """Evaluates real-time crowd safety rules and handles cooldown/deduplication."""

    def __init__(
        self,
        camera_id: str,
        gate_name: str,
        zone_name: str = "",
        max_occupancy: int = 15,
        wrong_way_enabled: bool = True,
        blocked_exit_enabled: bool = True,
        block_duration_sec: float = 5.0,
        cooldown_seconds: int = 60,
    ) -> None:
        self.camera_id = camera_id
        self.gate_name = gate_name
        self.zone_name = zone_name or gate_name
        self.max_occupancy = max_occupancy
        self.wrong_way_enabled = wrong_way_enabled
        self.blocked_exit_enabled = blocked_exit_enabled
        self.block_duration_sec = block_duration_sec
        self.cooldown_seconds = cooldown_seconds

        # Cooldown tracker: event_type -> (last_alert_time, last_severity)
        self._last_alert: Dict[str, Tuple[float, str]] = {}
        # Active status of condition: event_type -> bool
        self._condition_active: Dict[str, bool] = {
            "OVERCROWDING": False,
            "WRONG_WAY_MOVEMENT": False,
            "BLOCKED_EXIT": False,
            "CAMERA_OFFLINE": False,
        }

    def update_config(
        self,
        gate_name: Optional[str] = None,
        zone_name: Optional[str] = None,
        max_occupancy: Optional[int] = None,
        wrong_way_enabled: Optional[bool] = None,
        blocked_exit_enabled: Optional[bool] = None,
        block_duration_sec: Optional[float] = None,
        cooldown_seconds: Optional[int] = None,
    ) -> None:
        if gate_name:
            self.gate_name = gate_name
        if zone_name:
            self.zone_name = zone_name
        if max_occupancy is not None:
            self.max_occupancy = max(1, max_occupancy)
        if wrong_way_enabled is not None:
            self.wrong_way_enabled = wrong_way_enabled
        if blocked_exit_enabled is not None:
            self.blocked_exit_enabled = blocked_exit_enabled
        if block_duration_sec is not None:
            self.block_duration_sec = block_duration_sec
        if cooldown_seconds is not None:
            self.cooldown_seconds = max(5, cooldown_seconds)

    def evaluate(
        self,
        tracked_persons: List[TrackedPerson],
        crossing_events: List[CrossingEvent],
        camera_error: Optional[str] = None,
    ) -> List[SafetyEventCandidate]:
        """Evaluates rules against current detections and returns actionable events."""
        now = time.time()
        candidates: List[SafetyEventCandidate] = []
        people_count = len(tracked_persons)

        # Rule 1: Camera Disconnect / Offline
        if camera_error:
            self._condition_active["CAMERA_OFFLINE"] = True
            if self._should_fire("CAMERA_OFFLINE", now, "HIGH"):
                candidates.append(
                    SafetyEventCandidate(
                        event_type="CAMERA_OFFLINE",
                        severity="HIGH",
                        title=f"Camera signal failure at {self.gate_name}",
                        reason=f"CCTV stream error: {camera_error}. Barricade AI monitoring interrupted.",
                        recommended_action="Inspect network connection and CCTV power feed.",
                        people_count=0,
                    )
                )
        else:
            self._condition_active["CAMERA_OFFLINE"] = False

        # Rule 2: Overcrowding / Dangerous Queue Limit
        if people_count >= self.max_occupancy:
            self._condition_active["OVERCROWDING"] = True
            is_critical = people_count >= int(self.max_occupancy * 1.3)
            severity = "CRITICAL" if is_critical else "HIGH"

            if self._should_fire("OVERCROWDING", now, severity):
                candidates.append(
                    SafetyEventCandidate(
                        event_type="OVERCROWDING",
                        severity=severity,
                        title=f"Crowd alert — {self.gate_name}",
                        reason=f"Configured occupancy limit ({self.max_occupancy}) exceeded with {people_count} people in gate zone.",
                        recommended_action="Please check the queue. Hold outer barricades and meter devotee influx.",
                        people_count=people_count,
                    )
                )
        else:
            self._condition_active["OVERCROWDING"] = False

        # Rule 3: Wrong Direction Movement
        if self.wrong_way_enabled and crossing_events:
            wrong_way_events = [e for e in crossing_events if e.is_wrong_way]
            if wrong_way_events:
                self._condition_active["WRONG_WAY_MOVEMENT"] = True
                ww_count = len(wrong_way_events)
                tid_list = ", ".join(f"ID {e.track_id}" for e in wrong_way_events[:3])
                if self._should_fire("WRONG_WAY_MOVEMENT", now, "MEDIUM"):
                    candidates.append(
                        SafetyEventCandidate(
                            event_type="WRONG_WAY_MOVEMENT",
                            severity="MEDIUM",
                            title=f"Wrong direction movement at {self.gate_name}",
                            reason=f"Devotee ({tid_list}) detected moving against designated one-way queue direction.",
                            recommended_action="Guard to redirect devotee to correct lane before bottleneck occurs.",
                            people_count=people_count,
                        )
                    )
            else:
                self._condition_active["WRONG_WAY_MOVEMENT"] = False
        else:
            self._condition_active["WRONG_WAY_MOVEMENT"] = False

        # Rule 4: Blocked Exit / Bottleneck Obstruction
        if self.blocked_exit_enabled and tracked_persons:
            stationary_people = [
                p for p in tracked_persons if p.stationary_duration >= self.block_duration_sec
            ]
            # If 2 or more people remain stuck for >= duration, or 1 person blocking narrow queue
            if len(stationary_people) >= 2 or (people_count >= 5 and len(stationary_people) >= 1):
                self._condition_active["BLOCKED_EXIT"] = True
                count_blocked = len(stationary_people)
                max_dwell = max(p.stationary_duration for p in stationary_people)
                severity = "CRITICAL" if count_blocked >= 3 else "HIGH"

                if self._should_fire("BLOCKED_EXIT", now, severity):
                    candidates.append(
                        SafetyEventCandidate(
                            event_type="BLOCKED_EXIT",
                            severity=severity,
                            title=f"Gate obstruction detected at {self.gate_name}",
                            reason=f"{count_blocked} people stationary for {max_dwell:.0f}s causing flow obstruction.",
                            recommended_action="Guard intervention required to clear obstruction and maintain movement.",
                            people_count=people_count,
                        )
                    )
            else:
                self._condition_active["BLOCKED_EXIT"] = False
        else:
            self._condition_active["BLOCKED_EXIT"] = False

        return candidates

    def _should_fire(self, event_type: str, now: float, severity: str) -> bool:
        """Determines if an alert should fire based on cooldown and severity changes."""
        if event_type not in self._last_alert:
            self._last_alert[event_type] = (now, severity)
            return True

        last_time, last_sev = self._last_alert[event_type]
        elapsed = now - last_time

        # Escalate immediately if severity rose to CRITICAL
        if last_sev != "CRITICAL" and severity == "CRITICAL" and elapsed > 5.0:
            self._last_alert[event_type] = (now, severity)
            return True

        if elapsed >= self.cooldown_seconds:
            self._last_alert[event_type] = (now, severity)
            return True

        return False

    def get_active_conditions(self) -> Dict[str, bool]:
        return dict(self._condition_active)
