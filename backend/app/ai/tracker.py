import time
from collections import deque
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np


@dataclass
class TrackedPerson:
    """Represents a tracked person in the camera frame."""

    track_id: int
    bbox: Tuple[int, int, int, int]  # (x1, y1, x2, y2)
    centroid: Tuple[int, int]  # (cx, cy)
    conf: float
    trajectory: List[Tuple[int, int]] = field(default_factory=list)
    velocity: Tuple[float, float] = (0.0, 0.0)
    stationary_duration: float = 0.0
    first_seen: float = field(default_factory=time.time)
    last_seen: float = field(default_factory=time.time)


class BarricadeTracker:
    """Multi-object person tracker using YOLO ByteTrack with trajectory & dwell analysis."""

    def __init__(
        self,
        max_trajectory_length: int = 40,
        max_lost_seconds: float = 2.0,
        stationary_radius_px: float = 25.0,
    ) -> None:
        self.max_trajectory_length = max_trajectory_length
        self.max_lost_seconds = max_lost_seconds
        self.stationary_radius_px = stationary_radius_px

        # Internal track state: track_id -> dict
        self._tracks: Dict[int, Dict] = {}
        self._next_fallback_id = 1000

    def reset(self) -> None:
        self._tracks.clear()
        self._next_fallback_id = 1000

    def update(
        self,
        model,
        frame: np.ndarray,
        conf_threshold: float = 0.4,
        iou_threshold: float = 0.45,
        device: str = "cpu",
    ) -> List[TrackedPerson]:
        """Runs tracking on the frame and returns tracked persons."""
        if frame is None or model is None:
            return []

        now = time.time()
        tracked_persons: List[TrackedPerson] = []

        try:
            # Run Ultralytics YOLO with ByteTrack persistence
            results = model.track(
                source=frame,
                conf=conf_threshold,
                iou=iou_threshold,
                classes=[0],  # Person class only
                persist=True,
                tracker="bytetrack.yaml",
                device=device,
                verbose=False,
                stream=False,
            )
        except Exception:
            # Fallback to standard prediction if tracker throws
            try:
                results = model.predict(
                    source=frame,
                    conf=conf_threshold,
                    iou=iou_threshold,
                    classes=[0],
                    device=device,
                    verbose=False,
                    stream=False,
                )
            except Exception:
                return []

        detected_ids = set()

        if results and len(results) > 0:
            boxes = getattr(results[0], "boxes", None)
            if boxes is not None and len(boxes) > 0:
                xyxy = boxes.xyxy.cpu().numpy() if hasattr(boxes.xyxy, "cpu") else boxes.xyxy
                confs = boxes.conf.cpu().numpy() if hasattr(boxes.conf, "cpu") else boxes.conf
                ids = None
                if hasattr(boxes, "id") and boxes.id is not None:
                    ids = boxes.id.cpu().numpy() if hasattr(boxes.id, "cpu") else boxes.id

                for idx, box in enumerate(xyxy):
                    x1, y1, x2, y2 = [int(v) for v in box[:4]]
                    cx = int((x1 + x2) / 2)
                    cy = int((y1 + y2) / 2)
                    conf = float(confs[idx]) if idx < len(confs) else 0.5

                    if ids is not None and idx < len(ids) and ids[idx] is not None:
                        track_id = int(ids[idx])
                    else:
                        # Find closest existing track or assign fallback ID
                        track_id = self._match_centroid(cx, cy)
                        if track_id is None:
                            track_id = self._next_fallback_id
                            self._next_fallback_id += 1

                    detected_ids.add(track_id)

                    # Update internal tracking memory
                    if track_id not in self._tracks:
                        self._tracks[track_id] = {
                            "trajectory": deque(maxlen=self.max_trajectory_length),
                            "first_seen": now,
                            "last_seen": now,
                            "anchor_pos": (cx, cy),
                            "stationary_since": now,
                            "prev_centroid": (cx, cy),
                            "velocity": (0.0, 0.0),
                        }

                    t_info = self._tracks[track_id]
                    prev_cx, prev_cy = t_info["prev_centroid"]
                    t_info["trajectory"].append((cx, cy))
                    dt = max(0.001, now - t_info["last_seen"])
                    vx = (cx - prev_cx) / dt
                    vy = (cy - prev_cy) / dt
                    t_info["velocity"] = (round(vx, 1), round(vy, 1))
                    t_info["prev_centroid"] = (cx, cy)
                    t_info["last_seen"] = now

                    # Stationary dwell calculation
                    anchor_x, anchor_y = t_info["anchor_pos"]
                    dist_from_anchor = np.hypot(cx - anchor_x, cy - anchor_y)
                    if dist_from_anchor > self.stationary_radius_px:
                        t_info["anchor_pos"] = (cx, cy)
                        t_info["stationary_since"] = now
                        stationary_dur = 0.0
                    else:
                        stationary_dur = round(now - t_info["stationary_since"], 1)

                    tracked_persons.append(
                        TrackedPerson(
                            track_id=track_id,
                            bbox=(x1, y1, x2, y2),
                            centroid=(cx, cy),
                            conf=round(conf, 2),
                            trajectory=list(t_info["trajectory"]),
                            velocity=t_info["velocity"],
                            stationary_duration=stationary_dur,
                            first_seen=t_info["first_seen"],
                            last_seen=now,
                        )
                    )

        # Clean up stale tracks not seen in max_lost_seconds
        stale_ids = [
            tid
            for tid, info in self._tracks.items()
            if tid not in detected_ids and (now - info["last_seen"] > self.max_lost_seconds)
        ]
        for tid in stale_ids:
            del self._tracks[tid]

        return tracked_persons

    def _match_centroid(self, cx: int, cy: int, max_dist: float = 60.0) -> Optional[int]:
        best_id = None
        best_dist = max_dist
        for tid, info in self._tracks.items():
            prev_x, prev_y = info["prev_centroid"]
            dist = np.hypot(cx - prev_x, cy - prev_y)
            if dist < best_dist:
                best_dist = dist
                best_id = tid
        return best_id
