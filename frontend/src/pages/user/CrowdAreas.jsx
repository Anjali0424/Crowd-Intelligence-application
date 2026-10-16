import { useEffect, useState } from "react";

import { getCrowdMap, formatClock, sourceLabel } from "../../services/crowdMapService";
import TempleMap from "../../components/user/TempleMap";
import { getCrowdCardColors, getCrowdLabel } from "../../utils/crowdLevel";

const POLL_MS = 5000;

function SpotHeatmap({ spots }) {
  return (
    <section className="crowd-heatmap">
      <h2>🗺️ Crowd Heatmap</h2>
      <p className="heatmap-subtitle">See which temple areas are crowded</p>

      <div className="heatmap-grid">
        {spots.length === 0 && (
          <p className="heatmap-empty">
            No crowd information available right now. Please check back shortly.
          </p>
        )}
        {spots.map((spot) => {
          const level = spot.has_data ? spot.level : "NO_DATA";
          const card = getCrowdCardColors(level);

          return (
            <div key={spot.id} className="heatmap-zone" style={card}>
              <strong>{spot.name}</strong>

              {spot.has_data ? (
                <>
                  <span className="heatmap-count">
                    {spot.people_count} people
                  </span>
                  <span className="heatmap-meta">
                    {getCrowdLabel(level)}
                    {spot.density_percent != null &&
                      ` · ${spot.density_percent}% full`}
                  </span>
                  <span className="heatmap-foot">
                    Updated {formatClock(spot.observed_at)} ·{" "}
                    {sourceLabel(spot.source)}
                  </span>
                </>
              ) : spot.stale ? (
                <>
                  <span className="heatmap-count">{spot.people_count} people</span>
                  <span className="heatmap-meta">Data may be old</span>
                  <span className="heatmap-foot">
                    Updated {formatClock(spot.observed_at)}
                  </span>
                </>
              ) : (
                <span className="heatmap-meta">No crowd data</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CrowdAreas() {
  const [mapData, setMapData] = useState(null);
  const [error, setError] = useState(null);
  const [showFacilities, setShowFacilities] = useState(false);
  const [showRoute, setShowRoute] = useState(false);
  const [showUser, setShowUser] = useState(false);

  useEffect(() => {
    let mounted = true;
    let timer;

    async function fetchData() {
      try {
        const res = await getCrowdMap();
        if (!mounted) return;
        setMapData(res);
        setError(null);
      } catch (err) {
        if (mounted) setError("Could not load crowd information.");
      }
    }

    fetchData();
    timer = setInterval(fetchData, POLL_MS);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const spots = mapData?.spots || [];
  const paths = mapData?.paths || [];
  const updatedText = formatClock(mapData?.generated_at);

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
          spots={spots}
          paths={paths}
          showUser={showUser}
          showFacilities={showFacilities}
          showRoute={showRoute}
        />
      </div>

      <div className="crowd-map-foot">
        <span>
          {mapData?.note ||
            "Crowd status is based on staff and camera observations and may differ from actual conditions."}
        </span>
        {updatedText && (
          <span className="crowd-map-updated">Updated {updatedText}</span>
        )}
      </div>

      <SpotHeatmap spots={spots} />
    </div>
  );
}

export default CrowdAreas;
