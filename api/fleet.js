import { isSupabaseConfigured, supabase, getLocalDb, sendJson, ZONES } from "./lib/supabase.js";
import { buildFleetSnapshot } from "./lib/fleet.js";

function listAllReports(db) {
  return db.prepare("SELECT report_no, status, address, address_detail, zone, assignee, updated_at FROM reports ORDER BY created_at DESC").all();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }
  try {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("reports")
        .select("report_no, status, address, address_detail, zone, assignee, updated_at");
      if (error) throw error;
      return sendJson(res, 200, { ...buildFleetSnapshot(null, data || []), zones: ZONES });
    }
    const db = getLocalDb();
    return sendJson(res, 200, { ...buildFleetSnapshot(db, listAllReports(db)), zones: ZONES });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "태블릿 현황을 불러오지 못했습니다." });
  }
}
