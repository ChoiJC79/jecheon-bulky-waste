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
function listReports({ status, zone, q } = {}) {
  const clauses = []; const params = [];
  if (status) { clauses.push("status = ?"); params.push(status); }
  if (zone) { clauses.push("zone = ?"); params.push(zone); }
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
  if (req.method === "GET" && path === "/api/reports") {
    const status = url.searchParams.get("status") || undefined;
    const zone = url.searchParams.get("zone") || undefined;
    const q = url.searchParams.get("q")?.trim() || undefined;
    return send(res, 200, { reports: listReports({ status, zone, q }), zones: ZONES });
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
    } else {
      return send(res, 400, { error: "지원하지 않는 작업입니다." });
    }
    return send(res, 200, { report: getReport(reportNo) });
  }
  const lookupMatch = path.match(/^\/api\/reports\/([^/]+)$/);
  if (req.method === "GET" && lookupMatch) {
    const report = getReport(decodeURIComponent(lookupMatch[1]));
    if (!report) return send(res, 404, { error: "접수번호를 확인해 주세요." });
    const { report_no, status, payment_status, address, before_photo, after_photo, total_fee, created_at, items } = report;
    return send(res, 200, { report: { report_no, status, payment_status, address, before_photo, after_photo, total_fee, created_at, items } });
  }
  if (req.method === "GET" && path === "/api/verification") {
    const rows = db.prepare("SELECT report_no, status, payment_status, latitude, longitude, memo, created_at FROM reports ORDER BY created_at DESC").all();
    const total = rows.length;
    const pendingPayment = rows.filter((row) => row.payment_status !== "COMPLETED").length;
    const missingLocation = rows.filter((row) => row.latitude === null || row.longitude === null);
    const dayMs = 24 * 60 * 60 * 1000;
    const staleUnassigned = rows.filter((row) => row.status === "RECEIVED" && Date.now() - new Date(row.created_at).getTime() > dayMs);
    const followUp = rows.filter((row) => row.status === "SUPPLEMENT_REQUESTED" || row.status === "REJECTED");
    const flagged = [
      ...missingLocation.map((row) => ({ reportNo: row.report_no, category: "위치 정합성", detail: "위치 좌표가 저장되지 않았습니다.", owner: "접수 담당자" })),
      ...staleUnassigned.map((row) => ({ reportNo: row.report_no, category: "업무 정합성", detail: "접수 후 24시간이 지나도록 배정되지 않았습니다.", owner: "접수 담당자" })),
      ...followUp.map((row) => ({ reportNo: row.report_no, category: row.status === "REJECTED" ? "반려 처리" : "보완 요청", detail: row.memo || "사유가 등록되지 않았습니다.", owner: "접수 담당자" }))
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
    const createdAt = new Date().toISOString(); const totalFee = items.reduce((sum, item) => sum + item.fee * item.quantity, 0); const paymentStatus = paymentMethod === "cash" ? "PENDING_CASH_RECEIPT" : "PENDING_PAYMENT";
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
if (process.argv[1] === fileURLToPath(import.meta.url)) app.listen(4173, "127.0.0.1", () => console.log("http://127.0.0.1:4173"));
