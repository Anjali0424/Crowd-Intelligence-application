// Single source of truth for the backend base URL. Override with the
// VITE_API_BASE environment variable; otherwise use the FastAPI default port.
const envBase = import.meta.env.VITE_API_BASE;
const DEFAULT_API_BASE = "https://crowd-intelligence-application.onrender.com";

export const API_BASE =
  typeof envBase === "string" && envBase.trim()
    ? envBase.trim().replace(/\/+$/, "")
    : DEFAULT_API_BASE;

const REQUEST_TIMEOUT_MS = 90000;

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

function unreachableError(error) {
  if (error?.name === "AbortError") {
    return new Error(
      "The server took too long to respond. It may be waking up. Please try again in a minute."
    );
  }
  if (error instanceof TypeError) {
    return new Error(
      "Could not reach the server. Check your connection, or wait a minute if the service is starting up, then try again."
    );
  }
  return error;
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs || REQUEST_TIMEOUT_MS
  );

  try {
    const init = {
      method: options.method || "GET",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      signal: controller.signal,
    };
    if (options.body !== undefined) init.body = options.body;
    const res = await fetch(`${API_BASE}${path}`, init);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "" }));
      const detail = errorDetail(err, "");
      const waking =
        !detail && (res.status === 502 || res.status === 503 || res.status === 504);
      const error = new Error(
        waking
          ? "The server is unavailable or still starting. Please try again in a minute."
          : detail || res.statusText || "The server returned an unexpected response."
      );
      error.response = { data: err, status: res.status };
      throw error;
    }

    return res.json();
  } catch (error) {
    if (error?.response) throw error;
    throw unreachableError(error);
  } finally {
    clearTimeout(timer);
  }
}

export async function apiGet(path, options = {}) {
  return request(path, options);
}

export async function apiPost(path, data, options = {}) {
  return request(path, {
    ...options,
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function apiPut(path, data, options = {}) {
  return request(path, {
    ...options,
    method: "PUT",
    body: JSON.stringify(data),
  });
}

