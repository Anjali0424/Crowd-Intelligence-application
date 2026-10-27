"""Recompute holdout metrics for the saved Darshan time model.

Run from the backend directory:

    python -m ml.evaluate_model
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import joblib
import numpy as np

from ml.train_model import (
    DEFAULT_MODEL_PATH,
    FEATURES,
    TARGET_DURATION,
    TARGET_TOTAL,
    TARGET_WAIT,
    DatasetError,
    _metric_block,
    chronological_split,
    load_dataset,
)


def evaluate(model_path: Path | None = None, csv_path: Path | None = None) -> dict:
    path = Path(model_path) if model_path is not None else DEFAULT_MODEL_PATH
    if not path.is_file():
        raise DatasetError(
            f"Trained model not found: {path}. "
            "Train it with: python -m ml.train_model"
        )
    try:
        bundle = joblib.load(path)
    except Exception as exc:
        raise DatasetError(f"Could not load {path.name}: {exc}") from exc

    metadata = bundle.get("metadata") or {}
    dataset_name = ((metadata.get("dataset") or {}).get("filename"))
    source = csv_path
    if source is None and dataset_name:
        candidate = path.parent.parent / "data" / dataset_name
        if candidate.is_file():
            source = candidate

    frame, report = load_dataset(source)
    stored_hash = (metadata.get("dataset") or {}).get("sha256")
    if stored_hash and stored_hash != report["sha256"]:
        raise DatasetError(
            f"{report['filename']} has changed since the model was trained. "
            "Retrain with: python -m ml.train_model"
        )

    _train, test, test_start = chronological_split(frame)
    stored_start = (metadata.get("split") or {}).get("test_start_date")
    if stored_start and stored_start != test_start:
        raise DatasetError(
            "The chronological split no longer matches the saved model "
            f"(saved {stored_start}, current {test_start})."
        )

    pipelines = bundle["pipelines"]
    fresh = {}
    for target in (TARGET_WAIT, TARGET_DURATION, TARGET_TOTAL):
        prediction = pipelines[target].predict(test[FEATURES])
        fresh[target] = _metric_block(test[target], prediction)

    wait = np.clip(pipelines[TARGET_WAIT].predict(test[FEATURES]), 0, None)
    duration = np.clip(pipelines[TARGET_DURATION].predict(test[FEATURES]), 0, None)
    fresh["served_total"] = _metric_block(test[TARGET_TOTAL], wait + duration)
    return {
        "model_path": str(path),
        "dataset": report,
        "test_start_date": test_start,
        "test_rows": int(len(test)),
        "metrics": fresh,
        "stored_metrics": metadata.get("metrics"),
        "data_quality": metadata.get("data_quality"),
        "model_label": metadata.get("model_label"),
    }


def _print_evaluation(result: dict) -> None:
    print(f"Model: {result['model_path']}")
    print(f"Label: {result['model_label']}")
    print(f"Data quality: {result['data_quality']}")
    dataset = result["dataset"]
    print(
        f"CSV: {dataset['filename']} ({dataset['rows']} rows, "
        f"holdout from {result['test_start_date']}, {result['test_rows']} rows)"
    )
    if result["data_quality"] == "demo":
        print("These metrics are not real-world Tirumala accuracy.")
    print()
    print(f"{'target':<28} {'MAE':>8} {'RMSE':>8} {'R2':>8}")
    labels = {
        TARGET_WAIT: TARGET_WAIT,
        TARGET_DURATION: TARGET_DURATION,
        TARGET_TOTAL: TARGET_TOTAL,
        "served_total": "served total (wait+duration)",
    }
    for key, label in labels.items():
        scores = result["metrics"][key]
        r2 = "n/a" if scores["r2"] is None else f"{scores['r2']:.4f}"
        print(
            f"{label:<28} {scores['mae_minutes']:8.2f} "
            f"{scores['rmse_minutes']:8.2f} {r2:>8}"
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Evaluate the saved Darshan time model.")
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL_PATH)
    parser.add_argument("--csv", type=Path, default=None)
    args = parser.parse_args(argv)
    try:
        result = evaluate(args.model, args.csv)
    except DatasetError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    _print_evaluation(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
