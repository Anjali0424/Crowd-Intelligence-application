"""DEV SAMPLE DATA - not real live Tirumala counts.

Seeds a handful of labelled crowd observations so the devotee map shows a
spread of colours (LOW / MODERATE / HIGH / CRITICAL) and at least one gray
``NO_DATA`` route while developing.

Run from the ``backend`` directory:

    python -m scripts.seed_crowd_demo

This is safe to re-run: it replaces only the observations it previously wrote
(identified by the ``DEV SAMPLE`` note) and never touches other data.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.database import SessionLocal  # noqa: E402
from app.database.models import CrowdObservation  # noqa: E402
from app.services.crowd_service import seed_defaults  # noqa: E402

NOTE = "DEV SAMPLE - not real live Tirumala data"

# spot_id -> (people_count, capacity)
SAMPLES = {
    "main-gate": (60, 300),      # 20% -> LOW
    "queue-area": (200, 250),    # 80% -> HIGH
    "darshan-area": (195, 200),  # 98% -> CRITICAL
    "exit-area": (95, 150),      # 63% -> MODERATE
    # gopuram / laddu-counter / vqc-1 stay empty -> gray NO_DATA routes.
}


def main() -> None:
    db = SessionLocal()
    try:
        seed_defaults(db)

        db.query(CrowdObservation).filter(
            CrowdObservation.notes == NOTE
        ).delete(synchronize_session=False)

        now = datetime.utcnow()
        for spot_id, (people, capacity) in SAMPLES.items():
            db.add(
                CrowdObservation(
                    spot_id=spot_id,
                    people_count=people,
                    capacity=capacity,
                    source="staff",
                    notes=NOTE,
                    observed_at=now,
                )
            )
        db.commit()
        print(f"Seeded {len(SAMPLES)} dev-sample observations at {now.isoformat()} UTC")
    finally:
        db.close()


if __name__ == "__main__":
    main()
