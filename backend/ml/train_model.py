"""Train the demonstration Darshan time models.

Run from the backend directory:

    python -m ml.train_model

The script reads the CSV already stored in ``backend/data``. It does not
modify that file. Metrics describe the synthetic dataset only and are not
real-world Tirumala accuracy.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
DEFAULT_MODEL_PATH = BACKEND_DIR / "models" / "darshan_time_model.joblib"

MODEL_VERSION = "1.0"
RANDOM_SEED = 42
TRAIN_FRACTION = 0.8
TIMEZONE_NAME = "Asia/Kolkata"

# Columns the selected arrival can supply without inventing weather, festival
# status, daily crowd, or how many counters are open.
CATEGORICAL_FEATURES = ["day_of_week", "darshan_type"]
NUMERICAL_FEATURES = ["is_weekend", "arrival_hour_24h"]
FEATURES = CATEGORICAL_FEATURES + NUMERICAL_FEATURES

TARGET_WAIT = "queue_wait_minutes"
TARGET_DURATION = "darshan_duration_minutes"
TARGET_TOTAL = "total_time_minutes"
TARGETS = (TARGET_WAIT, TARGET_DURATION, TARGET_TOTAL)

REQUIRED_COLUMNS = [
    "record_id",
    "date",
    "day_of_week",
    "is_weekend",
    "is_festival_or_peak_day",
    "darshan_type",
    "arrival_hour_24h",
    "arrival_time_slot",
    "estimated_total_crowd_per_day",
    "queue_counters_open",
    "weather",
    "queue_wait_minutes",
    "darshan_duration_minutes",
    "total_time_minutes",
    "total_time_hours",
    "data_source",
]

DAY_NAMES = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]

EXCLUDED_COLUMNS = {
    "record_id": "Record identifier. Not a predictive feature.",
    "date": (
        "Used to derive the weekday and to order the chronological split. "
        "A raw date would not transfer to a later day."
    ),
    "data_source": "Constant dataset label, not a predictive feature.",
    "arrival_time_slot": "Coarser copy of arrival_hour_24h.",
    "is_festival_or_peak_day": (
        "Not known for an arbitrary selected arrival, so it is not required "
        "at prediction time and is not invented."
    ),
    "estimated_total_crowd_per_day": (
        "Daily crowd total. Live camera counts are instantaneous people "
        "counts and are not substituted for this column."
    ),
    "queue_counters_open": (
        "Not known for the selected arrival and not invented."
    ),
    "weather": "Not known for the selected arrival and not invented.",
    "queue_wait_minutes": "Target.",
    "darshan_duration_minutes": "Target.",
    "total_time_minutes": "Target. Equals queue wait plus darshan duration.",
    "total_time_hours": "Rounded hours form of total_time_minutes.",
}

SYNTHETIC_SOURCE = "SYNTHETIC_DEMO_NOT_REAL_TIRUMALA_DATA"


class DatasetError(Exception):
    """The CSV is missing or cannot be used for training."""


def find_dataset(csv_path: Path | None = None) -> Path:
    """Locate the training CSV without creating or modifying it."""
    if csv_path is not None:
        path = Path(csv_path)
        if not path.is_file():
            raise DatasetError(f"Dataset not found: {path}")
        return path

    if not DATA_DIR.is_dir():
        raise DatasetError(
            f"Dataset directory does not exist: {DATA_DIR}. "
            "Place the Darshan CSV in backend/data."
        )

    csv_files = sorted(path for path in DATA_DIR.glob("*.csv") if path.is_file())
    if not csv_files:
        raise DatasetError(
            f"No CSV dataset found in {DATA_DIR}. "
            "Training stopped. The original file was not created or replaced."
        )
    if len(csv_files) == 1:
        return csv_files[0]

    matching = []
    for path in csv_files:
        try:
            header = pd.read_csv(path, nrows=0).columns.tolist()
        except Exception:
            continue
        if set(REQUIRED_COLUMNS).issubset(header):
            matching.append(path)
    if len(matching) == 1:
        return matching[0]
    names = ", ".join(path.name for path in csv_files)
    raise DatasetError(
        "More than one CSV is in backend/data "
        f"({names}). Pass the file explicitly with --csv."
    )


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _problems_for(frame: pd.DataFrame) -> list[str]:
    problems: list[str] = []
    missing_columns = [name for name in REQUIRED_COLUMNS if name not in frame.columns]
    if missing_columns:
        problems.append("missing columns: " + ", ".join(missing_columns))
        return problems

    if frame.empty:
        problems.append("the CSV has no rows")
        return problems

    null_counts = frame[REQUIRED_COLUMNS].isna().sum()
    null_columns = [name for name, count in null_counts.items() if int(count) > 0]
    if null_columns:
        problems.append(
            "missing values in: "
            + ", ".join(f"{name} ({int(null_counts[name])})" for name in null_columns)
        )

    if frame["record_id"].duplicated().any():
        problems.append(
            f"duplicate record_id values: {int(frame['record_id'].duplicated().sum())}"
        )

    exact_duplicates = int(frame.duplicated(subset=REQUIRED_COLUMNS).sum())
    if exact_duplicates:
        problems.append(f"fully duplicated rows: {exact_duplicates}")

    dates = pd.to_datetime(frame["date"], errors="coerce")
    if dates.isna().any():
        problems.append(f"invalid date values: {int(dates.isna().sum())}")

    for column in (
        "is_weekend",
        "is_festival_or_peak_day",
        "arrival_hour_24h",
        "estimated_total_crowd_per_day",
        "queue_counters_open",
        TARGET_WAIT,
        TARGET_DURATION,
        TARGET_TOTAL,
        "total_time_hours",
    ):
        numeric = pd.to_numeric(frame[column], errors="coerce")
        if numeric.isna().any():
            problems.append(f"non-numeric values in {column}: {int(numeric.isna().sum())}")

    if problems:
        return problems

    numeric_frame = frame.copy()
    numeric_frame["date"] = dates
    for column in (
        "is_weekend",
        "is_festival_or_peak_day",
        "arrival_hour_24h",
        "estimated_total_crowd_per_day",
        "queue_counters_open",
        TARGET_WAIT,
        TARGET_DURATION,
        TARGET_TOTAL,
        "total_time_hours",
    ):
        numeric_frame[column] = pd.to_numeric(numeric_frame[column])

    weekend_values = set(numeric_frame["is_weekend"].unique().tolist())
    if not weekend_values.issubset({0, 1}):
        problems.append(f"is_weekend contains values other than 0 or 1: {sorted(weekend_values)}")

    festival_values = set(numeric_frame["is_festival_or_peak_day"].unique().tolist())
    if not festival_values.issubset({0, 1}):
        problems.append(
            "is_festival_or_peak_day contains values other than 0 or 1: "
            f"{sorted(festival_values)}"
        )

    hours = numeric_frame["arrival_hour_24h"]
    if ((hours < 0) | (hours > 23) | (hours != hours.round())).any():
        problems.append("arrival_hour_24h must be a whole hour from 0 through 23")

    if (numeric_frame["estimated_total_crowd_per_day"] < 0).any():
        problems.append("estimated_total_crowd_per_day contains negative values")
    if (numeric_frame["queue_counters_open"] <= 0).any():
        problems.append("queue_counters_open must be positive")

    for column in (TARGET_WAIT, TARGET_DURATION, TARGET_TOTAL):
        if (numeric_frame[column] < 0).any():
            problems.append(f"{column} contains negative values")

    inconsistent = (
        numeric_frame[TARGET_WAIT] + numeric_frame[TARGET_DURATION]
        != numeric_frame[TARGET_TOTAL]
    )
    if inconsistent.any():
        problems.append(
            "total_time_minutes does not equal queue_wait_minutes + "
            f"darshan_duration_minutes for {int(inconsistent.sum())} rows"
        )

    hour_gap = (
        numeric_frame["total_time_hours"] - (numeric_frame[TARGET_TOTAL] / 60.0)
    ).abs()
    if (hour_gap > 0.02).any():
        problems.append(
            "total_time_hours is not total_time_minutes / 60 "
            f"for {int((hour_gap > 0.02).sum())} rows"
        )

    expected_day = numeric_frame["date"].dt.dayofweek.map(lambda value: DAY_NAMES[int(value)])
    day_mismatch = expected_day != numeric_frame["day_of_week"].astype(str).str.strip()
    if day_mismatch.any():
        problems.append(
            f"day_of_week does not match date for {int(day_mismatch.sum())} rows"
        )

    expected_weekend = (numeric_frame["date"].dt.dayofweek >= 5).astype(int)
    weekend_mismatch = expected_weekend != numeric_frame["is_weekend"].astype(int)
    if weekend_mismatch.any():
        problems.append(
            f"is_weekend does not match date for {int(weekend_mismatch.sum())} rows"
        )

    blank_type = numeric_frame["darshan_type"].astype(str).str.strip() == ""
    if blank_type.any():
        problems.append(f"blank darshan_type values: {int(blank_type.sum())}")

    blank_weather = numeric_frame["weather"].astype(str).str.strip() == ""
    if blank_weather.any():
        problems.append(f"blank weather values: {int(blank_weather.sum())}")

    blank_source = numeric_frame["data_source"].astype(str).str.strip() == ""
    if blank_source.any():
        problems.append(f"blank data_source values: {int(blank_source.sum())}")

    return problems


def load_dataset(csv_path: Path | None = None) -> tuple[pd.DataFrame, dict]:
    """Read and validate the CSV. Raises ``DatasetError`` when it cannot be used."""
    path = find_dataset(csv_path)
    try:
        frame = pd.read_csv(path, encoding="utf-8-sig")
    except Exception as exc:
        raise DatasetError(f"Could not read {path.name}: {exc}") from exc

    problems = _problems_for(frame)
    if problems:
        details = "\n".join(f"- {item}" for item in problems)
        raise DatasetError(f"Dataset {path.name} is invalid and was not modified:\n{details}")

    frame = frame.copy()
    frame["date"] = pd.to_datetime(frame["date"]).dt.normalize()
    for column in (
        "is_weekend",
        "is_festival_or_peak_day",
        "arrival_hour_24h",
        "estimated_total_crowd_per_day",
        "queue_counters_open",
        TARGET_WAIT,
        TARGET_DURATION,
        TARGET_TOTAL,
    ):
        frame[column] = pd.to_numeric(frame[column]).astype(int)
    frame["total_time_hours"] = pd.to_numeric(frame["total_time_hours"])
    for column in ("day_of_week", "darshan_type", "weather", "data_source", "record_id"):
        frame[column] = frame[column].astype(str).str.strip()

    repeated_key = ["date", "darshan_type", "arrival_hour_24h"]
    repeated = frame.duplicated(subset=repeated_key, keep=False)
    repeated_groups = 0
    if repeated.any():
        repeated_groups = int(frame.loc[repeated].groupby(repeated_key).ngroups)

    sources = sorted(frame["data_source"].unique().tolist())
    if sources == [SYNTHETIC_SOURCE]:
        data_quality = "demo"
    elif SYNTHETIC_SOURCE in sources:
        data_quality = "mixed"
    else:
        data_quality = "historical"

    report = {
        "filename": path.name,
        "rows": int(len(frame)),
        "sha256": _sha256(path),
        "date_min": frame["date"].min().date().isoformat(),
        "date_max": frame["date"].max().date().isoformat(),
        "distinct_dates": int(frame["date"].nunique()),
        "data_sources": sources,
        "data_quality": data_quality,
        "darshan_types": sorted(frame["darshan_type"].unique().tolist()),
        "hour_min": int(frame["arrival_hour_24h"].min()),
        "hour_max": int(frame["arrival_hour_24h"].max()),
        "repeated_arrival_groups": repeated_groups,
        "null_count": 0,
    }
    return frame, report


def chronological_split(frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, str]:
    """Train on earlier dates and evaluate on later dates."""
    ordered = frame.sort_values(
        ["date", "arrival_hour_24h", "record_id"],
        kind="mergesort",
    )
    dates = ordered["date"].drop_duplicates().tolist()
    if len(dates) < 2:
        raise DatasetError("At least two distinct dates are required for chronological validation.")

    cut = int(len(dates) * TRAIN_FRACTION)
    cut = min(max(cut, 1), len(dates) - 1)
    train_dates = set(dates[:cut])
    train = ordered[ordered["date"].isin(train_dates)].copy()
    test = ordered[~ordered["date"].isin(train_dates)].copy()
    if train.empty or test.empty:
        raise DatasetError("Chronological split produced an empty train or test set.")
    test_start = pd.Timestamp(dates[cut]).date().isoformat()
    return train, test, test_start


def _make_pipeline() -> Pipeline:
    preprocessor = ColumnTransformer(
        transformers=[
            (
                "categorical",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                CATEGORICAL_FEATURES,
            ),
            ("numerical", "passthrough", NUMERICAL_FEATURES),
        ],
        remainder="drop",
    )
    model = RandomForestRegressor(
        n_estimators=200,
        min_samples_leaf=2,
        random_state=RANDOM_SEED,
        n_jobs=1,
    )
    return Pipeline([("preprocess", preprocessor), ("model", model)])


def _metric_block(y_true, y_pred) -> dict:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    r2 = None
    if len(y_true) > 1 and float(np.var(y_true)) > 0:
        r2 = float(r2_score(y_true, y_pred))
    return {
        "mae_minutes": round(float(mean_absolute_error(y_true, y_pred)), 2),
        "rmse_minutes": round(float(mean_squared_error(y_true, y_pred)) ** 0.5, 2),
        "r2": round(r2, 4) if r2 is not None else None,
    }


def _json_ready(value):
    if isinstance(value, dict):
        return {str(key): _json_ready(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_ready(item) for item in value]
    if isinstance(value, (np.floating, float)):
        number = float(value)
        if np.isnan(number):
            return None
        return number
    if isinstance(value, (np.integer, int)):
        return int(value)
    return value


def train_and_save(
    csv_path: Path | None = None,
    model_path: Path | None = None,
) -> dict:
    """Validate the CSV, fit the models, and save the artifact."""
    frame, dataset_report = load_dataset(csv_path)
    train, test, test_start = chronological_split(frame)

    pipelines = {}
    metrics = {}
    baselines = {}
    for target in TARGETS:
        pipeline = _make_pipeline()
        pipeline.fit(train[FEATURES], train[target].to_numpy(dtype=float))
        prediction = pipeline.predict(test[FEATURES])
        metrics[target] = _metric_block(test[target], prediction)

        baseline = DummyRegressor(strategy="mean")
        baseline.fit(train[FEATURES], train[target].to_numpy(dtype=float))
        baseline_prediction = baseline.predict(test[FEATURES])
        baselines[target] = _metric_block(test[target], baseline_prediction)
        baselines[target]["strategy"] = "training_mean"
        baselines[target]["beats_baseline"] = (
            metrics[target]["mae_minutes"] < baselines[target]["mae_minutes"]
        )
        pipelines[target] = pipeline

    wait_prediction = np.clip(pipelines[TARGET_WAIT].predict(test[FEATURES]), 0, None)
    duration_prediction = np.clip(
        pipelines[TARGET_DURATION].predict(test[FEATURES]),
        0,
        None,
    )
    served_total = wait_prediction + duration_prediction
    served_metrics = _metric_block(test[TARGET_TOTAL], served_total)

    trained_at = datetime.now(timezone.utc).isoformat()
    metadata = {
        "model_version": MODEL_VERSION,
        "model_label": (
            "demonstration model"
            if dataset_report["data_quality"] == "demo"
            else "historical model"
        ),
        "data_quality": dataset_report["data_quality"],
        "prediction_source": "trained_model",
        "timezone": TIMEZONE_NAME,
        "random_seed": RANDOM_SEED,
        "algorithm": "RandomForestRegressor",
        "trained_at": trained_at,
        "dataset": dataset_report,
        "split": {
            "type": "chronological",
            "train_fraction_of_dates": TRAIN_FRACTION,
            "test_start_date": test_start,
            "train_rows": int(len(train)),
            "test_rows": int(len(test)),
            "train_date_min": train["date"].min().date().isoformat(),
            "train_date_max": train["date"].max().date().isoformat(),
            "test_date_min": test["date"].min().date().isoformat(),
            "test_date_max": test["date"].max().date().isoformat(),
        },
        "features": {
            "categorical": CATEGORICAL_FEATURES,
            "numerical": NUMERICAL_FEATURES,
            "all": FEATURES,
        },
        "excluded_columns": EXCLUDED_COLUMNS,
        "targets": {
            TARGET_WAIT: "Queue waiting time in minutes.",
            TARGET_DURATION: "Time spent in darshan after the queue, in minutes.",
            TARGET_TOTAL: "Queue wait plus darshan duration, in minutes.",
        },
        "serving_rule": (
            "queue_wait_minutes and darshan_duration_minutes come from their "
            "own models. total_time_minutes is their sum after clipping each "
            "prediction at zero, so the three values stay consistent."
        ),
        "metrics": metrics,
        "baseline_metrics": baselines,
        "served_total_metrics": served_metrics,
        "darshan_types": dataset_report["darshan_types"],
        "day_names": DAY_NAMES,
        "hour_min": dataset_report["hour_min"],
        "hour_max": dataset_report["hour_max"],
        "real_world_accuracy": False,
    }

    destination = Path(model_path) if model_path is not None else DEFAULT_MODEL_PATH
    destination.parent.mkdir(parents=True, exist_ok=True)
    bundle = {"metadata": metadata, "pipelines": pipelines}
    joblib.dump(bundle, destination)
    meta_path = destination.with_name(destination.stem + "_meta.json")
    meta_path.write_text(json.dumps(_json_ready(metadata), indent=2), encoding="utf-8")
    metadata["model_path"] = str(destination)
    metadata["meta_path"] = str(meta_path)
    return metadata


def _print_report(metadata: dict) -> None:
    dataset = metadata["dataset"]
    split = metadata["split"]
    print("Darshan time model")
    print(f"Label: {metadata['model_label']}")
    print(f"Data quality: {metadata['data_quality']}")
    print(f"CSV: {dataset['filename']} ({dataset['rows']} rows)")
    print(f"Dates: {dataset['date_min']} to {dataset['date_max']}")
    print(f"data_source: {', '.join(dataset['data_sources'])}")
    if metadata["data_quality"] == "demo":
        print("These metrics are not real-world Tirumala accuracy.")
    if dataset["repeated_arrival_groups"]:
        print(
            "Kept "
            f"{dataset['repeated_arrival_groups']} arrival groups that share a "
            "date, darshan type, and hour but have different recorded durations."
        )
    print(
        "Chronological split: "
        f"{split['train_rows']} train rows through {split['train_date_max']}, "
        f"{split['test_rows']} test rows from {split['test_start_date']}."
    )
    print("Features: " + ", ".join(metadata["features"]["all"]))
    print()
    print(f"{'target':<28} {'MAE':>8} {'RMSE':>8} {'R2':>8} {'base MAE':>10}")
    for target, scores in metadata["metrics"].items():
        baseline = metadata["baseline_metrics"][target]
        r2 = "n/a" if scores["r2"] is None else f"{scores['r2']:.4f}"
        print(
            f"{target:<28} {scores['mae_minutes']:8.2f} "
            f"{scores['rmse_minutes']:8.2f} {r2:>8} {baseline['mae_minutes']:10.2f}"
        )
    served = metadata["served_total_metrics"]
    served_r2 = "n/a" if served["r2"] is None else f"{served['r2']:.4f}"
    print(
        f"{'served total (wait+duration)':<28} {served['mae_minutes']:8.2f} "
        f"{served['rmse_minutes']:8.2f} {served_r2:>8}"
    )
    print()
    print(f"Saved model: {metadata['model_path']}")
    print(f"Saved metadata: {metadata['meta_path']}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Train the Darshan time model.")
    parser.add_argument("--csv", type=Path, default=None, help="CSV path. Defaults to the file in backend/data.")
    parser.add_argument(
        "--model",
        type=Path,
        default=DEFAULT_MODEL_PATH,
        help="Where to write the joblib artifact.",
    )
    args = parser.parse_args(argv)
    try:
        metadata = train_and_save(args.csv, args.model)
    except DatasetError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    _print_report(metadata)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
