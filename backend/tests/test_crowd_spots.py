"""Tests for spot-wise crowd classification and map payloads.

Run with:  python -m unittest tests.test_crowd_spots
(No third-party test runner is required.)
"""

import os
import tempfile
import unittest
from datetime import datetime, timedelta

# Point the database at a throwaway file *before* importing the app modules.
_TMP_DB = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_TMP_DB.close()
os.environ["DARSHAN_DB_PATH"] = _TMP_DB.name

from app.database.database import SessionLocal, init_db  # noqa: E402
from app.database.models import CrowdObservation, CrowdPath, CrowdSpot  # noqa: E402
from app.services import crowd_service as svc  # noqa: E402


class ClassificationTests(unittest.TestCase):
    def test_boundaries(self):
        self.assertEqual(svc.classify_crowd(0, 300)["level"], "LOW")
        self.assertEqual(svc.classify_crowd(120, 300)["level"], "LOW")
        self.assertEqual(svc.classify_crowd(150, 300)["level"], "MODERATE")
        self.assertEqual(svc.classify_crowd(213, 300)["level"], "HIGH")
        self.assertEqual(svc.classify_crowd(270, 300)["level"], "HIGH")
        self.assertEqual(svc.classify_crowd(273, 300)["level"], "CRITICAL")
        self.assertEqual(svc.classify_crowd(300, 300)["level"], "CRITICAL")

    def test_density_matches_level(self):
        for people in range(0, 301, 7):
            result = svc.classify_crowd(people, 300)
            expected = svc.classify_crowd(result["density_percent"], 100)["level"]
            self.assertEqual(result["level"], expected)

    def test_unknown_capacity_is_no_data(self):
        result = svc.classify_crowd(50, None)
        self.assertEqual(result["level"], "NO_DATA")
        self.assertIsNone(result["density_percent"])
        self.assertEqual(result["color"], "#9CA3AF")
        self.assertEqual(result["people_count"], 50)

    def test_invalid_inputs(self):
        self.assertEqual(svc.classify_crowd(None, 100)["level"], "NO_DATA")
        self.assertEqual(svc.classify_crowd(-5, 100)["level"], "NO_DATA")
        self.assertEqual(svc.classify_crowd(5, 0)["level"], "NO_DATA")


class MapPayloadTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    def setUp(self):
        db = SessionLocal()
        db.query(CrowdObservation).delete()
        db.query(CrowdPath).delete()
        db.query(CrowdSpot).delete()
        db.commit()
        svc.seed_defaults(db)
        db.close()

    def test_seed_is_idempotent(self):
        db = SessionLocal()
        svc.seed_defaults(db)
        self.assertEqual(db.query(CrowdSpot).count(), len(svc.DEFAULT_SPOTS))
        self.assertEqual(db.query(CrowdPath).count(), len(svc.DEFAULT_PATHS))
        db.close()

    def test_no_observation_is_no_data(self):
        db = SessionLocal()
        payload = svc.build_map_payload(db, resolve_geometry=False)
        db.close()
        self.assertTrue(all(s["level"] == "NO_DATA" for s in payload["spots"]))
        self.assertTrue(all(p["level"] == "NO_DATA" for p in payload["paths"]))

    def test_observation_sets_spot_and_path_levels(self):
        db = SessionLocal()
        db.add(
            CrowdObservation(
                spot_id="main-gate", people_count=270, capacity=300, source="staff"
            )
        )
        db.commit()
        payload = svc.build_map_payload(db, resolve_geometry=False)
        db.close()

        by_id = {s["id"]: s for s in payload["spots"]}
        self.assertEqual(by_id["main-gate"]["level"], "HIGH")
        self.assertEqual(by_id["main-gate"]["density_percent"], 90)
        self.assertTrue(by_id["main-gate"]["has_data"])
        self.assertEqual(by_id["queue-area"]["level"], "NO_DATA")

        paths = {p["id"]: p for p in payload["paths"]}
        self.assertEqual(paths["p-gate-queue"]["level"], "HIGH")
        self.assertEqual(paths["p-darshan-exit"]["level"], "NO_DATA")

    def test_stale_observation_is_no_data(self):
        db = SessionLocal()
        old = datetime.utcnow() - timedelta(minutes=svc._stale_minutes() + 5)
        db.add(
            CrowdObservation(
                spot_id="main-gate",
                people_count=280,
                capacity=300,
                source="staff",
                observed_at=old,
            )
        )
        db.commit()
        payload = svc.build_map_payload(db, resolve_geometry=False)
        db.close()

        spot = {s["id"]: s for s in payload["spots"]}["main-gate"]
        self.assertTrue(spot["stale"])
        self.assertFalse(spot["has_data"])
        self.assertEqual(spot["level"], "NO_DATA")


if __name__ == "__main__":
    unittest.main()
