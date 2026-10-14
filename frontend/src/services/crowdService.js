import { apiGet } from "./api";

export async function getLiveCrowd() {
  return apiGet("/api/crowd/live");
}

export async function getCameraCounts() {
  return apiGet(`/api/cameras/counts?t=${Date.now()}`);
}
