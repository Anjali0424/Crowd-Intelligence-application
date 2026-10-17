import { useNavigate } from "react-router-dom";

import StatCard from "../../components/admin/StatCard";
import { mockAdminData } from "../../data/mockAdminData";

function AdminDashboard() {
  const navigate = useNavigate();

  const d = mockAdminData;

  return (
    <div className="admin-home">

      {/* Top Status Cards */}
      <section className="stat-grid">
        <StatCard
          icon="👥"
          label="LIVE CROWD"
          value={d.crowd.totalPeople.toLocaleString()}
          status={`🔴 ${d.crowd.level}`}
          tone="high"
          note={`${d.crowd.attentionZones} zones need attention`}
        />

        <StatCard
          icon="📹"
          label="CAMERAS"
          value={`${d.cameras.online} / ${d.cameras.total}`}
          status="🟢 ONLINE"
          tone="low"
          note="All feeds active"
        />

        <StatCard
          icon="🚨"
          label="ACTIVE ALERTS"
          value={d.alerts.active}
          status={`${d.alerts.critical} Critical`}
          tone="critical"
          note="Civic sense monitoring"
        />

        <StatCard
          icon="🔮"
          label="AI FORECAST"
          value={d.prediction.predictedCount.toLocaleString()}
          status={`${d.prediction.targetTime} · MOCK`}
          tone="moderate"
          note={`Confidence ${d.prediction.confidence}% · mock prediction`}
        />
      </section>

      {/* Command Modules */}
      <section className="modules-section">
        <h3 className="section-title">Command Modules</h3>

        <div className="adm-modules">

          {/* 1 — Live Crowd Intelligence */}
          <button
            type="button"
            className="adm-module adm-module-compact"
            onClick={() => navigate("/admin/crowd")}
          >
            <span className="adm-module-icon">👥</span>
            <h4>Live Crowd Intelligence</h4>
          </button>

          {/* 2 — Camera Monitoring */}
          <button
            type="button"
            className="adm-module adm-module-compact"
            onClick={() => navigate("/admin/cameras")}
          >
            <span className="adm-module-icon">📹</span>
            <h4>Camera Monitoring</h4>
          </button>

          {/* AI Barricade Monitoring (New) */}
          <button
            type="button"
            className="adm-module adm-module-compact module-highlight"
            onClick={() => navigate("/admin/barricade")}
          >
            <span className="adm-module-icon">🚧</span>
            <h4>AI Barricade Monitoring</h4>
          </button>

          {/* 3 — Temple Crowd Map */}
          <button
            type="button"
            className="adm-module adm-module-compact"
            onClick={() => navigate("/admin/map")}
          >
            <span className="adm-module-icon">🗺️</span>
            <h4>Temple Crowd Map</h4>
          </button>

          {/* 4 — AI Crowd Prediction */}
          <button
            type="button"
            className="adm-module adm-module-compact"
            onClick={() => navigate("/admin/prediction")}
          >
            <span className="adm-module-icon">🔮</span>
            <h4>AI Crowd Prediction</h4>
          </button>

          {/* 5 — Hourly Crowd Forecast (New) */}
          <button
            type="button"
            className="adm-module adm-module-compact"
            onClick={() => navigate("/admin/hourly-crowd")}
          >
            <span className="adm-module-icon">🕒</span>
            <h4>Hourly Crowd Forecast</h4>
          </button>

          {/* 6 — Civic Sense Intelligence */}
          <button
            type="button"
            className="adm-module adm-module-compact module-highlight"
            onClick={() => navigate("/admin/civic-sense")}
          >
            <span className="adm-module-icon icon-alert">🚨</span>
            <h4>Civic Sense Intelligence</h4>
          </button>

          {/* 7 — Staff Assignment */}
          <button
            type="button"
            className="adm-module adm-module-compact"
            onClick={() => navigate("/admin/staff")}
          >
            <span className="adm-module-icon">👮</span>
            <h4>Staff Assignment</h4>
          </button>

          {/* 8 — Entry / Exit Monitoring */}
          <button
            type="button"
            className="adm-module adm-module-compact"
            onClick={() => navigate("/admin/entry-exit")}
          >
            <span className="adm-module-icon">🚪</span>
            <h4>Entry / Exit Monitoring</h4>
          </button>

          {/* 9 — Emergency Resources */}
          <button
            type="button"
            className="adm-module adm-module-compact"
            onClick={() => navigate("/admin/resources")}
          >
            <span className="adm-module-icon">🚑</span>
            <h4>Emergency Resources</h4>
          </button>

          {/* 10 — Analytics & Reports */}
          <button
            type="button"
            className="adm-module adm-module-compact"
            onClick={() => navigate("/admin/analytics")}
          >
            <span className="adm-module-icon">📊</span>
            <h4>Analytics &amp; Reports</h4>
          </button>

        </div>
      </section>
    </div>
  );
}

export default AdminDashboard;