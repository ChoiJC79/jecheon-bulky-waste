import { getLocalDb, sendJson } from "../lib/supabase.js";
import { getFleetDevice, latestSyncSeq, waitForFleetEvent } from "../lib/fleet.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const deviceId = url.searchParams.get("deviceId") || "";
  if (deviceId && !getFleetDevice(deviceId)) {
    return sendJson(res, 400, { error: "등록된 현장 태블릿만 대기할 수 있습니다." });
  }
  const since = Number(url.searchParams.get("since") || 0) || 0;
  const timeoutMs = Math.min(8000, Math.max(500, Number(url.searchParams.get("timeoutMs") || 8000) || 8000));
  const db = getLocalDb();
  const event = await waitForFleetEvent({ since, deviceId, timeoutMs });
  return sendJson(res, 200, { event, syncSeq: event?.seq || latestSyncSeq(db), timedOut: !event });
}
