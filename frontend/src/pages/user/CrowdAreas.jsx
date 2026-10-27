import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { getCrowdMap, formatClock, sourceLabel } from "../../services/crowdMapService";
import TempleMap from "../../components/user/TempleMap";
import { getCrowdCardColors, getCrowdLabel } from "../../utils/crowdLevel";

const POLL_MS = 5000;

function SpotHeatmap({ spots }) {
  const { t } = useTranslation();

  return (
    <section className="crowd-heatmap">
      <h2>🗺️ {t("crowd.heatmapTitle")}</h2>
      <p className="heatmap-subtitle">{t("crowd.heatmapSubtitle")}</p>

      <div className="heatmap-grid">
        {spots.length === 0 && (
          <p className="heatmap-empty">{t("crowd.empty")}</p>
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
                    {t("crowd.people", { count: spot.people_count })}
                  </span>
                  <span className="heatmap-meta">
                    {t(`entries.levels.${level}`, { defaultValue: getCrowdLabel(level) })}
                    {spot.density_percent != null &&
                      ` · ${t("crowd.percentFull", { density: spot.density_percent })}`}
                  </span>
                  <span className="heatmap-foot">
                    {t("crowd.updated", { time: formatClock(spot.observed_at) })} ·{" "}
                    {sourceLabel(spot.source)}
                  </span>
                </>
              ) : spot.stale ? (
                <>
                  <span className="heatmap-count">{t("crowd.people", { count: spot.people_count })}</span>
                  <span className="heatmap-meta">{t("crowd.dataMayBeOld")}</span>
                  <span className="heatmap-foot">
                    {t("crowd.updated", { time: formatClock(spot.observed_at) })}
                  </span>
                </>
              ) : (
                <span className="heatmap-meta">{t("crowd.noData")}</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CrowdAreas() {
  const { t } = useTranslation();
  const [mapData, setMapData] = useState(null);
  const [error, setError] = useState(false);
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
        setError(false);
      } catch (err) {
        if (mounted) setError(true);
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
      {error && <div className="crowd-error" role="alert">{t("crowd.error")}</div>}

      <div
        className="crowd-map-controls"
        role="group"
        aria-label={t("crowd.controls")}
      >
        <button
          type="button"
          className={`crowd-control ${showUser ? "active" : ""}`}
          aria-pressed={showUser}
          onClick={() => setShowUser((value) => !value)}
        >
          <span aria-hidden="true">📍</span> {t("crowd.myLocation")}
        </button>
        <button
          type="button"
          className={`crowd-control ${showFacilities ? "active" : ""}`}
          aria-pressed={showFacilities}
          onClick={() => setShowFacilities((value) => !value)}
        >
          <span aria-hidden="true">🚻</span> {t("crowd.facilities")}
        </button>
        <button
          type="button"
          className={`crowd-control ${showRoute ? "active" : ""}`}
          aria-pressed={showRoute}
          onClick={() => setShowRoute((value) => !value)}
        >
          <span aria-hidden="true">🧭</span> {t("crowd.lessCrowdedRoute")}
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
          {t("crowd.note")}
        </span>
        {updatedText && (
          <span className="crowd-map-updated">
            {t("crowd.updated", { time: updatedText })}
          </span>
        )}
      </div>

      <SpotHeatmap spots={spots} />
    </div>
  );
}

export default CrowdAreas;
