import { isSupabaseConfigured, supabase, getLocalDb, ZONES, sendJson } from "./lib/supabase.js";

const DEFAULT_ASSIGNEES = [
  "김수거 (1호차·청전의림)",
  "이청소 (2호차·중앙교동)",
  "박자원 (3호차·하소영천)"
];

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    let existing = [];
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("reports")
        .select("assignee")
        .not("assignee", "is", null);
      if (!error && data) {
        existing = data.map((r) => r.assignee).filter(Boolean);
      }
    } else {
      const db = getLocalDb();
      const rows = db.prepare("SELECT DISTINCT assignee FROM reports WHERE assignee IS NOT NULL AND assignee != ''").all();
      existing = rows.map((r) => r.assignee);
    }

    const merged = Array.from(new Set([...DEFAULT_ASSIGNEES, ...existing]));
    return sendJson(res, 200, { assignees: merged, zones: ZONES });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "서버 오류가 발생했습니다." });
  }
}
