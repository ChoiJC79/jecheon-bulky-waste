import { getLocalDb, parseBody, sendJson } from "../lib/supabase.js";
import { getFleetDevice, publicDevice, recordPresence } from "../lib/fleet.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }
  try {
    const body = await parseBody(req);
    const device = getFleetDevice(body.deviceId);
    if (!device) return sendJson(res, 400, { error: "등록된 현장 태블릿만 연결할 수 있습니다." });
    const db = getLocalDb();
    const lastSeenAt = recordPresence(db, device.id, {
      activeReportNo: typeof body.activeReportNo === "string" ? body.activeReportNo : null
    });
    return sendJson(res, 200, { ok: true, lastSeenAt, device: publicDevice(device) });
  } catch (error) {
    return sendJson(res, 400, { error: error.message || "연결 상태를 저장하지 못했습니다." });
  }
}
