import { useState } from "react";
import { useNavigate } from "react-router-dom";

const MOCK_CREDENTIALS = {
  staffId: "admin",
  password: "admin123",
};

function StaffLogin() {
  const navigate = useNavigate();

  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();

    if (
      staffId.trim() === MOCK_CREDENTIALS.staffId &&
      password === MOCK_CREDENTIALS.password
    ) {
      setError("");
      navigate("/admin");
    } else {
      setError("Invalid Staff ID or password. Please try again.");
    }
  };

  return (
    <div className="role-page">
      <div className="role-container login-container">

        <div className="login-card">

          <div className="login-shield">🛡️</div>

          <h1 className="login-title">Temple Staff Login</h1>

          <p className="login-subtitle">
            Secure access for authorized temple personnel
          </p>

          <form className="login-form" onSubmit={handleSubmit}>

            <label className="login-field">
              <span>Staff ID</span>
              <input
                type="text"
                placeholder="Enter your Staff ID"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                autoComplete="username"
              />
            </label>

            <label className="login-field">
              <span>Password</span>
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>

            {error && <div className="login-error">{error}</div>}

            <button type="submit" className="login-button">
              Staff Login →
            </button>

          </form>

          <div className="login-hint">
            🔒 Authorized personnel only
          </div>

          
          <button
            type="button"
            className="login-back"
            onClick={() => navigate("/")}
          >
            ← Back to role selection
          </button>

        </div>

      </div>
    </div>
  );
}

export default StaffLogin;
