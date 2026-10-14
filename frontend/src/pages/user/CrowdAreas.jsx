import { useEffect, useState } from "react";

import { getCameraCounts } from "../../services/crowdService";
import TempleMap from "../../components/user/TempleMap";
import { crowdZones } from "../../data/mockTempleMapData";

const STALE_MS = 12000;

const ZONE_CAPACITY = Object.fromEntries(
  crowdZones.map((zone) => [zone.id, zone.capacity])
);

function levelFromDensity(density) {
  if (density == null) return null;
  if (density >= 91) return "CRITICAL";
  if (density >= 71) return "HIGH";
  if (density >= 41) return "MODERATE";
  return "LOW";
}

function formatTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildZoneCounts(cameras) {
  const zones = {};

  for (const camera of cameras) {
    const zoneId = camera.zone_id;
    if (!zoneId) continue;

    if (!zones[zoneId]) {
      zones[zoneId] = {
        available: false,
        processing: false,
        people: 0,
        capacity: ZONE_CAPACITY[zoneId] || camera.capacity || null,
        timestamp: 0,
        sourceId: null,
        sourceName: null,
        sourceKind: null,
      };
    }

    const zone = zones[zoneId];
    if (camera.available && camera.has_count) {
      zone.available = true;
      zone.processing = zone.processing || Boolean(camera.processing);
      const people = camera.people_count || 0;
      if (people >= zone.people) {
        zone.people = people;
        zone.sourceId = camera.camera_id || camera.id;
        zone.sourceName = camera.name;
        zone.sourceKind = camera.kind || "camera";
      }
      zone.timestamp = Math.max(zone.timestamp, camera.timestamp || 0);
    }
  }

  for (const zoneId of Object.keys(zones)) {
    const zone = zones[zoneId];
    if (zone.available && zone.capacity) {
      zone.density = Math.round((zone.people / zone.capacity) * 100);
      zone.level = levelFromDensity(zone.density);
    }
  }

  return zones;
}

function CrowdHeatmap({ zoneCounts }) {
  const colors = {
    LOW: "#22c55e",
    MODERATE: "#facc15",
    HIGH: "#f97316",
    CRITICAL: "#ef4444",
  };

  const labels = {
    LOW: "Less crowded",
    MODERATE: "Busy",
    HIGH: "Very crowded",
    CRITICAL: "Too crowded",
  };

  return (
    <section className="crowd-heatmap">
      <h2>🗺️ Crowd Heatmap</h2>
      <p className="heatmap-subtitle">
        See which temple areas are crowded
      </p>

      <div className="heatmap-grid">
        {crowdZones.map((zone) => {
          const data = zoneCounts[zone.id];
          const counted = Boolean(data?.available);
          const ageMs = data?.timestamp
            ? Date.now() - data.timestamp * 1000
            : Infinity;
          const stale = counted && ageMs > STALE_MS;
          const hasLive = counted && !stale && Boolean(data?.capacity && data?.level);

          const level = hasLive ? data.level : null;
          const color = hasLive ? colors[level] : "#d1d5db";
          const textColor = !hasLive
            ? "#4b5563"
            : level === "MODERATE"
            ? "#422006"
            : "#ffffff";

          return (
            <div
              key={zone.id}
              className="heatmap-zone"
              style={{ backgroundColor: color, color: textColor }}
            >
              <strong>{zone.name}</strong>

              {hasLive ? (
                <>
                  <span className="heatmap-count">
                    {data.people} people
                  </span>
                  <span className="heatmap-label">
                    {labels[level] || "Less crowded"}
                  </span>
                  <span className="heatmap-density">
                    {data.density}% full
                  </span>
                  <span className="heatmap-time">
                    Updated {formatTime(data.timestamp)}
                  </span>
                  <span className="heatmap-source">
                    {data.sourceKind === "drone" ? "🛸" : "📹"}{" "}
                    {data.sourceName || data.sourceId || "video"}
                  </span>
                </>
              ) : stale ? (
                <>
                  <span className="heatmap-count">{data.people} people</span>
                  <span className="heatmap-label">Data may be old</span>
                  <span className="heatmap-time">
                    Last {formatTime(data.timestamp)}
                  </span>
                </>
              ) : (
                <span className="heatmap-label">Not started</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}


function CrowdAreas() {
  const [cameras, setCameras] = useState([]);
  const [error, setError] = useState(null);
  const [showFacilities, setShowFacilities] = useState(false);
  const [showRoute, setShowRoute] = useState(false);
  const [showUser, setShowUser] = useState(false);

  useEffect(() => {
    let mounted = true;
    let timer;

    async function fetchData() {
      try {
        const res = await getCameraCounts();
        if (!mounted) return;
        setCameras(res.cameras || []);
        setError(null);
      } catch (err) {
        if (mounted) setError("Could not load crowd information.");
      }
    }

    fetchData();
    timer = setInterval(fetchData, 1500);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const zoneCounts = buildZoneCounts(cameras);

  const countedCameras = cameras.filter(
    (camera) => camera.zone_id && camera.available && camera.has_count
  );
  const newest = countedCameras.reduce(
    (max, camera) => Math.max(max, camera.timestamp || 0),
    0
  );
  const isStale =
    countedCameras.length > 0 && Date.now() - newest * 1000 > STALE_MS;

  const updatedText =
    countedCameras.length === 0
      ? "Not started"
      : isStale
      ? `Data may be old · last ${formatTime(newest)}`
      : `Updated ${formatTime(newest)}`;

  return (
    <div className="crowd-areas">
      {error && <div className="crowd-error">{error}</div>}

      <div
        className="crowd-map-controls"
        role="group"
        aria-label="Map controls"
      >
        <button
          type="button"
          className={`crowd-control ${showUser ? "active" : ""}`}
          aria-pressed={showUser}
          onClick={() => setShowUser((value) => !value)}
        >
          <span aria-hidden="true">📍</span> My Location
        </button>
        <button
          type="button"
          className={`crowd-control ${showFacilities ? "active" : ""}`}
          aria-pressed={showFacilities}
          onClick={() => setShowFacilities((value) => !value)}
        >
          <span aria-hidden="true">🚻</span> Facilities
        </button>
        <button
          type="button"
          className={`crowd-control ${showRoute ? "active" : ""}`}
          aria-pressed={showRoute}
          onClick={() => setShowRoute((value) => !value)}
        >
          <span aria-hidden="true">🧭</span> Less Crowded Route
        </button>
      </div>

      <div className="crowd-map-shell">
        <TempleMap
          zoneCounts={zoneCounts}
          showUser={showUser}
          showFacilities={showFacilities}
          showRoute={showRoute}
        />
      </div>

      <div className="crowd-map-foot">
        <span>📹 From video analysis — may differ from the real crowd</span>
        <span className="crowd-map-updated">{updatedText}</span>
      </div>

      <CrowdHeatmap zoneCounts={zoneCounts} />
    </div>
    
  );
}

export default CrowdAreas;
