"""Tests for the Darshan prediction engine.

Run with:  python -m unittest discover -s tests -p "test_*.py"
(No third-party test runner is required.)
"""

import os
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

# Point the database at a throwaway file *before* importing the app modules.
_TMP_DB = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_TMP_DB.close()
os.environ["DARSHAN_DB_PATH"] = _TMP_DB.name
os.environ["DARSHAN_QUEUE_CAPACITY"] = "250"

from app.database.database import SessionLocal, init_db  # noqa: E402
from app.database.models import DarshanRecord  # noqa: E402
from app.api import darshan as darshan_api  # noqa: E402
from app.services import darshan_service as svc  # noqa: E402


class PredictionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls._tmp_models = tempfile.mkdtemp()
        svc.MODEL_DIR = Path(cls._tmp_models)
        svc.MODEL_PATH = Path(cls._tmp_models) / "model.joblib"

    def setUp(self):
        db = SessionLocal()
        db.query(DarshanRecord).delete()
        db.commit()
        db.close()

    def test_normalize_slot(self):
        self.assertEqual(darshan_api.normalize_slot("8:00 AM"), "08:00")
        self.assertEqual(darshan_api.normalize_slot("4:00 PM"), "16:00")
        self.assertEqual(darshan_api.normalize_slot("12:00 AM"), "00:00")
        self.assertEqual(darshan_api.normalize_slot("12:30 PM"), "12:30")
        self.assertEqual(darshan_api.normalize_slot("14:05"), "14:05")
        with self.assertRaises(ValueError):
            darshan_api.normalize_slot("not-a-time")

    def test_crowd_levels(self):
        self.assertEqual(svc.crowd_level_from_density(10), "LOW")
        self.assertEqual(svc.crowd_level_from_density(50), "MODERATE")
        self.assertEqual(svc.crowd_level_from_density(80), "HIGH")
        self.assertEqual(svc.crowd_level_from_density(95), "CRITICAL")

    def test_baseline_math(self):
        result = svc.baseline_predict(
            queue_population=100,
            people_inside=100,
            processing_rate=250,
            entry_rate=None,
            observed_darshan_avg=None,
        )
        self.assertTrue(result["available"])
        self.assertAlmostEqual(result["wait_minutes"], 24.0)
        self.assertAlmostEqual(result["darshan_minutes"], 24.0)
        self.assertAlmostEqual(result["total_minutes"], 48.0)

    def test_baseline_growing_queue(self):
        result = svc.baseline_predict(
            queue_population=100,
            people_inside=50,
            processing_rate=100,
            entry_rate=150,
            observed_darshan_avg=None,
        )
        self.assertEqual(result["queue_trend"], "increasing")

    def test_predict_without_rate_is_unavailable(self):
        db = SessionLocal()
        try:
            result = svc.predict(db, queue=50, people_inside=20, persist=False)
            self.assertFalse(result["available"])
            self.assertIn("processing_rate", result["missing"])
        finally:
            db.close()

    def test_predict_with_explicit_rate(self):
        db = SessionLocal()
        try:
            result = svc.predict(
                db,
                queue=100,
                people_inside=100,
                processing_rate=250,
                persist=False,
            )
            self.assertTrue(result["available"])
            self.assertEqual(result["method"], "queue-baseline")
            self.assertAlmostEqual(result["wait_minutes"], 24.0)
            self.assertAlmostEqual(result["total_minutes"], 48.0)
            self.assertEqual(result["crowd_level"], "MODERATE")
            self.assertIn("expected_completion", result)
        finally:
            db.close()

    def test_train_requires_enough_records(self):
        db = SessionLocal()
        try:
            metrics = svc.train_model(db)
            self.assertFalse(metrics["trained"])
            self.assertEqual(metrics["reason"], "insufficient_data")
        finally:
            db.close()

    def test_train_and_predict_combined(self):
        db = SessionLocal()
        try:
            base = date.today() - timedelta(days=40)
            for i in range(40):
                rate = 100 + (i % 5) * 20
                queue = 50 + (i % 10) * 10
                row = DarshanRecord(
                    record_date=base + timedelta(days=i),
                    slot_time=f"{8 + (i % 10):02d}:00",
                    source="historical",
                    queue_population=queue,
                    people_inside=queue // 2,
                    completed_per_hour=rate,
                    passes_issued=queue * 2,
                    actual_entries=queue,
                    camera_count=queue,
                    observed_wait_minutes=round(queue / rate * 60),
                    observed_darshan_minutes=20,
                )
                db.add(row)
            db.commit()

            metrics = svc.train_model(db)
            self.assertTrue(metrics["trained"])
            self.assertIn("mae_minutes", metrics)
            self.assertGreater(metrics["records"], 0)

            result = svc.predict(
                db,
                queue=100,
                people_inside=50,
                processing_rate=200,
                persist=False,
            )
            self.assertTrue(result["available"])
            self.assertIn(result["method"], ("combined", "historical-ml", "queue-baseline"))
            self.assertIsNotNone(result["total_minutes"])
        finally:
            db.close()

    def test_upsert_record_endpoint(self):
        db = SessionLocal()
        try:
            payload = darshan_api.RecordIn(
                slot_time="9:00 AM",
                passes_issued=1000,
                actual_entries=800,
                queue_population=120,
                completed_per_hour=240,
                observed_wait_minutes=30,
            )
            first = darshan_api.upsert_record(payload, db=db, _admin=None)
            self.assertTrue(first["created"])
            self.assertEqual(first["record"]["slot_time"], "09:00")

            payload2 = darshan_api.RecordIn(
                slot_time="09:00",
                actual_entries=850,
            )
            second = darshan_api.upsert_record(payload2, db=db, _admin=None)
            self.assertFalse(second["created"])
            self.assertEqual(second["record"]["actual_entries"], 850)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
