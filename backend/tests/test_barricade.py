import unittest
import time
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database.database import Base
from app.database.models import BarricadeGateConfig, BarricadeSafetyEvent, SecurityGuard
from app.ai.counter import VirtualLineCounter
from app.ai.tracker import TrackedPerson
from app.ai.movement import SafetyRuleEngine
from app.services.barricade_service import seed_barricade_defaults


class TestBarricadeMonitoring(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        seed_barricade_defaults(self.db)

    def tearDown(self):
        self.db.close()

    def test_seed_defaults(self):
        """Verifies default barricade gates and guards are seeded properly."""
        guards = self.db.query(SecurityGuard).all()
        gates = self.db.query(BarricadeGateConfig).all()
        self.assertGreaterEqual(len(guards), 5)
        self.assertGreaterEqual(len(gates), 5)

        # Check CAM-01 gate config
        cam1 = self.db.query(BarricadeGateConfig).filter_by(id="CAM-01").first()
        self.assertIsNotNone(cam1)
        self.assertEqual(cam1.direction_mode, "top_to_bottom")
        self.assertEqual(cam1.max_occupancy, 15)

    def test_virtual_line_crossing_and_no_double_count(self):
        """Verifies people crossing the line are counted once and not double counted."""
        counter = VirtualLineCounter(
            line_norm=(0.1, 0.5, 0.9, 0.5),
            direction_mode="top_to_bottom",
            crossing_cooldown_sec=5.0,
        )

        frame_w, frame_h = 640, 480
        # Person 1 moving downward (y: 200 -> y: 280), crossing line at y=240
        person1 = TrackedPerson(
            track_id=1,
            bbox=(100, 260, 150, 310),
            centroid=(125, 285),
            conf=0.88,
            trajectory=[(125, 200), (125, 285)],
        )

        events1 = counter.update([person1], frame_w, frame_h)
        self.assertEqual(len(events1), 1)
        self.assertEqual(events1[0].track_id, 1)
        self.assertEqual(events1[0].direction, "ENTRY")
        self.assertEqual(counter.entries_count, 1)

        # In the next frame, person 1 continues moving (y: 285 -> y: 310). Should NOT double count!
        person1_next = TrackedPerson(
            track_id=1,
            bbox=(100, 285, 150, 335),
            centroid=(125, 310),
            conf=0.90,
            trajectory=[(125, 200), (125, 285), (125, 310)],
        )
        events2 = counter.update([person1_next], frame_w, frame_h)
        self.assertEqual(len(events2), 0)
        self.assertEqual(counter.entries_count, 1)

    def test_wrong_way_direction_detection(self):
        """Verifies movement against intended queue direction is flagged."""
        counter = VirtualLineCounter(
            line_norm=(0.1, 0.5, 0.9, 0.5),
            direction_mode="top_to_bottom",
        )
        frame_w, frame_h = 640, 480

        # Person 2 moving upward (y: 280 -> y: 200), against top_to_bottom flow
        person2 = TrackedPerson(
            track_id=2,
            bbox=(200, 180, 250, 230),
            centroid=(225, 205),
            conf=0.85,
            trajectory=[(225, 280), (225, 205)],
        )
        events = counter.update([person2], frame_w, frame_h)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].direction, "EXIT")
        self.assertTrue(events[0].is_wrong_way)
        self.assertEqual(counter.exits_count, 1)

    def test_safety_rule_overcrowding_and_cooldown(self):
        """Verifies overcrowding alert is generated only when limit exceeded, with cooldown."""
        engine = SafetyRuleEngine(
            camera_id="CAM-01",
            gate_name="Main Entrance Barricade",
            max_occupancy=3,
            cooldown_seconds=10,
        )

        # 2 people: Normal detection - NO alert should fire!
        normal_people = [
            TrackedPerson(track_id=1, bbox=(10, 10, 50, 50), centroid=(30, 30), conf=0.8),
            TrackedPerson(track_id=2, bbox=(60, 10, 100, 50), centroid=(80, 30), conf=0.8),
        ]
        candidates = engine.evaluate(normal_people, [])
        self.assertEqual(len(candidates), 0)

        # 4 people: Exceeds max_occupancy (3) - Alert SHOULD fire!
        crowded_people = normal_people + [
            TrackedPerson(track_id=3, bbox=(110, 10, 150, 50), centroid=(130, 30), conf=0.8),
            TrackedPerson(track_id=4, bbox=(160, 10, 200, 50), centroid=(180, 30), conf=0.8),
        ]
        candidates = engine.evaluate(crowded_people, [])
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0].event_type, "OVERCROWDING")
        self.assertEqual(candidates[0].severity, "CRITICAL")

        # Immediate next frame with same crowd - cooldown should prevent duplicate alert
        candidates2 = engine.evaluate(crowded_people, [])
        self.assertEqual(len(candidates2), 0)

    def test_safety_rule_blocked_exit(self):
        """Verifies persistent stationary people trigger blocked exit alert."""
        engine = SafetyRuleEngine(
            camera_id="CAM-01",
            gate_name="Main Entrance Barricade",
            blocked_exit_enabled=True,
            block_duration_sec=4.0,
            cooldown_seconds=10,
        )

        stationary_people = [
            TrackedPerson(track_id=1, bbox=(10, 10, 50, 50), centroid=(30, 30), conf=0.8, stationary_duration=5.5),
            TrackedPerson(track_id=2, bbox=(60, 10, 100, 50), centroid=(80, 30), conf=0.8, stationary_duration=6.0),
        ]
        candidates = engine.evaluate(stationary_people, [])
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0].event_type, "BLOCKED_EXIT")

    def test_event_lifecycle_acknowledge_and_resolve(self):
        """Verifies safety event transitions from PENDING -> ACKNOWLEDGED -> RESOLVED."""
        event = BarricadeSafetyEvent(
            id="EVT-TEST-001",
            camera_id="CAM-01",
            gate_name="Main Entrance Barricade",
            event_type="OVERCROWDING",
            severity="CRITICAL",
            title="Crowd Alert",
            reason="Exceeded limit",
            recommended_action="Hold gate",
            people_count=18,
            assigned_guard_id="STAFF-07",
            assigned_guard_name="Inspector K. Sharma",
            delivery_status="DELIVERED",
            status="PENDING",
        )
        self.db.add(event)
        self.db.commit()

        # Acknowledge
        event.status = "ACKNOWLEDGED"
        event.acknowledged_by = "Inspector K. Sharma"
        self.db.commit()
        self.assertEqual(event.status, "ACKNOWLEDGED")

        # Resolve
        event.status = "RESOLVED"
        event.resolved_by = "Admin Commander"
        event.notes = "Crowd dispersed safely"
        self.db.commit()
        self.assertEqual(event.status, "RESOLVED")
        self.assertEqual(event.resolved_by, "Admin Commander")


if __name__ == "__main__":
    unittest.main()
