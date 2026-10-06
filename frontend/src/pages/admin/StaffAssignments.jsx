import { mockAdminData } from "../../data/mockAdminData";

const GROUPS = [
  { key: "AVAILABLE", title: "Available Staff", tone: "low" },
  { key: "ASSIGNED", title: "Assigned Staff", tone: "moderate" },
  { key: "BUSY", title: "Busy Staff", tone: "high" },
];

function StaffAssignments() {
  const { staff } = mockAdminData;

  return (
    <div className="admin-page-content">
      <div className="page-head">
        <h1>Staff &amp; Assignments</h1>
        <p>Live staff availability and responder mapping</p>
      </div>

      {GROUPS.map((group) => {
        const members = staff.filter((s) => s.status === group.key);

        return (
          <section key={group.key} className="modules-section">
            <h3 className="section-title">
              {group.title} ({members.length})
            </h3>

            <div className="staff-list">
              {members.length === 0 && (
                <p className="empty-line">No staff in this group.</p>
              )}

              {members.map((member) => (
                <div key={member.id} className="staff-row">
                  <span className="staff-avatar">👮</span>

                  <div className="staff-info">
                    <span className="staff-row-name">{member.name}</span>
                    <span className="staff-row-sub">
                      {member.role} · {member.near}
                    </span>
                  </div>

                  <div className="staff-row-right">
                    <b>{member.distance} m</b>
                    <span
                      className={`avail-chip tone-${group.tone}`}
                    >
                      {member.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <div className="future-note">
        🤖 Real staff GPS location and auto-assignment will be integrated
        later.
      </div>
    </div>
  );
}

export default StaffAssignments;
