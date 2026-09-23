import { ZONES, sendJson } from "./lib/supabase.js";
import { FLEET_DEVICES, publicDevice } from "./lib/fleet.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const devices = FLEET_DEVICES.map(publicDevice);
    return sendJson(res, 200, {
      assignees: devices.map((device) => device.name),
      devices,
      zones: ZONES,
      allMode: false
    });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "서버 오류가 발생했습니다." });
  }
}
