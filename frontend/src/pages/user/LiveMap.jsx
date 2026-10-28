import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./LiveMapTraffic.css";

import {
  TIRUMALA_CENTER,
  crowdZones,
  entryPoints,
  exitPoints,
  recommendedRoute,
} from "../../data/mockTempleMapData";
import { formatTime, translateData } from "../../i18n";
import { apiGet } from "../../services/api";

// FOSSGIS pedestrian routing. The URL segment says "driving", but this
// instance returns a walking path.
const OSRM_FOOT_URL =
  "https://routing.openstreetmap.de/routed-foot/route/v1/driving";

const WALK_SPEED_MPS = 1.4;
const REFRESH_INTERVAL_MS = 3000;

// The entry, queue, darshan, and exit coordinates are sample points until
// they are checked on site.
const ROUTE_COORDINATES_VERIFIED = false;

// Kept separate from the devotee view. Real camera capacities are used.
const ENABLE_TRAFFIC_TEST_MODE = false;

const TEST_CAPACITIES = {
  "main-gate": 20,
  "queue-area": 20,
  "darshan-area": 20,
  "exit-area": 20,
};

const TRAFFIC = {
  low: { labelKey: "levels.lessCrowded", color: "#22a447" },
  moderate: { labelKey: "levels.busy", color: "#f59e0b" },
  high: { labelKey: "levels.veryCrowded", color: "#ef4444" },
  critical: { labelKey: "levels.tooCrowded", color: "#991b1b" },
  noData: { labelKey: "map.noLiveData", color: "#808080" },
};

const TRAFFIC_LEGEND = [
  TRAFFIC.low,
  TRAFFIC.moderate,
  TRAFFIC.high,
  TRAFFIC.critical,
  TRAFFIC.noData,
];

// One camera per zone. Counts from the same zone are not added together.
const CAMERA_PRIORITY = {
  "main-gate": ["CAM-01", "CAM-07", "CAM-DEMO", "CAM-TEMPLE"],
  "queue-area": ["CAM-05", "CAM-09"],
  "darshan-area": ["CAM-06"],
  "exit-area": [],
};

const ROUTE_LEGEND = [
  ["map.legendEntry", "#2ecc71"],
  ["map.legendQueue", "#f1c40f"],
  ["map.legendDarshan", "#218C4A"],
  ["map.legendExit", "#e74c3c"],
];

function markerIcon(color, label) {
  return L.divIcon({
    className: "temple-map-marker-icon",
    html: `<span class="temple-map-marker" style="--marker-color:${color}">${label}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

const entryIcon = markerIcon("#2ecc71", "E");
const queueIcon = markerIcon("#f1c40f", "Q");
const darshanIcon = markerIcon("#218C4A", "D");
const exitIcon = markerIcon("#e74c3c", "X");
const focusIcon = markerIcon("#218C4A", "★");

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineMeters(a, b) {
  const earthRadius = 6371000;
  const dLat = toRadians(b[0] - a[0]);
  const dLng = toRadians(b[1] - a[1]);
  const lat1 = toRadians(a[0]);
  const lat2 = toRadians(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

function pathDistanceMeters(path) {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += haversineMeters(path[i - 1], path[i]);
  }
  return total;
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "< 1 min";
  return `${minutes} min`;
}

function getTrafficLevel(peopleCount, capacity) {
  if (
    !Number.isFinite(peopleCount) ||
    !Number.isFinite(capacity) ||
    capacity <= 0
  ) {
    return { ...TRAFFIC.noData, density: null };
  }

  const density = Math.max(0, (peopleCount / capacity) * 100);

  if (density > 90) return { ...TRAFFIC.critical, density };
  if (density > 70) return { ...TRAFFIC.high, density };
  if (density > 40) return { ...TRAFFIC.moderate, density };
  return { ...TRAFFIC.low, density };
}

function selectZoneCamera(zone, cameraCounts) {
  const priorities = CAMERA_PRIORITY[zone.id] || [];

  for (const cameraId of priorities) {
    const camera = cameraCounts.find((item) => item.camera_id === cameraId);
    if (
      camera &&
      camera.available &&
      camera.has_count &&
      !camera.error &&
      Number.isFinite(Number(camera.people_count)) &&
      Number.isFinite(Number(camera.capacity)) &&
      Number(camera.capacity) > 0
    ) {
      return camera;
    }
  }

  return null;
}

function FitRoute({ path }) {
  const map = useMap();

  useEffect(() => {
    if (path && path.length > 1) {
      map.fitBounds(L.latLngBounds(path), { padding: [36, 36] });
    }
  }, [map, path]);

  return null;
}

function FocusView({ point }) {
  const map = useMap();

  useEffect(() => {
    if (point) {
      map.flyTo([point.lat, point.lng], 18, { duration: 0.8 });
    }
  }, [map, point]);

  return null;
}

function nearestPathIndex(path, point) {
  let nearestIndex = 0;
  let nearestDistance = Infinity;

  path.forEach((coordinate, index) => {
    const distance = haversineMeters(coordinate, [point.lat, point.lng]);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

function LiveMap() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get("focus");

  const [cameraCounts, setCameraCounts] = useState([]);
  const [countsLoading, setCountsLoading] = useState(true);
  const [countsError, setCountsError] = useState(false);

  const [path, setPath] = useState([]);
  const [distanceM, setDistanceM] = useState(NaN);
  const [durationS, setDurationS] = useState(NaN);
  const [source, setSource] = useState("straight");
  const [routingLoading, setRoutingLoading] = useState(true);
  const [routingError, setRoutingError] = useState(false);

  const focusPoint = useMemo(() => {
    if (!focusId) return null;
    return (
      entryPoints.find((entry) => entry.id === focusId) ||
      crowdZones.find((zone) => zone.id === focusId) ||
      exitPoints.find((point) => point.id === focusId) ||
      null
    );
  }, [focusId]);

  const waypoints = useMemo(() => {
    const queue = crowdZones.find((zone) => zone.id === "queue-area");
    const darshan = crowdZones.find((zone) => zone.id === "darshan-area");
    const entry = entryPoints[0];
    const exit = exitPoints[0];
    const list = [];

    if (entry) {
      list.push({
        id: "entry",
        roleKey: "map.legendEntry",
        label: entry.name || "Main Entrance",
        icon: entryIcon,
        lat: entry.lat,
        lng: entry.lng,
      });
    }
    if (queue) {
      list.push({
        id: queue.id,
        roleKey: "map.legendQueue",
        label: queue.name || "Queue Area",
        icon: queueIcon,
        lat: queue.lat,
        lng: queue.lng,
      });
    }
    if (darshan) {
      list.push({
        id: darshan.id,
        roleKey: "map.legendDarshan",
        label: darshan.name || "Darshan Area",
        icon: darshanIcon,
        lat: darshan.lat,
        lng: darshan.lng,
      });
    }
    if (exit) {
      list.push({
        id: "exit",
        roleKey: "map.legendExit",
        label: exit.name || "Main Exit",
        icon: exitIcon,
        lat: exit.lat,
        lng: exit.lng,
      });
    }
    return list;
  }, []);

  const fallbackPath = useMemo(() => {
    if (waypoints.length > 1) {
      return waypoints.map((point) => [point.lat, point.lng]);
    }
    return recommendedRoute.map((point) => [point.lat, point.lng]);
  }, [waypoints]);

  useEffect(() => {
    let cancelled = false;

    async function refreshCounts() {
      try {
        const response = await apiGet("/api/cameras/counts");
        if (cancelled) return;
        const cameras = Array.isArray(response)
          ? response
          : Array.isArray(response?.cameras)
            ? response.cameras
            : [];
        setCameraCounts(cameras);
        setCountsError(false);
      } catch {
        if (!cancelled) setCountsError(true);
      } finally {
        if (!cancelled) setCountsLoading(false);
      }
    }

    refreshCounts();
    const intervalId = window.setInterval(refreshCounts, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const zoneTraffic = useMemo(() => {
    const results = {};

    for (const zone of crowdZones) {
      const camera = selectZoneCamera(zone, cameraCounts);

      if (!camera) {
        results[zone.id] = {
          zone,
          camera: null,
          peopleCount: null,
          capacity: null,
          density: null,
          level: TRAFFIC.noData,
          hasLiveData: false,
        };
        continue;
      }

      const peopleCount = Number(camera.people_count);
      const realCapacity = Number(camera.capacity);
      const capacity = ENABLE_TRAFFIC_TEST_MODE
        ? TEST_CAPACITIES[zone.id] ?? realCapacity
        : realCapacity;
      const level = getTrafficLevel(peopleCount, capacity);

      results[zone.id] = {
        zone,
        camera,
        peopleCount,
        capacity,
        realCapacity,
        density: level.density,
        level,
        hasLiveData: level.density != null,
      };
    }

    return results;
  }, [cameraCounts]);

  useEffect(() => {
    let cancelled = false;

    if (fallbackPath.length < 2) {
      setPath(fallbackPath);
      setRoutingLoading(false);
      return undefined;
    }

    const straightDistance = pathDistanceMeters(fallbackPath);
    setPath(fallbackPath);
    setDistanceM(straightDistance);
    setDurationS(straightDistance / WALK_SPEED_MPS);
    setSource("straight");
    setRoutingError(false);
    setRoutingLoading(true);

    const coordinates = waypoints
      .map((point) => `${point.lng},${point.lat}`)
      .join(";");
    const url = `${OSRM_FOOT_URL}/${coordinates}?overview=full&geometries=geojson`;

    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error("routing");
        return response.json();
      })
      .then((result) => {
        if (cancelled) return;
        const geometry = result?.routes?.[0]?.geometry?.coordinates;
        if (
          result?.code !== "Ok" ||
          !Array.isArray(geometry) ||
          geometry.length < 2
        ) {
          throw new Error("route");
        }
        setPath(geometry.map(([lng, lat]) => [lat, lng]));
        setDistanceM(result.routes[0].distance);
        setDurationS(result.routes[0].duration);
        setSource("osrm");
      })
      .catch(() => {
        if (!cancelled) setRoutingError(true);
      })
      .finally(() => {
        if (!cancelled) setRoutingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fallbackPath, waypoints]);

  const coloredSegments = useMemo(() => {
    if (path.length < 2) return [];

    const segments = [];
    const pushSpan = (zoneId, startIndex, endIndex) => {
      const traffic = zoneTraffic[zoneId];
      const color = traffic?.hasLiveData
        ? traffic.level.color
        : TRAFFIC.noData.color;
      const labelKey = traffic?.hasLiveData
        ? traffic.level.labelKey
        : TRAFFIC.noData.labelKey;

      for (let i = startIndex + 1; i <= endIndex; i += 1) {
        if (!path[i - 1] || !path[i]) continue;
        segments.push({
          key: `${zoneId}-${i}`,
          positions: [path[i - 1], path[i]],
          color,
          labelKey,
        });
      }
    };

    if (waypoints.length >= 4) {
      const entryIndex = nearestPathIndex(path, waypoints[0]);
      const queueIndex = Math.max(
        entryIndex,
        nearestPathIndex(path, waypoints[1])
      );
      const darshanIndex = Math.max(
        queueIndex,
        nearestPathIndex(path, waypoints[2])
      );
      const exitIndex = Math.max(
        darshanIndex,
        nearestPathIndex(path, waypoints[3])
      );

      pushSpan("main-gate", entryIndex, queueIndex);
      pushSpan("queue-area", queueIndex, darshanIndex);
      pushSpan("darshan-area", darshanIndex, exitIndex);
    }

    if (segments.length === 0) {
      for (let i = 1; i < path.length; i += 1) {
        segments.push({
          key: `fallback-${i}`,
          positions: [path[i - 1], path[i]],
          color: TRAFFIC.noData.color,
          labelKey: TRAFFIC.noData.labelKey,
        });
      }
    }

    return segments;
  }, [path, waypoints, zoneTraffic]);

  let sourceNote;
  if (routingLoading) {
    sourceNote = t("map.calculating");
  } else if (source === "osrm") {
    sourceNote = t("map.sourceOsrm");
  } else {
    sourceNote = routingError
      ? t("map.sourceStraight")
      : t("map.sourceStraightOnly");
  }

  const connectionLabel = countsError
    ? t("map.noLiveData")
    : countsLoading
      ? t("common.loading")
      : t("map.trafficUpdating");

  return (
    <div className="temple-route">
      {!ROUTE_COORDINATES_VERIFIED && (
        <div className="temple-route-note" role="status">
          <span className="temple-route-badge">{t("map.demoBadge")}</span>
          <span>{t("map.demoNote")}</span>
        </div>
      )}

      <div className="temple-route-shell">
        <MapContainer
          center={[TIRUMALA_CENTER.lat, TIRUMALA_CENTER.lng]}
          zoom={17}
          scrollWheelZoom
          className="temple-map-leaflet"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {coloredSegments.map((segment) => (
            <Fragment key={segment.key}>
              <Polyline
                positions={segment.positions}
                pathOptions={{
                  color: "#ffffff",
                  weight: 10,
                  opacity: 0.95,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
              <Polyline
                positions={segment.positions}
                pathOptions={{
                  color: segment.color,
                  weight: 6,
                  opacity: 1,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            </Fragment>
          ))}

          {waypoints.map((point) => (
            <Marker
              key={point.id}
              position={[point.lat, point.lng]}
              icon={point.icon}
              title={t(point.roleKey)}
            >
              <Popup>
                <strong>{t(point.roleKey)}</strong>
                <br />
                <small>{translateData(t, point.label)}</small>
              </Popup>
            </Marker>
          ))}

          {focusPoint && (
            <>
              <Circle
                center={[focusPoint.lat, focusPoint.lng]}
                radius={20}
                pathOptions={{
                  color: "#218C4A",
                  fillColor: "#218C4A",
                  fillOpacity: 0.12,
                  weight: 2,
                }}
              />
              <Marker
                position={[focusPoint.lat, focusPoint.lng]}
                icon={focusIcon}
                title={t("map.selectedPlace")}
              >
                <Popup>
                  <strong>
                    {translateData(t, focusPoint.name) || t("map.selectedPlace")}
                  </strong>
                </Popup>
              </Marker>
            </>
          )}

          <FocusView point={focusPoint} />
          {!focusPoint && <FitRoute path={path} />}
        </MapContainer>

        <div className="temple-map-legend" aria-label={t("map.templeRoute")}>
          {ROUTE_LEGEND.map(([labelKey, color]) => (
            <span key={labelKey} className="temple-map-legend-item">
              <span
                className="temple-map-legend-dot"
                style={{ background: color }}
              />
              {t(labelKey)}
            </span>
          ))}
        </div>
      </div>

      <section className="traffic-status-section" aria-label={t("map.trafficTitle")}>
        <div className="traffic-status-heading">
          <h3>{t("map.trafficTitle")}</h3>
          <span
            className={
              countsError ? "traffic-connection-error" : "traffic-connection-ok"
            }
            role="status"
          >
            {connectionLabel}
          </span>
        </div>

        {countsError && (
          <p className="traffic-error-message" role="alert">
            {t("map.trafficUnavailable")}
          </p>
        )}

        <div className="traffic-legend" aria-label={t("map.trafficTitle")}>
          {TRAFFIC_LEGEND.map((item) => (
            <span key={item.labelKey} className="traffic-legend-item">
              <span
                className="traffic-legend-color"
                style={{ backgroundColor: item.color }}
              />
              {t(item.labelKey)}
            </span>
          ))}
        </div>

        <div className="crowd-status-panel">
          {crowdZones.map((zone) => {
            const traffic = zoneTraffic[zone.id];
            const color = traffic?.level.color || TRAFFIC.noData.color;
            const updated = traffic?.hasLiveData
              ? formatTime(traffic.camera.timestamp)
              : "";

            return (
              <article className="crowd-status-card" key={zone.id}>
                <div className="crowd-card-title-row">
                  <span
                    className="crowd-card-indicator"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  <h4>{translateData(t, zone.name) || zone.id}</h4>
                </div>

                <p>
                  <strong>{t("common.status")}:</strong>{" "}
                  <span style={{ color, fontWeight: 700 }}>
                    {t(traffic?.level.labelKey || TRAFFIC.noData.labelKey)}
                  </span>
                </p>
                <p>
                  <strong>{t("map.peopleSeen")}:</strong>{" "}
                  {traffic?.hasLiveData ? traffic.peopleCount : "—"}
                </p>
                <p>
                  <strong>{t("map.space")}:</strong>{" "}
                  {traffic?.hasLiveData ? traffic.capacity : "—"}
                </p>
                {ENABLE_TRAFFIC_TEST_MODE && traffic?.hasLiveData && (
                  <p>
                    <strong>{t("map.realSpace")}:</strong> {traffic.realCapacity}
                  </p>
                )}
                <p>
                  <strong>{t("map.howFull")}:</strong>{" "}
                  {traffic?.hasLiveData ? `${traffic.density.toFixed(1)}%` : "—"}
                </p>
                <p className="crowd-camera-source">
                  {traffic?.hasLiveData
                    ? t("map.camera", { id: traffic.camera.camera_id })
                    : t("map.noLiveData")}
                </p>
                {updated && (
                  <p className="crowd-camera-source">
                    {t("map.updated", { time: updated })}
                  </p>
                )}
              </article>
            );
          })}
        </div>

        <p className="traffic-data-note">{t("map.trafficNote")}</p>
      </section>

      <div className="temple-route-panel">
        <h2>{t("map.templeRoute")}</h2>
        <p className="temple-route-steps">{t("map.routePath")}</p>
        <div className="temple-route-metrics">
          <div className="temple-route-metric">
            <span className="temple-route-metric-label">
              {t("map.walkingDistance")}
            </span>
            <span className="temple-route-metric-value">
              {formatDistance(distanceM)}
            </span>
          </div>
          <div className="temple-route-metric">
            <span className="temple-route-metric-label">
              {t("map.estimatedTime")}
            </span>
            <span className="temple-route-metric-value">
              {formatDuration(durationS)}
            </span>
          </div>
        </div>
        <p className="temple-route-source">{sourceNote}</p>
      </div>
    </div>
  );
}

export default LiveMap;
