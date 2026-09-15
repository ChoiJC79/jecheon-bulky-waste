import "dotenv/config";
import { createServer } from "node:http";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
await mkdir(join(root, "data"), { recursive: true });
await mkdir(join(root, "uploads"), { recursive: true });
const db = new DatabaseSync(join(root, "data", "waste.db"));
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const PHOTO_MIME_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
async function savePhoto(dataUrl, filenameBase) {
  const match = typeof dataUrl === "string" && dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) return null;
  const [, contentType, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > 6_000_000) return null;
  const filename = `${filenameBase}.${PHOTO_MIME_EXT[contentType]}`;
  await writeFile(join(root, "uploads", filename), buffer);
  return `/uploads/${filename}`;
}
const ZONES = ["청전·의림", "중앙·교동", "하소·영천"];
db.exec(`CREATE TABLE IF NOT EXISTS reports (report_no TEXT PRIMARY KEY, status TEXT NOT NULL, payment_method TEXT NOT NULL, payment_status TEXT NOT NULL, address TEXT NOT NULL, address_detail TEXT NOT NULL, latitude REAL, longitude REAL, zone TEXT, assignee TEXT, memo TEXT, total_fee INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT); CREATE TABLE IF NOT EXISTS report_items (id INTEGER PRIMARY KEY AUTOINCREMENT, report_no TEXT NOT NULL, name TEXT NOT NULL, option_name TEXT NOT NULL, quantity INTEGER NOT NULL, unit_fee INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, report_no TEXT NOT NULL, action TEXT NOT NULL, actor_role TEXT NOT NULL, created_at TEXT NOT NULL);`);
const reportColumns = db.prepare("PRAGMA table_info(reports)").all().map((column) => column.name);
for (const [column, type] of [["latitude", "REAL"], ["longitude", "REAL"], ["zone", "TEXT"], ["assignee", "TEXT"], ["memo", "TEXT"], ["updated_at", "TEXT"], ["before_photo", "TEXT"], ["after_photo", "TEXT"]]) {
  if (!reportColumns.includes(column)) db.exec(`ALTER TABLE reports ADD COLUMN ${column} ${type}`);
}
const send = (res, status, body) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(body)); };
const reportSelect = "SELECT report_no, status, payment_method, payment_status, address, address_detail, latitude, longitude, zone, assignee, memo, before_photo, after_photo, total_fee, created_at, updated_at FROM reports";
function listReports({ status, zone, assignee, q } = {}) {
  const clauses = []; const params = [];
  if (status) { clauses.push("status = ?"); params.push(status); }
  if (zone) { clauses.push("zone = ?"); params.push(zone); }
  if (assignee) { clauses.push("assignee = ?"); params.push(assignee); }
  if (q) { clauses.push("(report_no LIKE ? OR address LIKE ? OR address_detail LIKE ?)"); const like = `%${q}%`; params.push(like, like, like); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const reports = db.prepare(`${reportSelect} ${where} ORDER BY created_at DESC`).all(...params);
  const items = db.prepare("SELECT report_no, name, option_name, quantity, unit_fee FROM report_items").all();
  const itemsByReport = new Map();
  for (const item of items) { if (!itemsByReport.has(item.report_no)) itemsByReport.set(item.report_no, []); itemsByReport.get(item.report_no).push(item); }
  return reports.map((report) => ({ ...report, items: itemsByReport.get(report.report_no) || [] }));
}
function getReport(reportNo) {
  const report = db.prepare(`${reportSelect} WHERE report_no = ?`).get(reportNo);
  if (!report) return null;
  report.items = db.prepare("SELECT name, option_name, quantity, unit_fee FROM report_items WHERE report_no = ?").all(reportNo);
  return report;
}
async function parseBody(req) {
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 8_000_000) throw new Error("payload too large"); }
  return JSON.parse(raw || "{}");
}

async function api(req, res, url) {
  const path = url.pathname;
  if (req.method === "GET" && path === "/api/health") return send(res, 200, { ok: true });
  if (req.method === "GET" && path === "/api/staff-assignees") {
    const rows = db.prepare("SELECT DISTINCT assignee FROM reports WHERE assignee IS NOT NULL AND assignee != ''").all();
    const existing = rows.map((r) => r.assignee);
    const defaults = [
      "김수거 (1호차·청전의림)",
      "이청소 (2호차·중앙교동)",
      "박자원 (3호차·하소영천)"
    ];
    const merged = Array.from(new Set([...defaults, ...existing]));
    return send(res, 200, { assignees: merged, zones: ZONES });
  }
  if (req.method === "GET" && path === "/api/reports") {
    const status = url.searchParams.get("status") || undefined;
    const zone = url.searchParams.get("zone") || undefined;
    const assignee = url.searchParams.get("assignee") || undefined;
    const q = url.searchParams.get("q")?.trim() || undefined;
    return send(res, 200, { reports: listReports({ status, zone, assignee, q }), zones: ZONES });
  }
  const statusMatch = path.match(/^\/api\/reports\/([^/]+)\/status$/);
  if (req.method === "PATCH" && statusMatch) {
    const reportNo = decodeURIComponent(statusMatch[1]);
    const existing = getReport(reportNo);
    if (!existing) return send(res, 404, { error: "신고 건을 찾을 수 없습니다." });
    if (existing.status === "REJECTED") return send(res, 409, { error: "반려된 건은 상태를 변경할 수 없습니다." });
    let body; try { body = await parseBody(req); } catch { return send(res, 400, { error: "요청 내용을 읽을 수 없습니다." }); }
    const updatedAt = new Date().toISOString();
    if (body.action === "assign") {
      if (!ZONES.includes(body.zone)) return send(res, 400, { error: "수거구역을 선택해 주세요." });
      const assignee = typeof body.assignee === "string" ? body.assignee.trim() || null : null;
      db.prepare("UPDATE reports SET status = 'ASSIGNED', zone = ?, assignee = ?, memo = NULL, updated_at = ? WHERE report_no = ?").run(body.zone, assignee, updatedAt, reportNo);
      db.prepare("INSERT INTO audit_logs (report_no, action, actor_role, created_at) VALUES (?, 'ASSIGNED', 'RECEPTION', ?)").run(reportNo, updatedAt);
    } else if (body.action === "supplement" || body.action === "reject") {
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!reason) return send(res, 400, { error: "사유를 입력해 주세요." });
      const status = body.action === "supplement" ? "SUPPLEMENT_REQUESTED" : "REJECTED";
      db.prepare("UPDATE reports SET status = ?, memo = ?, updated_at = ? WHERE report_no = ?").run(status, reason, updatedAt, reportNo);
      db.prepare("INSERT INTO audit_logs (report_no, action, actor_role, created_at) VALUES (?, ?, 'RECEPTION', ?)").run(reportNo, status, updatedAt);
    } else if (body.action === "complete") {
      if (existing.status !== "ASSIGNED") return send(res, 409, { error: "수거구역이 배정된 건만 수거 완료 처리할 수 있습니다." });
      const afterPhoto = await savePhoto(body.afterPhoto, `${reportNo}-after`);
      if (!afterPhoto) return send(res, 400, { error: "현장에서 촬영한 사진을 첨부해 주세요." });
      db.prepare("UPDATE reports SET status = 'COLLECTED', after_photo = ?, memo = NULL, updated_at = ? WHERE report_no = ?").run(afterPhoto, updatedAt, reportNo);
      db.prepare("INSERT INTO audit_logs (report_no, action, actor_role, created_at) VALUES (?, 'COLLECTED', 'FIELD', ?)").run(reportNo, updatedAt);
    } else if (body.action === "uncollect") {
      if (existing.status !== "ASSIGNED" && existing.status !== "CHANGE_REQUESTED") {
        return send(res, 409, { error: "수거 진행 중인 건만 미수거 처리할 수 있습니다." });
      }
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!reason) return send(res, 400, { error: "미수거 사유를 입력해 주세요." });
      const proofPhoto = body.proofPhoto || body.afterPhoto ? await savePhoto(body.proofPhoto || body.afterPhoto, `${reportNo}-uncollected`) : null;
      db.prepare("UPDATE reports SET status = 'UNCOLLECTED', memo = ?, after_photo = COALESCE(?, after_photo), updated_at = ? WHERE report_no = ?").run(reason, proofPhoto, updatedAt, reportNo);
      db.prepare("INSERT INTO audit_logs (report_no, action, actor_role, created_at) VALUES (?, 'UNCOLLECTED', 'FIELD', ?)").run(reportNo, updatedAt);
    } else if (body.action === "field_change") {
      if (existing.status !== "ASSIGNED") {
        return send(res, 409, { error: "배정된 건만 현장 변경을 요청할 수 있습니다." });
      }
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!reason) return send(res, 400, { error: "현장 변경 요청 사유를 입력해 주세요." });
      const proofPhoto = body.proofPhoto || body.afterPhoto ? await savePhoto(body.proofPhoto || body.afterPhoto, `${reportNo}-fieldchange`) : null;
      db.prepare("UPDATE reports SET status = 'CHANGE_REQUESTED', memo = ?, after_photo = COALESCE(?, after_photo), updated_at = ? WHERE report_no = ?").run(reason, proofPhoto, updatedAt, reportNo);
      db.prepare("INSERT INTO audit_logs (report_no, action, actor_role, created_at) VALUES (?, 'CHANGE_REQUESTED', 'FIELD', ?)").run(reportNo, updatedAt);
    } else if (body.action === "confirm_payment" || body.action === "confirm_cash") {
      db.prepare("UPDATE reports SET payment_status = 'COMPLETED', updated_at = ? WHERE report_no = ?").run(updatedAt, reportNo);
      db.prepare("INSERT INTO audit_logs (report_no, action, actor_role, created_at) VALUES (?, 'PAYMENT_CONFIRMED', 'RECEPTION', ?)").run(reportNo, updatedAt);
    } else {
      return send(res, 400, { error: "지원하지 않는 작업입니다." });
    }
    return send(res, 200, { report: getReport(reportNo) });
  }
  if (req.method === "GET" && path === "/api/reports/export.csv") {
    const updatedAt = new Date().toISOString();
    db.prepare("INSERT INTO audit_logs (report_no, action, actor_role, created_at) VALUES ('ALL', 'CSV_EXPORT', 'VERIFICATION', ?)").run(updatedAt);
    const reports = listReports();
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
    res.writeHead(200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="jecheon-waste-reports-${new Date().toISOString().slice(0, 10)}.csv"`
    });
    return res.end(csvContent);
  }
  const lookupMatch = path.match(/^\/api\/reports\/([^/]+)$/);
  if (req.method === "GET" && lookupMatch) {
    const report = getReport(decodeURIComponent(lookupMatch[1]));
    if (!report) return send(res, 404, { error: "접수번호를 확인해 주세요." });
    const { report_no, status, payment_method, payment_status, address, address_detail, memo, before_photo, after_photo, total_fee, created_at, items } = report;
    return send(res, 200, { report: { report_no, status, payment_method, payment_status, address, address_detail, memo, before_photo, after_photo, total_fee, created_at, items } });
  }
  if (req.method === "GET" && path === "/api/verification") {
    const rows = db.prepare("SELECT report_no, status, payment_status, latitude, longitude, memo, created_at FROM reports ORDER BY created_at DESC").all();
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
      ...missingLocation.map((row) => ({ reportNo: row.report_no, category: "위치 정합성", detail: "위치 좌표가 저장되지 않았습니다.", owner: "접수 담당자" })),
      ...staleUnassigned.map((row) => ({ reportNo: row.report_no, category: "업무 정합성", detail: "접수 후 24시간이 지나도록 배정되지 않았습니다.", owner: "접수 담당자" })),
      ...followUp.map((row) => ({
        reportNo: row.report_no,
        category: statusCategory[row.status] || "확인 필요",
        detail: row.memo || "사유가 등록되지 않았습니다.",
        owner: row.status === "UNCOLLECTED" || row.status === "CHANGE_REQUESTED" ? "접수 담당자 (재배정/보완)" : "접수 담당자"
      }))
    ];
    return send(res, 200, { totalReports: total, pendingPayment, missingLocation: missingLocation.length, unassignedOver24h: staleUnassigned.length, flagged, directDatabaseAccess: false, note: "최종 담당자 화면은 읽기 전용 검증 API만 사용합니다." });
  }
  if (req.method !== "POST" || path !== "/api/reports") return send(res, 404, { error: "요청한 API를 찾을 수 없습니다." });
  try {
    const { address, addressDetail, paymentMethod, location, items, beforePhoto } = await parseBody(req);
    const validItems = Array.isArray(items) && items.length && items.every((item) => item.name && item.option && Number.isInteger(item.quantity) && item.quantity > 0 && Number.isInteger(item.fee) && item.fee >= 0);
    if (!address || !addressDetail || !["kakaopay", "naverpay", "tosspay", "card", "transfer", "cash"].includes(paymentMethod) || !validItems) return send(res, 400, { error: "주소, 상세 장소, 결제수단, 품목을 확인해 주세요." });
    const latitude = Number.isFinite(location?.latitude) ? location.latitude : null; const longitude = Number.isFinite(location?.longitude) ? location.longitude : null;
    const reportNo = `JC-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-6)}`;
    const beforePhotoPath = beforePhoto ? await savePhoto(beforePhoto, `${reportNo}-before`) : null;
    const createdAt = new Date().toISOString();
    const totalFee = items.reduce((sum, item) => sum + item.fee * item.quantity, 0);
    const paymentStatus = paymentMethod === "cash" ? "PENDING_CASH_RECEIPT" : (paymentMethod === "transfer" ? "PENDING_TRANSFER" : "COMPLETED");
    db.exec("BEGIN");
    try {
      db.prepare("INSERT INTO reports (report_no, status, payment_method, payment_status, address, address_detail, latitude, longitude, before_photo, total_fee, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(reportNo, "RECEIVED", paymentMethod, paymentStatus, address, addressDetail, latitude, longitude, beforePhotoPath, totalFee, createdAt, createdAt);
      const insertItem = db.prepare("INSERT INTO report_items (report_no, name, option_name, quantity, unit_fee) VALUES (?, ?, ?, ?, ?)");
      items.forEach((item) => insertItem.run(reportNo, item.name, item.option, item.quantity, item.fee));
      db.prepare("INSERT INTO audit_logs (report_no, action, actor_role, created_at) VALUES (?, ?, ?, ?)").run(reportNo, "REPORT_CREATED", "CITIZEN", createdAt);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    return send(res, 201, { reportNo, totalFee, paymentStatus });
  } catch { return send(res, 400, { error: "신고 내용을 읽을 수 없습니다." }); }
}
async function staticFile(res, path) {
  const relative = normalize(path === "/" ? "/index.html" : path).replace(/^([.][.][/\\])+/, ""); const file = join(root, relative);
  if (!file.startsWith(root)) return send(res, 403, { error: "허용되지 않은 경로입니다." });
  try { if ((await stat(file)).isDirectory()) throw new Error("directory"); res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" }); res.end(await readFile(file)); } catch { send(res, 404, { error: "파일을 찾을 수 없습니다." }); }
}
export const app = createServer(async (req, res) => { const url = new URL(req.url, "http://localhost"); if (url.pathname.startsWith("/api/")) return api(req, res, url); return staticFile(res, url.pathname); });
if (process.argv[1] === fileURLToPath(import.meta.url)) app.listen(4173, () => console.log("http://localhost:4173 (http://127.0.0.1:4173)"));
