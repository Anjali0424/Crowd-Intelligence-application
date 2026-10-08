import os
import time
from threading import Lock, Thread
from typing import Any, Dict, Optional
from typing import Union

import cv2

from app.ai.detector import PersonDetector

DEFAULT_VIDEO = os.getenv("CROWD_VIDEO_PATH", "videos/crowd.mp4")
DEFAULT_CAPACITY = int(os.getenv("CROWD_CAPACITY", "300"))
DEFAULT_ZONE_ID = os.getenv("CROWD_ZONE_ID", "main-gate")
DEFAULT_ZONE_NAME = os.getenv("CROWD_ZONE_NAME", "Main Darshan Gate")


class CrowdProcessor:
    """Processes a video source (file or webcam) and maintains latest crowd info."""

    def __init__(
        self,
        source: Union[int, str] = DEFAULT_VIDEO,
        capacity: int = DEFAULT_CAPACITY,
        zone_id: str = DEFAULT_ZONE_ID,
        zone_name: str = DEFAULT_ZONE_NAME,
        model_path: str = "yolo11n.pt",
        conf_threshold: float = 0.5,
    ) -> None:
        self.source = source
        self.capacity = max(1, capacity)
        self.zone_id = zone_id
        self.zone_name = zone_name
        self.model_path = model_path
        self.conf_threshold = conf_threshold

        self._lock = Lock()
        self._latest: Dict[str, Any] = {
            "people_count": 0,
            "capacity": self.capacity,
            "density": 0.0,
            "level": "LOW",
            "timestamp": time.time(),
            "source": "video",
            "zone_id": self.zone_id,
            "zone_name": self.zone_name,
            "fps": 0.0,
            "confidence_mean": 0.0,
            "frame_size": (0, 0),
            "error": None,
        }
        self._running = False
        self._thread: Optional[Thread] = None
        self._cap: Optional[cv2.VideoCapture] = None
        self._detector: Optional[PersonDetector] = None
        self._start()

    def _level(self, count: int) -> str:
        pct = (count / self.capacity) * 100.0
        if pct >= 91.0:
            return "CRITICAL"
        if pct >= 71.0:
            return "HIGH"
        if pct >= 41.0:
            return "MODERATE"
        return "LOW"

    def _density(self, count: int) -> float:
        pct = (count / self.capacity) * 100.0
        if pct < 0.0:
            pct = 0.0
        if pct > 100.0:
            pct = 100.0
        return round(pct, 2)

    def _open_source(self) -> cv2.VideoCapture:
        src = self.source
        if isinstance(src, int) or (isinstance(src, str) and src.isdigit()):
            cap = cv2.VideoCapture(int(src))
            try:
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            except Exception:
                pass
            return cap
        if not os.path.exists(src):
            raise FileNotFoundError(f"Video source not found: {src}")
        return cv2.VideoCapture(src)

    def _loop(self) -> None:
        try:
            self._cap = self._open_source()
            if not self._cap.isOpened():
                raise RuntimeError("Failed to open video source")
            try:
                self._detector = PersonDetector(
                    model_path=self.model_path,
                    conf_threshold=self.conf_threshold,
                )
            except Exception as exc:
                raise exc
            while self._running:
                ret, frame = self._cap.read()
                if not ret or frame is None:
                    # If file ends, try to restart once; else break
                    if isinstance(self.source, str) and not self.source.isdigit():
                        # restart
                        self._cap.release()
                        self._cap = self._open_source()
                        if not self._cap.isOpened():
                            break
                        continue
                    break
                res = self._detector.detect_frame(frame)
                with self._lock:
                    self._latest.update(
                        {
                            "people_count": res.people_count,
                            "capacity": self.capacity,
                            "density": self._density(res.people_count),
                            "level": self._level(res.people_count),
                            "timestamp": res.timestamp,
                            "source": "webcam" if (isinstance(self.source, int) or str(self.source).isdigit()) else "video",
                            "zone_id": self.zone_id,
                            "zone_name": self.zone_name,
                            "fps": res.fps,
                            "confidence_mean": res.confidence_mean,
                            "frame_size": res.frame_size,
                            "error": None,
                        }
                    )
                # small sleep not required; loop is real-time
        except Exception as exc:
            with self._lock:
                self._latest["error"] = str(exc)
                self._latest["people_count"] = 0
        finally:
            if self._cap is not None:
                self._cap.release()
            if self._detector is not None:
                try:
                    self._detector.close()
                except Exception:
                    pass
            self._running = False

    def _start(self) -> None:
        if self._running:
            return
        self._running = True
        self._thread = Thread(target=self._loop, daemon=True)
        self._thread.start()

    def get_latest(self) -> Dict[str, Any]:
        with self._lock:
            return dict(self._latest)

    def stop(self) -> None:
        self._running = False
        if self._thread is not None:
            self._thread.join(timeout=2.0)
