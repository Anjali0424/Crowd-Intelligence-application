import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import LanguageSelector from "./LanguageSelector";

function Header({ title }) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <header className="user-header">
      <h2 className="header-title">{title || t("common.appName")}</h2>

      <div className="header-actions">
        <LanguageSelector />

        <button
          className="header-bell"
          aria-label={t("common.notifications")}
          title={t("common.notifications")}
          onClick={() => navigate("/user/alerts")}
        >
          🔔
        </button>
      </div>
    </header>
  );
}

export default Header;
