import { mockAdminData } from "../../data/mockAdminData";

function Prediction() {
  const { prediction } = mockAdminData;

  const max = Math.max(...prediction.hourly.map((h) => h.people));

  return (
    <div className="admin-page-content">
      <div className="page-head">
        <h1>AI Crowd Prediction</h1>
        <p>Expected crowd for the next hours</p>
      </div>

      <div className="prediction-card">
        <span className="mock-badge">MOCK PREDICTION</span>

        <div className="mini-stats">
          <div className="mini-stat">
            <span>Current</span>
            <b>{prediction.current.toLocaleString()}</b>
          </div>
          <div className="mini-stat">
            <span>At {prediction.targetTime}</span>
            <b>
              {prediction.predictedCount.toLocaleString()} predicted
            </b>
          </div>
          <div className="mini-stat">
            <span>Risk</span>
            <b className="text-high">🔴 {prediction.level}</b>
          </div>
          <div className="mini-stat">
            <span>Confidence</span>
            <b>{prediction.confidence}%</b>
          </div>
        </div>

        <div className="bar-chart">
          {prediction.hourly.map((h) => (
            <div key={h.time} className="bar-col">
              <div
                className={`bar ${
                  h.people >= prediction.predictedCount ? "bar-peak" : ""
                }`}
                style={{ height: `${Math.round((h.people / max) * 100)}%` }}
              ></div>
              <span className="bar-label">{h.time}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="future-note">
        🤖 Future pipeline: Historical Crowd Data → Feature Engineering →
        Forecasting Model → Live Forecast. This is mock data, not a trained
        model yet.
      </div>
    </div>
  );
}

export default Prediction;
