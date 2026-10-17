import os
import time
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2

from app.ai.detector import PersonDetector

BASE_DIR = Path(__file__).resolve().parents[2]
VIDEOS_DIR = BASE_DIR / "videos"

MODEL_PATH = os.getenv("MODEL_PATH", "yolo11n.pt")
CONF_THRESHOLD = float(os.getenv("MODEL_CONF", "0.5"))
IOU_THRESHOLD = float(os.getenv("MODEL_IOU", "0.45"))

CAMERA_FILES: Dict[str, Dict[str, Any]] = {
    "CAM-01": {
        "name": "Main Entrance",
        "filename": "CAM-01_Main_Entrance.mp4",
        "zone_id": "main-gate",
        "zone_name": "Main Darshan Gate",
        "capacity": 300,
    },
    "CAM-05": {
        "name": "Main Hall",
        "filename": "CAM-05_Main_Hall.mp4",
        "zone_id": "queue-area",
        "zone_name": "Queue Area",
        "capacity": 250,
    },
    "CAM-06": {
        "name": "Darshan Area",
        "filename": "CAM-06_Darshan_Area.mp4",
        "zone_id": "darshan-area",
        "zone_name": "Darshan Area",
        "capacity": 200,
    },
    "CAM-07": {
        "name": "Entry Gate",
        "filename": "CAM-07_Entry_Gate.mp4",
        "zone_id": "main-gate",
        "zone_name": "Main Darshan Gate",
        "capacity": 300,
    },
    "CAM-09": {
        "name": "Outer Queue",
        "filename": "CAM-09_Outer_Queue.mp4",
        "zone_id": "queue-area",
        "zone_name": "Queue Area",
        "capacity": 250,
    },
    "CAM-DEMO": {
        "name": "Crowd Demo",
        "filename": "crowd.mp4",
        "zone_id": "main-gate",
        "zone_name": "Main Darshan Gate",
        "capacity": 300,
    },
    "CAM-TEMPLE": {
        "name": "Temple CCTV (temple_civic_video.mp4)",
        "filename": "temple_civic_video.mp4",
        "location": "Temple Barricade Gate (Main CCTV)",
        "zone_id": "main-gate",
        "zone_name": "Main Darshan Gate",
        "capacity": 250,
        "kind": "camera",
    },
    "DRONE-01": {
        "name": "Temple Overview Drone",
        "filename": "DRONE-01_Temple_Overview.mp4",
        "location": "Temple premises (aerial)",
        "zone_id": "main-gate",
        "zone_name": "Main Darshan Gate",
        "capacity": None,
        "kind": "drone",
    },
}

ALIASES = {
    "temple": "CAM-TEMPLE",
    "temple_civic_video": "CAM-TEMPLE",
    "temple_civic_video.mp4": "CAM-TEMPLE",
    "temple-cctv": "CAM-TEMPLE",
    "cctv": "CAM-TEMPLE",
    "crowd": "CAM-DEMO",
    "crowd.mp4": "CAM-DEMO",
    "demo": "CAM-DEMO",
    "drone": "DRONE-01",
    "drone-01": "DRONE-01",
}

ORDER = ["CAM-TEMPLE", "CAM-01", "CAM-05", "CAM-06", "CAM-07", "CAM-09", "CAM-DEMO", "DRONE-01"]


def normalize_id(camera_id: str) -> Optional[str]:
    if not camera_id:
        return None
    cid = camera_id.strip()
    if cid in CAMERA_FILES:
        return cid
    low = cid.lower()
    if low in ALIASES:
        return ALIASES[low]
    upper = cid.upper()
    if upper in CAMERA_FILES:
        return upper
    return None


def video_path(camera_id: str) -> Optional[Path]:
    cid = normalize_id(camera_id)
    if cid and cid in CAMERA_FILES:
        path = (VIDEOS_DIR / CAMERA_FILES[cid]["filename"]).resolve()
        if path.exists() and path.is_file():
            return path
    # Also check if raw camera_id is a direct file inside VIDEOS_DIR
    direct = (VIDEOS_DIR / camera_id.strip()).resolve()
    if direct.exists() and direct.is_file():
        return direct
    return None


def camera_info(camera_id: str) -> Optional[Dict[str, Any]]:
    cid = normalize_id(camera_id)
    if not cid:
        return None
    meta = CAMERA_FILES[cid]
    path = video_path(cid)
    return {
        "id": cid,
        "name": meta["name"],
        "location": meta.get("location", meta["name"]),
        "zone_id": meta["zone_id"],
        "zone_name": meta["zone_name"],
        "capacity": meta["capacity"],
        "filename": meta["filename"],
        "kind": meta.get("kind", "camera"),
        "available": path is not None,
        "status": "available" if path is not None else "missing",
        "missing_reason": None if path is not None else f"{meta['filename']} not found",
    }


def list_camera_info() -> List[Dict[str, Any]]:
    return [camera_info(cid) for cid in ORDER]


class CameraSession:
    """Runs real YOLOv11 counting for a single recorded video, on demand.

    Video playback is served separately (see the /stream route), so counting can
    start and stop without interrupting playback. Only one worker thread per
    camera is ever created.
    """

    def __init__(self, camera_id: str) -> None:
        self.raw_id = camera_id
        self.camera_id = normalize_id(camera_id) or camera_id
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._processing = False
        self._people_count = 0
        self._timestamp = time.time()
        self._confidence_mean = 0.0
        self._fps = 0.0
        self._frame_size = (0, 0)
        self._error: Optional[str] = None
        self._has_count = False

    def info(self) -> Dict[str, Any]:
        info = camera_info(self.camera_id) or {
            "id": self.camera_id,
            "name": self.camera_id,
            "location": self.camera_id,
            "zone_id": None,
            "zone_name": None,
            "capacity": None,
            "available": False,
            "status": "unknown",
            "missing_reason": f"Unknown camera id: {self.raw_id}",
        }
        with self._lock:
            info = dict(info)
            info["processing"] = self._processing
            self._error = self._error
        return info

    def latest(self) -> Dict[str, Any]:
        info = camera_info(self.camera_id) or {}
        with self._lock:
            return {
                "camera_id": self.camera_id,
                "name": meta_name(self.camera_id),
                "zone_id": info.get("zone_id"),
                "zone_name": info.get("zone_name"),
                "capacity": info.get("capacity"),
                "people_count": self._people_count,
                "timestamp": self._timestamp,
                "confidence_mean": self._confidence_mean,
                "fps": self._fps,
                "frame_size": list(self._frame_size),
                "error": self._error,
                "processing": self._processing,
                "has_count": self._has_count,
                "available": bool(info.get("available")),
                "kind": info.get("kind", "camera"),
                "source": "recorded-video",
            }

    def start(self) -> None:
        path = video_path(self.camera_id)
        if path is None:
            raise RuntimeError(
                f"Video for {self.camera_id} is not available"
            )
        with self._lock:
            if self._processing:
                return
            self._error = None
            self._processing = True
            self._has_count = False
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, args=(str(path),), daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        thread = self._thread
        if thread is not None and thread.is_alive():
            thread.join(timeout=2.0)
        with self._lock:
            self._processing = False

    def _run(self, path: str) -> None:
        cap = None
        detector = None
        try:
            cap = cv2.VideoCapture(path)
            if not cap.isOpened():
                raise RuntimeError(f"Could not open video file: {path}")
            detector = PersonDetector(
                model_path=MODEL_PATH,
                conf_threshold=CONF_THRESHOLD,
                iou_threshold=IOU_THRESHOLD,
            )
            while not self._stop.is_set():
                ret, frame = cap.read()
                if not ret or frame is None:
                    # Loop recorded video instead of ending the session.
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ret, frame = cap.read()
                    if not ret or frame is None:
                        break
                result = detector.detect_frame(frame)
                with self._lock:
                    self._people_count = result.people_count
                    self._timestamp = result.timestamp
                    self._confidence_mean = result.confidence_mean
                    self._fps = result.fps
                    self._frame_size = result.frame_size
                    self._error = None
                    self._has_count = True
        except Exception as exc:  # noqa: BLE001 - surfaced to the API
            with self._lock:
                self._error = str(exc)
                self._people_count = 0
        finally:
            if cap is not None:
                try:
                    cap.release()
                except Exception:
                    pass
            if detector is not None:
                try:
                    detector.close()
                except Exception:
                    pass
            with self._lock:
                self._processing = False


def meta_name(camera_id: str) -> str:
    cid = normalize_id(camera_id)
    if cid:
        return CAMERA_FILES[cid]["name"]
    return camera_id
