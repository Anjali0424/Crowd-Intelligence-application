import time
from collections import deque
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from app.ai.tracker import TrackedPerson


@dataclass
class CrossingEvent:
    track_id: int
    direction: str  # "ENTRY" or "EXIT"
    is_wrong_way: bool
    timestamp: float


def _cross_product(
    line_p1: Tuple[float, float],
    line_p2: Tuple[float, float],
    p: Tuple[float, float],
) -> float:
    """Returns the signed 2D cross product of (p2 - p1) and (p - p1)."""
    lx = line_p2[0] - line_p1[0]
    ly = line_p2[1] - line_p1[1]
    px = p[0] - line_p1[0]
    py = p[1] - line_p1[1]
    return lx * py - ly * px


def _segments_intersect(
    a1: Tuple[float, float],
    a2: Tuple[float, float],
    b1: Tuple[float, float],
    b2: Tuple[float, float],
) -> bool:
    """Returns True if line segment a1-a2 intersects line segment b1-b2."""
    def ccw(p1, p2, p3):
        return (p3[1] - p1[1]) * (p2[0] - p1[0]) > (p2[1] - p1[1]) * (p3[0] - p1[0])

    return (ccw(a1, b1, b2) != ccw(a2, b1, b2)) and (ccw(a1, a2, b1) != ccw(a1, a2, b2))


class VirtualLineCounter:
    """Tracks people crossing a configured virtual barricade line."""

    def __init__(
        self,
        line_norm: Tuple[float, float, float, float] = (0.1, 0.5, 0.9, 0.5),
        direction_mode: str = "top_to_bottom",
        crossing_cooldown_sec: float = 8.0,
    ) -> None:
        self.line_norm = line_norm  # (x1, y1, x2, y2) normalized [0.0 - 1.0]
        self.direction_mode = direction_mode
        self.crossing_cooldown_sec = crossing_cooldown_sec

        self.entries_count = 0
        self.exits_count = 0
        self._counted_history: Dict[int, float] = {}  # track_id -> timestamp
        self._recent_events: deque = deque(maxlen=50)

    def set_config(
        self,
        line_norm: Optional[Tuple[float, float, float, float]] = None,
        direction_mode: Optional[str] = None,
    ) -> None:
        if line_norm is not None:
            self.line_norm = line_norm
        if direction_mode is not None:
            self.direction_mode = direction_mode

    def reset_counts(self) -> None:
        self.entries_count = 0
        self.exits_count = 0
        self._counted_history.clear()
        self._recent_events.clear()

    @property
    def current_inside(self) -> int:
        return max(0, self.entries_count - self.exits_count)

    def get_pixel_line(self, frame_width: int, frame_height: int) -> Tuple[Tuple[int, int], Tuple[int, int]]:
        x1 = int(self.line_norm[0] * frame_width)
        y1 = int(self.line_norm[1] * frame_height)
        x2 = int(self.line_norm[2] * frame_width)
        y2 = int(self.line_norm[3] * frame_height)
        return (x1, y1), (x2, y2)

    def update(
        self,
        tracked_persons: List[TrackedPerson],
        frame_width: int,
        frame_height: int,
    ) -> List[CrossingEvent]:
        """Evaluates tracked persons against the virtual line."""
        if not tracked_persons or frame_width <= 0 or frame_height <= 0:
            return []

        now = time.time()
        p1, p2 = self.get_pixel_line(frame_width, frame_height)
        new_crossings: List[CrossingEvent] = []

        # Prune old cooldown history
        stale_ids = [
            tid
            for tid, t_time in self._counted_history.items()
            if now - t_time > self.crossing_cooldown_sec
        ]
        for tid in stale_ids:
            del self._counted_history[tid]

        for person in tracked_persons:
            tid = person.track_id
            traj = person.trajectory
            if len(traj) < 2:
                continue

            # Check if this person was already counted recently
            if tid in self._counted_history:
                continue

            prev_pt = traj[-2]
            curr_pt = traj[-1]

            # Test intersection between trajectory segment and virtual line
            intersects = _segments_intersect(prev_pt, curr_pt, p1, p2)
            if not intersects:
                # Also check cross-product sign change for robustness
                cp_prev = _cross_product(p1, p2, prev_pt)
                cp_curr = _cross_product(p1, p2, curr_pt)
                if (cp_prev * cp_curr < 0) and abs(cp_curr - cp_prev) > 10.0:
                    intersects = True

            if intersects:
                cp_prev = _cross_product(p1, p2, prev_pt)
                cp_curr = _cross_product(p1, p2, curr_pt)

                # Determine direction:
                # If cp_curr > cp_prev, person moved from right/above to left/below
                is_forward = cp_curr > cp_prev
                if self.direction_mode == "bottom_to_top" or self.direction_mode == "right_to_left":
                    is_forward = not is_forward

                direction = "ENTRY" if is_forward else "EXIT"
                is_wrong_way = False

                if self.direction_mode == "top_to_bottom" or self.direction_mode == "bottom_to_top":
                    if not is_forward and self.direction_mode != "bidirectional":
                        is_wrong_way = True

                if direction == "ENTRY":
                    self.entries_count += 1
                else:
                    self.exits_count += 1

                event = CrossingEvent(
                    track_id=tid,
                    direction=direction,
                    is_wrong_way=is_wrong_way,
                    timestamp=now,
                )
                self._counted_history[tid] = now
                self._recent_events.append(event)
                new_crossings.append(event)

        return new_crossings

    def get_recent_events(self) -> List[Dict]:
        return [
            {
                "track_id": e.track_id,
                "direction": e.direction,
                "is_wrong_way": e.is_wrong_way,
                "timestamp": e.timestamp,
            }
            for e in self._recent_events
        ]
