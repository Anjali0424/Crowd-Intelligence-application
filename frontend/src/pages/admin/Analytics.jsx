import StatCard from "../../components/admin/StatCard";
import { mockAdminData } from "../../data/mockAdminData";

function Analytics() {
  const { analytics } = mockAdminData;

  const max = Math.max(...analytics.hourly.map((h) => h.people));

  return (
    <div className="admin-page-content">
      <div className="page-head">
        <h1>Analytics &amp; Reports</h1>
        <p>Today's crowd trends at a glance</p>
      </div>

      <div className="stat-grid">
        <StatCard
          icon="🧑‍🤝‍🧑"
          label="TODAY'S VISITORS"
          value={analytics.todayVisitors.toLocaleString()}
          status="SINCE 6 AM"
          tone="neutral"
        />
        <StatCard
          icon="📈"
          label="PEAK CROWD"
          value={analytics.peakCrowd.toLocaleString()}
          status={`AT ${analytics.peakTime}`}
          tone="high"
          note="Highest recorded today"
        />
        <StatCard
          icon="📊"
          label="AVERAGE CROWD"
          value={analytics.averageCrowd.toLocaleString()}
          status="ALL DAY"
          tone="moderate"
        />
      </div>

      <section className="modules-section">
        <h3 className="section-title">Hourly Crowd (Mock)</h3>

        <div className="prediction-card">
          <div className="bar-chart">
            {analytics.hourly.map((h) => (
              <div key={h.time} className="bar-col">
                <div
                  className={`bar ${
                    h.people === analytics.peakCrowd ? "bar-peak" : ""
                  }`}
                  style={{ height: `${Math.round((h.people / max) * 100)}%` }}
                ></div>
                <span className="bar-label">{h.time}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="future-note">
        🤖 Historical data exports and deeper reports will be generated from
        the database later.
      </div>
    </div>
  );
}

export default Analytics;
