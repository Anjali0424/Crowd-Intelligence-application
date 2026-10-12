const envBase = import.meta.env.VITE_API_BASE;
export const API_BASE =
  (typeof envBase === "string" && envBase.trim())
    ? envBase.trim()
    : "http://127.0.0.1:8000";


export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}
