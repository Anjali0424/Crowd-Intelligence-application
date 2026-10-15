import { apiGet, apiPost } from "./api";

const adminToken = import.meta.env.VITE_ADMIN_API_TOKEN;
const adminHeaders = adminToken ? { "X-Admin-Token": adminToken } : undefined;

export async function getDarshanStatus() {
  return apiGet(`/api/darshan/status?t=${Date.now()}`);
}

export async function getDarshanCurrent() {
  return apiGet(`/api/darshan/current?t=${Date.now()}`);
}

export async function getDarshanPrediction(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, value);
    }
  });
  const suffix = query.toString();
  return apiGet(`/api/darshan/prediction${suffix ? `?${suffix}` : ""}`);
}

export async function runDarshanPrediction(payload = {}) {
  return apiPost("/api/darshan/predict", payload, { headers: adminHeaders });
}

export async function saveDarshanRecord(record) {
  return apiPost("/api/darshan/records", record, { headers: adminHeaders });
}

export async function getDarshanRecords(date) {
  const suffix = date ? `?date=${date}` : "";
  return apiGet(`/api/darshan/records${suffix}`);
}

export async function getDarshanHistory(limit = 50) {
  return apiGet(`/api/darshan/history?limit=${limit}`);
}

export async function trainDarshanModel() {
  return apiPost("/api/darshan/train", {}, { headers: adminHeaders });
}

export async function getDarshanModel() {
  return apiGet(`/api/darshan/model?t=${Date.now()}`);
}

export const LEVEL_META = {
  LOW: { dot: "🟢" },
  MODERATE: { dot: "🟡" },
  HIGH: { dot: "🟠" },
  CRITICAL: { dot: "🔴" },
};

export function formatMinutes(value) {
  if (value === null || value === undefined) return "—";
  const total = Math.round(Number(value));
  if (!Number.isFinite(total)) return "—";
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

export function formatClock(isoString) {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDataPoints(count) {
  if (count === null || count === undefined) return "—";
  return `${count} record${Number(count) === 1 ? "" : "s"}`;
}

export function levelFromDensity(density) {
  if (density == null) return null;
  if (density >= 91) return "CRITICAL";
  if (density >= 71) return "HIGH";
  if (density >= 41) return "MODERATE";
  return "LOW";
}
