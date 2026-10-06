import { useNavigate } from "react-router-dom";

import StatCard from "../../components/admin/StatCard";
import { mockAdminData } from "../../data/mockAdminData";

const lvlClass = (level) => `lvl lvl-${level.toLowerCase()}`;

function AdminDashboard() {
  const navigate = useNavigate();

  const d = mockAdminData;

  const availableStaff = d.staff.filter((s) => s.status === "AVAILABLE").length;
  const busyStaff = d.staff.filter((s) => s.status === "BUSY").length;
  const assignedStaff = d.staff.filter((s) => s.status === "ASSIGNED").length;

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
            className="adm-module"
            onClick={() => navigate("/admin/crowd")}
          >
            <div className="adm-module-head">
              <span className="adm-module-icon">👥</span>
              <div className="adm-module-titles">
                <h4>Live Crowd Intelligence</h4>
                <p>Real-time crowd density, movement and zone data</p>
              </div>
              <span className="adm-module-arrow">→</span>
            </div>

            <div className="adm-module-body">
              <span className="chip-row">
                <b>{d.crowd.totalPeople.toLocaleString()} people</b>
                <span className={lvlClass(d.crowd.level)}>
                  🔴 {d.crowd.level}
                </span>
              </span>
              <span className="module-hint">
                {d.crowd.attentionZones} zones require attention · trend:{" "}
                {d.crowd.trend}
              </span>
            </div>
          </button>

          {/* 2 — Camera Monitoring */}
          <button
            className="adm-module"
            onClick={() => navigate("/admin/cameras")}
          >
            <div className="adm-module-head">
              <span className="adm-module-icon">📹</span>
              <div className="adm-module-titles">
                <h4>Camera Monitoring</h4>
                <p>CCTV feeds across every zone of the temple</p>
              </div>
              <span className="adm-module-arrow">→</span>
            </div>

            <div className="adm-module-body">
              <span className="chip-row">
                <b>
                  {d.cameras.online} / {d.cameras.total} Online
                </b>
              </span>

              <div className="cam-mini-list">
                {d.cameras.list
                  .filter((c) =>
                    ["CAM-01", "CAM-02", "CAM-07", "CAM-09"].includes(c.id)
                  )
                  .map((c) => (
                    <span
                      key={c.id}
                      className={`cam-mini ${
                        c.status === "ALERT" ? "is-alert" : "is-online"
                      }`}
                    >
                      {c.id} {c.status === "ALERT" ? "🔴" : "🟢"}
                    </span>
                  ))}
              </div>
            </div>
          </button>

          {/* 3 — Temple Crowd Map */}
          <button
            className="adm-module"
            onClick={() => navigate("/admin/map")}
          >
            <div className="adm-module-head">
              <span className="adm-module-icon">🗺️</span>
              <div className="adm-module-titles">
                <h4>Temple Crowd Map</h4>
                <p>View crowd density across the complete temple</p>
              </div>
              <span className="adm-module-arrow">→</span>
            </div>

            <div className="adm-module-body">
              <div className="map-schematic">
                {d.mapZones.map((zone, i) => (
                  <span key={zone.name} className="map-schematic-line">
                    <span className={`map-node ${lvlClass(zone.level)}`}>
                      {zone.name}{" "}
                      {zone.level === "LOW"
                        ? "🟢"
                        : zone.level === "MODERATE"
                        ? "🟡"
                        : "🔴"}
                    </span>
                    {i < d.mapZones.length - 1 && (
                      <span className="map-down">↓</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </button>

          {/* 4 — AI Crowd Prediction */}
          <button
            className="adm-module"
            onClick={() => navigate("/admin/prediction")}
          >
            <div className="adm-module-head">
              <span className="adm-module-icon">🔮</span>
              <div className="adm-module-titles">
                <h4>AI Crowd Prediction</h4>
                <p>Forecast of crowd for the next hours</p>
              </div>
              <span className="adm-module-arrow">→</span>
            </div>

            <div className="adm-module-body">
              <span className="mock-badge">MOCK PREDICTION</span>

              <div className="mini-stats">
                <div className="mini-stat">
                  <span>Current</span>
                  <b>{d.prediction.current.toLocaleString()}</b>
                </div>
                <div className="mini-stat">
                  <span>At {d.prediction.targetTime}</span>
                  <b>
                    {d.prediction.predictedCount.toLocaleString()} predicted
                  </b>
                </div>
                <div className="mini-stat">
                  <span>Risk</span>
                  <b className="text-high">🔴 {d.prediction.level}</b>
                </div>
                <div className="mini-stat">
                  <span>Confidence</span>
                  <b>{d.prediction.confidence}%</b>
                </div>
              </div>
            </div>
          </button>

          {/* 5 — Civic Sense Intelligence */}
          <button
            className="adm-module module-highlight"
            onClick={() => navigate("/admin/civic-sense")}
          >
            <div className="adm-module-head">
              <span className="adm-module-icon icon-alert">🚨</span>
              <div className="adm-module-titles">
                <h4>Civic Sense Intelligence</h4>
                <p>AI behaviour detection &amp; incident response</p>
              </div>
              <span className="adm-module-arrow">→</span>
            </div>

            <div className="adm-module-body">
              <span className="chip-row">
                <b>{d.civicIncidents.length} Active Incidents</b>
              </span>

              <div className="incident-mini-list">
                {d.civicIncidents.map((inc) => (
                  <span key={inc.id} className="incident-mini">
                    <span
                      className={`sev-dot sev-${inc.severity.toLowerCase()}`}
                    ></span>
                    <b>{inc.title}</b>
                    <span className="incident-mini-loc">
                      📍 {inc.location}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </button>

          {/* 6 — Staff Assignment */}
          <button
            className="adm-module"
            onClick={() => navigate("/admin/staff")}
          >
            <div className="adm-module-head">
              <span className="adm-module-icon">👮</span>
              <div className="adm-module-titles">
                <h4>Staff Assignment</h4>
                <p>Available staff &amp; nearest responder mapping</p>
              </div>
              <span className="adm-module-arrow">→</span>
            </div>

            <div className="adm-module-body">
              <div className="mini-stats">
                <div className="mini-stat">
                  <span>Available</span>
                  <b className="text-low">{availableStaff}</b>
                </div>
                <div className="mini-stat">
                  <span>Assigned</span>
                  <b className="text-moderate">{assignedStaff}</b>
                </div>
                <div className="mini-stat">
                  <span>Busy</span>
                  <b className="text-high">{busyStaff}</b>
                </div>
              </div>

              <span className="module-hint">
                ⭐ Recommended: {d.staff[0].name} — {d.staff[0].distance} m
                from {d.civicIncidents[0].location}
              </span>
            </div>
          </button>

          {/* 7 — Entry / Exit Monitoring */}
          <button
            className="adm-module"
            onClick={() => navigate("/admin/entry-exit")}
          >
            <div className="adm-module-head">
              <span className="adm-module-icon">🚪</span>
              <div className="adm-module-titles">
                <h4>Entry / Exit Monitoring</h4>
                <p>Gate flow and inside-strength tracking</p>
              </div>
              <span className="adm-module-arrow">→</span>
            </div>

            <div className="adm-module-body">
              <div className="mini-stats">
                <div className="mini-stat">
                  <span>Today's Entries</span>
                  <b>{d.entryExit.todayEntries.toLocaleString()}</b>
                </div>
                <div className="mini-stat">
                  <span>Today's Exits</span>
                  <b>{d.entryExit.todayExits.toLocaleString()}</b>
                </div>
                <div className="mini-stat">
                  <span>Currently Inside</span>
                  <b>{d.entryExit.inside.toLocaleString()}</b>
                </div>
              </div>

              <span className="chip-row">
                {d.entryExit.gates.map((g) => (
                  <span key={g.name} className={`gate-chip ${lvlClass(g.level)}`}>
                    {g.name}: {g.level === "LOW" ? "🟢" : g.level === "MODERATE" ? "🟡" : "🔴"} {g.level}
                  </span>
                ))}
              </span>
            </div>
          </button>

          {/* 8 — Emergency Resources */}
          <button
            className="adm-module"
            onClick={() => navigate("/admin/resources")}
          >
            <div className="adm-module-head">
              <span className="adm-module-icon">🚑</span>
              <div className="adm-module-titles">
                <h4>Emergency Resources</h4>
                <p>Ambulance, police, medical &amp; fire teams</p>
              </div>
              <span className="adm-module-arrow">→</span>
            </div>

            <div className="adm-module-body">
              <span className="chip-row">
                {d.resources.map((r) => (
                  <span key={r.id} className="gate-chip">
                    {r.icon} {r.name.split(" ")[0]} {r.available}
                  </span>
                ))}
              </span>
            </div>
          </button>

          {/* 9 — Analytics & Reports */}
          <button
            className="adm-module"
            onClick={() => navigate("/admin/analytics")}
          >
            <div className="adm-module-head">
              <span className="adm-module-icon">📊</span>
              <div className="adm-module-titles">
                <h4>Analytics &amp; Reports</h4>
                <p>Today's crowd trends and performance reports</p>
              </div>
              <span className="adm-module-arrow">→</span>
            </div>

            <div className="adm-module-body">
              <div className="mini-stats">
                <div className="mini-stat">
                  <span>Today's Visitors</span>
                  <b>{d.analytics.todayVisitors.toLocaleString()}</b>
                </div>
                <div className="mini-stat">
                  <span>Peak Crowd</span>
                  <b>{d.analytics.peakCrowd.toLocaleString()}</b>
                </div>
                <div className="mini-stat">
                  <span>Peak Time</span>
                  <b>{d.analytics.peakTime}</b>
                </div>
                <div className="mini-stat">
                  <span>Average Crowd</span>
                  <b>{d.analytics.averageCrowd.toLocaleString()}</b>
                </div>
              </div>
            </div>
          </button>

        </div>
      </section>
    </div>
  );
}

export default AdminDashboard;
