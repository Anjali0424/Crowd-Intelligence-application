import { useState } from "react";

function AlertCard({ incident }) {
  const [status, setStatus] = useState(incident.status || "PENDING");

  const staff = incident.nearestStaff?.[0];

  return (
    <article
      className={`incident-card severity-${(
        incident.severity || "medium"
      ).toLowerCase()}`}
    >
      <header className="incident-header">
        <span className="incident-badge">🚨 CIVIC SENSE ALERT</span>
        <span
          className={`severity-chip severity-${(
            incident.severity || "medium"
          ).toLowerCase()}`}
        >
          {incident.severity}
        </span>
      </header>

      <h3 className="incident-title">{incident.title}</h3>

      <div className="incident-meta">
        <span>📍 {incident.location}</span>
        {incident.camera && <span>📹 {incident.camera}</span>}
        {incident.detectedAt && <span>🕐 Detected: {incident.detectedAt}</span>}
        {incident.confidence && <span>🎯 Confidence: {incident.confidence}%</span>}
        <span>
          ⚡ Priority:{" "}
          <b>{incident.severity}</b>
        </span>
        <span>
          📌 Status: <b>{status}</b>
        </span>
      </div>

      {staff && (
        <div className="nearest-staff-box">
          <span className="nearest-staff-label">
            ⭐ Recommended Staff
          </span>
          <div className="nearest-staff-row">
            <span className="staff-name">👮 {staff.name}</span>
            <span className="staff-distance">{staff.distance} m away</span>
            <span
              className={`staff-status-dot ${
                staff.status === "AVAILABLE" ? "available" : "busy"
              }`}
            >
              {staff.status}
            </span>
          </div>
        </div>
      )}

      <div className="incident-actions">
        <button type="button" className="incident-btn">
          📹 View Camera
        </button>
        <button type="button" className="incident-btn">
          🧭 Navigate
        </button>
        <button type="button" className="incident-btn">
          👮 Assign Staff
        </button>
        <button
          type="button"
          className="incident-btn resolve-btn"
          onClick={() => setStatus("RESOLVED")}
          disabled={status === "RESOLVED"}
        >
          ✅ {status === "RESOLVED" ? "Resolved" : "Mark Resolved"}
        </button>
      </div>
    </article>
  );
}

export default AlertCard;
