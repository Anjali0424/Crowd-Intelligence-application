import { useNavigate } from "react-router-dom";

function Header({ title = "Temple Civic Sense" }) {
  const navigate = useNavigate();

  return (
    <header className="user-header">
      <h2 className="header-title">{title}</h2>

      <button
        className="header-bell"
        aria-label="Notifications"
        onClick={() => navigate("/user/alerts")}
      >
        🔔
        <span className="bell-dot"></span>
      </button>
    </header>
  );
}

export default Header;
