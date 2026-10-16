import json
import os
import threading
import time
import uuid
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import cv2
import numpy as np
from sqlalchemy.orm import Session

from app.ai.counter import CrossingEvent, VirtualLineCounter
from app.ai.movement import SafetyEventCandidate, SafetyRuleEngine
from app.ai.tracker import BarricadeTracker, TrackedPerson
from app.database.database import SessionLocal
from app.database.models import BarricadeGateConfig, BarricadeSafetyEvent, SecurityGuard
from app.streaming.camera import CAMERA_FILES, normalize_id, video_path

BASE_DIR = Path(__file__).resolve().parents[2]


def resolve_yolo_model_path() -> str:
    """Finds yolov11n.pt or yolo11n.pt in backend directory or falls back gracefully."""
    env_m = os.getenv("MODEL_PATH")
    if env_m and Path(env_m).is_file():
        return str(Path(env_m).resolve())
    for name in ["yolov11n.pt", "yolo11n.pt"]:
        candidate = BASE_DIR / name
        if candidate.is_file():
            return str(candidate.resolve())
    return "yolov11n.pt"


MODEL_PATH = resolve_yolo_model_path()
MODEL_CONF = float(os.getenv("MODEL_CONF", "0.4"))
MODEL_IOU = float(os.getenv("MODEL_IOU", "0.45"))

# Pre-seeded default gate configurations
DEFAULT_GATES = [
    {
        "id": "CAM-TEMPLE",
        "name": "Temple CCTV (temple_civic_video.mp4)",
        "zone_id": "main-gate",
        "zone_name": "Main Darshan Gate",
        "camera_id": "CAM-TEMPLE",
        "line_x1": 0.05,
        "line_y1": 0.55,
        "line_x2": 0.95,
        "line_y2": 0.55,
        "direction_mode": "top_to_bottom",
        "max_occupancy": 15,
        "wrong_way_enabled": True,
        "blocked_exit_enabled": True,
        "block_duration_sec": 5.0,
        "cooldown_seconds": 60,
        "assigned_guard_id": "STAFF-07",
    },
    {
        "id": "CAM-01",
        "name": "Main Entrance Barricade",
        "zone_id": "main-gate",
        "zone_name": "Main Darshan Gate",
        "camera_id": "CAM-01",
        "line_x1": 0.05,
        "line_y1": 0.55,
        "line_x2": 0.95,
        "line_y2": 0.55,
        "direction_mode": "top_to_bottom",
        "max_occupancy": 15,
        "wrong_way_enabled": True,
        "blocked_exit_enabled": True,
        "block_duration_sec": 5.0,
        "cooldown_seconds": 60,
        "assigned_guard_id": "STAFF-07",
    },
    {
        "id": "CAM-07",
        "name": "Queue Entry Gate B",
        "zone_id": "main-gate",
        "zone_name": "Main Darshan Gate",
        "camera_id": "CAM-07",
        "line_x1": 0.1,
        "line_y1": 0.6,
        "line_x2": 0.9,
        "line_y2": 0.6,
        "direction_mode": "top_to_bottom",
        "max_occupancy": 12,
        "wrong_way_enabled": True,
        "blocked_exit_enabled": True,
        "block_duration_sec": 5.0,
        "cooldown_seconds": 60,
        "assigned_guard_id": "STAFF-12",
    },
    {
        "id": "CAM-05",
        "name": "Main Hall Queue Lane",
        "zone_id": "queue-area",
        "zone_name": "Queue Area",
        "camera_id": "CAM-05",
        "line_x1": 0.1,
        "line_y1": 0.5,
        "line_x2": 0.9,
        "line_y2": 0.5,
        "direction_mode": "top_to_bottom",
        "max_occupancy": 20,
        "wrong_way_enabled": True,
        "blocked_exit_enabled": True,
        "block_duration_sec": 5.0,
        "cooldown_seconds": 60,
        "assigned_guard_id": "STAFF-24",
    },
    {
        "id": "CAM-06",
        "name": "Darshan Chute Gate",
        "zone_id": "darshan-area",
        "zone_name": "Darshan Area",
        "camera_id": "CAM-06",
        "line_x1": 0.1,
        "line_y1": 0.5,
        "line_x2": 0.9,
        "line_y2": 0.5,
        "direction_mode": "top_to_bottom",
        "max_occupancy": 15,
        "wrong_way_enabled": True,
        "blocked_exit_enabled": True,
        "block_duration_sec": 5.0,
        "cooldown_seconds": 60,
        "assigned_guard_id": "STAFF-19",
    },
    {
        "id": "CAM-09",
        "name": "Outer Queue Barricade",
        "zone_id": "queue-area",
        "zone_name": "Queue Area",
        "camera_id": "CAM-09",
        "line_x1": 0.1,
        "line_y1": 0.5,
        "line_x2": 0.9,
        "line_y2": 0.5,
        "direction_mode": "top_to_bottom",
        "max_occupancy": 18,
        "wrong_way_enabled": True,
        "blocked_exit_enabled": True,
        "block_duration_sec": 5.0,
        "cooldown_seconds": 60,
        "assigned_guard_id": "STAFF-03",
    },
    {
        "id": "CAM-DEMO",
        "name": "Demo Barricade Zone",
        "zone_id": "main-gate",
        "zone_name": "Main Darshan Gate",
        "camera_id": "CAM-DEMO",
        "line_x1": 0.05,
        "line_y1": 0.5,
        "line_x2": 0.95,
        "line_y2": 0.5,
        "direction_mode": "top_to_bottom",
        "max_occupancy": 10,
        "wrong_way_enabled": True,
        "blocked_exit_enabled": True,
        "block_duration_sec": 5.0,
        "cooldown_seconds": 60,
        "assigned_guard_id": "STAFF-12",
    },
]

# Pre-seeded default guards
DEFAULT_GUARDS = [
    {
        "id": "STAFF-07",
        "name": "Inspector K. Sharma",
        "role": "Gate In-charge",
        "assigned_zone": "Main Darshan Gate",
        "assigned_gate": "CAM-01",
        "phone": "+91 98480 12345",
        "on_duty": True,
        "notification_channel": "in-app, push",
    },
    {
        "id": "STAFF-12",
        "name": "Officer R. Naidu",
        "role": "Crowd Controller",
        "assigned_zone": "Main Darshan Gate",
        "assigned_gate": "CAM-07",
        "phone": "+91 98480 23456",
        "on_duty": True,
        "notification_channel": "in-app, push",
    },
    {
        "id": "STAFF-19",
        "name": "Marshal V. Reddy",
        "role": "Queue Marshal",
        "assigned_zone": "Darshan Area",
        "assigned_gate": "CAM-06",
        "phone": "+91 98480 34567",
        "on_duty": True,
        "notification_channel": "in-app, push",
    },
    {
        "id": "STAFF-03",
        "name": "Patrol Officer S. Rao",
        "role": "Patrol Staff",
        "assigned_zone": "Queue Area",
        "assigned_gate": "CAM-09",
        "phone": "+91 98480 45678",
        "on_duty": True,
        "notification_channel": "in-app, push",
    },
    {
        "id": "STAFF-24",
        "name": "Support Lead M. Anjali",
        "role": "Hall Marshal",
        "assigned_zone": "Queue Area",
        "assigned_gate": "CAM-05",
        "phone": "+91 98480 56789",
        "on_duty": True,
        "notification_channel": "in-app, push",
    },
]


def seed_barricade_defaults(db: Session) -> None:
    """Seeds default barricade gate configurations and security guards."""
    for g in DEFAULT_GUARDS:
        if not db.query(SecurityGuard).filter(SecurityGuard.id == g["id"]).first():
            db.add(SecurityGuard(**g))
    db.commit()

    for gate in DEFAULT_GATES:
        if not db.query(BarricadeGateConfig).filter(BarricadeGateConfig.id == gate["id"]).first():
            db.add(BarricadeGateConfig(**gate))
    db.commit()


class BarricadeCameraSession:
    """Manages AI Barricade Monitoring for a camera/gate with video streaming,
    green box person detection, tracking, line crossing counts, and guard alerts.
    """

    def __init__(self, camera_id: str, gate_config: BarricadeGateConfig) -> None:
        self.camera_id = camera_id
        self.gate_config = gate_config

        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._processing = False
        self._replay_requested = False

        # AI Engines
        self.tracker = BarricadeTracker()
        self.counter = VirtualLineCounter(
            line_norm=(
                gate_config.line_x1,
                gate_config.line_y1,
                gate_config.line_x2,
                gate_config.line_y2,
            ),
            direction_mode=gate_config.direction_mode,
        )
        self.safety_engine = SafetyRuleEngine(
            camera_id=camera_id,
            gate_name=gate_config.name,
            zone_name=gate_config.zone_name or "",
            max_occupancy=gate_config.max_occupancy,
            wrong_way_enabled=gate_config.wrong_way_enabled,
            blocked_exit_enabled=gate_config.blocked_exit_enabled,
            block_duration_sec=gate_config.block_duration_sec,
            cooldown_seconds=gate_config.cooldown_seconds,
        )

        # Telemetry State
        self.people_count = 0
        self.fps = 0.0
        self.last_frame_time = time.time()
        self.frame_size = (0, 0)
        self.error: Optional[str] = None
        self.active_alert_banner: Optional[str] = None
        self.active_alert_severity: Optional[str] = None

        # JPEG buffer for live MJPEG stream
        self._latest_jpeg: Optional[bytes] = None
        self._frame_condition = threading.Condition(self._lock)

    def update_config(self, config: BarricadeGateConfig) -> None:
        with self._lock:
            self.gate_config = config
            self.counter.set_config(
                line_norm=(config.line_x1, config.line_y1, config.line_x2, config.line_y2),
                direction_mode=config.direction_mode,
            )
            self.safety_engine.update_config(
                gate_name=config.name,
                zone_name=config.zone_name,
                max_occupancy=config.max_occupancy,
                wrong_way_enabled=config.wrong_way_enabled,
                blocked_exit_enabled=config.blocked_exit_enabled,
                block_duration_sec=config.block_duration_sec,
                cooldown_seconds=config.cooldown_seconds,
            )

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "camera_id": self.camera_id,
                "gate_name": self.gate_config.name,
                "zone_name": self.gate_config.zone_name,
                "processing": self._processing,
                "people_count": self.people_count,
                "entries_count": self.counter.entries_count,
                "exits_count": self.counter.exits_count,
                "current_inside": self.counter.current_inside,
                "max_occupancy": self.gate_config.max_occupancy,
                "fps": self.fps,
                "last_frame_time": self.last_frame_time,
                "frame_size": list(self.frame_size),
                "error": self.error,
                "active_alert": self.active_alert_banner,
                "active_alert_severity": self.active_alert_severity,
                "direction_mode": self.gate_config.direction_mode,
                "line_norm": [
                    self.gate_config.line_x1,
                    self.gate_config.line_y1,
                    self.gate_config.line_x2,
                    self.gate_config.line_y2,
                ],
                "assigned_guard_id": self.gate_config.assigned_guard_id,
                "is_test_video": True,
            }

    def start(self) -> None:
        path = video_path(self.camera_id)
        if path is None or not Path(path).is_file():
            raise FileNotFoundError(
                f"Video file for '{self.camera_id}' not found in backend/videos/ "
                f"(Checked {path if path else 'configured filename'})"
            )

        with self._lock:
            if self._processing:
                return
            self._processing = True
            self.error = None
            self._replay_requested = False
            self._stop_event.clear()

        self._thread = threading.Thread(
            target=self._run_loop,
            args=(str(path),),
            daemon=True,
            name=f"BarricadeWorker-{self.camera_id}",
        )
        self._thread.start()

    def replay(self) -> None:
        """Restarts playback from the beginning and resets counting telemetry."""
        with self._lock:
            self._replay_requested = True
            self.counter.reset_counts()
            self.tracker.reset()
            self.active_alert_banner = None
            self.active_alert_severity = None
            self.error = None
        if not self._processing:
            self.start()

    def stop(self) -> None:
        self._stop_event.set()
        thread = self._thread
        if thread is not None and thread.is_alive():
            thread.join(timeout=2.5)
        with self._lock:
            self._processing = False

    def get_frame_jpeg(self, timeout: float = 2.0) -> Optional[bytes]:
        with self._frame_condition:
            if self._latest_jpeg is None and self._processing:
                self._frame_condition.wait(timeout=timeout)
            return self._latest_jpeg

    def _run_loop(self, video_file: str) -> None:
        from ultralytics import YOLO

        cap = None
        model = None
        fps_deque = deque(maxlen=20)
        last_t = time.time()

        try:
            model_path_resolved = resolve_yolo_model_path()
            model = YOLO(model_path_resolved)
            cap = cv2.VideoCapture(video_file)
            if not cap.isOpened():
                raise RuntimeError(f"Could not open video file: {video_file}")

            while not self._stop_event.is_set():
                if self._replay_requested:
                    with self._lock:
                        self._replay_requested = False
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    time.sleep(0.02)
                    continue

                ret, frame = cap.read()
                if not ret or frame is None:
                    # Loop recorded video smoothly
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ret, frame = cap.read()
                    if not ret or frame is None:
                        time.sleep(0.05)
                        continue

                h, w = frame.shape[:2]
                now = time.time()
                dt = max(0.001, now - last_t)
                last_t = now
                fps_deque.append(1.0 / dt)
                avg_fps = round(sum(fps_deque) / len(fps_deque), 1)

                # 1. Person Detection & Tracking (Ultralytics ByteTrack)
                tracked_persons = self.tracker.update(
                    model=model,
                    frame=frame,
                    conf_threshold=MODEL_CONF,
                    iou_threshold=MODEL_IOU,
                )

                # 2. Virtual Line Crossing Evaluation
                crossing_events = self.counter.update(
                    tracked_persons=tracked_persons,
                    frame_width=w,
                    frame_height=h,
                )

                # 3. Safety Rule Engine Evaluation
                safety_candidates = self.safety_engine.evaluate(
                    tracked_persons=tracked_persons,
                    crossing_events=crossing_events,
                    camera_error=None,
                )

                # 4. Dispatch Safety Events if Triggered
                for candidate in safety_candidates:
                    self._dispatch_safety_event(candidate)

                # 5. Render Video Overlays
                annotated_frame = self._render_overlays(
                    frame=frame,
                    tracked_persons=tracked_persons,
                    width=w,
                    height=h,
                    fps=avg_fps,
                )

                # 6. Encode Frame to JPEG for MJPEG Streaming
                ret_enc, buffer = cv2.imencode(".jpg", annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                if ret_enc:
                    jpeg_bytes = buffer.tobytes()
                    with self._frame_condition:
                        self._latest_jpeg = jpeg_bytes
                        self.people_count = len(tracked_persons)
                        self.fps = avg_fps
                        self.last_frame_time = now
                        self.frame_size = (w, h)
                        self.error = None
                        self._frame_condition.notify_all()

                # Sleep slightly to avoid pegging CPU on fast local video loops
                time.sleep(0.03)

        except Exception as exc:
            with self._lock:
                self.error = str(exc)
                self.people_count = 0
            # Also dispatch camera offline alert if engine crashed
            candidates = self.safety_engine.evaluate(
                tracked_persons=[],
                crossing_events=[],
                camera_error=str(exc),
            )
            for c in candidates:
                self._dispatch_safety_event(c)
        finally:
            if cap is not None:
                try:
                    cap.release()
                except Exception:
                    pass
            with self._lock:
                self._processing = False

    def _render_overlays(
        self,
        frame: np.ndarray,
        tracked_persons: List[TrackedPerson],
        width: int,
        height: int,
        fps: float,
    ) -> np.ndarray:
        """Renders green bounding boxes, virtual line, telemetry, and alert banner."""
        img = frame.copy()

        # A. Virtual Counting Line
        p1, p2 = self.counter.get_pixel_line(width, height)
        # Line in bright cyan/yellow
        line_color = (0, 230, 255)
        cv2.line(img, p1, p2, line_color, 2, cv2.LINE_AA)

        # Midpoint indicator with direction arrows
        mid_x = int((p1[0] + p2[0]) / 2)
        mid_y = int((p1[1] + p2[1]) / 2)
        arrow_dy = 20 if self.gate_config.direction_mode == "top_to_bottom" else -20
        cv2.arrowedLine(
            img,
            (mid_x, mid_y - arrow_dy),
            (mid_x, mid_y + arrow_dy),
            (0, 255, 128),
            2,
            tipLength=0.35,
        )
        cv2.putText(
            img,
            f"VIRTUAL BARRICADE LINE [{self.gate_config.direction_mode.upper()}]",
            (max(10, p1[0] + 5), max(20, p1[1] - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (0, 230, 255),
            1,
            cv2.LINE_AA,
        )

        # B. Green Bounding Boxes for Detected & Tracked People
        # Normal people detection: GREEN bounding box (BGR: 34, 197, 94 -> 94, 197, 34)
        for person in tracked_persons:
            x1, y1, x2, y2 = person.bbox
            box_color = (60, 220, 60)  # Clean bright green

            # Draw green rectangle
            cv2.rectangle(img, (x1, y1), (x2, y2), box_color, 2)

            # Draw label tag: ID 12 or Person 12
            label = f"ID {person.track_id}"
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.42, 1)
            cv2.rectangle(
                img,
                (x1, max(0, y1 - th - 6)),
                (x1 + tw + 6, y1),
                box_color,
                -1,
            )
            cv2.putText(
                img,
                label,
                (x1 + 3, max(th, y1 - 3)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.42,
                (0, 0, 0),  # Black text for clear readability
                1,
                cv2.LINE_AA,
            )

        # C. Top Telemetry Header
        header_h = 36
        overlay = img.copy()
        cv2.rectangle(overlay, (0, 0), (width, header_h), (15, 23, 42), -1)
        cv2.addWeighted(overlay, 0.82, img, 0.18, 0, img)

        header_text = (
            f"{self.gate_config.name} | Zone: {self.gate_config.zone_name or 'Gate'} | "
            f"Occupancy: {len(tracked_persons)}/{self.gate_config.max_occupancy} | "
            f"IN: {self.counter.entries_count} | OUT: {self.counter.exits_count} | "
            f"FPS: {fps}"
        )
        cv2.putText(
            img,
            header_text,
            (10, 23),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.48,
            (255, 255, 255),
            1,
            cv2.LINE_AA,
        )

        # D. Watermark indicator for prerecorded test video
        cv2.putText(
            img,
            "TEST VIDEO FOOTAGE (RECORDED) - NOT LIVE CCTV",
            (width - 320, height - 12),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.36,
            (180, 180, 180),
            1,
            cv2.LINE_AA,
        )

        # E. Alert Banner Overlay (ONLY displayed when safety event is active!)
        active_conditions = self.safety_engine.get_active_conditions()
        active_type = None
        if active_conditions.get("OVERCROWDING"):
            active_type = "OVERCROWDING"
        elif active_conditions.get("BLOCKED_EXIT"):
            active_type = "BLOCKED_EXIT"
        elif active_conditions.get("WRONG_WAY_MOVEMENT"):
            active_type = "WRONG_WAY_MOVEMENT"

        if active_type:
            banner_bg = (0, 0, 220) if active_type == "OVERCROWDING" else (0, 140, 255)
            banner_text = f"SAFETY ALERT: {active_type.replace('_', ' ')} IN PROGRESS"
            cv2.rectangle(img, (0, header_h), (width, header_h + 30), banner_bg, -1)
            cv2.putText(
                img,
                banner_text,
                (width // 4, header_h + 21),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (255, 255, 255),
                2,
                cv2.LINE_AA,
            )
            with self._lock:
                self.active_alert_banner = banner_text
                self.active_alert_severity = "CRITICAL" if active_type == "OVERCROWDING" else "HIGH"
        else:
            with self._lock:
                self.active_alert_banner = None
                self.active_alert_severity = None

        return img

    def _dispatch_safety_event(self, candidate: SafetyEventCandidate) -> None:
        """Persists the safety event, assigns guard, and broadcasts to clients."""
        db = SessionLocal()
        try:
            # 1. Lookup assigned on-duty guard
            guard_id = self.gate_config.assigned_guard_id
            guard = db.query(SecurityGuard).filter(SecurityGuard.id == guard_id).first()
            if not guard:
                # Fallback to any on-duty guard
                guard = db.query(SecurityGuard).filter(SecurityGuard.on_duty.is_(True)).first()

            guard_name = guard.name if guard else "Unassigned Staff"
            guard_id_val = guard.id if guard else None

            # 2. Generate unique event ID
            timestamp_str = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
            short_uuid = uuid.uuid4().hex[:6]
            event_id = f"EVT-BAR-{timestamp_str}-{short_uuid}"

            event = BarricadeSafetyEvent(
                id=event_id,
                camera_id=self.camera_id,
                gate_name=self.gate_config.name,
                zone_name=self.gate_config.zone_name,
                event_type=candidate.event_type,
                severity=candidate.severity,
                title=candidate.title,
                reason=candidate.reason,
                recommended_action=candidate.recommended_action,
                people_count=candidate.people_count,
                assigned_guard_id=guard_id_val,
                assigned_guard_name=guard_name,
                delivery_status="DELIVERED",
                status="PENDING",
            )
            db.add(event)
            db.commit()
            db.refresh(event)

            # 3. Broadcast event to WebSocket subscribers
            manager.broadcast_event(event.to_dict())

        except Exception:
            db.rollback()
        finally:
            db.close()


class BarricadeManager:
    """Singleton service managing barricade monitoring sessions and guard notifications."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sessions: Dict[str, BarricadeCameraSession] = {}
        self._ws_clients: Set[Any] = set()

    def get_session(self, camera_id: str, db: Session) -> BarricadeCameraSession:
        cid = normalize_id(camera_id) or camera_id
        with self._lock:
            if cid in self._sessions:
                return self._sessions[cid]

            # Fetch gate configuration or initialize default
            config = db.query(BarricadeGateConfig).filter(BarricadeGateConfig.id == cid).first()
            if not config:
                info = CAMERA_FILES.get(cid, {})
                config = BarricadeGateConfig(
                    id=cid,
                    name=info.get("name", f"Gate {cid}"),
                    zone_id=info.get("zone_id", "main-gate"),
                    zone_name=info.get("zone_name", "Main Darshan Gate"),
                    camera_id=cid,
                    line_x1=0.1,
                    line_y1=0.5,
                    line_x2=0.9,
                    line_y2=0.5,
                    direction_mode="top_to_bottom",
                    max_occupancy=15,
                )
                db.add(config)
                db.commit()
                db.refresh(config)

            session = BarricadeCameraSession(cid, config)
            self._sessions[cid] = session
            return session

    def list_cameras_status(self, db: Session) -> List[Dict[str, Any]]:
        configs = db.query(BarricadeGateConfig).all()
        result = []
        for conf in configs:
            sess = self.get_session(conf.id, db)
            status = sess.get_status()
            result.append(status)
        return result

    def register_ws(self, websocket: Any) -> None:
        with self._lock:
            self._ws_clients.add(websocket)

    def unregister_ws(self, websocket: Any) -> None:
        with self._lock:
            self._ws_clients.discard(websocket)

    def broadcast_event(self, event_dict: Dict[str, Any]) -> None:
        """Broadcasts safety events asynchronously to connected WebSockets."""
        payload = json.dumps({"type": "SAFETY_EVENT", "data": event_dict})
        with self._lock:
            clients = list(self._ws_clients)

        for ws in clients:
            try:
                # Async send if loop available or discard closed
                import asyncio
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.create_task(ws.send_text(payload))
            except Exception:
                pass


# Global singleton manager
manager = BarricadeManager()
