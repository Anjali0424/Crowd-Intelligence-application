import {
  crowdZones,
  entryPoints,
  templeDestinations,
} from "../data/mockTempleMapData";

// FOSSGIS pedestrian (foot) routing instance, running OSRM with the
// "routed-foot" profile. OSRM keeps "driving" in the URL path for every
// profile, but this instance only exposes walkable ways (pedestrian routing).
export const OSRM_FOOT_URL =
  "https://routing.openstreetmap.de/routed-foot/route/v1/driving";

function zoneById(id) {
  return crowdZones.find((zone) => zone.id === id) || null;
}

function destinationById(id) {
  return templeDestinations.find((place) => place.id === id) || null;
}

function asViaPoint(source, fallbackName) {
  if (!source || !Number.isFinite(source.lat) || !Number.isFinite(source.lng)) {
    return null;
  }
  return {
    name: source.name || fallbackName,
    lat: source.lat,
    lng: source.lng,
  };
}

// Candidate routes are expressed only as ordered waypoints drawn from the
// project's own data. The path geometry, distance, duration and directions are
// always produced by the routing engine — nothing here is drawn by hand.
export function buildRouteCandidates() {
  const entry = entryPoints[0];
  const darshan = zoneById("darshan-area");
  const queue = zoneById("queue-area");
  const westMada = destinationById("west-mada-street");
  const eastMada = destinationById("east-mada-street");

  if (!entry || !darshan) return [];

  const definitions = [
    {
      id: "direct",
      title: "Direct approach",
      description: "Straight pedestrian approach to the darshan area.",
      via: [],
    },
    {
      id: "via-queue",
      title: "Via Queue Complex",
      description: "Approaches darshan through the Vaikuntam Queue Complex.",
      via: [queue && asViaPoint(queue, "Queue Area")],
    },
    {
      id: "via-west-mada",
      title: "Via West Mada Street",
      via: [destinationById("west-mada-street") && asViaPoint(destinationById("west-mada-street"), "West Mada Street")],
      description: "Follows the West Mada Street pradakshina path.",
    },
    {
      id: "via-east-mada",
      title: "Via East Mada Street",
      via: [destinationById("east-mada-street") && asViaPoint(destinationById("east-mada-street"), "East Mada Street")],
      description: "Follows the East Mada Street pradakshina path.",
    },
  ];

  const origin = asViaPoint(entry, "Main Entrance");
  const destination = asViaPoint(zoneById("darshan-area"), "Darshan Area");

  if (!origin || !destination) return [];

  return definitions
    .map((definition) => {
      if (definition.via.some((point) => !point)) return null;
      return {
        id: definition.id,
        title: definition.title,
        description: definition.description,
        via: definition.via.filter(Boolean),
        waypoints: [origin, ...definition.via.filter(Boolean), destination],
      };
    })
    .filter(Boolean);
}

function describeStep(step) {
  if (!step) return "";
  const { type = "", modifier = "" } = step.maneuver || {};
  const name = step.name ? ` on ${step.name}` : "";
  const mod = modifier ? ` ${modifier}` : "";

  switch (type) {
    case "depart":
      return `Head${mod || " forward"}${name}`;
    case "arrive":
      return "Arrive at the destination";
    case "turn":
      return `Turn${mod}${name}`;
    case "continue":
      return `Continue${mod || " straight"}${name}`;
    case "new name":
      return `Continue${name}`;
    case "end of road":
      return `At the end of the road, turn${mod}${name}`;
    case "fork":
      return `Keep${mod}${name}`;
    case "merge":
      return `Merge${mod}${name}`;
    case "on ramp":
      return `Take the ramp${name}`;
    case "off ramp":
      return `Take the exit${name}`;
    case "roundabout":
      return `Enter the roundabout${name}`;
    default: {
      const label = type ? type[0].toUpperCase() + type.slice(1) : "Continue";
      return `${label}${mod}${name}`.trim();
    }
  }
}

/**
 * Fetch a pedestrian route through the given waypoints.
 * Returns an array of routes (primary + any alternatives the engine provides).
 * Throws on network / service / no-route errors so callers can handle them.
 */
export async function fetchFootRoute(waypoints, { alternatives = 0, signal } = {}) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    throw new Error("At least two waypoints are required");
  }

  const coordinates = waypoints
    .map((point) => `${point.lng},${point.lat}`)
    .join(";");

  const params = new URLSearchParams({
    overview: "full",
    geometries: "geojson",
    steps: "true",
  });
  if (alternatives > 0) params.set("alternatives", String(alternatives));

  const response = await fetch(`${OSRM_FOOT_URL}/${coordinates}?${params}`, {
    signal,
  });
  if (!response.ok) {
    throw new Error("Routing service unavailable");
  }

  const data = await response.json();
  if (data.code !== "Ok" || !Array.isArray(data.routes) || data.routes.length === 0) {
    throw new Error("No walking route found");
  }

  // Normalise each route and drop anything we cannot safely render/number.
  const routes = data.routes
    .map((route) => {
      const geometry = (route?.geometry?.coordinates || [])
        .filter((pair) => Array.isArray(pair) && pair.length >= 2)
        .map(([lng, lat]) => [lat, lng])
        .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

      const steps = (route?.legs || [])
        .flatMap((leg) => (Array.isArray(leg?.steps) ? leg.steps : []))
        .map((step) => ({
          instruction: describeStep(step),
          distance: Number.isFinite(step?.distance) ? step.distance : null,
          street: step?.name || "",
        }))
        .filter((step) => step.instruction);

      return {
        distance: Number.isFinite(route?.distance) ? route.distance : null,
        duration: Number.isFinite(route?.duration) ? route.duration : null,
        geometry,
        steps,
      };
    })
    .filter(
      (route) =>
        route.geometry.length >= 2 &&
        Number.isFinite(route.distance) &&
        Number.isFinite(route.duration)
    );

  if (routes.length === 0) {
    throw new Error("No walking route found");
  }

  return routes;
}
