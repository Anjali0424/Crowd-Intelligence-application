import cv2
import time
from collections import deque
from dataclasses import dataclass
from typing import Optional, Tuple, Union

try:
    from ultralytics import YOLO
except Exception:  # pragma: no cover
    YOLO = None


@dataclass
class DetectionResult:
    people_count: int
    confidence_mean: float
    timestamp: float
    fps: float
    frame_size: Tuple[int, int]


class PersonDetector:
    """YOLOv11-based person detector returning real counts per frame."""

    def __init__(
        self,
        model_path: str = "yolo11n.pt",
        conf_threshold: float = 0.5,
        iou_threshold: float = 0.45,
        device: str = "cpu",
        person_class_id: int = 0,
    ) -> None:
        if YOLO is None:
            raise RuntimeError(
                "ultralytics is not installed. Install with: pip install ultralytics"
            )

        self.model_path = model_path
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.device = device
        self.person_class_id = person_class_id

        try:
            self.model = YOLO(model_path)
        except Exception as exc:
            raise RuntimeError(f"Failed to load YOLO model '{model_path}': {exc}")

        try:
            if hasattr(self.model, "to"):
                self.model.to(device)
        except Exception:
            pass

        self.fps_deque = deque(maxlen=30)
        self._last_time = time.time()

    def _get_fps(self) -> float:
        now = time.time()
        dt = now - self._last_time if now > self._last_time else 0.001
        self._last_time = now
        if dt <= 0:
            dt = 0.001
        fps = 1.0 / dt
        self.fps_deque.append(fps)
        if not self.fps_deque:
            return round(fps, 2)
        avg_fps = sum(self.fps_deque) / len(self.fps_deque)
        return round(avg_fps, 2)

    def detect_frame(self, frame) -> DetectionResult:
        if frame is None:
            return DetectionResult(
                people_count=0,
                confidence_mean=0.0,
                timestamp=time.time(),
                fps=0.0,
                frame_size=(0, 0),
            )

        h, w = frame.shape[:2]
        results = self.model.predict(
            source=frame,
            conf=self.conf_threshold,
            iou=self.iou_threshold,
            classes=[self.person_class_id],
            device=self.device,
            verbose=False,
            stream=False,
        )

        people_count = 0
        confs = []

        try:
            for r in results:
                boxes = getattr(r, "boxes", None)
                if boxes is None:
                    continue
                cls = boxes.cls.cpu().numpy() if hasattr(boxes.cls, "cpu") else boxes.cls
                conf = boxes.conf.cpu().numpy() if hasattr(boxes.conf, "cpu") else boxes.conf

                for c, cf in zip(cls, conf):
                    try:
                        if int(c) == self.person_class_id:
                            people_count += 1
                            confs.append(float(cf))
                    except Exception:
                        continue
        except Exception:
            people_count = 0
            confs = []

        confidence_mean = round(sum(confs) / len(confs), 3) if confs else 0.0
        fps = self._get_fps()

        return DetectionResult(
            people_count=people_count,
            confidence_mean=confidence_mean,
            timestamp=time.time(),
            fps=fps,
            frame_size=(w, h),
        )

    def close(self) -> None:
        pass
