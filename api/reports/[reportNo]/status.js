import {
  isSupabaseConfigured,
  supabase,
  getLocalDb,
  savePhoto,
  parseBody,
  sendJson,
  ZONES
} from "../../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "PATCH") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  // URL에서 reportNo 추출 (/api/reports/JC-xxx/status 또는 req.query.reportNo)
  const segments = req.url.split("/").filter(Boolean);
  const statusIdx = segments.indexOf("status");
  const rawReportNo = req.query?.reportNo || (statusIdx > 0 ? segments[statusIdx - 1] : segments[segments.length - 2]);
  if (!rawReportNo) {
    return sendJson(res, 400, { error: "접수번호가 필요합니다." });
  }
  const reportNo = decodeURIComponent(rawReportNo);

  try {
    let existing = null;
    if (isSupabaseConfigured && supabase) {
      const { data } = await supabase
        .from("reports")
        .select("report_no, status, after_photo")
        .eq("report_no", reportNo)
        .maybeSingle();
      existing = data;
    } else {
      const db = getLocalDb();
      existing = db.prepare("SELECT report_no, status, after_photo FROM reports WHERE report_no = ?").get(reportNo);
    }

    if (!existing) return sendJson(res, 404, { error: "신고 건을 찾을 수 없습니다." });
    if (existing.status === "REJECTED") return sendJson(res, 409, { error: "반려된 건은 상태를 변경할 수 없습니다." });

    let body;
    try {
      body = await parseBody(req);
    } catch {
      return sendJson(res, 400, { error: "요청 내용을 읽을 수 없습니다." });
    }

    const updatedAt = new Date().toISOString();
    let updates = {};
    let auditAction = "";
    let auditRole = "RECEPTION";

    if (body.action === "assign") {
      if (!ZONES.includes(body.zone)) return sendJson(res, 400, { error: "수거구역을 선택해 주세요." });
      const assignee = typeof body.assignee === "string" ? body.assignee.trim() || null : null;
      updates = { status: "ASSIGNED", zone: body.zone, assignee, memo: null, updated_at: updatedAt };
      auditAction = "ASSIGNED";
      auditRole = "RECEPTION";
    } else if (body.action === "supplement" || body.action === "reject") {
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!reason) return sendJson(res, 400, { error: "사유를 입력해 주세요." });
      const newStatus = body.action === "supplement" ? "SUPPLEMENT_REQUESTED" : "REJECTED";
      updates = { status: newStatus, memo: reason, updated_at: updatedAt };
      auditAction = newStatus;
      auditRole = "RECEPTION";
    } else if (body.action === "complete") {
      if (existing.status !== "ASSIGNED") {
        return sendJson(res, 409, { error: "수거구역이 배정된 건만 수거 완료 처리할 수 있습니다." });
      }
      const afterPhoto = await savePhoto(body.afterPhoto, `${reportNo}-after`);
      if (!afterPhoto) return sendJson(res, 400, { error: "현장에서 촬영한 사진을 첨부해 주세요." });
      updates = { status: "COLLECTED", after_photo: afterPhoto, memo: null, updated_at: updatedAt };
      auditAction = "COLLECTED";
      auditRole = "FIELD";
    } else if (body.action === "uncollect") {
      if (existing.status !== "ASSIGNED" && existing.status !== "CHANGE_REQUESTED") {
        return sendJson(res, 409, { error: "수거 진행 중인 건만 미수거 처리할 수 있습니다." });
      }
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!reason) return sendJson(res, 400, { error: "미수거 사유를 입력해 주세요." });
      const proofPhoto = body.proofPhoto || body.afterPhoto ? await savePhoto(body.proofPhoto || body.afterPhoto, `${reportNo}-uncollected`) : null;
      updates = {
        status: "UNCOLLECTED",
        memo: reason,
        updated_at: updatedAt,
        ...(proofPhoto ? { after_photo: proofPhoto } : {})
      };
      auditAction = "UNCOLLECTED";
      auditRole = "FIELD";
    } else if (body.action === "field_change") {
      if (existing.status !== "ASSIGNED") {
        return sendJson(res, 409, { error: "배정된 건만 현장 변경을 요청할 수 있습니다." });
      }
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!reason) return sendJson(res, 400, { error: "현장 변경 요청 사유를 입력해 주세요." });
      const proofPhoto = body.proofPhoto || body.afterPhoto ? await savePhoto(body.proofPhoto || body.afterPhoto, `${reportNo}-fieldchange`) : null;
      updates = {
        status: "CHANGE_REQUESTED",
        memo: reason,
        updated_at: updatedAt,
        ...(proofPhoto ? { after_photo: proofPhoto } : {})
      };
      auditAction = "CHANGE_REQUESTED";
      auditRole = "FIELD";
    } else if (body.action === "confirm_payment" || body.action === "confirm_cash") {
      updates = { payment_status: "COMPLETED", updated_at: updatedAt };
      auditAction = "PAYMENT_CONFIRMED";
      auditRole = "RECEPTION";
    } else {
      return sendJson(res, 400, { error: "지원하지 않는 작업입니다." });
    }

    if (isSupabaseConfigured && supabase) {
      const { error: updateError } = await supabase
        .from("reports")
        .update(updates)
        .eq("report_no", reportNo);
      if (updateError) throw updateError;

      await supabase.from("audit_logs").insert({
        report_no: reportNo,
        action: auditAction,
        actor_role: auditRole,
        created_at: updatedAt
      });

      const { data: updatedReport } = await supabase
        .from("reports")
        .select(`
          report_no, status, payment_method, payment_status,
          address, address_detail, latitude, longitude,
          zone, assignee, memo, before_photo, after_photo,
          total_fee, created_at, updated_at,
          report_items ( name, option_name, quantity, unit_fee )
        `)
        .eq("report_no", reportNo)
        .maybeSingle();

      const report = {
        ...updatedReport,
        items: updatedReport?.report_items || []
      };
      delete report.report_items;

      return sendJson(res, 200, { report });
    }

    // SQLite Fallback
    const db = getLocalDb();
    if (body.action === "assign") {
      db.prepare("UPDATE reports SET status = 'ASSIGNED', zone = ?, assignee = ?, memo = NULL, updated_at = ? WHERE report_no = ?").run(body.zone, updates.assignee, updatedAt, reportNo);
    } else if (body.action === "supplement" || body.action === "reject") {
      db.prepare("UPDATE reports SET status = ?, memo = ?, updated_at = ? WHERE report_no = ?").run(updates.status, updates.memo, updatedAt, reportNo);
    } else if (body.action === "complete") {
      db.prepare("UPDATE reports SET status = 'COLLECTED', after_photo = ?, memo = NULL, updated_at = ? WHERE report_no = ?").run(updates.after_photo, updatedAt, reportNo);
    } else if (body.action === "uncollect" || body.action === "field_change") {
      db.prepare("UPDATE reports SET status = ?, memo = ?, after_photo = COALESCE(?, after_photo), updated_at = ? WHERE report_no = ?").run(updates.status, updates.memo, updates.after_photo || null, updatedAt, reportNo);
    } else if (body.action === "confirm_payment" || body.action === "confirm_cash") {
      db.prepare("UPDATE reports SET payment_status = 'COMPLETED', updated_at = ? WHERE report_no = ?").run(updatedAt, reportNo);
    }

    db.prepare("INSERT INTO audit_logs (report_no, action, actor_role, created_at) VALUES (?, ?, ?, ?)").run(reportNo, auditAction, auditRole, updatedAt);

    const reportSelect = "SELECT report_no, status, payment_method, payment_status, address, address_detail, latitude, longitude, zone, assignee, memo, before_photo, after_photo, total_fee, created_at, updated_at FROM reports";
    const report = db.prepare(`${reportSelect} WHERE report_no = ?`).get(reportNo);
    report.items = db.prepare("SELECT name, option_name, quantity, unit_fee FROM report_items WHERE report_no = ?").all(reportNo);

    return sendJson(res, 200, { report });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "상태 변경 중 오류가 발생했습니다." });
  }
}
