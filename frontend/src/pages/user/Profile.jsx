import { useTranslation } from "react-i18next";

function Profile() {
  const { t } = useTranslation();

  return (
    <div className="page-placeholder">
      <span className="placeholder-icon" aria-hidden="true">👤</span>
      <h2>{t("profile.title")}</h2>
      <p>{t("profile.empty")}</p>
    </div>
  );
}

export default Profile;
