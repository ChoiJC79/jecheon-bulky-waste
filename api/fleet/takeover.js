import { isSupabaseConfigured, supabase, getLocalDb, parseBody, sendJson } from "../lib/supabase.js";
import { buildFleetSnapshot, publicDevice, takeoverRoute, takeoverRouteRemote } from "../lib/fleet.js";

function listAllReports(db) {
  return db.prepare("SELECT report_no, status, address, address_detail, zone, assignee, updated_at FROM reports").all();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }
  try {
    const body = await parseBody(req);
    if (isSupabaseConfigured && supabase) {
      const result = await takeoverRouteRemote({ fromDeviceId: body.fromDeviceId, toDeviceId: body.toDeviceId });
      if (!result.ok) return sendJson(res, 400, { error: result.error });
      const { data } = await supabase.from("reports").select("report_no, status, address, address_detail, zone, assignee, updated_at");
      return sendJson(res, 200, {
        moved: result.moved,
        reportNos: result.reportNos,
        from: publicDevice(result.from),
        to: publicDevice(result.to),
        fleet: buildFleetSnapshot(null, data || [])
      });
    }
    const db = getLocalDb();
    const result = takeoverRoute(db, { fromDeviceId: body.fromDeviceId, toDeviceId: body.toDeviceId });
    if (!result.ok) return sendJson(res, 400, { error: result.error });
    return sendJson(res, 200, {
      moved: result.moved,
      reportNos: result.reportNos,
      from: publicDevice(result.from),
      to: publicDevice(result.to),
      fleet: buildFleetSnapshot(db, listAllReports(db))
    });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "경로 인수에 실패했습니다." });
  }
}
