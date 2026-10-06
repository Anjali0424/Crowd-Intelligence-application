import AlertCard from "../../components/admin/AlertCard";
import { mockAdminData } from "../../data/mockAdminData";

function CivicSense() {
  const { civicIncidents, civicWorkflow, staff } = mockAdminData;

  const available = staff
    .filter((s) => s.status === "AVAILABLE")
    .sort((a, b) => a.distance - b.distance);

  return (
    <div className="admin-page-content">
      <div className="page-head">
        <h1>Civic Sense Intelligence</h1>
        <p>AI behaviour detection &amp; incident response</p>
      </div>

      {/* Workflow */}
      <section className="workflow-card">
        <h3 className="section-title">Detection Workflow</h3>

        <div className="workflow-track">
          {civicWorkflow.map((step, i) => (
            <span key={step} className="workflow-step-line">
              <span
                className={`workflow-step ${
                  i < 8 ? "is-done" : "is-future"
                }`}
              >
                {step}
              </span>
              {i < civicWorkflow.length - 1 && (
                <span className="workflow-arrow">→</span>
              )}
            </span>
          ))}
        </div>

        <p className="workflow-note">
          Steps in solid style are UI-ready; detection steps run on the
          future AI/CCTV pipeline.
        </p>
      </section>

      {/* Incidents */}
      <section className="modules-section">
        <h3 className="section-title">
          Active Incidents ({civicIncidents.length})
        </h3>

        <div className="incident-list">
          {civicIncidents.map((incident) => (
            <AlertCard key={incident.id} incident={incident} />
          ))}
        </div>
      </section>

      {/* Nearest Staff */}
      <section className="modules-section">
        <h3 className="section-title">Nearest Staff</h3>

        <div className="staff-list">
          {available.map((member, i) => (
            <div
              key={member.id}
              className={`staff-row ${i === 0 ? "is-recommended" : ""}`}
            >
              <span className="staff-avatar">👮</span>

              <div className="staff-info">
                <span className="staff-row-name">
                  {member.name}
                  {i === 0 && <span className="star-chip">⭐ Recommended</span>}
                </span>
                <span className="staff-row-sub">
                  {member.role} · {member.near}
                </span>
              </div>

              <div className="staff-row-right">
                <b>{member.distance} m</b>
                <span className="avail-chip">{member.status}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="future-note">
          🤖 Nearest staff is matched using incident location + staff
          location + availability + role + severity — mock distances for now.
        </div>
      </section>
    </div>
  );
}

export default CivicSense;
