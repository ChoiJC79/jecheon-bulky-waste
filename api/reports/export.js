import { isSupabaseConfigured, supabase, getLocalDb } from "../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end("Method not allowed");
  }

  try {
    const updatedAt = new Date().toISOString();
    let reports = [];

    if (isSupabaseConfigured && supabase) {
      await supabase.from("audit_logs").insert({
        report_no: "ALL",
        action: "CSV_EXPORT",
        actor_role: "VERIFICATION",
        created_at: updatedAt
      });

      const { data, error } = await supabase
        .from("reports")
        .select("report_no, status, payment_method, payment_status, address, address_detail, latitude, longitude, zone, assignee, memo, total_fee, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      reports = data || [];
    } else {
      const db = getLocalDb();
      db.prepare("INSERT INTO audit_logs (report_no, action, actor_role, created_at) VALUES ('ALL', 'CSV_EXPORT', 'VERIFICATION', ?)").run(updatedAt);
      const reportSelect = "SELECT report_no, status, payment_method, payment_status, address, address_detail, latitude, longitude, zone, assignee, memo, total_fee, created_at FROM reports ORDER BY created_at DESC";
      reports = db.prepare(reportSelect).all();
    }

    const headers = ["접수번호", "상태", "결제수단", "결제상태", "주소", "상세주소", "위도", "경도", "수거구역", "담당자", "수수료", "메모", "접수일시"];
    const rows = reports.map((r) => [
      r.report_no,
      r.status,
      r.payment_method,
      r.payment_status,
      `"${(r.address || "").replaceAll('"', '""')}"`,
      `"${(r.address_detail || "").replaceAll('"', '""')}"`,
      r.latitude ?? "",
      r.longitude ?? "",
      r.zone ?? "",
      r.assignee ?? "",
      r.total_fee,
      `"${(r.memo || "").replaceAll('"', '""')}"`,
      r.created_at
    ].join(","));

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const filenameDate = new Date().toISOString().slice(0, 10);

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="jecheon-waste-reports-${filenameDate}.csv"`
    );
    return res.end(csvContent);
  } catch (error) {
    res.statusCode = 500;
    return res.end("CSV 생성 중 오류가 발생했습니다.");
  }
}
