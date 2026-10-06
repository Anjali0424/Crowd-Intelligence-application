import StatCard from "../../components/admin/StatCard";
import RiskCard from "../../components/admin/RiskCard";
import { mockAdminData } from "../../data/mockAdminData";

function CrowdMonitoring() {
  const { crowd } = mockAdminData;

  return (
    <div className="admin-page-content">
      <div className="page-head">
        <h1>Live Crowd Intelligence</h1>
        <p>Zone-wise crowd density across the temple</p>
      </div>

      <div className="stat-grid stat-grid-2">
        <StatCard
          icon="👥"
          label="TOTAL PEOPLE"
          value={crowd.totalPeople.toLocaleString()}
          status={`🔴 ${crowd.level}`}
          tone="high"
          note={`Trend: ${crowd.trend}`}
        />
        <StatCard
          icon="⚠️"
          label="ZONES TO WATCH"
          value={crowd.attentionZones}
          status="NEEDS ATTENTION"
          tone="moderate"
          note="Queue areas"
        />
      </div>

      <section className="modules-section">
        <h3 className="section-title">Zones</h3>

        <div className="risk-grid">
          {crowd.zones.map((zone) => (
            <RiskCard
              key={zone.name}
              title={zone.name}
              level={zone.level}
              count={zone.people}
              detail={`${zone.people} people detected`}
            />
          ))}
        </div>
      </section>

      <div className="future-note">
        🤖 Live counts will be fed by YOLOv11 + ByteTrack density analysis
        over CCTV — coming later.
      </div>
    </div>
  );
}

export default CrowdMonitoring;
