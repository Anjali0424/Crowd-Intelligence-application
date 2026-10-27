import os
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Tuple

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None


@dataclass
class DetectionResult:
    people_count: int
    confidence_mean: float
    timestamp: float
    fps: float
    frame_size: Tuple[int, int]
    detections: List[Dict[str, Any]] = field(default_factory=list)


class PersonDetector:
    """
    YOLOv11 person detection with ByteTrack tracking.

    Provides:
    - Person count
    - Detection confidence
    - Bounding boxes
    - ByteTrack tracking IDs
    - Annotated OpenCV frames
    """

    def __init__(
        self,
        model_path: str = "yolo11n.pt",
        conf_threshold: float = 0.25,
        iou_threshold: float = 0.45,
        device: str = "cpu",
        person_class_id: int = 0,
        image_size: int = 960,
    ) -> None:

        if YOLO is None:
            raise RuntimeError(
                "Ultralytics is not installed. Run "
                "'python -m pip install ultralytics'."
            )

        if not 0.0 <= conf_threshold <= 1.0:
            raise ValueError(
                "conf_threshold must be between 0 and 1."
            )

        if not 0.0 <= iou_threshold <= 1.0:
            raise ValueError(
                "iou_threshold must be between 0 and 1."
            )

        if person_class_id < 0:
            raise ValueError(
                "person_class_id must be non-negative."
            )

        if image_size <= 0:
            raise ValueError(
                "image_size must be positive."
            )

        if not model_path:
            raise ValueError(
                "model_path cannot be empty."
            )

        self.model_path = str(model_path)
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.device = device
        self.person_class_id = person_class_id
        self.image_size = image_size

        try:
            candidate = Path(self.model_path)

            if candidate.is_file():
                resolved_path = str(candidate.resolve())
            else:
                resolved_path = self.model_path

            self.model = YOLO(resolved_path)

        except Exception as exc:
            raise RuntimeError(
                f"Could not load YOLO model "
                f"'{self.model_path}': {exc}"
            ) from exc

        self.fps_deque = deque(maxlen=30)
        self._last_time = None

    def _get_fps(self) -> float:
        now = time.perf_counter()

        if self._last_time is None:
            self._last_time = now
            return 0.0

        elapsed = now - self._last_time
        self._last_time = now

        if elapsed <= 0:
            return 0.0

        self.fps_deque.append(1.0 / elapsed)

        return round(
            sum(self.fps_deque) / len(self.fps_deque),
            2,
        )

    def detect_frame(self, frame) -> DetectionResult:
        """Detect and track people in one OpenCV frame."""

        timestamp = time.time()

        if frame is None:
            return DetectionResult(
                people_count=0,
                confidence_mean=0.0,
                timestamp=timestamp,
                fps=0.0,
                frame_size=(0, 0),
                detections=[],
            )

        if not hasattr(frame, "shape") or len(frame.shape) < 2:
            raise ValueError(
                "Expected a valid OpenCV image."
            )

        height, width = frame.shape[:2]

        if height <= 0 or width <= 0:
            raise ValueError(
                "Invalid frame dimensions."
            )

        try:
            results = self.model.track(
                source=frame,
                persist=True,
                tracker="bytetrack.yaml",
                conf=self.conf_threshold,
                iou=self.iou_threshold,
                classes=[self.person_class_id],
                device=self.device,
                imgsz=self.image_size,
                verbose=False,
            )

        except Exception as exc:
            raise RuntimeError(
                f"YOLO detection/tracking failed: {exc}"
            ) from exc

        detections = []
        confidences = []

        for result in results or []:
            boxes = result.boxes

            if boxes is None or len(boxes) == 0:
                continue

            coordinates = boxes.xyxy.cpu().tolist()
            classes = boxes.cls.cpu().tolist()
            scores = boxes.conf.cpu().tolist()

            track_ids = None

            if boxes.id is not None:
                track_ids = boxes.id.int().cpu().tolist()

            for index, (box, class_id, confidence) in enumerate(
                zip(coordinates, classes, scores)
            ):
                if int(class_id) != self.person_class_id:
                    continue

                x1, y1, x2, y2 = box

                x1 = max(0, min(int(x1), width - 1))
                y1 = max(0, min(int(y1), height - 1))
                x2 = max(0, min(int(x2), width - 1))
                y2 = max(0, min(int(y2), height - 1))

                if x2 <= x1 or y2 <= y1:
                    continue

                track_id = None

                if track_ids is not None and index < len(track_ids):
                    track_id = int(track_ids[index])

                detections.append(
                    {
                        "track_id": track_id,
                        "class_name": "person",
                        "confidence": round(
                            float(confidence), 3
                        ),
                        "bbox": [x1, y1, x2, y2],
                    }
                )

                confidences.append(float(confidence))

        confidence_mean = (
            round(
                sum(confidences) / len(confidences),
                3,
            )
            if confidences
            else 0.0
        )

        return DetectionResult(
            people_count=len(detections),
            confidence_mean=confidence_mean,
            timestamp=timestamp,
            fps=self._get_fps(),
            frame_size=(width, height),
            detections=detections,
        )

    def annotate_frame(
        self,
        frame,
        result,
        show_confidence: bool = True,
    ):
        """
        Draw bounding boxes and ByteTrack IDs on a frame.

        Accepts either a DetectionResult or a list of detections.
        """

        import cv2

        annotated = frame.copy()

        # Support both forms:
        # annotate_frame(frame, DetectionResult)
        # annotate_frame(frame, result.detections)
        if isinstance(result, DetectionResult):
            detections = result.detections
            people_count = result.people_count
            fps = result.fps
        else:
            detections = result or []
            people_count = len(detections)
            fps = 0.0

        for detection in detections:
            x1, y1, x2, y2 = detection["bbox"]

            track_id = detection.get("track_id")
            confidence = float(
                detection.get("confidence", 0.0)
            )

            if track_id is None:
                label = "Person ?"
            else:
                label = f"Person ID {track_id}"

            if show_confidence:
                label += f" {confidence:.0%}"

            # Green bounding box.
            cv2.rectangle(
                annotated,
                (x1, y1),
                (x2, y2),
                (0, 255, 0),
                2,
            )

            # Background for the detection label.
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.55
            thickness = 2

            (text_width, text_height), baseline = (
                cv2.getTextSize(
                    label,
                    font,
                    font_scale,
                    thickness,
                )
            )

            label_y = max(y1, text_height + 10)

            cv2.rectangle(
                annotated,
                (
                    x1,
                    label_y - text_height - 8,
                ),
                (
                    min(
                        x1 + text_width + 8,
                        annotated.shape[1] - 1,
                    ),
                    label_y + baseline - 4,
                ),
                (0, 150, 0),
                -1,
            )

            cv2.putText(
                annotated,
                label,
                (x1 + 4, label_y - 4),
                font,
                font_scale,
                (255, 255, 255),
                thickness,
                cv2.LINE_AA,
            )

        # Display count on the frame.
        cv2.rectangle(
            annotated,
            (10, 10),
            (235, 48),
            (0, 0, 0),
            -1,
        )

        cv2.putText(
            annotated,
            f"People: {people_count} | FPS: {fps:.1f}",
            (18, 35),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 0),
            2,
            cv2.LINE_AA,
        )

        return annotated

    def close(self) -> None:
        self.fps_deque.clear()
        self._last_time = None