import { useTranslation } from "react-i18next";

function Alerts() {
  const { t } = useTranslation();

  return (
    <div className="page-placeholder">
      <span className="placeholder-icon" aria-hidden="true">🚨</span>
      <h2>{t("alerts.title")}</h2>
      <p>{t("alerts.empty")}</p>
    </div>
  );
}

export default Alerts;
