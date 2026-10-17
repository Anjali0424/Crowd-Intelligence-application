import unittest
from fastapi.testclient import TestClient
from app.main import app


class TestBarricadeApiEndpoints(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health(self):
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"status": "ok"})

    def test_list_barricade_cameras(self):
        res = self.client.get("/api/barricade/cameras")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("cameras", data)
        self.assertGreaterEqual(len(data["cameras"]), 5)

        # Check CAM-01 is present
        cam1 = next((c for c in data["cameras"] if c["camera_id"] == "CAM-01"), None)
        self.assertIsNotNone(cam1)
        self.assertEqual(cam1["gate_name"], "Main Entrance Barricade")
        self.assertEqual(cam1["direction_mode"], "top_to_bottom")

    def test_camera_counts_and_status(self):
        res = self.client.get("/api/barricade/cameras/CAM-01/counts")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["camera_id"], "CAM-01")
        self.assertIn("people_count", data)
        self.assertIn("entries_count", data)
        self.assertIn("exits_count", data)
        self.assertIn("current_inside", data)

    def test_update_gate_config(self):
        res = self.client.post(
            "/api/barricade/cameras/CAM-01/config",
            json={
                "line_y1": 0.65,
                "line_y2": 0.65,
                "max_occupancy": 18,
                "direction_mode": "top_to_bottom",
            },
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["config"]["max_occupancy"], 18)
        self.assertEqual(data["config"]["line_y1"], 0.65)

    def test_list_guards(self):
        res = self.client.get("/api/barricade/guards")
        self.assertEqual(res.status_code, 200)
        guards = res.json()["guards"]
        self.assertGreaterEqual(len(guards), 5)
        guard_ids = [g["id"] for g in guards]
        self.assertIn("STAFF-07", guard_ids)
        self.assertIn("STAFF-12", guard_ids)

    def test_events_and_acknowledgement(self):
        # 1. Fetch events
        res = self.client.get("/api/barricade/events")
        self.assertEqual(res.status_code, 200)
        self.assertIn("events", res.json())

    def test_update_guard_assignment(self):
        res = self.client.post(
            "/api/guards/assignments",
            json={
                "guard_id": "STAFF-07",
                "assigned_gate": "CAM-01",
                "on_duty": True,
            },
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["guard"]["id"], "STAFF-07")

    def test_temple_civic_video_registered(self):
        """Verifies CAM-TEMPLE (temple_civic_video.mp4) is present and resolves via pathlib."""
        from app.streaming.camera import video_path
        path = video_path("CAM-TEMPLE")
        self.assertIsNotNone(path)
        self.assertTrue(path.is_file())
        self.assertEqual(path.name, "temple_civic_video.mp4")

        res = self.client.get("/api/barricade/cameras")
        self.assertEqual(res.status_code, 200)
        cams = res.json()["cameras"]
        temple_cam = next((c for c in cams if c["camera_id"] == "CAM-TEMPLE"), None)
        self.assertIsNotNone(temple_cam)
        self.assertIn("temple_civic_video", temple_cam["gate_name"])

    def test_replay_endpoint(self):
        """Verifies the replay endpoint for demo videos."""
        res = self.client.post("/api/barricade/cameras/CAM-TEMPLE/replay")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("ok"))
        self.assertTrue(data.get("replayed"))


if __name__ == "__main__":
    unittest.main()
