import { Outlet, useNavigate } from "react-router-dom";

import AdminNav from "../components/admin/AdminNav";
import { mockAdminData } from "../data/mockAdminData";

function AdminLayout() {
  const navigate = useNavigate();

  const { system, currentUser } = mockAdminData;

  return (
    <div className="admin-page">
      <div className="admin-container">

        <header className="admin-header">
          <div className="admin-header-top">
            <div className="admin-header-titles">
              <h2 className="admin-app-name">Temple Civic Sense</h2>
              <p className="admin-app-sub">Admin Command Center</p>
            </div>

            <div className="admin-header-actions">
              <button
                className="admin-header-btn"
                aria-label="Notifications"
                onClick={() => navigate("/admin/alerts")}
              >
                🔔
                <span className="bell-dot"></span>
              </button>

              <button
                className="admin-header-btn"
                aria-label="Staff profile"
                onClick={() => navigate("/admin/profile")}
              >
                👤
              </button>
            </div>
          </div>

          <div className="admin-status-strip">
            <span className="system-status">
              🟢 SYSTEM ONLINE
            </span>

            <span className="system-updated">
              Last updated: {system.lastUpdated}
            </span>

            <span className="system-staff">
              {currentUser.name}
            </span>
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>

        <AdminNav />

      </div>
    </div>
  );
}

export default AdminLayout;
