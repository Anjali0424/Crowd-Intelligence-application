import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

import { getCameraCounts } from "../../services/crowdService";
import { buildRouteCandidates, fetchFootRoute } from "../../services/routeService";
import { TIRUMALA_CENTER, crowdZones } from "../../data/mockTempleMapData";

// Live crowd readings older than this are treated as unavailable.
const STALE_MS = 12000;

// Zone readings are considered relevant to a route when the route passes
// within the zone radius plus this buffer.
const ZONE_BUFFER_M = 30;

// The entry/darshan/queue coordinates in the project data are demo
// placeholders clustered around the temple. Flip this to true once real,
// verified waypoint coordinates are supplied.
const ROUTE_COORDINATES_VERIFIED = false;

const ZONE_CAPACITY = Object.fromEntries(
  crowdZones.map((zone) => [zone.id, zone.capacity])
);

const LEVEL_COLORS = {
  LOW: "#22c55e",
  MODERATE: "#facc15",
  HIGH: "#f97316",
  CRITICAL: "#ef4444",
};

const LEVEL_WORDS = {
  LOW: "Less crowded",
  MODERATE: "Busy",
  HIGH: "Very crowded",
  CRITICAL: "Too crowded",
};

function levelFromDensity(density) {
  if (density == null) return null;
  if (density >= 91) return "CRITICAL";
  if (density >= 71) return "HIGH";
  if (density >= 41) return "MODERATE";
  return "LOW";
}

function buildZoneCounts(cameras) {
  const zones = {};

  for (const camera of cameras) {
    const zoneId = camera.zone_id;
    if (!zoneId) continue;

    if (!zones[zoneId]) {
      zones[zoneId] = {
        available: false,
        people: 0,
        capacity: ZONE_CAPACITY[zoneId] || camera.capacity || null,
        timestamp: 0,
      };
    }

    const zone = zones[zoneId];
    if (camera.available && camera.has_count) {
      zone.available = true;
      const people = camera.people_count || 0;
      if (people >= zone.people) zone.people = people;
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

function nearestRouteDistanceMeters(geometry, zone) {
  let min = Infinity;
  const point = [zone.lat, zone.lng];
  for (const vertex of geometry) {
    const distance = haversineMeters(point, vertex);
    if (distance < min) min = distance;
  }
  return min;
}

function crowdForRoute(geometry, liveZones) {
  let best = null;
  for (const zone of liveZones) {
    const reach = (zone.radius || 60) + ZONE_BUFFER_M;
    if (nearestRouteDistanceMeters(geometry, zone) <= reach) {
      if (!best || zone.density > best.density) best = zone;
    }
  }
  return best;
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

function geometrySignature(route) {
  if (!Array.isArray(route.geometry) || route.geometry.length < 2) return null;
  const distance = Number.isFinite(route.distance)
    ? Math.round(route.distance)
    : 0;
  return `${distance}:${route.geometry.length}`;
}

function markerIcon(color, label) {
  return L.divIcon({
    className: "temple-map-marker-icon",
    html: `<span class="temple-map-marker" style="--marker-color:${color}">${label}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

const startIcon = markerIcon("#2ecc71", "S");
const destIcon = markerIcon("#6046e8", "D");
const viaIcon = markerIcon("#f1c40f", "V");

const ROUTE_LEGEND = [
  ["Start", "#2ecc71"],
  ["Via point", "#f1c40f"],
  ["Darshan", "#6046e8"],
];

function FitRoute({ path }) {
  const map = useMap();

  useEffect(() => {
    if (path && path.length > 1) {
      map.fitBounds(L.latLngBounds(path), { padding: [36, 36] });
    }
  }, [map, path]);

  return null;
}

function RecommendedRoute() {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [routeError, setRouteError] = useState(null);
  const [rawRoutes, setRawRoutes] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);

  // Poll live camera counts; crowd is best-effort and never blocks the routes.
  useEffect(() => {
    let mounted = true;
    let timer;

    async function fetchData() {
      try {
        const res = await getCameraCounts();
        if (!mounted) return;
        setCameras(res.cameras || []);
      } catch {
        if (mounted) setCameras([]);
      }
    }

    fetchData();
    timer = setInterval(fetchData, 5000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  // Fetch every candidate route once on mount.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      const candidates = buildRouteCandidates();
      if (candidates.length === 0) {
        setLoading(false);
        setRouteError("Route data is unavailable.");
        return;
      }

      const results = await Promise.allSettled(
        candidates.map((candidate) =>
          fetchFootRoute(candidate.waypoints, {
            alternatives: 2,
            signal: controller.signal,
          })
        )
      );

      if (cancelled) return;

      const seen = new Set();
      const routes = [];

      results.forEach((result, index) => {
        if (result.status !== "fulfilled") return;
        const candidate = candidates[index];
        result.value.forEach((route, option) => {
          const signature = geometrySignature(route);
          if (!signature || seen.has(signature)) return;
          seen.add(signature);
          routes.push({
            key: `${candidate.id}-${option}`,
            title:
              option === 0
                ? candidate.title
                : `${candidate.title} (alt ${option + 1})`,
            description: candidate.description,
            // Keep the waypoints and via points on the flattened route so the
            // map markers and "Via …" text always have arrays to work with.
            waypoints: Array.isArray(candidate.waypoints)
              ? candidate.waypoints
              : [],
            via: Array.isArray(candidate.via) ? candidate.via : [],
            geometry: Array.isArray(route.geometry) ? route.geometry : [],
            steps: Array.isArray(route.steps) ? route.steps : [],
            distance: Number.isFinite(route.distance) ? route.distance : null,
            duration: Number.isFinite(route.duration) ? route.duration : null,
          });
        });
      });

      setRawRoutes(routes);
      setRouteError(
        routes.length === 0
          ? "Could not load walking routes. Check the routing service and try again."
          : null
      );
      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const liveZones = useMemo(() => {
    const counts = buildZoneCounts(cameras);
    const now = Date.now();
    return crowdZones
      .map((zone) => {
        const data = counts[zone.id];
        if (!data || !data.available || !data.capacity || !data.level) {
          return null;
        }
        const ageMs = data.timestamp ? now - data.timestamp * 1000 : Infinity;
        if (ageMs > STALE_MS) return null;
        return {
          ...zone,
          density: data.density,
          level: data.level,
          people: data.people,
        };
      })
      .filter(Boolean);
  }, [cameras]);

  const options = useMemo(() => {
    const withCrowd = rawRoutes.map((route) => {
      const zone = crowdForRoute(route.geometry, liveZones);
      return {
        ...route,
        density: zone ? zone.density : null,
        level: zone ? zone.level : null,
        crowdZoneName: zone ? zone.name : null,
      };
    });

    if (withCrowd.length === 0) return [];

    const shortest = [...withCrowd].sort((a, b) => a.distance - b.distance)[0];
    const fastest = [...withCrowd].sort((a, b) => a.duration - b.duration)[0];

    const densities = withCrowd
      .map((route) => route.density)
      .filter((value) => value != null);
    const crowdDiscriminates =
      densities.length >= 2 && new Set(densities).size > 1;

    const lowest = crowdDiscriminates
      ? withCrowd
          .filter((route) => route.density != null)
          .sort((a, b) => a.density - b.density)[0]
      : null;

    const claimed = new Set();
    const badges = {};
    if (lowest) {
      badges[lowest.key] = "Lowest crowd";
      claimed.add(lowest.key);
    }
    if (shortest && !claimed.has(shortest.key)) {
      badges[shortest.key] = "Shortest distance";
      claimed.add(shortest.key);
    }
    if (fastest && !claimed.has(fastest.key)) {
      badges[fastest.key] = "Fastest walk";
      claimed.add(fastest.key);
    }

    const recommendedKey = (lowest || shortest || fastest).key;

    return withCrowd
      .map((route) => ({
        ...route,
        badge: badges[route.key] || "Alternative",
        recommended: route.key === recommendedKey,
      }))
      .sort((a, b) => {
        if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
        return a.distance - b.distance;
      });
  }, [rawRoutes, liveZones]);

  useEffect(() => {
    if (options.length === 0) return;
    if (!options.some((option) => option.key === selectedKey)) {
      setSelectedKey(options[0].key);
    }
  }, [options, selectedKey]);

  const selected =
    options.find((option) => option.key === selectedKey) || options[0] || null;

  const path = Array.isArray(selected?.geometry) ? selected.geometry : [];

  let crowdNote;
  if (liveZones.length === 0) {
    crowdNote =
      "Live crowd counts are unavailable right now, so routes are compared by distance and walking time only.";
  } else if (options.length > 0 && options.every((option) => option.density == null)) {
    crowdNote =
      "No live crowd reading applies to these routes yet; they are compared by distance and walking time.";
  } else {
    crowdNote =
      "Crowd level is the busiest live-monitored zone a route passes through.";
  }

  return (
    <div className="route-page">
      {!ROUTE_COORDINATES_VERIFIED && (
        <div className="temple-route-note" role="status">
          <span className="temple-route-badge">Demo route</span>
          <span>
            Waypoints are approximate placeholders for the temple area. Paths
            and timings come from OpenStreetMap pedestrian routing (OSRM foot).
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
              pathOptions={{ color: "#2563eb", weight: 6, opacity: 0.95 }}
            />
          )}

          {(selected?.waypoints || []).map((point, index) => {
            const isStart = index === 0;
            const isEnd = index === selected.waypoints.length - 1;
            const icon = isStart ? startIcon : isEnd ? destIcon : viaIcon;
            return (
              <Marker
                key={`${point.name}-${index}`}
                position={[point.lat, point.lng]}
                icon={icon}
                title={point.name}
              >
                <Popup>{point.name}</Popup>
              </Marker>
            );
          })}

          <FitRoute path={path} />
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

      <section className="route-options">
        <h2>Routes to darshan</h2>
        <p className="route-options-subtitle">
          Compare walking distance, time and live crowd level, then pick a route
          to see it on the map.
        </p>
        <p className="route-crowd-note">{crowdNote}</p>

        {loading && <p className="route-status">Finding walking routes…</p>}
        {routeError && <div className="route-error">{routeError}</div>}

        <div className="route-cards">
          {options.map((option) => {
            const active = selected && option.key === selected.key;
            const color = option.level ? LEVEL_COLORS[option.level] : "#9aa0a6";
            return (
              <button
                key={option.key}
                type="button"
                className={`route-card ${active ? "active" : ""} ${
                  option.recommended ? "recommended" : ""
                }`}
                aria-pressed={active}
                onClick={() => setSelectedKey(option.key)}
              >
                <div className="route-card-head">
                  <span className="route-card-title">{option.title}</span>
                  <span
                    className={`route-badge ${
                      option.recommended ? "is-recommended" : ""
                    }`}
                  >
                    {option.recommended ? "Recommended" : option.badge}
                  </span>
                </div>

                <div className="route-card-metrics">
                  <span className="route-card-metric">
                    <strong>{formatDistance(option.distance)}</strong>
                    <small>walk</small>
                  </span>
                  <span className="route-card-metric">
                    <strong>{formatDuration(option.duration)}</strong>
                    <small>time</small>
                  </span>
                  <span className="route-card-metric">
                    <strong style={{ color }}>
                      {option.density != null ? `${option.density}%` : "—"}
                    </strong>
                    <small>crowd</small>
                  </span>
                </div>

                <span className="route-card-crowd">
                  <span
                    className="route-crowd-dot"
                    style={{ background: color }}
                  />
                  {option.density != null
                    ? `${LEVEL_WORDS[option.level] || "Busy"}${
                        option.crowdZoneName ? ` at ${option.crowdZoneName}` : ""
                      }`
                    : "Crowd data unavailable"}
                </span>

                {(option.via || []).length > 0 && (
                  <span className="route-card-via">
                    Via {(option.via || []).map((point) => point.name).join(" · ")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {selected && (
        <section className="route-steps-panel">
          <h3>{selected.title}</h3>
          <p className="route-steps-head">
            {formatDistance(selected.distance)} ·{" "}
            {formatDuration(selected.duration)} walking ·{" "}
            {selected.density != null
              ? `${LEVEL_WORDS[selected.level] || "Busy"}`
              : "crowd unavailable"}
          </p>
          <ol className="route-steps-list">
            {(selected.steps || []).map((step, index) => (
              <li key={`${index}-${step.instruction}`}>
                <span>{step.instruction}</span>
                {Number.isFinite(step.distance) && step.distance > 0 && (
                  <small>{formatDistance(step.distance)}</small>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

export default RecommendedRoute;
