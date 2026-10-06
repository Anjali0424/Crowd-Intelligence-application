function StatCard({ icon, label, value, status, tone = "neutral", note }) {
  return (
    <div className="stat-card">
      <div className="stat-card-top">
        <span className="stat-icon">{icon}</span>
        <span className="stat-label">{label}</span>
      </div>

      <div className="stat-value">{value}</div>

      {status && (
        <span className={`status-pill tone-${tone}`}>{status}</span>
      )}

      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

export default StatCard;
