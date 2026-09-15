import { isSupabaseConfigured, supabase, getLocalDb, sendJson } from "./lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    let rows = [];
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("reports")
        .select("report_no, status, payment_status, latitude, longitude, memo, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      rows = data || [];
    } else {
      const db = getLocalDb();
      rows = db.prepare("SELECT report_no, status, payment_status, latitude, longitude, memo, created_at FROM reports ORDER BY created_at DESC").all();
    }

    const total = rows.length;
    const pendingPayment = rows.filter((row) => row.payment_status !== "COMPLETED").length;
    const missingLocation = rows.filter((row) => row.latitude === null || row.longitude === null);
    const dayMs = 24 * 60 * 60 * 1000;
    const staleUnassigned = rows.filter((row) => row.status === "RECEIVED" && Date.now() - new Date(row.created_at).getTime() > dayMs);
    const followUp = rows.filter((row) => ["SUPPLEMENT_REQUESTED", "REJECTED", "UNCOLLECTED", "CHANGE_REQUESTED"].includes(row.status));

    const statusCategory = {
      REJECTED: "반려 처리",
      UNCOLLECTED: "현장 미수거",
      CHANGE_REQUESTED: "현장변경 요청",
      SUPPLEMENT_REQUESTED: "보완 요청"
    };

    const flagged = [
      ...missingLocation.map((row) => ({
        reportNo: row.report_no,
        category: "위치 정합성",
        detail: "위치 좌표가 저장되지 않았습니다.",
        owner: "접수 담당자"
      })),
      ...staleUnassigned.map((row) => ({
        reportNo: row.report_no,
        category: "업무 정합성",
        detail: "접수 후 24시간이 지나도록 배정되지 않았습니다.",
        owner: "접수 담당자"
      })),
      ...followUp.map((row) => ({
        reportNo: row.report_no,
        category: statusCategory[row.status] || "확인 필요",
        detail: row.memo || "사유가 등록되지 않았습니다.",
        owner: row.status === "UNCOLLECTED" || row.status === "CHANGE_REQUESTED" ? "접수 담당자 (재배정/보완)" : "접수 담당자"
      }))
    ];

    return sendJson(res, 200, {
      totalReports: total,
      pendingPayment,
      missingLocation: missingLocation.length,
      unassignedOver24h: staleUnassigned.length,
      flagged,
      directDatabaseAccess: false,
      note: "최종 담당자 화면은 읽기 전용 검증 API만 사용합니다."
    });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "검증 데이터를 조회할 수 없습니다." });
  }
}
