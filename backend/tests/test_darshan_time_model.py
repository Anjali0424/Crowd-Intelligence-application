"""Tests for the CSV-trained Darshan time model and planned-arrival API.

Run from the backend directory:

    python -m unittest tests.test_darshan_time_model
"""

import hashlib
import os
import tempfile
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path

_TMP_DB = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_TMP_DB.close()
os.environ.setdefault("DARSHAN_DB_PATH", _TMP_DB.name)
os.environ.setdefault("DARSHAN_QUEUE_CAPACITY", "250")

from fastapi import HTTPException  # noqa: E402

from app.api import darshan as darshan_api  # noqa: E402
from app.database.database import SessionLocal, init_db  # noqa: E402
from ml.predict import (  # noqa: E402
    MODEL_PATH,
    ZONE,
    InvalidPredictionInput,
    ModelNotAvailable,
    build_success_response,
    clear_model_cache,
    features_from_arrival,
    predict_for_request,
    resolve_arrival,
)
from ml.train_model import (  # noqa: E402
    DatasetError,
    find_dataset,
    load_dataset,
    train_and_save,
)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


_STATE = {}


def setUpModule():
    init_db()
    folder = tempfile.TemporaryDirectory()
    model_path = Path(folder.name) / "darshan_time_model.joblib"
    csv_path = find_dataset()
    _STATE["folder"] = folder
    _STATE["model_path"] = model_path
    _STATE["csv_path"] = csv_path
    _STATE["csv_hash"] = _sha256(csv_path)
    _STATE["metadata"] = train_and_save(csv_path, model_path)
    clear_model_cache()


def tearDownModule():
    clear_model_cache()
    folder = _STATE.get("folder")
    if folder is not None:
        folder.cleanup()


class DatasetValidationTests(unittest.TestCase):
    def test_real_csv_schema_and_source(self):
        path = find_dataset()
        frame, report = load_dataset(path)
        self.assertEqual(path.name, "tirupati_darshan_prediction_sample.csv")
        self.assertEqual(len(frame), 724)
        self.assertEqual(report["rows"], 724)
        self.assertEqual(report["data_sources"], ["SYNTHETIC_DEMO_NOT_REAL_TIRUMALA_DATA"])
        self.assertEqual(report["data_quality"], "demo")
        self.assertEqual(report["date_min"], "2026-01-01")
        self.assertEqual(report["date_max"], "2026-06-30")
        self.assertEqual(report["null_count"], 0)
        self.assertIn("Sarva Darshan", report["darshan_types"])

    def test_missing_csv_is_a_clear_error(self):
        missing = Path(tempfile.gettempdir()) / "darshan-missing-dataset.csv"
        if missing.exists():
            missing.unlink()
        with self.assertRaises(DatasetError) as caught:
            load_dataset(missing)
        self.assertIn("Dataset not found", str(caught.exception))

    def test_invalid_schema_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "bad.csv"
            path.write_text("record_id,date\n1,2026-01-01\n", encoding="utf-8")
            with self.assertRaises(DatasetError) as caught:
                load_dataset(path)
        self.assertIn("missing columns", str(caught.exception))

    def test_inconsistent_duration_is_rejected(self):
        source, _report = load_dataset()
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "inconsistent.csv"
            broken = source.copy()
            broken.loc[broken.index[0], "total_time_minutes"] = (
                int(broken.loc[broken.index[0], "queue_wait_minutes"])
                + int(broken.loc[broken.index[0], "darshan_duration_minutes"])
                + 5
            )
            broken.to_csv(path, index=False)
            with self.assertRaises(DatasetError) as caught:
                load_dataset(path)
        self.assertIn("total_time_minutes", str(caught.exception))


class TrainingTests(unittest.TestCase):
    def test_training_saves_artifact_without_changing_csv(self):
        model_path = _STATE["model_path"]
        self.assertTrue(model_path.is_file())
        self.assertTrue(model_path.with_name(model_path.stem + "_meta.json").is_file())
        self.assertEqual(_sha256(_STATE["csv_path"]), _STATE["csv_hash"])
        self.assertEqual(_STATE["metadata"]["data_quality"], "demo")
        metadata = _STATE["metadata"]
        self.assertEqual(metadata["model_label"], "demonstration model")
        self.assertIn("queue_wait_minutes", metadata["metrics"])
        self.assertIn("darshan_duration_minutes", metadata["metrics"])
        self.assertIn("total_time_minutes", metadata["metrics"])
        self.assertIn("mae_minutes", metadata["metrics"]["queue_wait_minutes"])
        self.assertIn("rmse_minutes", metadata["metrics"]["queue_wait_minutes"])
        self.assertGreater(metadata["split"]["test_rows"], 0)
        self.assertGreater(metadata["split"]["train_rows"], metadata["split"]["test_rows"])

    def test_selected_time_is_a_model_input(self):
        morning = features_from_arrival(
            datetime(2026, 10, 26, 10, 15, tzinfo=ZONE),
            "Sarva Darshan",
        )
        evening = features_from_arrival(
            datetime(2026, 10, 26, 20, 15, tzinfo=ZONE),
            "Sarva Darshan",
        )
        self.assertEqual(int(morning["arrival_hour_24h"].iloc[0]), 10)
        self.assertEqual(int(evening["arrival_hour_24h"].iloc[0]), 20)
        self.assertEqual(morning["day_of_week"].iloc[0], "Monday")
        self.assertEqual(int(morning["is_weekend"].iloc[0]), 0)

        saturday = features_from_arrival(
            datetime(2026, 10, 31, 10, 0, tzinfo=ZONE),
            "Divya Darshan",
        )
        self.assertEqual(saturday["day_of_week"].iloc[0], "Saturday")
        self.assertEqual(int(saturday["is_weekend"].iloc[0]), 1)
        self.assertEqual(saturday["darshan_type"].iloc[0], "Divya Darshan")

    def test_inference_uses_selected_hour_and_returns_fields(self):
        morning = predict_for_request(
            "10:15",
            "Sarva Darshan",
            arrival_date=date(2026, 10, 26),
            model_path=_STATE["model_path"],
        )
        evening = predict_for_request(
            "20:15",
            "Sarva Darshan",
            arrival_date=date(2026, 10, 26),
            model_path=_STATE["model_path"],
        )
        for result, hour in ((morning, 10), (evening, 20)):
            self.assertTrue(result["available"])
            self.assertEqual(result["prediction_source"], "trained_model")
            self.assertEqual(result["data_quality"], "demo")
            self.assertEqual(result["model_version"], "1.0")
            self.assertEqual(result["features_used"]["arrival_hour_24h"], hour)
            self.assertGreaterEqual(result["queue_wait_minutes"], 0)
            self.assertGreaterEqual(result["darshan_duration_minutes"], 0)
            self.assertEqual(
                result["total_time_minutes"],
                result["queue_wait_minutes"] + result["darshan_duration_minutes"],
            )
            self.assertEqual(
                result["total_time_hours"],
                round(result["total_time_minutes"] / 60.0, 2),
            )
            self.assertIn("synthetic", result["demo_warning"])
        self.assertEqual(morning["arrival_time"], "10:15")
        self.assertEqual(evening["arrival_time"], "20:15")
        self.assertNotEqual(
            morning["queue_wait_minutes"],
            evening["queue_wait_minutes"],
        )

    def test_expected_completion_crosses_midnight(self):
        arrival = datetime(2026, 10, 26, 23, 50, tzinfo=ZONE)
        result = build_success_response(
            arrival,
            queue_wait=20,
            duration=15,
            metadata={"model_version": "1.0", "data_quality": "demo"},
            darshan_type="Sarva Darshan",
        )
        self.assertEqual(result["expected_completion"], "00:25")
        self.assertEqual(result["expected_completion_date"], "2026-10-27")
        self.assertTrue(result["crosses_midnight"])
        self.assertEqual(result["total_time_minutes"], 35)

    def test_negative_predictions_are_clipped(self):
        arrival = datetime(2026, 10, 26, 10, 0, tzinfo=ZONE)
        result = build_success_response(
            arrival,
            queue_wait=-8,
            duration=-1,
            metadata={"model_version": "1.0", "data_quality": "demo"},
            darshan_type="Sarva Darshan",
        )
        self.assertEqual(result["queue_wait_minutes"], 0)
        self.assertEqual(result["darshan_duration_minutes"], 0)
        self.assertEqual(result["total_time_minutes"], 0)

    def test_omitted_date_rolls_to_the_next_day_after_the_clock_time(self):
        now = datetime(2026, 10, 26, 15, 0, tzinfo=ZONE)
        self.assertEqual(resolve_arrival("10:00", None, now).date(), date(2026, 10, 27))
        self.assertEqual(resolve_arrival("16:00", None, now).date(), date(2026, 10, 26))
        self.assertEqual(
            resolve_arrival("10:00", date(2026, 10, 26), now).date(),
            date(2026, 10, 26),
        )

    def test_invalid_darshan_type_and_time(self):
        with self.assertRaises(InvalidPredictionInput):
            predict_for_request(
                "10:00",
                "Not A Real Darshan",
                arrival_date=date(2026, 10, 26),
                model_path=_STATE["model_path"],
            )
        with self.assertRaises(InvalidPredictionInput):
            predict_for_request(
                "25:00",
                "Sarva Darshan",
                model_path=_STATE["model_path"],
            )

    def test_unsupported_hour_is_unavailable(self):
        result = predict_for_request(
            "01:00",
            "Sarva Darshan",
            arrival_date=date(2026, 10, 26),
            model_path=_STATE["model_path"],
        )
        self.assertFalse(result["available"])
        self.assertEqual(result["reason"], "unsupported_arrival_hour")
        self.assertIsNone(result["total_time_minutes"])

    def test_missing_model_artifact(self):
        missing = _STATE["model_path"].parent / "missing.joblib"
        with self.assertRaises(ModelNotAvailable):
            predict_for_request(
                "10:00",
                "Sarva Darshan",
                model_path=missing,
            )


class PlannedArrivalApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls._original_model_path = MODEL_PATH
        cls.model_path = _STATE["model_path"]
        import ml.predict as predict_module

        predict_module.MODEL_PATH = cls.model_path
        clear_model_cache()

    @classmethod
    def tearDownClass(cls):
        import ml.predict as predict_module

        predict_module.MODEL_PATH = cls._original_model_path
        clear_model_cache()

    def test_existing_queue_prediction_contract_is_unchanged(self):
        import app.services.darshan_service as svc

        previous = svc.MODEL_PATH
        svc.MODEL_PATH = _STATE["model_path"].parent / "no-queue-baseline-model.joblib"
        db = SessionLocal()
        try:
            body = darshan_api.PredictIn(
                queue_population=100,
                people_inside=50,
                processing_rate_per_hour=200,
                use_live=False,
                persist=False,
            )
            result = darshan_api.predict(body, db)
        finally:
            db.close()
            svc.MODEL_PATH = previous
        self.assertTrue(result["available"])
        self.assertEqual(result["method"], "queue-baseline")
        self.assertIn("wait_minutes", result)
        self.assertIn("total_minutes", result)
        self.assertNotIn("queue_wait_minutes", result)
        self.assertAlmostEqual(result["wait_minutes"], 30.0)

    def test_frontend_payload_reaches_the_model(self):
        db = SessionLocal()
        try:
            body = darshan_api.PredictIn(
                arrival_time="10:30",
                darshan_type="Sarva Darshan",
                arrival_date=date(2026, 10, 26),
                use_live=False,
                persist=False,
            )
            result = darshan_api.predict(body, db)
        finally:
            db.close()
        self.assertTrue(result["available"])
        self.assertEqual(result["arrival_time"], "10:30")
        self.assertEqual(result["features_used"]["arrival_hour_24h"], 10)
        self.assertEqual(result["darshan_type"], "Sarva Darshan")
        self.assertEqual(result["prediction_source"], "trained_model")
        arrival = datetime(2026, 10, 26, 10, 30, tzinfo=ZONE)
        completion = arrival + timedelta(minutes=result["total_time_minutes"])
        self.assertEqual(completion.strftime("%H:%M"), result["expected_completion"])
        self.assertEqual(
            completion.date().isoformat(),
            result["expected_completion_date"],
        )

    def test_api_errors_for_invalid_and_missing_inputs(self):
        db = SessionLocal()
        try:
            with self.assertRaises(HTTPException) as missing_type:
                darshan_api.predict(
                    darshan_api.PredictIn(arrival_time="10:00", use_live=False),
                    db,
                )
            self.assertEqual(missing_type.exception.status_code, 422)

            with self.assertRaises(HTTPException) as bad_time:
                darshan_api.predict(
                    darshan_api.PredictIn(
                        arrival_time="not-a-time",
                        darshan_type="Sarva Darshan",
                    ),
                    db,
                )
            self.assertEqual(bad_time.exception.status_code, 422)

            with self.assertRaises(HTTPException) as bad_type:
                darshan_api.predict(
                    darshan_api.PredictIn(
                        arrival_time="10:00",
                        darshan_type="Unknown Darshan",
                    ),
                    db,
                )
            self.assertEqual(bad_type.exception.status_code, 422)
        finally:
            db.close()

    def test_api_missing_model_returns_503(self):
        import ml.predict as predict_module

        previous = predict_module.MODEL_PATH
        predict_module.MODEL_PATH = Path(self.model_path.parent) / "absent.joblib"
        clear_model_cache()
        db = SessionLocal()
        try:
            with self.assertRaises(HTTPException) as caught:
                darshan_api.predict(
                    darshan_api.PredictIn(
                        arrival_time="10:00",
                        darshan_type="Sarva Darshan",
                        arrival_date=date(2026, 10, 26),
                    ),
                    db,
                )
            self.assertEqual(caught.exception.status_code, 503)
        finally:
            db.close()
            predict_module.MODEL_PATH = previous
            clear_model_cache()


if __name__ == "__main__":
    unittest.main()
