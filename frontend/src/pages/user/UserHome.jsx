import { useNavigate } from "react-router-dom";

import { homeMockData } from "../../data/mockHomeData";

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

  const crowd = homeMockData.crowd;

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
            {crowd.dot} {crowd.label}
          </span>
        </div>

        <div className="live-crowd-body">
          <h2>{crowd.area}</h2>
          <p>{crowd.note}</p>
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
