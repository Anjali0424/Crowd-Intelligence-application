import { useNavigate } from "react-router-dom";
import frontImage from "../../assets/images/temple.jpg";

function RoleSelection() {
  const navigate = useNavigate();

  const handleDevotee = () => {
    navigate("/user");
  };

  const handleAdmin = () => {
    navigate("/admin-login");
  };

  return (
    <div className="role-page">
      <div className="role-container">

        {/* Temple Image */}
        <div className="temple-image-container">
          <img
            src={frontImage}
            alt="Temple Civic Intelligence"
            className="temple-image"
          />

          <div className="image-overlay"></div>

          <div className="temple-title">
            <h1>Crowd Intelligence System</h1>

            <p>
              Smart Guidance for a Safer
              <br />
              and Smoother Darshan
            </p>
          </div>
        </div>

        {/* Role Selection */}
        <div className="role-section">

          {/* Devotee */}
          <button
            className="role-button devotee-button"
            onClick={handleDevotee}
          >
            <div className="role-icon">
              👥
            </div>

            <div className="role-text">
              <h3>I am a Devotee</h3>
              <span>Temple Visitor</span>
            </div>

            <div className="arrow">
              →
            </div>
          </button>

          {/* Admin */}
          <button
            className="role-button admin-button"
            onClick={handleAdmin}
          >
            <div className="role-icon admin-icon">
              🛡️
            </div>

            <div className="role-text">
              <h3>Temple Staff / Admin</h3>
              <span>Authorized Access</span>
            </div>

            <div className="arrow">
              →
            </div>
          </button>

        </div>

        {/* Footer */}
        <div className="role-footer">
          <p>🛡️ Secure • Smart • Crowd-Aware</p>
        </div>

      </div>
    </div>
  );
}

export default RoleSelection;