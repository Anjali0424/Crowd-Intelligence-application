"""Darshan waiting-time prediction engine.

The engine has two transparent layers:

1. **Queue baseline** - a deterministic model:
   ``wait = queue_population / processing_rate`` and
   ``darshan = people_inside / processing_rate``. It needs only one live reading
   and a service rate, so it is always available when the inputs exist.

2. **Historical ML** - a ``RandomForestRegressor`` trained only when enough
   labelled records (``observed_wait_minutes``) exist. It is validated with a
   time-ordered split and compared against a fallback mean predictor. If the
   model does not beat the fallback by a usable margin, the baseline is used.

No random values are produced: every number comes from an input, from stored
records, or from a documented formula.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from pathlib import Path

from app.database.database import BACKEND_DIR
from app.database.models import DarshanPrediction, DarshanRecord

MODEL_DIR = BACKEND_DIR / "models"
MODEL_PATH = MODEL_DIR / "darshan_wait_model.joblib"

FEATURES = [
    "hour_of_day",
    "day_of_week",
    "is_weekend",
    "queue_population",
    "people_inside",
    "passes_issued",
    "actual_entries",
    "completed_per_hour",
    "camera_count",
]

# Minimum labelled rows before a model is trained at all.
MIN_TRAIN_ROWS = 30
# Fraction of the (time-ordered) records held out to validate the model.
TEST_FRACTION = 0.2


def _env_int(name: str, default: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
        return value if value > 0 else default
    except (TypeError, ValueError):
        return default


def queue_capacity() -> int:
    return _env_int("DARSHAN_QUEUE_CAPACITY", 250)


def _round(value, digits: int = 1):
    if value is None:
        return None
    return round(float(value), digits)


def crowd_level_from_density(density_pct: float) -> str:
    if density_pct < 40:
        return "LOW"
    if density_pct < 70:
        return "MODERATE"
    if density_pct < 90:
        return "HIGH"
    return "CRITICAL"


# ---------------------------------------------------------------------------
# Live data
# ---------------------------------------------------------------------------

def live_zone_counts() -> dict:
    """Latest camera-derived counts per zone, or ``{}`` when unavailable."""
    try:
        from app.api.cameras import ORDER, _get_session
    except Exception:
        return {}

    zones = {}
    for cid in ORDER:
        try:
            data = _get_session(cid).latest()
        except Exception:
            continue
        if not data.get("available") or not data.get("has_count"):
            continue
        zone_id = data.get("zone_id")
        if not zone_id:
            continue
        people = int(data.get("people_count") or 0)
        current = zones.get(zone_id)
        if current is None or people > current["people"]:
            zones[zone_id] = {
                "zone_id": zone_id,
                "zone_name": data.get("zone_name") or zone_id,
                "people": people,
                "capacity": data.get("capacity"),
                "updated_at": data.get("updated_at"),
            }
    return zones


def _latest_record(db) -> DarshanRecord | None:
    return (
        db.query(DarshanRecord)
        .order_by(DarshanRecord.record_date.desc(), DarshanRecord.slot_time.desc())
        .first()
    )


def _historical_average_rate(db) -> float | None:
    """Average measured throughput (people/hour) from stored records."""
    rows = (
        db.query(DarshanRecord.completed_per_hour)
        .filter(DarshanRecord.completed_per_hour.isnot(None))
        .filter(DarshanRecord.completed_per_hour > 0)
        .order_by(DarshanRecord.recorded_at.desc())
        .limit(60)
        .all()
    )
    values = [row[0] for row in rows if row[0]]
    if not values:
        return None
    return sum(values) / len(values)


def _historical_average_darshan(db) -> float | None:
    rows = (
        db.query(DarshanRecord.observed_darshan_minutes)
        .filter(DarshanRecord.observed_darshan_minutes.isnot(None))
        .filter(DarshanRecord.observed_darshan_minutes > 0)
        .all()
    )
    values = [row[0] for row in rows if row[0]]
    if not values:
        return None
    return sum(values) / len(values)


def effective_rate(db, explicit: float | None):
    """Return ``(rate, basis)``. Explicit staff input wins, then history."""
    if explicit is not None and float(explicit) > 0:
        return float(explicit), "staff_input"

    avg = _historical_average_rate(db)
    if avg and avg > 0:
        return round(avg, 1), "historical-average"

    return None, "unavailable"


def get_current_status(db) -> dict:
    """Merge the latest camera counts with the latest staff record.

    Every field is either measured (camera / stored record) or ``None``. No
    field is invented.
    """
    zones = live_zone_counts()
    record = _latest_record(db)

    queue_population = None
    people_inside = None
    camera_count = None
    source = None
    as_of = None

    queue_zone = zones.get("queue-area")
    darshan_zone = zones.get("darshan-area")

    if zones:
        camera_count = sum(z["people"] for z in zones.values())
        if queue_zone:
            queue_population = queue_zone["people"]
            as_of = queue_zone.get("updated_at")
        if darshan_zone:
            people_inside = darshan_zone["people"]
            as_of = as_of or darshan_zone.get("updated_at")
        source = "camera"

    if record is not None:
        if queue_population is None:
            queue_population = record.queue_population
        if people_inside is None:
            people_inside = record.people_inside
        if camera_count is None:
            camera_count = record.camera_count
        if as_of is None and record.recorded_at:
            as_of = record.recorded_at.isoformat()
        if source is None:
            source = "staff"
        elif source == "camera":
            source = "hybrid"

    rate, rate_basis = effective_rate(db, None)

    density = None
    level = None
    if queue_population is not None:
        density = round(queue_population / max(queue_capacity(), 1) * 100)
        level = crowd_level_from_density(density)

    rate, rate_basis = effective_rate(db, None)

    return {
        "as_of": as_of,
        "source": source,
        "queue_population": queue_population,
        "people_inside": people_inside,
        "camera_count": camera_count,
        "queue_capacity": queue_capacity(),
        "queue_density_pct": density,
        "crowd_level": level,
        "processing_rate_per_hour": rate,
        "processing_rate_basis": rate_basis,
        "live_zones_available": bool(zones),
        "historical_records": db.query(DarshanRecord).count(),
    }


# ---------------------------------------------------------------------------
# Baseline (transparent)
# ---------------------------------------------------------------------------

def baseline_predict(queue_population, people_inside, processing_rate, entry_rate,
                     observed_darshan_avg):
    """Deterministic queue/service-rate estimate.

    ``wait`` is queue divided by service rate. If more people arrive than the
    temple can process (``entry_rate >= processing_rate``) the queue is growing,
    so we still report the service-rate wait as a lower bound and flag the trend.
    """
    missing = []
    if processing_rate is None or processing_rate <= 0:
        missing.append("processing_rate")
    if queue_population is None:
        missing.append("queue_population")

    if missing:
        return {
            "available": False,
            "missing": missing,
            "wait_minutes": None,
            "darshan_minutes": None,
            "total_minutes": None,
            "queue_trend": None,
            "basis": {},
        }

    rate = float(processing_rate)
    wait_minutes = float(queue_population) / rate * 60.0

    queue_trend = "stable"
    if entry_rate is not None:
        if float(entry_rate) >= rate:
            queue_trend = "increasing"
        elif float(entry_rate) <= rate * 0.5:
            queue_trend = "decreasing"

    if observed_darshan_avg is not None and observed_darshan_avg > 0:
        darshan_minutes = float(observed_darshan_avg)
        darshan_basis = "historical average darshan duration"
    elif people_inside is not None:
        darshan_minutes = float(people_inside) / rate * 60.0
        darshan_basis = "people_inside / processing_rate"
    else:
        darshan_minutes = None
        darshan_basis = "unavailable (unknown people inside)"

    total = wait_minutes + (darshan_minutes or 0)

    return {
        "available": True,
        "missing": [],
        "wait_minutes": _round(wait_minutes),
        "darshan_minutes": _round(darshan_minutes),
        "total_minutes": _round(total),
        "queue_trend": queue_trend,
        "basis": {
            "wait": "queue_population / processing_rate",
            "darshan": darshan_basis,
        },
    }


# ---------------------------------------------------------------------------
# Historical ML
# ---------------------------------------------------------------------------

def _feature_row(record: DarshanRecord):
    when = record.recorded_at or datetime.utcnow()
    return [
        float(when.hour),
        float(when.weekday()),
        1.0 if when.weekday() >= 5 else 0.0,
        float(record.queue_population or 0),
        float(record.people_inside or 0),
        float(record.passes_issued or 0),
        float(record.actual_entries or 0),
        float(record.completed_per_hour or 0),
        float(record.camera_count or 0),
    ]


def _labelled_records(db):
    return (
        db.query(DarshanRecord)
        .filter(DarshanRecord.observed_wait_minutes.isnot(None))
        .filter(DarshanRecord.queue_population.isnot(None))
        .order_by(DarshanRecord.recorded_at.asc())
        .all()
    )


def train_model(db) -> dict:
    """Train and persist the model. Returns a metrics dict.

    Always safe to call: returns ``{"trained": False, "reason": ...}`` when
    there is not enough labelled data or scikit-learn is missing.
    """
    records = _labelled_records(db)
    if len(records) < MIN_TRAIN_ROWS:
        return {
            "trained": False,
            "reason": "insufficient_data",
            "labelled_records": len(records),
            "required": MIN_TRAIN_ROWS,
        }

    try:
        import joblib
        import numpy as np
        from sklearn.ensemble import RandomForestRegressor
        from sklearn.metrics import mean_absolute_error
    except Exception:
        return {"trained": False, "reason": "sklearn_unavailable"}

    X = np.array([_feature_row(r) for r in records], dtype=float)
    y = np.array([float(r.observed_wait_minutes) for r in records], dtype=float)

    split = max(1, int(len(records) * (1 - TEST_FRACTION)))
    if split >= len(records):
        split = len(records) - 1

    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]

    model = RandomForestRegressor(
        n_estimators=200,
        max_depth=8,
        min_samples_leaf=2,
        random_state=42,
    )
    model.fit(X_train, y_train)

    pred = model.predict(X_test)
    mae = float(mean_absolute_error(y_test, pred))

    fallback_value = float(np.mean(y_train))
    fallback_pred = np.full_like(y_test, fallback_value)
    fallback_mae = float(mean_absolute_error(y_test, fallback_pred))

    r2 = None
    try:
        from sklearn.metrics import r2_score

        denom = float(np.var(y_test))
        if denom > 0:
            r2 = float(r2_score(y_test, pred))
    except Exception:
        r2 = None

    metrics = {
        "trained": True,
        "trained_at": datetime.utcnow().isoformat(),
        "records": len(records),
        "train_rows": len(X_train),
        "test_rows": len(X_test),
        "mae_minutes": round(mae, 2),
        "fallback_mae_minutes": round(fallback_mae, 2),
        "beats_fallback": mae < fallback_mae * 0.95,
        "r2": round(r2, 3) if r2 is not None else None,
        "features": FEATURES,
    }

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "metrics": metrics, "features": FEATURES}, MODEL_PATH)
    return metrics


def load_model():
    if not MODEL_PATH.exists():
        return None
    try:
        import joblib

        return joblib.load(MODEL_PATH)
    except Exception:
        return None


def model_metrics() -> dict:
    bundle = load_model()
    if not bundle:
        return {"available": False, "reason": "no_model"}
    metrics = dict(bundle.get("metrics") or {})
    metrics["available"] = True
    return metrics


# ---------------------------------------------------------------------------
# Combined prediction
# ---------------------------------------------------------------------------

def _features_for_inputs(queue, people_inside, passes_issued, actual_entries,
                         rate, camera_count, when):
    return [
        float(when.hour),
        float(when.weekday()),
        1.0 if when.weekday() >= 5 else 0.0,
        float(queue or 0),
        float(people_inside or 0),
        float(passes_issued or 0),
        float(actual_entries or 0),
        float(rate or 0),
        float(camera_count or 0),
    ]


def predict(db, *, queue=None, people_inside=None, processing_rate=None,
            entry_rate=None, passes_issued=None, actual_entries=None,
            camera_count=None, source=None, input_source=None, when=None,
            persist=True) -> dict:
    """Produce a darshan waiting-time estimate from the best available data."""
    when = when or datetime.now()
    observed_darshan_avg = _historical_average_darshan(db)

    eff_rate, eff_basis = effective_rate(db, processing_rate)
    baseline = baseline_predict(
        queue_population=queue,
        people_inside=people_inside,
        processing_rate=eff_rate,
        entry_rate=entry_rate,
        observed_darshan_avg=observed_darshan_avg,
    )

    bundle = load_model()
    ml_wait = None
    ml_mae = None

    model_beats_fallback = bool(
        ((bundle or {}).get("metrics") or {}).get("beats_fallback")
    )
    if bundle and bundle.get("model") is not None and queue is not None and model_beats_fallback:
        try:
            vec = [
                _features_for_inputs(
                    queue,
                    people_inside,
                    passes_issued,
                    actual_entries,
                    eff_rate,
                    camera_count,
                    when,
                )
            ]
            ml_wait = max(0.0, float(bundle["model"].predict(vec)[0]))
            ml_mae = (bundle.get("metrics") or {}).get("mae_minutes")
        except Exception:
            ml_wait = None
            ml_mae = None

    baseline_wait = baseline["wait_minutes"]
    baseline_total = baseline["total_minutes"]

    if baseline_total is None and ml_wait is None:
        return {
            "available": False,
            "reason": "missing_inputs",
            "missing": baseline.get("missing", []),
            "generated_at": datetime.now().isoformat(),
            "crowd_level": None,
        }

    method = "queue-baseline"
    wait_minutes = baseline_wait
    total_minutes = baseline_total

    if ml_wait is not None and baseline_wait is not None:
        method = "combined"
        wait_minutes = _round(0.6 * ml_wait + 0.4 * baseline_wait)
        total_minutes = _round((wait_minutes or 0) + (baseline["darshan_minutes"] or 0))
    elif ml_wait is not None:
        method = "historical-ml"
        wait_minutes = _round(ml_wait)
        total_minutes = _round(ml_wait + (baseline["darshan_minutes"] or 0))

    # Confidence and uncertainty band.
    if method == "combined" and ml_mae is not None:
        margin = max(ml_mae, 0.2 * (total_minutes or 0))
        confidence = "high" if ml_mae <= 0.15 * max(baseline_wait or 1, 1) else "medium"
    elif method == "historical-ml":
        margin = 0.25 * (total_minutes or 0)
        confidence = "medium"
    else:
        margin = 0.25 * (total_minutes or 0)
        confidence = "low" if (entry_rate is not None and entry_rate >= (processing_rate or 0)) else "medium"

    range_low = _round(max(0.0, (total_minutes or 0) - margin))
    range_high = _round((total_minutes or 0) + margin)

    density = None
    level = None
    if queue is not None:
        density = round(queue / max(queue_capacity(), 1) * 100)
        level = crowd_level_from_density(density)

    now = datetime.now()
    start = when or now
    expected_completion = start + timedelta(minutes=total_minutes or 0)
    if input_source in {"camera", "staff", "hybrid"}:
        data_source = input_source
    elif source in {"camera", "staff", "hybrid"}:
        data_source = source
    else:
        data_source = "unknown"

    result = {
        "available": True,
        "method": method,
        "data_source": data_source,
        "inputs_are_live": data_source in {"camera", "hybrid"},
        "estimate_start": start.isoformat(),
        "generated_at": now.isoformat(),
        "queue_population": queue,
        "people_inside": people_inside,
        "processing_rate_per_hour": processing_rate,
        "effective_rate_per_hour": eff_rate,
        "processing_rate_basis": eff_basis,
        "entry_rate_per_hour": entry_rate,
        "queue_capacity": queue_capacity(),
        "queue_density_pct": density,
        "crowd_level": level,
        "wait_minutes": _round(wait_minutes),
        "darshan_minutes": baseline["darshan_minutes"],
        "total_minutes": _round(total_minutes),
        "range": {"low_minutes": range_low, "high_minutes": range_high},
        "confidence": confidence,
        "queue_trend": baseline.get("queue_trend"),
        "expected_completion": expected_completion.isoformat(),
        "historical_records": db.query(DarshanRecord).count(),
        "model_mae_minutes": ml_mae,
        "baseline": baseline,
        "ml_wait_minutes": _round(ml_wait),
    }

    if persist:
        _store_prediction(db, result, passes_issued, actual_entries, camera_count)

    return result


def _store_prediction(db, result, passes_issued, actual_entries, camera_count):
    row = DarshanPrediction(
        source=result.get("data_source") or "staff",
        method=result.get("method") or "queue-baseline",
        queue_population=result.get("queue_population"),
        people_inside=result.get("people_inside"),
        processing_rate_per_hour=result.get("effective_rate_per_hour")
        or result.get("processing_rate_per_hour"),
        entry_rate_per_hour=result.get("entry_rate_per_hour"),
        crowd_level=result.get("crowd_level"),
        wait_minutes=result.get("wait_minutes"),
        darshan_minutes=result.get("darshan_minutes"),
        total_minutes=result.get("total_minutes"),
        range_low_minutes=(result.get("range") or {}).get("low_minutes"),
        range_high_minutes=(result.get("range") or {}).get("high_minutes"),
        confidence=result.get("confidence"),
        expected_completion=datetime.fromisoformat(result["expected_completion"])
        if result.get("expected_completion")
        else None,
        historical_records=result.get("historical_records"),
        model_mae_minutes=result.get("model_mae_minutes"),
        details=json.dumps(
            {
                "passes_issued": passes_issued,
                "actual_entries": actual_entries,
                "camera_count": camera_count,
                "processing_rate_basis": result.get("processing_rate_basis"),
                "queue_trend": result.get("queue_trend"),
            }
        ),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# History helpers used by the API
# ---------------------------------------------------------------------------

def list_records(db, record_date=None, limit=200):
    query = db.query(DarshanRecord)
    if record_date is not None:
        query = query.filter(DarshanRecord.record_date == record_date)
    return (
        query.order_by(DarshanRecord.record_date.desc(), DarshanRecord.slot_time.desc())
        .limit(limit)
        .all()
    )


def prediction_history(db, limit=50):
    return (
        db.query(DarshanPrediction)
        .order_by(DarshanPrediction.created_at.desc())
        .limit(limit)
        .all()
    )
