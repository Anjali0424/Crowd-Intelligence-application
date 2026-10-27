"""Load the trained Darshan time model and predict for a selected arrival.

The selected time changes ``arrival_hour_24h``. The selected date changes
``day_of_week`` and ``is_weekend``. Weather, festival status, daily crowd, and
open counters are not inferred, and camera people-counts are not treated as
daily crowd totals.
"""

from __future__ import annotations

import math
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import joblib
import pandas as pd

from ml.train_model import (
    CATEGORICAL_FEATURES,
    DAY_NAMES,
    FEATURES,
    NUMERICAL_FEATURES,
    TARGET_DURATION,
    TARGET_WAIT,
    TIMEZONE_NAME,
)

BACKEND_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = BACKEND_DIR / "models" / "darshan_time_model.joblib"
ZONE = ZoneInfo(TIMEZONE_NAME)

_CACHE: dict = {"path": None, "mtime": None, "bundle": None}


class ModelNotAvailable(Exception):
    """The trained artifact is missing or cannot be loaded."""


class InvalidPredictionInput(Exception):
    """The request cannot be interpreted as a planned arrival."""


def now_kolkata() -> datetime:
    return datetime.now(ZONE)


def parse_clock(value: str) -> tuple[int, int]:
    """Accept ``HH:MM`` in 24-hour form."""
    text = (value or "").strip()
    parts = text.split(":")
    if len(parts) != 2 or not all(part.isdigit() for part in parts):
        raise InvalidPredictionInput(
            "arrival_time must be a 24-hour time like 10:00."
        )
    hours, minutes = int(parts[0]), int(parts[1])
    if hours > 23 or minutes > 59 or len(parts[0]) > 2 or len(parts[1]) != 2:
        raise InvalidPredictionInput(
            "arrival_time must be a 24-hour time like 10:00."
        )
    return hours, minutes


def resolve_arrival(
    arrival_time: str,
    arrival_date: date | None = None,
    now: datetime | None = None,
) -> datetime:
    """Build an Asia/Kolkata arrival.

    When the date is omitted and the clock time has already passed today, the
    arrival is scheduled for the next day. An explicit date is kept as given,
    including a time earlier today.
    """
    hours, minutes = parse_clock(arrival_time)
    current = now or now_kolkata()
    if current.tzinfo is None:
        current = current.replace(tzinfo=ZONE)
    else:
        current = current.astimezone(ZONE)

    selected_date = arrival_date or current.date()
    arrival = datetime(
        selected_date.year,
        selected_date.month,
        selected_date.day,
        hours,
        minutes,
        tzinfo=ZONE,
    )
    if arrival_date is None and arrival <= current:
        next_day = selected_date + timedelta(days=1)
        arrival = datetime(
            next_day.year,
            next_day.month,
            next_day.day,
            hours,
            minutes,
            tzinfo=ZONE,
        )
    return arrival


def features_from_arrival(arrival: datetime, darshan_type: str) -> pd.DataFrame:
    local = arrival.astimezone(ZONE)
    frame = pd.DataFrame(
        [
            {
                "day_of_week": DAY_NAMES[local.weekday()],
                "darshan_type": darshan_type,
                "is_weekend": 1 if local.weekday() >= 5 else 0,
                "arrival_hour_24h": int(local.hour),
            }
        ]
    )
    return frame[FEATURES]


def load_bundle(model_path: Path | None = None) -> dict:
    path = Path(model_path) if model_path is not None else MODEL_PATH
    if not path.is_file():
        raise ModelNotAvailable(
            "The Darshan time model is not available. "
            "From the backend directory, train it with: python -m ml.train_model"
        )
    mtime = path.stat().st_mtime
    if _CACHE["path"] == str(path) and _CACHE["mtime"] == mtime and _CACHE["bundle"] is not None:
        return _CACHE["bundle"]
    try:
        bundle = joblib.load(path)
    except Exception as exc:
        raise ModelNotAvailable(f"The Darshan time model could not be loaded: {exc}") from exc
    if not isinstance(bundle, dict) or "pipelines" not in bundle or "metadata" not in bundle:
        raise ModelNotAvailable("The Darshan time model file is not a trained artifact.")
    pipelines = bundle["pipelines"]
    if TARGET_WAIT not in pipelines or TARGET_DURATION not in pipelines:
        raise ModelNotAvailable("The Darshan time model is missing a required predictor.")
    _CACHE["path"] = str(path)
    _CACHE["mtime"] = mtime
    _CACHE["bundle"] = bundle
    return bundle


def clear_model_cache() -> None:
    _CACHE["path"] = None
    _CACHE["mtime"] = None
    _CACHE["bundle"] = None


def _round_minutes(value: float) -> int:
    return max(0, int(math.floor(float(value) + 0.5)))


def _canonical_darshan_type(value: str, known: list[str]) -> str:
    cleaned = " ".join((value or "").split())
    if not cleaned:
        raise InvalidPredictionInput("darshan_type is required.")
    for item in known:
        if item.lower() == cleaned.lower():
            return item
    choices = ", ".join(known)
    raise InvalidPredictionInput(f"darshan_type must be one of: {choices}.")


def _unavailable(metadata: dict, arrival: datetime, darshan_type: str, reason: str, message: str) -> dict:
    local = arrival.astimezone(ZONE)
    return {
        "available": False,
        "reason": reason,
        "message": message,
        "prediction_source": "trained_model",
        "arrival_time": local.strftime("%H:%M"),
        "arrival_date": local.date().isoformat(),
        "timezone": TIMEZONE_NAME,
        "darshan_type": darshan_type,
        "queue_wait_minutes": None,
        "darshan_duration_minutes": None,
        "total_time_minutes": None,
        "total_time_hours": None,
        "expected_completion": None,
        "model_version": metadata.get("model_version"),
        "data_quality": metadata.get("data_quality"),
    }


def build_success_response(
    arrival: datetime,
    queue_wait: float,
    duration: float,
    metadata: dict,
    darshan_type: str,
) -> dict:
    """Assemble a nonnegative, internally consistent prediction."""
    local = arrival.astimezone(ZONE)
    wait_minutes = _round_minutes(queue_wait)
    duration_minutes = _round_minutes(duration)
    total_minutes = wait_minutes + duration_minutes
    completion = local + timedelta(minutes=total_minutes)
    quality = metadata.get("data_quality") or "demo"
    if quality == "demo":
        warning = (
            "Demonstration estimate from synthetic data, not a live Tirumala forecast. "
            "The selected arrival time, date, and darshan type were used. "
            "Weather, festival status, the daily crowd total, and open queue counters "
            "were not available and were not invented."
        )
    else:
        warning = (
            "Historical estimate from the trained dataset, not a live camera forecast. "
            "Weather, festival status, the daily crowd total, and open queue counters "
            "were not available and were not invented."
        )
    return {
        "available": True,
        "prediction_source": "trained_model",
        "arrival_time": local.strftime("%H:%M"),
        "arrival_date": local.date().isoformat(),
        "timezone": TIMEZONE_NAME,
        "darshan_type": darshan_type,
        "queue_wait_minutes": wait_minutes,
        "darshan_duration_minutes": duration_minutes,
        "total_time_minutes": total_minutes,
        "total_time_hours": round(total_minutes / 60.0, 2),
        "expected_completion": completion.strftime("%H:%M"),
        "expected_completion_date": completion.date().isoformat(),
        "crosses_midnight": completion.date() != local.date(),
        "model_version": metadata.get("model_version"),
        "data_quality": quality,
        "demo_warning": warning,
        "features_used": {
            "day_of_week": DAY_NAMES[local.weekday()],
            "is_weekend": 1 if local.weekday() >= 5 else 0,
            "darshan_type": darshan_type,
            "arrival_hour_24h": int(local.hour),
        },
    }


def predict_for_request(
    arrival_time: str,
    darshan_type: str,
    arrival_date: date | None = None,
    now: datetime | None = None,
    model_path: Path | None = None,
) -> dict:
    """Predict queue wait and darshan duration for one planned arrival."""
    bundle = load_bundle(model_path)
    metadata = bundle["metadata"]
    known_types = list(metadata.get("darshan_types") or [])
    canonical_type = _canonical_darshan_type(darshan_type, known_types)
    arrival = resolve_arrival(arrival_time, arrival_date, now)
    hour = arrival.astimezone(ZONE).hour
    hour_min = int(metadata.get("hour_min", 0))
    hour_max = int(metadata.get("hour_max", 23))
    if hour < hour_min or hour > hour_max:
        return _unavailable(
            metadata,
            arrival,
            canonical_type,
            "unsupported_arrival_hour",
            (
                "This demonstration dataset only includes arrivals from "
                f"{hour_min:02d}:00 through {hour_max:02d}:59. "
                "Choose a time in that range."
            ),
        )

    features = features_from_arrival(arrival, canonical_type)
    missing = [name for name in FEATURES if name not in features.columns]
    if missing:
        raise ModelNotAvailable(
            "The model features could not be built: " + ", ".join(missing)
        )
    # Guard the column roles stored with the artifact.
    expected_categorical = list((metadata.get("features") or {}).get("categorical") or CATEGORICAL_FEATURES)
    expected_numerical = list((metadata.get("features") or {}).get("numerical") or NUMERICAL_FEATURES)
    model_columns = expected_categorical + expected_numerical
    if features[model_columns].isna().to_numpy().any():
        return _unavailable(
            metadata,
            arrival,
            canonical_type,
            "insufficient_data",
            "A required model input for the selected arrival is missing.",
        )

    wait = float(bundle["pipelines"][TARGET_WAIT].predict(features)[0])
    duration = float(bundle["pipelines"][TARGET_DURATION].predict(features)[0])
    return build_success_response(arrival, wait, duration, metadata, canonical_type)
