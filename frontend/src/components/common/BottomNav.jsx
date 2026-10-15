import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";

function BottomNav() {
  const { t } = useTranslation();

  const navItems = [
    { to: "/user", icon: "🏠", label: t("nav.home"), end: true },
    { to: "/user/map", icon: "🗺️", label: t("nav.map") },
    { to: "/user/alerts", icon: "🚨", label: t("nav.alerts") },
    { to: "/user/profile", icon: "👤", label: t("nav.profile") },
  ];

  return (
    <nav className="bottom-nav">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            isActive ? "nav-item active" : "nav-item"
          }
        >
          <span className="nav-icon">{item.icon}</span>
          <span className="nav-label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default BottomNav;
