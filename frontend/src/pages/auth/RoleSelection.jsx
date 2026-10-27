import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import frontImage from "../../assets/images/temple.jpg";
import LanguageSelector from "../../components/common/LanguageSelector";

function RoleSelection() {
  const navigate = useNavigate();
  const { t } = useTranslation();

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
            alt={t("role.imageAlt")}
            className="temple-image"
          />

          <div className="image-overlay"></div>

          <div className="temple-title">
            <h1>{t("role.tagline")}</h1>

            <p>{t("role.tagline2")}</p>
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
              <h3>{t("role.devotee")}</h3>
              <span>{t("role.devoteeSub")}</span>
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
              <h3>{t("role.staff")}</h3>
              <span>{t("role.staffSub")}</span>
            </div>

            <div className="arrow">
              →
            </div>
          </button>

        </div>

        {/* Footer */}
        <div className="role-footer">
          <p>{t("role.footer")}</p>
          <LanguageSelector />
        </div>

      </div>
    </div>
  );
}

export default RoleSelection;