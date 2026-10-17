import { apiGet, apiPut } from "./api";

const adminToken = import.meta.env.VITE_ADMIN_API_TOKEN;
const adminHeaders = adminToken ? { "X-Admin-Token": adminToken } : undefined;

export async function getExits() {
  return apiGet(`/api/exits?t=${Date.now()}`);
}

export async function updateExit(exitId, payload) {
  return apiPut(`/api/exits/${encodeURIComponent(exitId)}`, payload, {
    headers: adminHeaders,
  });
}

// Operator-settable statuses. "UNKNOWN" is derived by the backend and is never
// sent back as a value to store.
export const EXIT_STATUSES = ["OPEN", "BUSY", "CLOSED"];

export const EXIT_STATUS_LABELS = {
  OPEN: "Open",
  BUSY: "Busy",
  CLOSED: "Closed",
  UNKNOWN: "Status unknown",
};

export const EXIT_STATUS_COLORS = {
  OPEN: "#22C55E",
  BUSY: "#EAB308",
  CLOSED: "#DC2626",
  UNKNOWN: "#9CA3AF",
};
