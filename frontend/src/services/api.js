// One backend address for every API call. Production uses the deployed API.
// Set VITE_API_URL (or the older VITE_API_BASE) to http://127.0.0.1:8000
// when you want the local FastAPI server instead.
const PRODUCTION_API_BASE = "https://crowd-intelligence-application.onrender.com";

function cleanBase(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\/+$/, "");
}

const configuredBase =
  cleanBase(import.meta.env.VITE_API_URL) ||
  cleanBase(import.meta.env.VITE_API_BASE);

export const API_BASE = configuredBase || PRODUCTION_API_BASE;

export function toWebSocketUrl(path) {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const wsBase = API_BASE.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:");
  return `${wsBase}${suffix}`;
}

function errorDetail(payload, fallback) {
  const detail = payload?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const text = detail
      .map((item) => (typeof item === "string" ? item : item?.msg))
      .filter(Boolean)
      .join(" ");
    if (text) return text;
  }
  return fallback;
}

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorDetail(err, res.statusText));
  }

  return res.json();
}

export async function apiPost(path, data, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const error = new Error(errorDetail(err, res.statusText));
    error.response = { data: err };
    throw error;
  }

  return res.json();
}

export async function apiPut(path, data, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const error = new Error(errorDetail(err, res.statusText));
    error.response = { data: err };
    throw error;
  }

  return res.json();
}

