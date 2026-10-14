import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import {
  TIRUMALA_CENTER,
  templeDestinations,
} from "../../data/mockTempleMapData";

const FALLBACK_CENTER = [TIRUMALA_CENTER.lat, TIRUMALA_CENTER.lng];
const FALLBACK_ZOOM = 16;
const USER_ZOOM = 17;

const CATEGORY_ORDER = [
  "Temple",
  "Prasadam",
  "Medical",
  "Washroom",
  "Water",
  "Help Desk",
  "Transport",
  "Accommodation",
  "Other",
];

// FOSSGIS pedestrian (foot) routing instance. OSRM keeps "driving" as the
// profile segment in the path, but the "routed-foot" instance routes on foot.
const OSRM_FOOT_URL =
  "https://routing.openstreetmap.de/routed-foot/route/v1/driving";

// Reuses the existing temple-map marker styling from index.css.
function markerIcon(color, label) {
  return L.divIcon({
    className: "temple-map-marker-icon",
    html: `<span class="temple-map-marker" style="--marker-color:${color}">${label}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

const templeIcon = markerIcon("#6046e8", "T");
const userIcon = markerIcon("#4285F4", "•");
const destinationIcon = markerIcon("#e67e22", "★");
const selectedDestinationIcon = markerIcon("#2ecc71", "★");

function isValidCoordinate(value) {
  return (
    value &&
    typeof value.lat === "number" &&
    typeof value.lng === "number" &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng)
  );
}

function locationErrorMessage(error) {
  switch (error && error.code) {
    case 1:
      return "Location permission was denied. Allow location access for this site in your browser, then try again.";
    case 2:
      return "Your location is unavailable right now. Make sure GPS / location services are turned on, then try again.";
    case 3:
      return "Getting your location took too long. Please try again.";
    default:
      return (error && error.message) || "We could not get your location.";
  }
}

function MapController({ onReady, onUserDrag, position, follow, route }) {
  const map = useMap();

  useEffect(() => {
    onReady(map);
  }, [map, onReady]);

  useEffect(() => {
    const handleDrag = () => onUserDrag();
    map.on("dragstart", handleDrag);
    return () => map.off("dragstart", handleDrag);
  }, [map, onUserDrag]);

  useEffect(() => {
    if (position && follow) {
      map.panTo([position.lat, position.lng]);
    }
  }, [map, position, follow]);

  useEffect(() => {
    if (route && route.length > 1) {
      map.fitBounds(L.latLngBounds(route), { padding: [40, 40] });
    }
  }, [map, route]);

  return null;
}

function Navigation() {
  const [position, setPosition] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [status, setStatus] = useState("locating");
  const [errorMessage, setErrorMessage] = useState("");
  const [follow, setFollow] = useState(true);

  const [destinationId, setDestinationId] = useState("");
  const [route, setRoute] = useState([]);
  const [routeMessage, setRouteMessage] = useState("");
  const [isRouting, setIsRouting] = useState(false);

  const watchIdRef = useRef(null);
  const mapRef = useRef(null);

  const destinations = useMemo(() => {
    if (!Array.isArray(templeDestinations)) return [];
    return templeDestinations.filter(isValidCoordinate);
  }, []);

  const groupedDestinations = useMemo(() => {
    const groups = new Map();
    destinations.forEach((place) => {
      const category = place.category || "Other";
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(place);
    });
    return [...groups.entries()]
      .sort((a, b) => {
        const ai = CATEGORY_ORDER.indexOf(a[0]);
        const bi = CATEGORY_ORDER.indexOf(b[0]);
        return (ai === -1 ? CATEGORY_ORDER.length : ai) -
          (bi === -1 ? CATEGORY_ORDER.length : bi);
      })
      .map(([category, places]) => [
        category,
        [...places].sort((a, b) =>
          (a.name || a.id).localeCompare(b.name || b.id)
        ),
      ]);
  }, [destinations]);

  const selectedDestination = useMemo(
    () => destinations.find((place) => place.id === destinationId) || null,
    [destinations, destinationId]
  );

  useEffect(() => {
    if (destinations.length > 0 && !destinationId) {
      setDestinationId(destinations[0].id);
    }
  }, [destinations, destinationId]);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
  }, []);

  const startWatching = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("error");
      setErrorMessage(
        "Location is not supported by this browser. Please try a different browser."
      );
      return;
    }

    stopWatching();
    setStatus("locating");
    setErrorMessage("");

    watchIdRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setPosition({ lat: coords.latitude, lng: coords.longitude });
        setAccuracy(coords.accuracy);
        setStatus("ready");
        setErrorMessage("");
      },
      (error) => {
        setStatus("error");
        setErrorMessage(locationErrorMessage(error));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  }, [stopWatching]);

  useEffect(() => {
    startWatching();
    return stopWatching;
  }, [startWatching, stopWatching]);

  const handleMapReady = useCallback((map) => {
    mapRef.current = map;
  }, []);

  const handleUserDrag = useCallback(() => {
    setFollow(false);
  }, []);

  const handleLocate = useCallback(() => {
    setFollow(true);

    const map = mapRef.current;
    const target = position
      ? [position.lat, position.lng]
      : FALLBACK_CENTER;

    if (map) {
      map.flyTo(target, position ? USER_ZOOM : FALLBACK_ZOOM);
    }

    if (!position) {
      startWatching();
    }
  }, [position, startWatching]);

  const handleDestinationChange = useCallback((event) => {
    setDestinationId(event.target.value);
    setRoute([]);
    setRouteMessage("");
  }, []);

  const handleShowRoute = useCallback(async () => {
    if (destinations.length === 0) {
      setRoute([]);
      setRouteMessage("Destination data is unavailable, so a route cannot be drawn.");
      return;
    }

    if (!selectedDestination) {
      setRoute([]);
      setRouteMessage("Please choose a destination first.");
      return;
    }

    const usingCurrentLocation = isValidCoordinate(position);
    const origin = usingCurrentLocation ? position : TIRUMALA_CENTER;

    setIsRouting(true);
    setRouteMessage("");
    setRoute([]);

    try {
      const coordinates = `${origin.lng},${origin.lat};${selectedDestination.lng},${selectedDestination.lat}`;
      const url = `${OSRM_FOOT_URL}/${coordinates}?overview=full&geometries=geojson`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Routing service unavailable");
      }

      const result = await response.json();
      const geometry = result?.routes?.[0]?.geometry?.coordinates;

      if (result?.code !== "Ok" || !Array.isArray(geometry) || geometry.length < 2) {
        throw new Error("Route not found");
      }

      // GeoJSON coordinates are [longitude, latitude]; Leaflet expects [lat, lng].
      const path = geometry.map(([lng, lat]) => [lat, lng]);
      setRoute(path);

      const routeInfo = result.routes[0];
      const distanceKm = routeInfo.distance
        ? (routeInfo.distance / 1000).toFixed(1)
        : null;
      const minutes = routeInfo.duration
        ? Math.round(routeInfo.duration / 60)
        : null;
      const summary =
        distanceKm && minutes
          ? ` (${distanceKm} km, about ${minutes} min on foot)`
          : "";

      const startNote = usingCurrentLocation
        ? ""
        : " Starting from the temple centre because your location is unavailable.";
      setRouteMessage(
        `Walking route to ${selectedDestination.name}${summary}.${startNote}`
      );
    } catch {
      setRoute([]);
      setRouteMessage(
        "Could not calculate a walking route right now. Please try again later."
      );
    } finally {
      setIsRouting(false);
    }
  }, [destinations, selectedDestination, position]);

  return (
    <div className="nav-page">
      <div className="nav-map-shell">
        <MapContainer
          center={FALLBACK_CENTER}
          zoom={FALLBACK_ZOOM}
          scrollWheelZoom
          className="nav-map-canvas"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <Marker position={FALLBACK_CENTER} icon={templeIcon}>
            <Popup>Sri Venkateswara Swamy Temple, Tirumala</Popup>
          </Marker>

          {destinations.map((place) => (
            <Marker
              key={place.id}
              position={[place.lat, place.lng]}
              icon={
                place.id === destinationId
                  ? selectedDestinationIcon
                  : destinationIcon
              }
            >
              <Popup>
                <strong>{place.name || place.id}</strong>
                <br />
                <small>
                  {place.category || "Destination"}
                  {place.verified === false ? " · approx. location" : ""}
                </small>
              </Popup>
            </Marker>
          ))}

          {position && (
            <Marker
              position={[position.lat, position.lng]}
              icon={userIcon}
              title="You are here"
            >
              <Popup>
                <strong>You are here</strong>
                {accuracy ? (
                  <>
                    <br />
                    Accuracy: about {Math.round(accuracy)} m
                  </>
                ) : null}
              </Popup>
            </Marker>
          )}

          {route.length > 1 && (
            <Polyline
              positions={route}
              pathOptions={{ color: "#6046e8", opacity: 0.95, weight: 6 }}
            />
          )}

          <MapController
            onReady={handleMapReady}
            onUserDrag={handleUserDrag}
            position={position}
            follow={follow}
            route={route}
          />
        </MapContainer>

        <button
          type="button"
          className="nav-locate-btn"
          onClick={handleLocate}
          title="Recenter on my location"
        >
          <span aria-hidden="true">📍</span> My Location
        </button>

        {status === "locating" && (
          <div className="nav-pill" role="status">
            <span className="nav-spinner" aria-hidden="true" /> Getting your
            location…
          </div>
        )}

        {status === "error" && (
          <div className="nav-overlay" role="alert">
            <div className="nav-card">
              <span className="nav-card-icon" aria-hidden="true">
                📍
              </span>
              <h3>Location unavailable</h3>
              <p>{errorMessage}</p>
              <button type="button" className="nav-btn" onClick={startWatching}>
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>

      {status === "ready" && (
        <p className="nav-meta" role="status">
          {accuracy ? `Accurate to about ${Math.round(accuracy)} m · ` : ""}
          Live location — updating as you move
        </p>
      )}

      <div
        className="nav-route-controls"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          padding: "12px",
          background: "#ffffff",
          border: "1px solid #ece6ff",
          borderRadius: "18px",
        }}
      >
        {destinations.length === 0 ? (
          <p role="alert" style={{ margin: 0, fontSize: "12.5px", color: "#7a719b" }}>
            Destination data is unavailable right now, so walking routes cannot
            be shown.
          </p>
        ) : (
          <>
            <label htmlFor="temple-destination">Destination</label>
            <select
              id="temple-destination"
              value={destinationId}
              onChange={handleDestinationChange}
            >
              <option value="">Select a destination…</option>
              {groupedDestinations.map(([category, places]) => (
                <optgroup key={category} label={category}>
                  {places.map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.name || place.label || place.id}
                      {place.verified === false ? " (approx.)" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              type="button"
              className="nav-btn"
              onClick={handleShowRoute}
              disabled={isRouting || !selectedDestination}
            >
              {isRouting ? "Finding route…" : "Show Walking Route"}
            </button>
            {routeMessage && <p role="status">{routeMessage}</p>}
          </>
        )}
      </div>
    </div>
  );
}

export default Navigation;
