import { getLocalDb, parseBody, sendJson } from "../lib/supabase.js";
import { publicDevice, recordPresence, verifyDevicePin } from "../lib/fleet.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }
  try {
    const body = await parseBody(req);
    const check = verifyDevicePin(body.deviceId, body.pin);
    if (!check.ok) return sendJson(res, 401, { error: check.error });
    const db = getLocalDb();
    recordPresence(db, check.device.id);
    return sendJson(res, 200, { device: publicDevice(check.device) });
  } catch (error) {
    return sendJson(res, 400, { error: error.message || "태블릿을 등록하지 못했습니다." });
  }
}
