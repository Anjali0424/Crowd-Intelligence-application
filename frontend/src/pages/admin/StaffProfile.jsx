import { useNavigate } from "react-router-dom";

import { mockAdminData } from "../../data/mockAdminData";

function StaffProfile() {
  const navigate = useNavigate();

  const { currentUser, system } = mockAdminData;

  return (
    <div className="admin-page-content">
      <div className="page-head">
        <h1>Staff Profile</h1>
        <p>Signed-in command center operator</p>
      </div>

      <div className="profile-card">
        <span className="profile-avatar">👤</span>

        <h2>{currentUser.name}</h2>
        <p>{currentUser.role}</p>

        <div className="profile-meta">
          <span>🪪 {currentUser.id}</span>
          <span>🕑 {currentUser.shift}</span>
          <span>📍 {currentUser.zone}</span>
          <span>🟢 SYSTEM {system.status}</span>
        </div>
      </div>

      <button
        type="button"
        className="profile-logout"
        onClick={() => navigate("/")}
      >
        Sign out
      </button>
    </div>
  );
}

export default StaffProfile;
