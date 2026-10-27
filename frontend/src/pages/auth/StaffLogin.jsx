import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

const MOCK_CREDENTIALS = {
  staffId: "admin",
  password: "admin123",
};

function StaffLogin() {
  const navigate = useNavigate();
  const { t } = useTranslation();

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
      setError(t("staffLogin.error"));
    }
  };

  return (
    <div className="role-page">
      <div className="role-container login-container">

        <div className="login-card">

          <div className="login-shield">🛡️</div>

          <h1 className="login-title">{t("staffLogin.title")}</h1>

          <p className="login-subtitle">{t("staffLogin.hint")}</p>

          <form className="login-form" onSubmit={handleSubmit}>

            <label className="login-field">
              <span>{t("staffLogin.staffId")}</span>
              <input
                type="text"
                aria-label={t("staffLogin.staffId")}
                placeholder={t("staffLogin.staffIdPlaceholder")}
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                autoComplete="username"
              />
            </label>

            <label className="login-field">
              <span>{t("staffLogin.password")}</span>
              <input
                type="password"
                aria-label={t("staffLogin.password")}
                placeholder={t("staffLogin.passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>

            {error && <div className="login-error">{error}</div>}

            <button type="submit" className="login-button">
              {t("staffLogin.submit")}
            </button>

          </form>

          <button
            type="button"
            className="login-back"
            onClick={() => navigate("/")}
          >
            {t("staffLogin.back")}
          </button>

        </div>

      </div>
    </div>
  );
}

export default StaffLogin;
