import { useCallback, useEffect, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Pane,
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
  facilities,
  recommendedRoute,
} from "../../data/mockTempleMapData";
import {
  CROWD_THRESHOLDS,
  getCrowdColor,
  getCrowdLabel,
} from "../../utils/crowdLevel";

const LEVEL_EMOJI = {
  LOW: "🟢",
  MODERATE: "🟡",
  HIGH: "🟠",
  CRITICAL: "🔴",
  NO_DATA: "⚪",
};

const zoneColor = (level) => getCrowdColor(level);

const levelWord = (level) => {
  const normalised = (level || "").toUpperCase();
  return `${LEVEL_EMOJI[normalised] || "⚪"} ${getCrowdLabel(normalised)}`;
};

const SOURCE_EMOJI = { cctv: "📹", drone: "🛸", staff: "🧑‍💼", other: "•" };

const sourceWord = (source) => {
  switch (source) {
    case "cctv":
      return "Camera";
    case "drone":
      return "Drone";
    case "staff":
      return "Staff";
    case "other":
      return "Other";
    default:
      return source || "";
  }
};

function formatIso(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const STALE_MS = 12000;

function formatTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function markerIcon(color, label = "") {
  return L.divIcon({
    className: "temple-map-marker-icon",
    html: `<span class="temple-map-marker" style="--marker-color:${color}">${label}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function LocationMarker({ onError }) {
  const map = useMap();
  const [position, setPosition] = useState(null);

  useEffect(() => {
    let active = true;
    if (!navigator.geolocation) {
      onError("Location is not supported by this browser.");
      return () => {
        active = false;
      };
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!active) return;
        const location = [coords.latitude, coords.longitude];
        setPosition(location);
        onError(null);
        map.flyTo(location, Math.max(map.getZoom(), 16));
      },
      (error) => {
        if (active) onError(error.message || "Unable to get your location.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );

    return () => {
      active = false;
    };
  }, [map, onError]);

  return position ? (
    <Marker position={position} icon={markerIcon("#4285F4", "•")} title="You are here">
      <Popup>You are here</Popup>
    </Marker>
  ) : null;
}

function TempleMap({
  zoneCounts = {},
  spots = null,
  paths = null,
  showUser,
  showFacilities,
  showRoute,
}) {
  const [locationError, setLocationError] = useState(null);

  const handleLocationError = useCallback((error) => {
    setLocationError(error);
  }, []);

  const useSpots = Array.isArray(spots);
  const spotList = useSpots ? spots : [];
  const pathList = Array.isArray(paths) ? paths : [];

  const mappedPaths = pathList.filter(
    (path) => Array.isArray(path.geometry) && path.geometry.length >= 2
  );

  return (
    <div className="temple-map-wrapper">
      {showUser && locationError && (
        <div className="temple-map-location-error" role="status">
          {locationError}
        </div>
      )}
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

        <Marker
          position={[TIRUMALA_CENTER.lat, TIRUMALA_CENTER.lng]}
          icon={markerIcon("#218C4A", "T")}
          title="Sri Venkateswara Swamy Temple, Tirumala, Tirupati"
        >
          <Popup>Sri Venkateswara Swamy Temple</Popup>
        </Marker>

        {!useSpots && crowdZones.map((zone) => {
          const live = zoneCounts?.[zone.id];
          const counted = Boolean(live && live.available);
          const ageMs = live?.timestamp
            ? Date.now() - live.timestamp * 1000
            : Infinity;
          const stale = counted && ageMs > STALE_MS;
          const hasLive = counted && !stale;
          const people = live?.people;
          const level = live?.level;
          const color = hasLive ? zoneColor(level) : "#9aa0a6";
          const time = formatTime(live?.timestamp);

          return (
            <Circle
              key={zone.id}
              center={[zone.lat, zone.lng]}
              radius={zone.radius || 70}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: hasLive ? 0.28 : 0.12,
                weight: 2,
                dashArray: hasLive ? undefined : "5 5",
              }}
            >
              <Popup>
                <strong>{zone.name}</strong>
                <br />
                {hasLive ? (
                  <>
                    👥 {people} people here
                    <br />
                    {levelWord(level)}
                    <br />
                    <small>Updated {time}</small>
                    <br />
                    <small>From video</small>
                  </>
                ) : stale ? (
                  <>
                    👥 {people} people here
                    <br />
                    {levelWord(level)}
                    <br />
                    <small className="temple-map-popup-old">
                      Data may be old · last {time}
                    </small>
                    <br />
                    <small>From video</small>
                  </>
                ) : (
                  <>
                    ⚪ Crowd information unavailable
                    <br />
                    <small>Not started</small>
                  </>
                )}
              </Popup>
            </Circle>
          );
        })}

        {useSpots && (
          <Pane name="crowd-spots" style={{ zIndex: 450 }}>
            {spotList.map((spot) => (
              <CircleMarker
                key={spot.id}
                center={[spot.lat, spot.lng]}
                radius={12}
                pathOptions={{
                  color: "#ffffff",
                  weight: 3,
                  fillColor: spot.color || zoneColor(spot.level),
                  fillOpacity: 1,
                }}
              >
                <Popup>
                  <strong>{spot.name}</strong>
                  <br />
                  {spot.has_data ? (
                    <>
                      👥 {spot.people_count} people
                      <br />
                      {levelWord(spot.level)}
                      {spot.density_percent != null && (
                        <>
                          <br />
                          <small>{spot.density_percent}% of capacity</small>
                        </>
                      )}
                      <br />
                      <small>Updated {formatIso(spot.observed_at)}</small>
                      <br />
                      <small>
                        {SOURCE_EMOJI[spot.source] || "•"} {sourceWord(spot.source)}
                      </small>
                    </>
                  ) : spot.stale ? (
                    <>
                      👥 {spot.people_count} people
                      <br />
                      <small className="temple-map-popup-old">
                        Data may be old · last {formatIso(spot.observed_at)}
                      </small>
                    </>
                  ) : (
                    <>⚪ Crowd information unavailable</>
                  )}
                </Popup>
              </CircleMarker>
            ))}
          </Pane>
        )}

        {mappedPaths.length > 0 && (
          <Pane name="crowd-path-halo" style={{ zIndex: 430 }}>
            {mappedPaths.map((path) => (
              <Polyline
                key={`halo-${path.id}`}
                positions={path.geometry.map(([lat, lng]) => [lat, lng])}
                pathOptions={{
                  color: "#ffffff",
                  weight: 12,
                  opacity: 0.9,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            ))}
          </Pane>
        )}

        {mappedPaths.length > 0 && (
          <Pane name="crowd-path-line" style={{ zIndex: 440 }}>
            {mappedPaths.map((path) => (
              <Polyline
                key={path.id}
                positions={path.geometry.map(([lat, lng]) => [lat, lng])}
                pathOptions={{
                  color: path.color || zoneColor(path.level),
                  weight: 8,
                  opacity: 0.95,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              >
                <Popup>
                  <strong>{path.name}</strong>
                  <br />
                  {levelWord(path.level)}
                  {path.density_percent != null && (
                    <>
                      <br />
                      <small>{path.density_percent}% at busiest point</small>
                    </>
                  )}
                  <br />
                  <small>Colour follows the most crowded mapped spot</small>
                </Popup>
              </Polyline>
            ))}
          </Pane>
        )}

        {entryPoints.map((point) => (
          <Marker
            key={point.id}
            position={[point.lat, point.lng]}
            icon={markerIcon("#2ecc71", "→")}
            title={`${point.name} — Entry`}
          >
            <Popup>{point.name} · Entry</Popup>
          </Marker>
        ))}

        {exitPoints.map((point) => (
          <Marker
            key={point.id}
            position={[point.lat, point.lng]}
            icon={markerIcon("#e74c3c", "←")}
            title={`${point.name} — Exit`}
          >
            <Popup>{point.name} · Exit</Popup>
          </Marker>
        ))}

        {showFacilities &&
          facilities.map((facility) => (
            <Marker
              key={facility.id}
              position={[facility.lat, facility.lng]}
              icon={markerIcon("#14532D", "•")}
              title={facility.name}
            >
              <Popup>{facility.name}</Popup>
            </Marker>
          ))}

        {showRoute && (
          <Polyline
            positions={recommendedRoute.map((point) => [point.lat, point.lng])}
            pathOptions={{ color: "#218C4A", weight: 5, opacity: 0.9 }}
          />
        )}

        {showUser && <LocationMarker onError={handleLocationError} />}
      </MapContainer>

      <div className="temple-map-legend" aria-label="Crowd level legend">
        {Object.entries(CROWD_THRESHOLDS).map(([level, meta]) => (
          <span key={level} className="temple-map-legend-item">
            <span
              className="temple-map-legend-dot"
              style={{ background: meta.color }}
            />
            {meta.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default TempleMap;
