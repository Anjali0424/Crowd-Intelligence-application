import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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

import { apiGet } from "../../services/api";

/* --------------------------------------------------
   CONFIGURATION
-------------------------------------------------- */

const OSRM_FOOT_URL =
  "https://routing.openstreetmap.de/routed-foot/route/v1/driving";

const WALK_SPEED_MPS = 1.4;
const REFRESH_INTERVAL_MS = 3000;

/*
 * TEMPORARY TEST MODE
 *
 * true  = use test capacities below.
 * false = use actual backend camera capacities.
 *
 * Test capacities affect frontend calculations only.
 */
const ENABLE_TRAFFIC_TEST_MODE = true;

const TEST_CAPACITIES = {
  "main-gate": 20,
  "queue-area": 20,
  "darshan-area": 20,
  "exit-area": 20,
};

/* Traffic levels and colors */

const TRAFFIC = {
  low: {
    label: "Low",
    color: "#22a447",
  },
  moderate: {
    label: "Moderate",
    color: "#f59e0b",
  },
  high: {
    label: "High",
    color: "#ef4444",
  },
  critical: {
    label: "Critical",
    color: "#991b1b",
  },
  noData: {
    label: "No live data",
    color: "#808080",
  },
};

/*
 * Use one preferred camera per zone.
 * Cameras from the same zone are not added together.
 */
const CAMERA_PRIORITY = {
  "main-gate": [
    "CAM-01",
    "CAM-07",
    "CAM-DEMO",
    "CAM-TEMPLE",
  ],
  "queue-area": [
    "CAM-05",
    "CAM-09",
  ],
  "darshan-area": [
    "CAM-06",
  ],
  "exit-area": [],
};

const ROUTE_LEGEND = [
  ["Entry Gate", "#2ecc71"],
  ["Queue Area", "#f1c40f"],
  ["Darshan Area", "#218C4A"],
  ["Exit Gate", "#e74c3c"],
];

/* --------------------------------------------------
   MAP MARKERS
-------------------------------------------------- */

function markerIcon(color, label) {
  return L.divIcon({
    className: "temple-map-marker-icon",
    html: `
      <span
        class="temple-map-marker"
        style="--marker-color:${color}"
      >
        ${label}
      </span>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

const entryIcon = markerIcon("#2ecc71", "E");
const queueIcon = markerIcon("#f1c40f", "Q");
const darshanIcon = markerIcon("#218C4A", "D");
const exitIcon = markerIcon("#e74c3c", "X");
const focusIcon = markerIcon("#218C4A", "★");

/* --------------------------------------------------
   DISTANCE AND TIME HELPERS
-------------------------------------------------- */

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
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) ** 2;

  return (
    2 *
    earthRadius *
    Math.asin(Math.sqrt(h))
  );
}

function pathDistanceMeters(path) {
  let total = 0;

  for (let i = 1; i < path.length; i += 1) {
    total += haversineMeters(
      path[i - 1],
      path[i]
    );
  }

  return total;
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) {
    return "—";
  }

  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }

  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) {
    return "—";
  }

  const minutes = Math.round(seconds / 60);

  if (minutes < 1) {
    return "< 1 min";
  }

  return `${minutes} min`;
}

function formatUpdated(timestamp) {
  if (
    !timestamp ||
    !Number.isFinite(Number(timestamp))
  ) {
    return "Not available";
  }

  const date = new Date(Number(timestamp) * 1000);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/* --------------------------------------------------
   CROWD TRAFFIC CALCULATION
-------------------------------------------------- */

function getTrafficLevel(peopleCount, capacity) {
  if (
    !Number.isFinite(peopleCount) ||
    !Number.isFinite(capacity) ||
    capacity <= 0
  ) {
    return {
      ...TRAFFIC.noData,
      density: null,
    };
  }

  const density = Math.max(
    0,
    (peopleCount / capacity) * 100
  );

  if (density > 90) {
    return {
      ...TRAFFIC.critical,
      density,
    };
  }

  if (density > 70) {
    return {
      ...TRAFFIC.high,
      density,
    };
  }

  if (density > 40) {
    return {
      ...TRAFFIC.moderate,
      density,
    };
  }

  return {
    ...TRAFFIC.low,
    density,
  };
}

/*
 * Select one valid camera for a zone.
 * A camera without valid detection data is not treated
 * as a green/low-traffic zone.
 */
function selectZoneCamera(zone, cameraCounts) {
  const priorities = CAMERA_PRIORITY[zone.id] || [];

  for (const cameraId of priorities) {
    const camera = cameraCounts.find(
      (item) => item.camera_id === cameraId
    );

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

/* --------------------------------------------------
   MAP VIEW HELPERS
-------------------------------------------------- */

function FitRoute({ path }) {
  const map = useMap();

  useEffect(() => {
    if (path && path.length > 1) {
      map.fitBounds(
        L.latLngBounds(path),
        { padding: [36, 36] }
      );
    }
  }, [map, path]);

  return null;
}

function FocusView({ point }) {
  const map = useMap();

  useEffect(() => {
    if (point) {
      map.flyTo(
        [point.lat, point.lng],
        18,
        { duration: 0.8 }
      );
    }
  }, [map, point]);

  return null;
}

/*
 * Find the closest route vertex to a waypoint.
 */
function nearestPathIndex(path, point) {
  let nearestIndex = 0;
  let nearestDistance = Infinity;

  path.forEach((coordinate, index) => {
    const distance = haversineMeters(
      coordinate,
      [point.lat, point.lng]
    );

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

/* --------------------------------------------------
   MAIN LIVE MAP COMPONENT
-------------------------------------------------- */

function LiveMap() {
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get("focus");

  const [cameraCounts, setCameraCounts] = useState([]);
  const [countsLoading, setCountsLoading] = useState(true);
  const [countsError, setCountsError] = useState("");

  const [path, setPath] = useState([]);
  const [distanceM, setDistanceM] = useState(NaN);
  const [durationS, setDurationS] = useState(NaN);

  const [source, setSource] = useState("straight");
  const [routingLoading, setRoutingLoading] = useState(true);
  const [routingError, setRoutingError] = useState(false);

  /* Selected map point */

  const focusPoint = useMemo(() => {
    if (!focusId) {
      return null;
    }

    return (
      entryPoints.find(
        (entry) => entry.id === focusId
      ) ||
      crowdZones.find(
        (zone) => zone.id === focusId
      ) ||
      exitPoints.find(
        (point) => point.id === focusId
      ) ||
      null
    );
  }, [focusId]);

  /* Route waypoints */

  const waypoints = useMemo(() => {
    const queue = crowdZones.find(
      (zone) => zone.id === "queue-area"
    );

    const darshan = crowdZones.find(
      (zone) => zone.id === "darshan-area"
    );

    const entry = entryPoints[0];
    const exit = exitPoints[0];

    const list = [];

    if (entry) {
      list.push({
        id: "entry",
        role: "Entry Gate",
        label: entry.name || "Main Entrance",
        icon: entryIcon,
        lat: entry.lat,
        lng: entry.lng,
      });
    }

    if (queue) {
      list.push({
        id: queue.id,
        role: "Queue Area",
        label: queue.name || "Queue Area",
        icon: queueIcon,
        lat: queue.lat,
        lng: queue.lng,
      });
    }

    if (darshan) {
      list.push({
        id: darshan.id,
        role: "Darshan Area",
        label: darshan.name || "Darshan Area",
        icon: darshanIcon,
        lat: darshan.lat,
        lng: darshan.lng,
      });
    }

    if (exit) {
      list.push({
        id: "exit",
        role: "Exit Gate",
        label: exit.name || "Main Exit",
        icon: exitIcon,
        lat: exit.lat,
        lng: exit.lng,
      });
    }

    return list;
  }, []);

  /* Fallback route */

  const fallbackPath = useMemo(() => {
    if (waypoints.length > 1) {
      return waypoints.map((point) => [
        point.lat,
        point.lng,
      ]);
    }

    return recommendedRoute.map((point) => [
      point.lat,
      point.lng,
    ]);
  }, [waypoints]);

  /* Fetch camera counts every three seconds */

  useEffect(() => {
    let cancelled = false;

    async function refreshCounts() {
      try {
        const response = await apiGet(
          "/api/cameras/counts"
        );

        if (cancelled) {
          return;
        }

        const cameras = Array.isArray(response)
          ? response
          : Array.isArray(response?.cameras)
            ? response.cameras
            : [];

        setCameraCounts(cameras);
        setCountsError("");
      } catch {
        if (!cancelled) {
          setCountsError(
            "Unable to load camera counts. Check that the backend is running."
          );
        }
      } finally {
        if (!cancelled) {
          setCountsLoading(false);
        }
      }
    }

    refreshCounts();

    const intervalId = window.setInterval(
      refreshCounts,
      REFRESH_INTERVAL_MS
    );

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  /* Calculate traffic level for each zone */

  const zoneTraffic = useMemo(() => {
    const results = {};

    for (const zone of crowdZones) {
      const camera = selectZoneCamera(
        zone,
        cameraCounts
      );

      if (!camera) {
        results[zone.id] = {
          zone,
          camera: null,
          peopleCount: null,
          capacity: ENABLE_TRAFFIC_TEST_MODE
            ? TEST_CAPACITIES[zone.id] ?? null
            : Number(zone.capacity) || null,
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

      const level = getTrafficLevel(
        peopleCount,
        capacity
      );

      results[zone.id] = {
        zone,
        camera,
        peopleCount,
        capacity,
        realCapacity,
        density: level.density,
        level,
        hasLiveData: true,
      };
    }

    return results;
  }, [cameraCounts]);

  /* Calculate pedestrian route */

  useEffect(() => {
    let cancelled = false;

    if (fallbackPath.length < 2) {
      setPath(fallbackPath);
      setRoutingLoading(false);
      return undefined;
    }

    const straightDistance =
      pathDistanceMeters(fallbackPath);

    setPath(fallbackPath);
    setDistanceM(straightDistance);
    setDurationS(straightDistance / WALK_SPEED_MPS);
    setSource("straight");
    setRoutingError(false);
    setRoutingLoading(true);

    const coordinates = waypoints
      .map((point) => `${point.lng},${point.lat}`)
      .join(";");

    const url =
      `${OSRM_FOOT_URL}/${coordinates}` +
      "?overview=full&geometries=geojson";

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Routing request failed");
        }

        return response.json();
      })
      .then((result) => {
        if (cancelled) {
          return;
        }

        const geometry =
          result?.routes?.[0]?.geometry?.coordinates;

        if (
          result?.code !== "Ok" ||
          !Array.isArray(geometry) ||
          geometry.length < 2
        ) {
          throw new Error("No walking route returned");
        }

        const routePath = geometry.map(
          ([lng, lat]) => [lat, lng]
        );

        setPath(routePath);
        setDistanceM(result.routes[0].distance);
        setDurationS(result.routes[0].duration);
        setSource("osrm");
      })
      .catch(() => {
        if (!cancelled) {
          setRoutingError(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRoutingLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fallbackPath, waypoints]);

  /* Divide the route into traffic-colored sections */

  const coloredSegments = useMemo(() => {
    if (path.length < 2 || waypoints.length < 4) {
      return [];
    }

    const entryIndex = nearestPathIndex(
      path,
      waypoints[0]
    );

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

    const sections = [
      {
        zoneId: "main-gate",
        startIndex: entryIndex,
        endIndex: queueIndex,
      },
      {
        zoneId: "queue-area",
        startIndex: queueIndex,
        endIndex: darshanIndex,
      },
      {
        zoneId: "darshan-area",
        startIndex: darshanIndex,
        endIndex: exitIndex,
      },
    ];

    const segments = [];

    for (const section of sections) {
      const traffic = zoneTraffic[section.zoneId];

      const color = traffic?.hasLiveData
        ? traffic.level.color
        : TRAFFIC.noData.color;

      for (
        let i = section.startIndex + 1;
        i <= section.endIndex;
        i += 1
      ) {
        if (!path[i - 1] || !path[i]) {
          continue;
        }

        segments.push({
          key: `${section.zoneId}-${i}`,
          positions: [path[i - 1], path[i]],
          color,
          level:
            traffic?.level.label ||
            TRAFFIC.noData.label,
        });
      }
    }

    /*
     * If route sections cannot be assigned reliably,
     * use gray instead of inventing traffic information.
     */
    if (segments.length === 0) {
      for (let i = 1; i < path.length; i += 1) {
        segments.push({
          key: `fallback-${i}`,
          positions: [path[i - 1], path[i]],
          color: TRAFFIC.noData.color,
          level: TRAFFIC.noData.label,
        });
      }
    }

    return segments;
  }, [path, waypoints, zoneTraffic]);

  /* Route information */

  let sourceNote;

  if (routingLoading) {
    sourceNote = "Calculating the walking path…";
  } else if (source === "osrm") {
    sourceNote =
      "Path and duration from OpenStreetMap pedestrian routing.";
  } else {
    sourceNote = routingError
      ? "Pedestrian routing was unavailable; showing a straight-line estimate."
      : "Showing a straight-line estimate between route points.";
  }

  /* --------------------------------------------------
     RENDER
  -------------------------------------------------- */

  return (
    <div className="temple-route">

      {/* MAP */}

      <div className="temple-route-shell">
        <MapContainer
          center={[
            TIRUMALA_CENTER.lat,
            TIRUMALA_CENTER.lng,
          ]}
          zoom={17}
          scrollWheelZoom
          className="temple-map-leaflet"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Traffic route with a white outline */}

          {coloredSegments.map((segment) => (
            <React.Fragment key={segment.key}>
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
            </React.Fragment>
          ))}

          {/* Entry, queue, darshan and exit markers */}

          {waypoints.map((point) => (
            <Marker
              key={point.id}
              position={[point.lat, point.lng]}
              icon={point.icon}
              title={point.role}
            >
              <Popup>
                <strong>{point.role}</strong>
                <br />
                <small>{point.label}</small>
              </Popup>
            </Marker>
          ))}

          {/* Highlight a selected location */}

          {focusPoint && (
            <>
              <Circle
                center={[
                  focusPoint.lat,
                  focusPoint.lng,
                ]}
                radius={20}
                pathOptions={{
                  color: "#218C4A",
                  fillColor: "#218C4A",
                  fillOpacity: 0.12,
                  weight: 2,
                }}
              />

              <Marker
                position={[
                  focusPoint.lat,
                  focusPoint.lng,
                ]}
                icon={focusIcon}
              >
                <Popup>
                  {focusPoint.name || "Selected location"}
                </Popup>
              </Marker>
            </>
          )}

          <FocusView point={focusPoint} />

          {!focusPoint && <FitRoute path={path} />}
        </MapContainer>

        {/* Map marker legend */}

        <div className="temple-map-legend">
          {ROUTE_LEGEND.map(([label, color]) => (
            <span
              key={label}
              className="temple-map-legend-item"
            >
              <span
                className="temple-map-legend-dot"
                style={{ background: color }}
              />

              {label}
            </span>
          ))}
        </div>
      </div>

      {/* AI CROWD TRAFFIC */}

      <section className="traffic-status-section">
        <div className="traffic-status-heading">
          <h3>AI Crowd Traffic</h3>

          <span
            className={
              countsError
                ? "traffic-connection-error"
                : "traffic-connection-ok"
            }
          >
            {countsError
              ? "Backend unavailable"
              : countsLoading
                ? "Loading camera data…"
                : "Auto-refreshing"}
          </span>
        </div>

        {countsError && (
          <p className="traffic-error-message">
            {countsError}
          </p>
        )}

        {/* Traffic color legend */}

        <div className="traffic-legend">
          {[
            ["Low", TRAFFIC.low.color],
            ["Moderate", TRAFFIC.moderate.color],
            ["High", TRAFFIC.high.color],
            ["Critical", TRAFFIC.critical.color],
            ["No live data", TRAFFIC.noData.color],
          ].map(([label, color]) => (
            <span
              key={label}
              className="traffic-legend-item"
            >
              <span
                className="traffic-legend-color"
                style={{ backgroundColor: color }}
              />

              {label}
            </span>
          ))}
        </div>

        {/* Crowd status cards */}

        <div className="crowd-status-panel">
          {crowdZones.map((zone) => {
            const traffic = zoneTraffic[zone.id];

            const color =
              traffic?.level.color ||
              TRAFFIC.noData.color;

            return (
              <article
                className="crowd-status-card"
                key={zone.id}
              >
                <div className="crowd-card-title-row">
                  <span
                    className="crowd-card-indicator"
                    style={{ backgroundColor: color }}
                  />

                  <h4>{zone.name || zone.id}</h4>
                </div>

                <p>
                  <strong>Status:</strong>{" "}
                  <span
                    style={{
                      color,
                      fontWeight: 700,
                    }}
                  >
                    {traffic?.level.label || "No live data"}
                  </span>
                </p>

                <p>
                  <strong>People detected:</strong>{" "}
                  {traffic?.hasLiveData
                    ? traffic.peopleCount
                    : "—"}
                </p>

                <p>
                  <strong>Capacity:</strong>{" "}
                  {traffic?.capacity ?? "—"}
                </p>

                {ENABLE_TRAFFIC_TEST_MODE &&
                  traffic?.hasLiveData && (
                    <p>
                      <strong>Original capacity:</strong>{" "}
                      {traffic.realCapacity}
                    </p>
                  )}

                <p>
                  <strong>Density:</strong>{" "}
                  {traffic?.hasLiveData
                    ? `${traffic.density.toFixed(1)}%`
                    : "—"}
                </p>

                <p className="crowd-camera-source">
                  {traffic?.hasLiveData
                    ? `Camera: ${traffic.camera.camera_id}`
                    : "No valid camera data"}
                </p>

                {traffic?.hasLiveData && (
                  <p className="crowd-camera-source">
                    Updated:{" "}
                    {formatUpdated(traffic.camera.timestamp)}
                  </p>
                )}
              </article>
            );
          })}
        </div>

        <p className="traffic-data-note">
          Camera counts refresh every three seconds.
          Test mode changes frontend capacity calculations
          only. Recorded-video counts do not confirm
          actual current temple conditions.
        </p>
      </section>

      {/* TEMPLE ROUTE INFORMATION */}

      <div className="temple-route-panel">
        <h2>Temple Route</h2>

        <p className="temple-route-steps">
          Entry Gate → Queue → Darshan → Exit Gate
        </p>

        <div className="temple-route-metrics">
          <div className="temple-route-metric">
            <span className="temple-route-metric-label">
              Walking distance
            </span>

            <span className="temple-route-metric-value">
              {formatDistance(distanceM)}
            </span>
          </div>

          <div className="temple-route-metric">
            <span className="temple-route-metric-label">
              Estimated time
            </span>

            <span className="temple-route-metric-value">
              {formatDuration(durationS)}
            </span>
          </div>
        </div>

        <p className="temple-route-source">
          {sourceNote}
        </p>
      </div>
    </div>
  );
}

export default LiveMap;