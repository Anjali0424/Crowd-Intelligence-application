const TONES = {
  LOW: "low",
  MODERATE: "moderate",
  HIGH: "high",
  CRITICAL: "critical",
};

function RiskCard({ title, level, detail, count }) {
  const tone = TONES[level] || "moderate";

  return (
    <div className="risk-card">
      <div className="risk-top">
        <span className={`risk-level tone-${tone}`}>{level}</span>

        {typeof count === "number" && (
          <span className="risk-count">{count}</span>
        )}
      </div>

      <span className="risk-title">{title}</span>

      {detail && <span className="risk-detail">{detail}</span>}
    </div>
  );
}

export default RiskCard;
