import threading
import time
from pathlib import Path
from typing import Dict, Iterator, Optional

import cv2
from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import StreamingResponse

from app.streaming.camera import (
    ORDER,
    CameraSession,
    list_camera_info,
    normalize_id,
    video_path,
)
from app.ai.detector import PersonDetector


router = APIRouter(prefix="/api/cameras", tags=["cameras"])


# ---------------------------------------------------------
# SHARED CAMERA SESSIONS
# ---------------------------------------------------------

_sessions: Dict[str, CameraSession] = {}
_sessions_lock = threading.Lock()

_stream_locks: Dict[str, threading.Lock] = {}
_stream_locks_lock = threading.Lock()


# ---------------------------------------------------------
# PERFORMANCE SETTINGS
# ---------------------------------------------------------

JPEG_QUALITY = 65

# Maximum requested playback rate.
MAX_STREAM_FPS = 30.0

# Fallback FPS if the source video's FPS cannot be determined.
DEFAULT_SOURCE_FPS = 25.0

# Resize large frames before detection to improve performance.
MAX_DETECTION_WIDTH = 960


# ---------------------------------------------------------
# CAMERA SESSION HELPERS
# ---------------------------------------------------------

def _get_session(camera_id: str) -> CameraSession:
    camera_id = normalize_id(camera_id) or camera_id

    with _sessions_lock:
        if camera_id not in _sessions:
            _sessions[camera_id] = CameraSession(camera_id)

        return _sessions[camera_id]


def _get_stream_lock(camera_id: str) -> threading.Lock:
    with _stream_locks_lock:
        if camera_id not in _stream_locks:
            _stream_locks[camera_id] = threading.Lock()

        return _stream_locks[camera_id]


# ---------------------------------------------------------
# FRAME RESIZING
# ---------------------------------------------------------

def _resize_frame(frame):
    """
    Reduce large frames while preserving their aspect ratio.

    Smaller frames generally require less YOLO inference time.
    """
    height, width = frame.shape[:2]

    if width <= MAX_DETECTION_WIDTH:
        return frame

    scale = MAX_DETECTION_WIDTH / float(width)

    new_width = MAX_DETECTION_WIDTH
    new_height = max(1, int(height * scale))

    return cv2.resize(
        frame,
        (new_width, new_height),
        interpolation=cv2.INTER_LINEAR,
    )


# ---------------------------------------------------------
# ANNOTATED MJPEG STREAM
# ---------------------------------------------------------

def _mjpeg_stream(
    camera_id: str,
    path: Path,
) -> Iterator[bytes]:
    """
    Stream annotated video frames using MJPEG.

    Processing:
        1. Read the next frame.
        2. Resize large frames.
        3. Run YOLO person detection and ByteTrack.
        4. Draw detection boxes and IDs.
        5. Encode the frame as JPEG.
        6. Send it to the browser.

    Frames are processed in chronological order.
    """

    stream_lock = _get_stream_lock(camera_id)

    # Avoid two independent trackers processing the same camera.
    if not stream_lock.acquire(blocking=False):
        print(
            f"[Camera stream] Stream already active: {camera_id}"
        )
        return

    capture: Optional[cv2.VideoCapture] = None
    detector: Optional[PersonDetector] = None

    try:
        # Open the source video.
        capture = cv2.VideoCapture(str(path))

        if not capture.isOpened():
            print(
                f"[Camera stream] Unable to open video: {path}"
            )
            return

        # Determine the source video's FPS.
        source_fps = capture.get(cv2.CAP_PROP_FPS)

        if (
            not source_fps
            or source_fps <= 0
            or source_fps > 120
        ):
            source_fps = DEFAULT_SOURCE_FPS

        target_fps = min(
            source_fps,
            MAX_STREAM_FPS,
        )

        frame_delay = 1.0 / target_fps

        print(
            f"[Camera stream] Starting {camera_id} | "
            f"Source FPS: {source_fps:.2f} | "
            f"Target FPS: {target_fps:.2f}"
        )

        # Create one detector for this stream.
        detector = PersonDetector()

        while True:
            frame_started = time.perf_counter()

            # Read frames sequentially.
            success, frame = capture.read()

            # Loop the video when its last frame is reached.
            if not success:
                capture.set(
                    cv2.CAP_PROP_POS_FRAMES,
                    0,
                )

                # Reset tracker state between loops if supported.
                reset_tracker = getattr(
                    detector,
                    "reset_tracker",
                    None,
                )

                if callable(reset_tracker):
                    reset_tracker()

                success, frame = capture.read()

                if not success:
                    print(
                        f"[Camera stream] Cannot read frames: {path}"
                    )
                    break

            # Resize large frames before running YOLO.
            frame = _resize_frame(frame)

            # Run detection and tracking on this frame.
            result = detector.detect_frame(frame)

            # Draw bounding boxes and tracking IDs.
            annotated_frame = detector.annotate_frame(
                frame,
                result,
            )

            # Encode the annotated frame.
            encoded, buffer = cv2.imencode(
                ".jpg",
                annotated_frame,
                [
                    int(cv2.IMWRITE_JPEG_QUALITY),
                    JPEG_QUALITY,
                ],
            )

            if not encoded:
                continue

            jpeg_bytes = buffer.tobytes()

            # Send the frame as one MJPEG part.
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Cache-Control: no-store\r\n"
                b"Content-Length: "
                + str(len(jpeg_bytes)).encode("ascii")
                + b"\r\n\r\n"
                + jpeg_bytes
                + b"\r\n"
            )

            # Wait only if processing finished before the target
            # frame interval. Never add delay when processing is slow.
            elapsed = time.perf_counter() - frame_started
            remaining = frame_delay - elapsed

            if remaining > 0:
                time.sleep(remaining)

    except GeneratorExit:
        # The browser disconnected.
        return

    except Exception as exc:
        print(
            f"[Camera stream] Error for {camera_id}: {exc}"
        )

    finally:
        # Release the video source.
        if capture is not None:
            capture.release()

        # Release detector resources.
        if detector is not None:
            try:
                detector.close()
            except Exception as exc:
                print(
                    f"[Camera stream] Detector cleanup failed: {exc}"
                )

        stream_lock.release()

        print(
            f"[Camera stream] Stopped {camera_id}"
        )


# ---------------------------------------------------------
# LIST CAMERAS
# ---------------------------------------------------------

@router.get("")
def list_cameras():
    return {
        "cameras": list_camera_info(),
    }


# ---------------------------------------------------------
# HEALTH CHECK
# ---------------------------------------------------------

@router.get("/health")
def health():
    return {
        "status": "ok",
    }


# ---------------------------------------------------------
# ALL CAMERA COUNTS
# ---------------------------------------------------------

@router.get("/counts")
def list_counts(response: Response):
    """
    Return the latest detection results from camera sessions.
    """

    response.headers["Cache-Control"] = "no-store"

    return {
        "cameras": [
            _get_session(camera_id).latest()
            for camera_id in ORDER
        ],
    }


# ---------------------------------------------------------
# VIDEO STREAM
# ---------------------------------------------------------

@router.get("/{camera_id}/stream")
def stream(camera_id: str):
    """
    Return an annotated MJPEG stream.

    The frontend should display this endpoint using an <img>,
    not an HTML <video> element.
    """

    camera_id = normalize_id(camera_id) or camera_id

    path = video_path(camera_id)

    if path is None or not path.is_file():
        raise HTTPException(
            status_code=404,
            detail=f"Video not available for {camera_id}",
        )

    return StreamingResponse(
        _mjpeg_stream(camera_id, path),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": (
                "no-store, no-cache, must-revalidate"
            ),
            "Pragma": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------
# START PERSON COUNTING
# ---------------------------------------------------------

@router.post("/{camera_id}/count/start")
def start_count(camera_id: str):
    session = _get_session(camera_id)

    try:
        session.start()

    except RuntimeError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )

    return {
        "ok": True,
        "camera_id": session.camera_id,
        "processing": True,
    }


# ---------------------------------------------------------
# STOP PERSON COUNTING
# ---------------------------------------------------------

@router.post("/{camera_id}/count/stop")
def stop_count(camera_id: str):
    session = _get_session(camera_id)

    session.stop()

    return {
        "ok": True,
        "camera_id": session.camera_id,
        "processing": False,
    }


# ---------------------------------------------------------
# SINGLE CAMERA COUNT
# ---------------------------------------------------------

@router.get("/{camera_id}/count")
def get_count(
    camera_id: str,
    response: Response,
):
    session = _get_session(camera_id)

    response.headers["Cache-Control"] = "no-store"

    return session.latest()
