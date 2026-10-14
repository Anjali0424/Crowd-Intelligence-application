import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/admin", icon: "🏠", label: "Dashboard", end: true },
  { to: "/admin/crowd", icon: "👥", label: "Crowd" },
  { to: "/admin/alerts", icon: "🚨", label: "Alerts" },
  { to: "/admin/cameras", icon: "📹", label: "Cameras" },
  { to: "/admin/analytics", icon: "📊", label: "Analytics" },
  {
    to: "/admin/hourly-crowd",
    icon: "🕒",
    label: "Hourly Forecast",
  },
];

function AdminNav() {
  return (
    <nav className="bottom-nav admin-nav">
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

export default AdminNav;
