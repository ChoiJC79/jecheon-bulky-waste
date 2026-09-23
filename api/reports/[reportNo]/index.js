import { isSupabaseConfigured, supabase, getLocalDb, sendJson } from "../../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  // URL에서 reportNo 추출 (/api/reports/JC-xxx 또는 req.query.reportNo)
  const reportNo = req.query?.reportNo || req.url.split("/").filter(Boolean).slice(-1)[0]?.split("?")[0];
  if (!reportNo) {
    return sendJson(res, 400, { error: "접수번호가 필요합니다." });
  }

  const decodedNo = decodeURIComponent(reportNo);

  try {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("reports")
        .select(`
          report_no, status, payment_method, payment_status,
          address, address_detail, latitude, longitude,
          zone, assignee, memo, before_photo, after_photo,
          total_fee, created_at, updated_at, citizen_name, citizen_phone, channel,
          report_items ( name, option_name, quantity, unit_fee )
        `)
        .eq("report_no", decodedNo)
        .maybeSingle();

      if (error) throw error;
      if (!data) return sendJson(res, 404, { error: "접수번호를 확인해 주세요." });

      const report = {
        ...data,
        items: data.report_items || []
      };
      delete report.report_items;

      return sendJson(res, 200, { report });
    }

    // SQLite Fallback
    const db = getLocalDb();
    const reportSelect = "SELECT report_no, status, payment_method, payment_status, address, address_detail, latitude, longitude, zone, assignee, memo, before_photo, after_photo, total_fee, created_at, updated_at, citizen_name, citizen_phone, channel FROM reports";
    const report = db.prepare(`${reportSelect} WHERE report_no = ?`).get(decodedNo);
    if (!report) return sendJson(res, 404, { error: "접수번호를 확인해 주세요." });

    report.items = db
      .prepare("SELECT name, option_name, quantity, unit_fee FROM report_items WHERE report_no = ?")
      .all(decodedNo);

    return sendJson(res, 200, { report });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "신고 정보를 조회할 수 없습니다." });
  }
}
