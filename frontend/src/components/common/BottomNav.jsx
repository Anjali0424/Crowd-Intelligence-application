import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/user", icon: "🏠", label: "Home", end: true },
  { to: "/user/map", icon: "🗺️", label: "Map" },
  { to: "/user/alerts", icon: "🚨", label: "Alerts" },
  { to: "/user/profile", icon: "👤", label: "Profile" },
];

function BottomNav() {
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
