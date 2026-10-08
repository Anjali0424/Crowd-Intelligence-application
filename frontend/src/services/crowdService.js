import { apiGet } from "./api";

export async function getLiveCrowd() {
  return apiGet("/api/crowd/live");
}
