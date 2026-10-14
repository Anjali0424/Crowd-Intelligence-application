import { useCallback, useEffect, useState } from "react";
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
  facilities,
  recommendedRoute,
} from "../../data/mockTempleMapData";

const zoneColor = (level) => {
  switch ((level || "").toUpperCase()) {
    case "LOW":
      return "#2ecc71";
    case "MODERATE":
      return "#f1c40f";
    case "HIGH":
      return "#e67e22";
    case "CRITICAL":
      return "#e74c3c";
    default:
      return "#7f8c8d";
  }
};

const levelWord = (level) => {
  switch ((level || "").toUpperCase()) {
    case "LOW":
      return "🟢 Less crowded";
    case "MODERATE":
      return "🟡 Busy";
    case "HIGH":
      return "🟠 Very busy";
    case "CRITICAL":
      return "🔴 Too crowded";
    default:
      return "⚪ No information";
  }
};

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
  showUser,
  showFacilities,
  showRoute,
}) {
  const [locationError, setLocationError] = useState(null);

  const handleLocationError = useCallback((error) => {
    setLocationError(error);
  }, []);

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
          icon={markerIcon("#6046e8", "T")}
          title="Sri Venkateswara Swamy Temple, Tirumala, Tirupati"
        >
          <Popup>Sri Venkateswara Swamy Temple</Popup>
        </Marker>

        {crowdZones.map((zone) => {
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
              icon={markerIcon("#9b59b6", "•")}
              title={facility.name}
            >
              <Popup>{facility.name}</Popup>
            </Marker>
          ))}

        {showRoute && (
          <Polyline
            positions={recommendedRoute.map((point) => [point.lat, point.lng])}
            pathOptions={{ color: "#6046e8", weight: 5, opacity: 0.9 }}
          />
        )}

        {showUser && <LocationMarker onError={handleLocationError} />}
      </MapContainer>

      <div className="temple-map-legend" aria-label="Crowd level legend">
        {[
          ["Less crowded", "#2ecc71"],
          ["Busy", "#f1c40f"],
          ["Very busy", "#e67e22"],
          ["Too crowded", "#e74c3c"],
          ["No information", "#9aa0a6"],
        ].map(([label, color]) => (
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
  );
}

export default TempleMap;
