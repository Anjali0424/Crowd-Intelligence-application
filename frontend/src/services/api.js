// Single source of truth for the backend base URL. Override with the
// VITE_API_BASE environment variable; otherwise use the FastAPI default port.
const envBase = import.meta.env.VITE_API_BASE;
const DEFAULT_API_BASE = "http://127.0.0.1:8000";

export const API_BASE =
  typeof envBase === "string" && envBase.trim()
    ? envBase.trim().replace(/\/+$/, "")
    : DEFAULT_API_BASE;

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
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
    const error = new Error(err.detail || res.statusText);
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
    const error = new Error(err.detail || res.statusText);
    error.response = { data: err };
    throw error;
  }

  return res.json();
}

