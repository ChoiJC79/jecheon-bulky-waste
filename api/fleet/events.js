import { getLocalDb, sendJson } from "../lib/supabase.js";
import { getFleetDevice, latestSyncSeq, streamFleetEvents } from "../lib/fleet.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const deviceId = url.searchParams.get("deviceId") || "";
  if (deviceId && !getFleetDevice(deviceId)) {
    return sendJson(res, 400, { error: "등록된 현장 태블릿만 구독할 수 있습니다." });
  }
  const since = Number(url.searchParams.get("since") || 0) || 0;
  const db = getLocalDb();
  latestSyncSeq(db);
  return streamFleetEvents(req, res, { db, deviceId, since });
}
