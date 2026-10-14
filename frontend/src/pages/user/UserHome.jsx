import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { homeMockData } from "../../data/mockHomeData";
import { getCameraCounts } from "../../services/crowdService";

const LEVEL_META = {
  LOW: { label: "LOW", dot: "🟢" },
  MODERATE: { label: "MODERATE", dot: "🟡" },
  HIGH: { label: "HIGH", dot: "🟠" },
  CRITICAL: { label: "CRITICAL", dot: "🔴" },
};

function levelFromDensity(density) {
  if (density == null) return null;
  if (density >= 91) return "CRITICAL";
  if (density >= 71) return "HIGH";
  if (density >= 41) return "MODERATE";
  return "LOW";
}

const modules = [
  {
    id: "location",
    icon: "📍",
    title: "My Location & Path",
    detail: homeMockData.location.note,
    to: "/user/navigation",
  },
  {
    id: "map",
    icon: "🗺️",
    title: "Temple Map",
    detail: homeMockData.map.path,
    to: "/user/map",
  },
  {
    id: "route",
    icon: "🧭",
    title: "Recommended Route",
    detail: `${homeMockData.route.time} • ${homeMockData.route.crowd}`,
    to: "/user/route",
  },
  {
    id: "entries",
    icon: "🚪",
    title: "Entry Points",
    detail: `${homeMockData.entry.name} — ${homeMockData.entry.crowd}`,
    to: "/user/entries",
  },
  {
    id: "exits",
    icon: "🚪",
    title: "Exit Points",
    detail: `${homeMockData.exit.name} — ${homeMockData.exit.crowd}`,
    to: "/user/exits",
  },
  {
    id: "alerts",
    icon: "🚨",
    title: "Safety Alerts",
    detail: homeMockData.alert.text,
    to: "/user/alerts",
    badge: true,
  },
];

function UserHome() {
  const navigate = useNavigate();

  const [crowd, setCrowd] = useState(null);

  useEffect(() => {
    let mounted = true;
    let timer;

    async function load() {
      try {
        const res = await getCameraCounts();
        if (!mounted) return;
        const zones = {};
        for (const camera of res.cameras || []) {
          if (!camera.zone_id || !(camera.available && camera.has_count)) {
            continue;
          }
          const capacity = camera.capacity || 0;
          const density = capacity
            ? Math.round(((camera.people_count || 0) / capacity) * 100)
            : 0;
          const current = zones[camera.zone_id];
          if (!current || density > current.density) {
            zones[camera.zone_id] = {
              area: camera.zone_name,
              people: camera.people_count || 0,
              capacity,
              density,
            };
          }
        }
        const busiest = Object.values(zones).sort(
          (a, b) => b.density - a.density
        )[0];
        setCrowd(
          busiest
            ? { ...busiest, level: levelFromDensity(busiest.density) }
            : null
        );
      } catch (err) {
        if (mounted) setCrowd(null);
      }
    }

    load();
    timer = setInterval(load, 1500);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const meta = crowd?.level ? LEVEL_META[crowd.level] : null;

  return (
    <div className="user-home">
      {/* Greeting */}
      <section className="greeting">
        <h1>Good Morning 🙏</h1>
        <p>Your smart guide for a safer and smoother darshan.</p>
      </section>

      {/* Live Crowd Feature Card */}
      <section
        className="live-crowd-card"
        role="button"
        tabIndex={0}
        onClick={() => navigate("/user/crowd")}
        onKeyDown={(e) => {
          if (e.key === "Enter") navigate("/user/crowd");
        }}
      >
        <div className="live-crowd-top">
          <span className="live-crowd-label">LIVE CROWD</span>
          <span className="live-crowd-status">
            {meta ? `${meta.dot} ${meta.label}` : "⚪ NO DATA"}
          </span>
        </div>

        <div className="live-crowd-body">
          <h2>{crowd?.area || "No live data"}</h2>
          <p>
            {crowd
              ? `${crowd.people}/${crowd.capacity} people • ${crowd.density}% full`
              : "Counting not active"}
          </p>
        </div>

        <div className="live-crowd-action">View Crowd →</div>
      </section>

      {/* Smart Navigation */}
      <section className="modules-section">
        <h3 className="section-title">Smart Navigation</h3>

        <div className="module-grid">
          {modules.map((module) => (
            <button
              key={module.id}
              className="module-card"
              onClick={() => navigate(module.to)}
            >
              <div className="module-icon">{module.icon}</div>

              <h4 className="module-title">{module.title}</h4>

              <p className="module-detail">{module.detail}</p>

              <span className="module-arrow">→</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export default UserHome;
