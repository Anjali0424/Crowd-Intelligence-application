import { apiGet, apiPost, apiPut } from "./api";

const adminToken = import.meta.env.VITE_ADMIN_API_TOKEN;
const adminHeaders = adminToken ? { "X-Admin-Token": adminToken } : undefined;

export async function getCrowdMap() {
  return apiGet(`/api/crowd/map?t=${Date.now()}`);
}

export async function getCrowdSpots() {
  return apiGet(`/api/crowd/spots?t=${Date.now()}`);
}

export async function createCrowdSpot(payload) {
  return apiPost("/api/crowd/spots", payload, { headers: adminHeaders });
}

export async function updateCrowdSpot(spotId, payload) {
  return apiPut(`/api/crowd/spots/${encodeURIComponent(spotId)}`, payload, {
    headers: adminHeaders,
  });
}

export async function saveCrowdObservation(spotId, payload) {
  return apiPost(
    `/api/crowd/spots/${encodeURIComponent(spotId)}/observations`,
    payload,
    { headers: adminHeaders }
  );
}

export async function getCrowdPaths() {
  return apiGet(`/api/crowd/paths?t=${Date.now()}`);
}

export async function savePathGeometry(pathId, payload) {
  return apiPost(
    `/api/crowd/paths/${encodeURIComponent(pathId)}/geometry`,
    payload,
    { headers: adminHeaders }
  );
}

export const SPOT_SOURCES = ["staff", "cctv", "drone", "other"];

export const SOURCE_LABELS = {
  staff: "Staff",
  cctv: "Camera",
  drone: "Drone",
  other: "Other",
};

export function sourceLabel(source) {
  return SOURCE_LABELS[source] || (source ? String(source) : "—");
}

export function formatClock(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
