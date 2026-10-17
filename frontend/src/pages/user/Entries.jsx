import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  MapContainer,
  Marker,
  TileLayer,
  ZoomControl,
  useMap,
} from "react-leaflet";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

import { TIRUMALA_CENTER, entryPoints } from "../../data/mockTempleMapData";
import { getCrowdMap, formatClock } from "../../services/crowdMapService";
import { getDarshanCurrent } from "../../services/darshanService";
import { getCrowdColor, getCrowdCardColors } from "../../utils/crowdLevel";
import { formatNumber } from "../../i18n";
import "./Entries.css";

const POLL_MS = 10000;

const LEGEND_LEVELS = ["LOW", "MODERATE", "HIGH", "CRITICAL", "NO_DATA"];

function isValidCoordinate(entry) {
  return (
    Number.isFinite(entry?.lat) &&
    Number.isFinite(entry?.lng)
  );
}

function entryIcon(color, selected) {
  return L.divIcon({
    className: "temple-map-marker-icon",
    html: `<span class="temple-map-marker entry-marker${
      selected ? " entry-marker-selected" : ""
    }" style="--marker-color:${color}">→</span>`,
    iconSize: selected ? [38, 38] : [30, 30],
    iconAnchor: selected ? [19, 19] : [15, 15],
  });
}

function Recenter({ point }) {
  const map = useMap();

  useEffect(() => {
    if (point) {
      map.flyTo([point.lat, point.lng], 18, { duration: 0.6 });
    }
  }, [map, point]);

  return null;
}

function statusForLevel(level, hasData) {
  if (!hasData) return "open";
  if (level === "CRITICAL") return "closed";
  if (level === "HIGH" || level === "MODERATE") return "busy";
  return "open";
}

function resolveEntry(entry, spotsById, prediction) {
  const spot = entry.spotId ? spotsById.get(entry.spotId) : null;
  const hasData = Boolean(spot && spot.has_data);

  let people = null;
  let capacity = null;
  let level = "NO_DATA";
  let density = null;
  let observedAt = null;

  if (hasData) {
    people = spot.people_count;
    capacity = spot.capacity;
    level = spot.level;
    density = spot.density_percent;
    observedAt = spot.observed_at;
  }

  let waitMinutes = null;
  if (entry.i18nKey === "darshan" && prediction) {
    const wait = Number(prediction.wait_minutes);
    if (prediction.available !== false && Number.isFinite(wait)) {
      waitMinutes = wait;
    }
  }

  return {
    ...entry,
    hasData,
    people,
    capacity,
    level,
    density,
    observedAt,
    waitMinutes,
    color: getCrowdColor(hasData ? level : "NO_DATA"),
    status: statusForLevel(level, hasData),
  };
}

function EntrySheet({ entry, onClose, onNavigate }) {
  const { t } = useTranslation();
  const name = t(`entries.names.${entry.i18nKey}`, { defaultValue: entry.name });

  return (
    <div className="entry-sheet" role="dialog" aria-label={name}>
      <button
        type="button"
        className="entry-sheet-close"
        onClick={onClose}
        aria-label={t("entries.close")}
      >
        ×
      </button>

      <div className="entry-sheet-head">
        <h2>{name}</h2>
        {entry.hasData ? (
          <span className={`entry-status entry-status-${entry.status}`}>
            {t(`entries.status.${entry.status}`)}
          </span>
        ) : null}
      </div>

      <span className="entry-sheet-kind">
        {t("entries.entryPoint")}
        {entry.verified === false ? ` · ${t("entries.approximate")}` : ""}
      </span>

      <div className="entry-sheet-grid">
        <div className="entry-metric">
          <span className="entry-metric-label">{t("entries.crowd")}</span>
          {entry.people !== null && entry.people !== undefined ? (
            <span className="entry-metric-value">
              {formatNumber(entry.people)}
              {entry.capacity ? (
                <small>
                  {t("entries.ofCapacity", { value: formatNumber(entry.capacity) })}
                </small>
              ) : null}
            </span>
          ) : (
            <span className="entry-metric-value entry-metric-muted">
              {t("entries.noCrowdData")}
            </span>
          )}
        </div>

        <div className="entry-metric">
          <span className="entry-metric-label">{t("entries.wait")}</span>
          {entry.waitMinutes !== null ? (
            <span className="entry-metric-value">
              {t("entries.waitMin", { value: formatNumber(entry.waitMinutes) })}
            </span>
          ) : (
            <span className="entry-metric-value entry-metric-muted">
              {t("entries.waitUnavailable")}
            </span>
          )}
        </div>
      </div>

      {entry.hasData ? (
        <div className="entry-level" style={getCrowdCardColors(entry.level)}>
          <span>{t(`entries.levels.${entry.level}`)}</span>
          {entry.density !== null && entry.density !== undefined ? (
            <span className="entry-level-density">
              {t("entries.density", { value: entry.density })}
            </span>
          ) : null}
        </div>
      ) : null}

      {entry.observedAt ? (
        <span className="entry-updated">
          {t("entries.updatedAt", { value: formatClock(entry.observedAt) })}
        </span>
      ) : null}

      <button
        type="button"
        className="entry-map-btn"
        onClick={() => onNavigate(entry.id)}
      >
        {t("entries.navigate")}
      </button>
    </div>
  );
}

function Entries() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [mapData, setMapData] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const loadMap = useCallback(async () => {
    try {
      const res = await getCrowdMap();
      setMapData(res);
      setError(null);
    } catch {
      setError(true);
    }
  }, []);

  const loadPrediction = useCallback(async () => {
    try {
      const res = await getDarshanCurrent();
      setPrediction(res?.prediction || null);
    } catch {
      setPrediction(null);
    }
  }, []);

  useEffect(() => {
    loadMap();
    loadPrediction();
    const timer = setInterval(() => {
      loadMap();
      loadPrediction();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [loadMap, loadPrediction]);

  const spotsById = useMemo(() => {
    const map = new Map();
    (mapData?.spots || []).forEach((spot) => map.set(spot.id, spot));
    return map;
  }, [mapData]);

  const entries = useMemo(() => {
    return entryPoints
      .filter(isValidCoordinate)
      .map((entry) => resolveEntry(entry, spotsById, prediction));
  }, [spotsById, prediction]);

  const selected = entries.find((entry) => entry.id === selectedId) || null;
  const hasUnverified = entries.some((entry) => entry.verified === false);
  const updatedText = formatClock(mapData?.generated_at);

  if (entries.length === 0) {
    return (
      <div className="entries-page">
        <header className="entries-head">
          <h1>{t("entries.title")}</h1>
          <p>{t("entries.subtitle")}</p>
        </header>
        <div className="entries-empty">{t("entries.empty")}</div>
      </div>
    );
  }

  return (
    <div className="entries-page">
      <header className="entries-head">
        <h1>{t("entries.title")}</h1>
        <p>{t("entries.subtitle")}</p>
      </header>

      {error ? (
        <div className="entries-error" role="alert">
          <span>{t("entries.error")}</span>
          <button type="button" onClick={loadMap}>
            {t("entries.retry")}
          </button>
        </div>
      ) : null}

      <div className="entries-map-shell">
        <MapContainer
          center={[TIRUMALA_CENTER.lat, TIRUMALA_CENTER.lng]}
          zoom={17}
          scrollWheelZoom
          zoomControl={false}
          className="entries-map-canvas"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <ZoomControl position="topright" />

          {entries.map((entry) => (
            <Marker
              key={entry.id}
              position={[entry.lat, entry.lng]}
              icon={entryIcon(entry.color, entry.id === selectedId)}
              title={t(`entries.names.${entry.i18nKey}`, { defaultValue: entry.name })}
              eventHandlers={{
                click: () => setSelectedId(entry.id),
              }}
            />
          ))}

          <Recenter point={selected} />
        </MapContainer>

        <div className="entries-legend" aria-label={t("entries.legendTitle")}>
          <span className="entries-legend-title">{t("entries.legendTitle")}</span>
          {LEGEND_LEVELS.map((level) => (
            <span key={level} className="entries-legend-item">
              <span
                className="entries-legend-dot"
                style={{ background: getCrowdColor(level) }}
              />
              {t(`entries.levels.${level}`)}
            </span>
          ))}
        </div>

        {!selected ? (
          <div className="entries-hint" role="status">
            {t("entries.tapHint")}
          </div>
        ) : null}

        {selected ? (
          <EntrySheet
            entry={selected}
            onClose={() => setSelectedId(null)}
            onNavigate={(id) => navigate(`/user/map?focus=${id}`)}
          />
        ) : null}
      </div>

      {updatedText !== "—" ? (
        <span className="entries-updated">
          {t("entries.updatedAt", { value: updatedText })}
        </span>
      ) : null}

      {hasUnverified ? <p className="entries-note">{t("entries.demoNote")}</p> : null}
    </div>
  );
}

export default Entries;
