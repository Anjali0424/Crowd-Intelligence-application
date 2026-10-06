import { mockAdminData } from "../../data/mockAdminData";

function AdminAlerts() {
  const { alerts } = mockAdminData;

  return (
    <div className="admin-page-content">
      <div className="page-head">
        <h1>Active Alerts</h1>
        <p>
          {alerts.active} active · {alerts.critical} critical
        </p>
      </div>

      <div className="alert-list">
        {alerts.list.map((alert) => (
          <div
            key={alert.id}
            className={`incident-card severity-${alert.severity.toLowerCase()}`}
          >
            <header className="incident-header">
              <span className="incident-badge">🚨 ACTIVE ALERT</span>
              <span
                className={`severity-chip severity-${alert.severity.toLowerCase()}`}
              >
                {alert.severity}
              </span>
            </header>

            <h3 className="incident-title">{alert.title}</h3>

            <div className="incident-meta">
              <span>📍 {alert.location}</span>
              <span>📹 {alert.camera}</span>
              <span>🕐 Detected: {alert.detectedAt}</span>
              <span>🎯 Confidence: {alert.confidence}%</span>
            </div>

            <p className="incident-note">{alert.note}</p>

            <div className="incident-actions">
              <button type="button" className="incident-btn">
                📹 View Camera
              </button>
              <button type="button" className="incident-btn">
                🗺️ Open Map
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="future-note">
        🤖 Alerts will arrive in real time over WebSocket from the AI
        pipeline — coming later.
      </div>
    </div>
  );
}

export default AdminAlerts;
