import { useEffect, useMemo, useState } from "react";
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

import {
  TIRUMALA_CENTER,
  crowdZones,
  entryPoints,
  exitPoints,
  recommendedRoute,
} from "../../data/mockTempleMapData";

// FOSSGIS pedestrian (foot) routing instance. OSRM keeps "driving" as the
// profile segment in the URL, but the "routed-foot" instance routes on foot.
const OSRM_FOOT_URL =
  "https://routing.openstreetmap.de/routed-foot/route/v1/driving";

// Average pedestrian speed, used only when the routing service does not return
// a duration (1.4 m/s ≈ 5 km/h).
const WALK_SPEED_MPS = 1.4;

// The entry/exit/queue/darshan coordinates in the project data are demo
// placeholders clustered around the temple. Flip this to true once real,
// verified waypoint coordinates are supplied.
const ROUTE_COORDINATES_VERIFIED = false;

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

const ROUTE_LEGEND = [
  ["Entry Gate", "#2ecc71"],
  ["Queue Area", "#f1c40f"],
  ["Darshan Area", "#218C4A"],
  ["Exit Gate", "#e74c3c"],
];

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

function LiveMap() {
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get("focus");

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

  const fallbackPath = useMemo(() => {
    if (waypoints.length > 1) {
      return waypoints.map((point) => [point.lat, point.lng]);
    }
    return recommendedRoute.map((point) => [point.lat, point.lng]);
  }, [waypoints]);

  const [path, setPath] = useState(fallbackPath);
  const [distanceM, setDistanceM] = useState(() =>
    pathDistanceMeters(fallbackPath)
  );
  const [durationS, setDurationS] = useState(
    () => pathDistanceMeters(fallbackPath) / WALK_SPEED_MPS
  );
  const [source, setSource] = useState("straight");
  const [loading, setLoading] = useState(true);
  const [routingError, setRoutingError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const straight = fallbackPath;
    if (straight.length < 2 || waypoints.length < 2) {
      setLoading(false);
      return undefined;
    }

    const straightDistance = pathDistanceMeters(straight);
    setPath(straight);
    setDistanceM(straightDistance);
    setDurationS(straightDistance / WALK_SPEED_MPS);
    setSource("straight");
    setRoutingError(false);
    setLoading(true);

    const coords = waypoints
      .map((point) => `${point.lng},${point.lat}`)
      .join(";");
    const url = `${OSRM_FOOT_URL}/${coords}?overview=full&geometries=geojson`;

    fetch(url)
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("routing"))
      )
      .then((result) => {
        if (cancelled) return;
        const geometry = result?.routes?.[0]?.geometry?.coordinates;
        if (result?.code !== "Ok" || !Array.isArray(geometry) || geometry.length < 2) {
          throw new Error("route");
        }
        // GeoJSON is [lng, lat]; Leaflet expects [lat, lng].
        setPath(geometry.map(([lng, lat]) => [lat, lng]));
        setDistanceM(result.routes[0].distance);
        setDurationS(result.routes[0].duration);
        setSource("osrm");
      })
      .catch(() => {
        if (!cancelled) setRoutingError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fallbackPath, waypoints]);

  let sourceNote;
  if (loading) {
    sourceNote = "Calculating the walking path…";
  } else if (source === "osrm") {
    sourceNote =
      "Path and duration from OpenStreetMap pedestrian routing (OSRM foot).";
  } else {
    sourceNote = routingError
      ? "Walking routing was unavailable, so this is a straight-line estimate."
      : "Showing a straight-line estimate between the route points.";
  }

  return (
    <div className="temple-route">
      {!ROUTE_COORDINATES_VERIFIED && (
        <div className="temple-route-note" role="status">
          <span className="temple-route-badge">Demo route</span>
          <span>
            Waypoint coordinates are approximate placeholders for the temple
            area — not a verified pedestrian path.
          </span>
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

          {path.length > 1 && (
            <Polyline
              positions={path}
              pathOptions={{ color: "#218C4A", weight: 6, opacity: 0.95 }}
            />
          )}

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

          {focusPoint && (
            <>
              <Circle
                center={[focusPoint.lat, focusPoint.lng]}
                radius={35}
                pathOptions={{
                  color: "#218C4A",
                  fillColor: "#218C4A",
                  fillOpacity: 0.25,
                  weight: 2,
                }}
              />
              <Marker
                position={[focusPoint.lat, focusPoint.lng]}
                icon={focusIcon}
                title={focusPoint.name || "Entry point"}
              >
                <Popup>
                  <strong>{focusPoint.name || "Entry point"}</strong>
                </Popup>
              </Marker>
            </>
          )}

          <FocusView point={focusPoint} />
          {!focusPoint && <FitRoute path={path} />}
        </MapContainer>

        <div className="temple-map-legend" aria-label="Route markers">
          {ROUTE_LEGEND.map(([label, color]) => (
            <span key={label} className="temple-map-legend-item">
              <span
                className="temple-map-legend-dot"
                style={{ background: color }}
              />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="temple-route-panel">
        <h2>Temple Route</h2>
        <p className="temple-route-steps">
          Entry Gate → Queue → Darshan → Exit Gate
        </p>

        <div className="temple-route-metrics">
          <div className="temple-route-metric">
            <span className="temple-route-metric-label">Walking distance</span>
            <span className="temple-route-metric-value">
              {formatDistance(distanceM)}
            </span>
          </div>
          <div className="temple-route-metric">
            <span className="temple-route-metric-label">Estimated time</span>
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
