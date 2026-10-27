import { useCallback, useEffect, useState } from "react";
import StatCard from "../../components/admin/StatCard";
import RiskCard from "../../components/admin/RiskCard";
import { apiGet } from "../../services/api";

const REFRESH_INTERVAL = 3000;

const ZONES = [
{ id: "main-gate", name: "Main Entrance", capacity: 300 },
{ id: "security-check", name: "Security Check", capacity: 200 },
{ id: "queue-area", name: "Queue Area A", capacity: 250 },
{ id: "queue-area-b", name: "Queue Area B", capacity: 250 },
{ id: "main-hall", name: "Main Hall", capacity: 200 },
{ id: "darshan-area", name: "Darshan Area", capacity: 200 },
{ id: "north-corridor", name: "North Corridor", capacity: 150 },
];

function getLevel(people, capacity) {
if (!capacity || capacity <= 0) return "UNKNOWN";

const percentage = (people / capacity) * 100;

if (percentage >= 90) return "CRITICAL";
if (percentage >= 70) return "HIGH";
if (percentage >= 40) return "MODERATE";

return "LOW";
}

function CrowdMonitoring() {
const [cameras, setCameras] = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState("");
const [lastUpdated, setLastUpdated] = useState(null);

const fetchCrowdData = useCallback(async () => {
try {
const response = await apiGet("/api/cameras/counts");


  const cameraList = Array.isArray(response.cameras)
    ? response.cameras
    : [];

  setCameras(cameraList);
  setLastUpdated(new Date());
  setError("");
} catch (err) {
  setError(err.message || "Unable to fetch crowd data.");
} finally {
  setLoading(false);
}


}, []);

useEffect(() => {
fetchCrowdData();

const interval = setInterval(fetchCrowdData, REFRESH_INTERVAL);

return () => clearInterval(interval);


}, [fetchCrowdData]);

const zones = ZONES.map((zone) => {
// Choose one active camera per zone to avoid adding together
// multiple camera views that may contain the same people.
const candidates = cameras.filter(
(camera) =>
camera.zone_id === zone.id &&
camera.processing === true &&
camera.has_count === true &&
camera.error == null
);


const selected = candidates.sort(
  (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
)[0];

const people = selected ? Math.max(0, selected.people_count || 0) : null;
const capacity = selected?.capacity || zone.capacity;

return {
  ...zone,
  people,
  capacity,
  level: people === null ? "NO DATA" : getLevel(people, capacity),
  cameraName: selected?.name || null,
};


});

const availableZones = zones.filter((zone) => zone.people !== null);

const totalPeople = availableZones.reduce(
(total, zone) => total + zone.people,
0
);

const attentionZones = availableZones.filter(
(zone) => ["HIGH", "CRITICAL"].includes(zone.level)
).length;

const overallLevel =
availableZones.some((zone) => zone.level === "CRITICAL")
? "CRITICAL"
: availableZones.some((zone) => zone.level === "HIGH")
? "HIGH"
: availableZones.some((zone) => zone.level === "MODERATE")
? "MODERATE"
: availableZones.length > 0
? "LOW"
: "NO DATA";

const tone =
overallLevel === "CRITICAL" || overallLevel === "HIGH"
? "high"
: overallLevel === "MODERATE"
? "moderate"
: "low";

return ( <div className="admin-page-content"> <div className="page-head"> <h1>Live Crowd Intelligence</h1> <p>Zone-wise crowd density across the temple</p> <p>
{lastUpdated
? `Last updated: ${lastUpdated.toLocaleTimeString()}`
: "Waiting for live data..."}
{" · "}Auto-refresh every 3 seconds </p> </div>


  {error && (
    <div role="alert" className="future-note">
      Unable to refresh crowd data: {error}
    </div>
  )}

  <div className="stat-grid stat-grid-2">
    <StatCard
      icon="👥"
      label="TOTAL PEOPLE"
      value={loading && availableZones.length === 0
        ? "Loading..."
        : totalPeople.toLocaleString()}
      status={overallLevel}
      tone={tone}
      note={`${availableZones.length} of ${zones.length} zones reporting`}
    />

    <StatCard
      icon="⚠️"
      label="ZONES TO WATCH"
      value={attentionZones}
      status="NEEDS ATTENTION"
      tone={attentionZones > 0 ? "high" : "low"}
      note="Zones at high or critical levels"
    />
  </div>

  <section className="modules-section">
    <h3 className="section-title">Zones</h3>

    {loading && availableZones.length === 0 ? (
      <p>Loading crowd data from cameras...</p>
    ) : (
      <div className="risk-grid">
        {zones.map((zone) => (
          <RiskCard
            key={zone.id}
            title={zone.name}
            level={zone.level}
            count={zone.people === null ? "—" : zone.people}
            detail={
              zone.people === null
                ? "No active camera data"
                : `${zone.people} people detected · Capacity ${zone.capacity}`
            }
          />
        ))}
      </div>
    )}
  </section>

  <div className="future-note">
    {availableZones.length > 0
      ? "Crowd counts are being received from the backend camera detection service."
      : "No active camera counts are available. Check camera processing and video sources."}
  </div>
</div>


);
}

export default CrowdMonitoring;
