import { useState, useEffect } from "react";
import {
  APIProvider,
  Map,
  Marker,
  AdvancedMarker,
  useMap,
  Pin,
} from "@vis.gl/react-google-maps";

import {
  TIRUMALA_CENTER,
  crowdZones,
  entryPoints,
  exitPoints,
  facilities,
  recommendedRoute,
} from "../../data/mockTempleMapData";

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

function drawCircle(map, center, radiusMeters, color, opacity = 0.25) {
  if (!map || !window.google?.maps) return null;
  const circle = new window.google.maps.Circle({
    center,
    radius: radiusMeters,
    strokeColor: color,
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: color,
    fillOpacity: opacity,
    map,
  });
  return circle;
}

function drawPolyline(map, path, color = "#6046e8") {
  if (!map || !window.google?.maps) return null;
  const poly = new window.google.maps.Polyline({
    path,
    geodesic: true,
    strokeColor: color,
    strokeOpacity: 0.9,
    strokeWeight: 4,
    icons: [
      {
        icon: {
          path: "M 0,-1 0,1",
          strokeOpacity: 0.8,
          scale: 4,
        },
        offset: "0",
        repeat: "12px",
      },
    ],
    map,
  });
  return poly;
}

function MapOverlay({
  liveData,
  showUser,
  showFacilities,
  showRoute,
  onZoneClick,
}) {
  const map = useMap();
  const [userPos, setUserPos] = useState(null);
  const [userError, setUserError] = useState(null);
  const [circles, setCircles] = useState([]);
  const [polyline, setPolyline] = useState(null);
  const [infoWindow, setInfoWindow] = useState(null);

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

  useEffect(() => {
    if (map) {
      map.setOptions({
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
      });
    }
  }, [map]);

  useEffect(() => {
    circles.forEach((c) => c.setMap(null));
    if (!map) return;
    const newCircles = [];
    crowdZones.forEach((zone) => {
      const live = liveData?.zone_id === zone.id ? liveData : null;
      const people = live?.people_count ?? zone.people;
      const capacity = live?.capacity ?? zone.capacity;
      const density = live?.density ?? zone.density;
      const level = (live?.level || zone.level).toUpperCase();
      const color = zoneColor(level);
      const c = drawCircle(
        map,
        { lat: zone.lat, lng: zone.lng },
        zone.radius || 70,
        color,
        0.22
      );
      if (c) {
        newCircles.push(c);
        window.google?.maps?.event?.addListener(c, "click", () => {
          if (onZoneClick) onZoneClick({ ...zone, people, capacity, density, level });
          if (infoWindow) infoWindow.close();
          const iw = new window.google.maps.InfoWindow({
            content: `<div style="min-width:150px;font-size:12px"><b>${zone.name}</b><br/>${people}/${capacity} people<br/>${density}% density<br/><b>${level} CROWD</b>${live ? "<br/><small>Live AI data</small>" : ""}</div>`,
            position: { lat: zone.lat, lng: zone.lng },
          });
          iw.open(map);
          setInfoWindow(iw);
        });
      }
    });
    setCircles(newCircles);
    return () => newCircles.forEach((c) => c.setMap(null));
  }, [map, liveData]);

  useEffect(() => {
    if (polyline) polyline.setMap(null);
    if (!map || !showRoute) return;
    const path = recommendedRoute.map((pt) => ({ lat: pt.lat, lng: pt.lng }));
    const p = drawPolyline(map, path, "#6046e8");
    if (p) setPolyline(p);
    return () => {
      if (p) p.setMap(null);
    };
  }, [map, showRoute]);

  useEffect(() => {
    if (!map || !showUser) {
      setUserPos(null);
      setUserError(null);
      return;
    }
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserPos(coords);
          setUserError(null);
          try {
            map.panTo(coords);
            if (map.getZoom() < 16) map.setZoom(16);
          } catch (e) {}
        },
        (err) => {
          setUserError(err.message || "Location unavailable");
          setUserPos(null);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      setUserError("Geolocation not supported");
      setUserPos(null);
    }
  }, [map, showUser]);

  return (
    <>
      <Marker position={TIRUMALA_CENTER} title="Sri Venkateswara Swamy Temple, Tirumala, Tirupati" />

      {entryPoints.map((p) => (
        <AdvancedMarker key={p.id} position={{ lat: p.lat, lng: p.lng }}>
          <Pin background="#2ecc71" borderColor="#12805c" glyph="→" />
        </AdvancedMarker>
      ))}

      {exitPoints.map((p) => (
        <AdvancedMarker key={p.id} position={{ lat: p.lat, lng: p.lng }}>
          <Pin background="#e74c3c" borderColor="#c0392b" glyph="←" />
        </AdvancedMarker>
      ))}

      {showFacilities &&
        facilities.map((f) => (
          <AdvancedMarker key={f.id} position={{ lat: f.lat, lng: f.lng }} title={`${f.name} — DEMO`}>
            <Pin background="#9b59b6" borderColor="#8e44ad" glyph="●" />
          </AdvancedMarker>
        ))}

      {userPos && (
        <AdvancedMarker position={userPos} title="You are here">
          <Pin background="#4285F4" borderColor="#1a73e8" glyph="📍" />
        </AdvancedMarker>
      )}
    </>
  );
}

function TempleMap({ liveData, showUser, showFacilities, showRoute, onZoneClick }) {
  if (!API_KEY || API_KEY === "YOUR_GOOGLE_MAPS_API_KEY") {
    return (
      <div className="temple-map-wrapper" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f1ff" }}>
        <div style={{ textAlign: "center", padding: "20px", color: "#d1481f", fontSize: "13px" }}>
          Google Maps API key is not configured. Set VITE_GOOGLE_MAPS_API_KEY in frontend/.env
        </div>
      </div>
    );
  }

  return (
    <div className="temple-map-wrapper">
      <APIProvider apiKey={API_KEY}>
        <Map
          defaultCenter={TIRUMALA_CENTER}
          defaultZoom={15}
          style={{ width: "100%", height: "100%" }}
          gestureHandling="greedy"
          disableDefaultUI={false}
        >
          <MapOverlay
            liveData={liveData}
            showUser={showUser}
            showFacilities={showFacilities}
            showRoute={showRoute}
            onZoneClick={onZoneClick}
          />
        </Map>
      </APIProvider>
    </div>
  );
}

export default TempleMap;
