import StatCard from "../../components/admin/StatCard";
import { mockAdminData } from "../../data/mockAdminData";

const EMOJI = { LOW: "🟢", MODERATE: "🟡", HIGH: "🔴" };

function EntryExit() {
  const { entryExit } = mockAdminData;

  return (
    <div className="admin-page-content">
      <div className="page-head">
        <h1>Entry / Exit Monitoring</h1>
        <p>Gate flow and inside-strength tracking</p>
      </div>

      <div className="stat-grid">
        <StatCard
          icon="🚪"
          label="TODAY'S ENTRIES"
          value={entryExit.todayEntries.toLocaleString()}
          status="SINCE 6 AM"
          tone="neutral"
        />
        <StatCard
          icon="↩️"
          label="TODAY'S EXITS"
          value={entryExit.todayExits.toLocaleString()}
          status="SINCE 6 AM"
          tone="neutral"
        />
        <StatCard
          icon="🧑‍🤝‍🧑"
          label="CURRENTLY INSIDE"
          value={entryExit.inside.toLocaleString()}
          status="🟡 MANAGEABLE"
          tone="moderate"
          note="Auto-computed from entries − exits"
        />
      </div>

      <section className="modules-section">
        <h3 className="section-title">Gates</h3>

        <div className="risk-grid">
          {entryExit.gates.map((gate) => (
            <div key={gate.name} className="risk-card">
              <div className="risk-top">
                <span
                  className={`risk-level tone-${gate.level.toLowerCase()}`}
                >
                  {EMOJI[gate.level]} {gate.level}
                </span>
                <span className="risk-count">{gate.type}</span>
              </div>

              <span className="risk-title">{gate.name}</span>
              <span className="risk-detail">Mock gate status</span>
            </div>
          ))}
        </div>
      </section>

      <div className="future-note">
        🤖 Entry/exit counting will come from person re-identification across
        camera zones — coming later.
      </div>
    </div>
  );
}

export default EntryExit;
