import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapContainer, Marker, TileLayer, ZoomControl, useMap } from "react-leaflet";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

import { TIRUMALA_CENTER } from "../../data/mockTempleMapData";
import { getExits } from "../../services/exitService";
import { formatClock } from "../../services/crowdMapService";
import { formatNumber } from "../../i18n";
import "./Exits.css";

const POLL_MS = 10000;

const LEGEND_STATUSES = ["OPEN", "BUSY", "CLOSED", "UNKNOWN"];

function isValidCoordinate(exit) {
  return Number.isFinite(exit?.lat) && Number.isFinite(exit?.lng);
}

function exitIcon(exit, selected) {
  const closed = exit.status === "CLOSED";
  const unknown = exit.status === "UNKNOWN";
  const glyph = closed ? "✕" : "↩";
  return L.divIcon({
    className: "temple-map-marker-icon",
    html: `<span class="temple-map-marker exit-marker${
      selected ? " exit-marker-selected" : ""
    }${closed ? " exit-marker-closed" : ""}${
      unknown ? " exit-marker-unknown" : ""
    }" style="--marker-color:${exit.color}">${glyph}</span>`,
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

// A usable exit is one whose operator has set a status. Closed exits are never
// recommended; OPEN beats BUSY, and a lighter crowd (lower density) is better.
// Exits with no crowd reading are still candidates but ranked after ones with
// a known density.
function safeRank(exit) {
  if (exit.status === "CLOSED" || exit.status === "UNKNOWN") return null;
  const statusRank = exit.status === "OPEN" ? 0 : 1;
  const densityRank = Number.isFinite(exit.density_percent)
    ? exit.density_percent
    : 50;
  return [statusRank, densityRank];
}

function ExitSheet({ exit, onClose, onNavigate }) {
  const { t } = useTranslation();

  return (
    <div className="exit-sheet" role="dialog" aria-label={exit.name}>
      <button
        type="button"
        className="exit-sheet-close"
        onClick={onClose}
        aria-label={t("exits.close")}
      >
        ×
      </button>

      <div className="exit-sheet-head">
        <h2>{exit.name}</h2>
        <span className={`exit-status exit-status-${exit.status}`}>
          {t(`exits.status.${exit.status}`)}
        </span>
      </div>

      <span className="exit-sheet-kind">
        {t("exits.exitPoint")}
        {exit.verified === false ? ` · ${t("exits.approximate")}` : ""}
        {` · ${exit.id}`}
      </span>

      {exit.status === "CLOSED" && exit.closure_reason ? (
        <p className="exit-closure">{t("exits.closedReason", { value: exit.closure_reason })}</p>
      ) : null}

      <div className="exit-sheet-grid">
        <div className="exit-metric">
          <span className="exit-metric-label">{t("exits.crowd")}</span>
          {exit.has_crowd_data && exit.crowd_count !== null ? (
            <span className="exit-metric-value">
              {formatNumber(exit.crowd_count)}
              {exit.capacity ? (
                <small>
                  {t("exits.ofCapacity", { value: formatNumber(exit.capacity) })}
                </small>
              ) : null}
            </span>
          ) : (
            <span className="exit-metric-value exit-metric-muted">
              {t("exits.noCrowdData")}
            </span>
          )}
        </div>

        <div className="exit-metric">
          <span className="exit-metric-label">{t("exits.wait")}</span>
          {exit.wait_minutes !== null && exit.wait_minutes !== undefined ? (
            <span className="exit-metric-value">
              {t("exits.waitMin", { value: formatNumber(exit.wait_minutes) })}
            </span>
          ) : (
            <span className="exit-metric-value exit-metric-muted">
              {t("exits.waitUnavailable")}
            </span>
          )}
        </div>
      </div>

      {exit.updated_at ? (
        <span className="exit-updated">
          {t("exits.updatedAt", { value: formatClock(exit.updated_at) })}
        </span>
      ) : null}

      <button
        type="button"
        className="exit-map-btn"
        onClick={() => onNavigate(exit.id)}
      >
        {t("exits.navigate")}
      </button>
    </div>
  );
}

function Exits() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [suggestedId, setSuggestedId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await getExits();
      setData(res);
      setError(null);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const exits = useMemo(
    () => (data?.exits || []).filter(isValidCoordinate),
    [data]
  );

  const summary = useMemo(() => {
    const counts = { OPEN: 0, BUSY: 0, CLOSED: 0, UNKNOWN: 0 };
    exits.forEach((exit) => {
      counts[exit.status] = (counts[exit.status] || 0) + 1;
    });
    return counts;
  }, [exits]);

  const selected = exits.find((exit) => exit.id === selectedId) || null;
  const suggested = exits.find((exit) => exit.id === suggestedId) || null;

  const findSafest = () => {
    let best = null;
    let bestRank = null;
    exits.forEach((exit) => {
      const rank = safeRank(exit);
      if (!rank) return;
      if (
        bestRank === null ||
        rank[0] < bestRank[0] ||
        (rank[0] === bestRank[0] && rank[1] < bestRank[1])
      ) {
        best = exit;
        bestRank = rank;
      }
    });
    setSuggestedId(best ? best.id : null);
    if (best) setSelectedId(best.id);
  };

  const updatedText = formatClock(data?.generated_at);

  if (!data && !error) {
    return (
      <div className="exits-page">
        <header className="exits-head">
          <h1>{t("exits.title")}</h1>
          <p>{t("exits.subtitle")}</p>
        </header>
        <div className="exits-empty">{t("exits.loading")}</div>
      </div>
    );
  }

  return (
    <div className="exits-page">
      <header className="exits-head">
        <h1>{t("exits.title")}</h1>
        <p>{t("exits.subtitle")}</p>
      </header>

      {error ? (
        <div className="exits-error">
          <span>{t("exits.error")}</span>
          <button type="button" onClick={load}>
            {t("exits.retry")}
          </button>
        </div>
      ) : null}

      {exits.length === 0 && !error ? (
        <div className="exits-empty">{t("exits.empty")}</div>
      ) : (
        <>
          <div className="exits-summary" aria-label={t("exits.summaryTitle")}>
            {LEGEND_STATUSES.map((status) => (
              <span key={status} className="exits-summary-item">
                <span
                  className="exits-summary-dot"
                  style={{ background: `var(--exit-${status.toLowerCase()})` }}
                />
                {t(`exits.summary.${status}`, { value: summary[status] || 0 })}
              </span>
            ))}
          </div>

          <button
            type="button"
            className="exits-safe-btn"
            onClick={findSafest}
            disabled={summary.OPEN + summary.BUSY === 0}
          >
            {t("exits.findSafest")}
          </button>

          {suggested ? (
            <p className="exits-suggested" role="status">
              {t("exits.suggested", { value: suggested.name })}
            </p>
          ) : null}

          <div className="exits-map-shell">
            <MapContainer
              center={[TIRUMALA_CENTER.lat, TIRUMALA_CENTER.lng]}
              zoom={17}
              scrollWheelZoom
              className="exits-map-canvas"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <ZoomControl position="topright" />

              {exits.map((exit) => (
                <Marker
                  key={exit.id}
                  position={[exit.lat, exit.lng]}
                  icon={exitIcon(exit, exit.id === selectedId)}
                  title={exit.name}
                  eventHandlers={{
                    click: () => setSelectedId(exit.id),
                  }}
                />
              ))}

              <Recenter point={selected} />
            </MapContainer>

            <div className="exits-legend" aria-label={t("exits.legendTitle")}>
              <span className="exits-legend-title">{t("exits.legendTitle")}</span>
              {LEGEND_STATUSES.map((status) => (
                <span key={status} className="exits-legend-item">
                  <span
                    className="exits-legend-dot"
                    style={{ background: `var(--exit-${status.toLowerCase()})` }}
                  />
                  {t(`exits.status.${status}`)}
                </span>
              ))}
            </div>

            {!selected ? (
              <div className="exits-hint" role="status">
                {t("exits.tapHint")}
              </div>
            ) : null}

            {selected ? (
              <ExitSheet
                exit={selected}
                onClose={() => setSelectedId(null)}
                onNavigate={(id) => navigate(`/user/map?focus=${id}`)}
              />
            ) : null}
          </div>

          {updatedText !== "—" ? (
            <span className="exits-updated">
              {t("exits.updatedAt", { value: updatedText })}
            </span>
          ) : null}

          <p className="exits-note">{t("exits.demoNote")}</p>
        </>
      )}
    </div>
  );
}

export default Exits;
