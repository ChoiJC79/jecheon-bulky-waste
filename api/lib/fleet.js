import { EventEmitter } from "node:events";
import { isSupabaseConfigured, supabase } from "./supabase.js";

export const ONLINE_WINDOW_MS = 20_000;
export const FLEET_POLL_MS = 3_000;

export const FLEET_DEVICES = Object.freeze([
  { id: "tablet-1", name: "1호차", zone: "청전·의림", role: "field", pin: "1111" },
  { id: "tablet-2", name: "2호차", zone: "중앙·교동", role: "field", pin: "2222" },
  { id: "tablet-spare", name: "예비", zone: "", role: "spare", pin: "0000" }
]);

const FIELD_JOB_STATUSES = ["ASSIGNED", "UNCOLLECTED", "CHANGE_REQUESTED"];
const presenceMemory = new Map();
export const fleetBus = new EventEmitter();
fleetBus.setMaxListeners(80);

export function publicDevice(device) {
  return {
    id: device.id,
    name: device.name,
    zone: device.zone,
    role: device.role
  };
}

export function aliasesFor(device) {
  const aliases = [device.id, device.name];
  if (device.id === "tablet-1") aliases.push("김수거 (1호차·청전의림)");
  if (device.id === "tablet-2") aliases.push("이청소 (2호차·중앙교동)");
  if (device.id === "tablet-spare") aliases.push("박자원 (3호차·하소영천)");
  return aliases;
}

export function getFleetDevice(value) {
  if (!value || value === "__ALL__") return null;
  const raw = String(value).trim();
  for (const device of FLEET_DEVICES) {
    if (aliasesFor(device).includes(raw)) return device;
    if (raw.includes(device.name)) return device;
  }
  return null;
}

export function suggestedDeviceId(zone) {
  if (zone === "중앙·교동") return "tablet-2";
  return "tablet-1";
}

export function verifyDevicePin(deviceId, pin) {
  const device = FLEET_DEVICES.find((item) => item.id === deviceId);
  if (!device) return { ok: false, error: "등록되지 않은 태블릿입니다." };
  if (String(pin || "") !== device.pin) return { ok: false, error: "기기 PIN이 올바르지 않습니다." };
  return { ok: true, device };
}

export function ensureFleetSchema(db) {
  if (!db) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS fleet_presence (
      device_id TEXT PRIMARY KEY,
      last_seen_at TEXT NOT NULL,
      bound_at TEXT,
      active_report_no TEXT
    );
    CREATE TABLE IF NOT EXISTS fleet_events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      device_id TEXT,
      report_no TEXT,
      payload TEXT,
      created_at TEXT NOT NULL
    );
  `);
}

function touchMemory(deviceId, at) {
  presenceMemory.set(deviceId, at);
}

export function isDeviceOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  const ts = Date.parse(lastSeenAt);
  return Number.isFinite(ts) && Date.now() - ts <= ONLINE_WINDOW_MS;
}

export function currentPresence(deviceId, db) {
  const mem = presenceMemory.get(deviceId);
  if (db) {
    try {
      const row = db.prepare("SELECT last_seen_at FROM fleet_presence WHERE device_id = ?").get(deviceId);
      const persisted = row?.last_seen_at;
      if (!mem) return persisted || null;
      if (!persisted) return mem;
      return Date.parse(mem) >= Date.parse(persisted) ? mem : persisted;
    } catch {
      return mem || null;
    }
  }
  return mem || null;
}

export function recordPresence(db, deviceId, { activeReportNo = null } = {}) {
  const at = new Date().toISOString();
  touchMemory(deviceId, at);
  if (db) {
    ensureFleetSchema(db);
    db.prepare(`
      INSERT INTO fleet_presence (device_id, last_seen_at, bound_at, active_report_no)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET
        last_seen_at = excluded.last_seen_at,
        active_report_no = excluded.active_report_no
    `).run(deviceId, at, at, activeReportNo);
  }
  persistPresenceRemote(deviceId, at, activeReportNo).catch(() => {});
  return at;
}

async function persistPresenceRemote(deviceId, at, activeReportNo) {
  if (!isSupabaseConfigured || !supabase) return;
  await supabase.from("fleet_presence").upsert({
    device_id: deviceId,
    last_seen_at: at,
    bound_at: at,
    active_report_no: activeReportNo
  });
}

export function latestSyncSeq(db) {
  if (!db) return 0;
  try {
    ensureFleetSchema(db);
    const row = db.prepare("SELECT MAX(seq) AS seq FROM fleet_events").get();
    return Number(row?.seq || 0);
  } catch {
    return 0;
  }
}

export function publishFleetEvent(db, { type, deviceId = null, reportNo = null, payload = null } = {}) {
  const createdAt = new Date().toISOString();
  let seq = Date.now();
  if (db) {
    ensureFleetSchema(db);
    const result = db.prepare(
      "INSERT INTO fleet_events (event_type, device_id, report_no, payload, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(type, deviceId, reportNo, payload ? JSON.stringify(payload) : null, createdAt);
    seq = Number(result.lastInsertRowid || seq);
  }
  const event = { seq, type, deviceId, reportNo, payload, createdAt };
  fleetBus.emit("fleet", event);
  persistEventRemote(event).catch(() => {});
  return event;
}

async function persistEventRemote(event) {
  if (!isSupabaseConfigured || !supabase) return;
  await supabase.from("fleet_events").insert({
    event_type: event.type,
    device_id: event.deviceId,
    report_no: event.reportNo,
    payload: event.payload || null,
    created_at: event.createdAt
  });
}

export function notifyReportChange(db, { action, report } = {}) {
  if (!report) return null;
  const device = getFleetDevice(report.assignee);
  return publishFleetEvent(db, {
    type: action || "report-change",
    deviceId: device?.id || null,
    reportNo: report.report_no,
    payload: {
      status: report.status,
      assignee: report.assignee || null,
      deviceName: device?.name || null
    }
  });
}

function jobMatchesDevice(report, device) {
  if (!report?.assignee || !device) return false;
  return Boolean(getFleetDevice(report.assignee)?.id === device.id);
}

export function jobsForDevice(reports, device) {
  return (reports || []).filter((report) => jobMatchesDevice(report, device));
}

export function buildFleetSnapshot(db, reports = []) {
  const syncSeq = latestSyncSeq(db);
  const devices = FLEET_DEVICES.map((device) => {
    const lastSeenAt = currentPresence(device.id, db);
    const assignedJobs = jobsForDevice(reports, device).filter((report) => FIELD_JOB_STATUSES.includes(report.status));
    return {
      ...publicDevice(device),
      online: isDeviceOnline(lastSeenAt),
      lastSeenAt,
      assignedCount: assignedJobs.length,
      jobs: assignedJobs.map((report) => ({
        report_no: report.report_no,
        status: report.status,
        address: report.address,
        address_detail: report.address_detail,
        zone: report.zone,
        updated_at: report.updated_at
      }))
    };
  });
  return {
    devices,
    syncSeq,
    realtime: "sse+poll",
    pollMs: FLEET_POLL_MS,
    operatingMode: "named-tablets",
    allMode: false
  };
}

export function takeoverRoute(db, { fromDeviceId, toDeviceId }) {
  const from = getFleetDevice(fromDeviceId);
  const to = getFleetDevice(toDeviceId);
  if (!from || !to) return { ok: false, error: "인수할 현장 태블릿을 확인해 주세요." };
  if (from.id === to.id) return { ok: false, error: "같은 태블릿으로는 인수할 수 없습니다." };
  if (to.role !== "spare" && from.role !== "spare") {
    return { ok: false, error: "현장 태블릿 장애 시 예비 태블릿으로 인계하세요." };
  }

  const aliases = aliasesFor(from);
  const placeholders = aliases.map(() => "?").join(", ");
  const now = new Date().toISOString();
  const rows = db.prepare(
    `SELECT report_no FROM reports WHERE status IN (${FIELD_JOB_STATUSES.map(() => "?").join(",")}) AND assignee IN (${placeholders})`
  ).all(...FIELD_JOB_STATUSES, ...aliases);

  const reportNos = rows.map((row) => row.report_no);
  for (const reportNo of reportNos) {
    db.prepare("UPDATE reports SET assignee = ?, updated_at = ? WHERE report_no = ?").run(to.id, now, reportNo);
    db.prepare("INSERT INTO audit_logs (report_no, action, actor_role, created_at) VALUES (?, 'ROUTE_TAKEOVER', 'RECEPTION', ?)").run(reportNo, now);
  }

  const event = publishFleetEvent(db, {
    type: "takeover",
    deviceId: to.id,
    reportNo: reportNos[0] || null,
    payload: { fromDeviceId: from.id, toDeviceId: to.id, reportNos }
  });
  publishFleetEvent(db, {
    type: "takeover-cleared",
    deviceId: from.id,
    payload: { fromDeviceId: from.id, toDeviceId: to.id, reportNos }
  });

  return { ok: true, from, to, reportNos, moved: reportNos.length, event };
}

export async function takeoverRouteRemote({ fromDeviceId, toDeviceId }) {
  const from = getFleetDevice(fromDeviceId);
  const to = getFleetDevice(toDeviceId);
  if (!from || !to) return { ok: false, error: "인수할 현장 태블릿을 확인해 주세요." };
  if (from.id === to.id) return { ok: false, error: "같은 태블릿으로는 인수할 수 없습니다." };
  if (to.role !== "spare" && from.role !== "spare") {
    return { ok: false, error: "현장 태블릿 장애 시 예비 태블릿으로 인계하세요." };
  }
  if (!isSupabaseConfigured || !supabase) return { ok: false, error: "원격 저장소가 없습니다." };

  const aliases = aliasesFor(from);
  const now = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from("reports")
    .select("report_no")
    .in("status", FIELD_JOB_STATUSES)
    .in("assignee", aliases);
  if (error) throw error;
  const reportNos = (rows || []).map((row) => row.report_no);
  if (reportNos.length) {
    const { error: updateError } = await supabase
      .from("reports")
      .update({ assignee: to.id, updated_at: now })
      .in("report_no", reportNos);
    if (updateError) throw updateError;
    await supabase.from("audit_logs").insert(
      reportNos.map((reportNo) => ({
        report_no: reportNo,
        action: "ROUTE_TAKEOVER",
        actor_role: "RECEPTION",
        created_at: now
      }))
    );
  }
  const event = publishFleetEvent(null, {
    type: "takeover",
    deviceId: to.id,
    reportNo: reportNos[0] || null,
    payload: { fromDeviceId: from.id, toDeviceId: to.id, reportNos }
  });
  publishFleetEvent(null, {
    type: "takeover-cleared",
    deviceId: from.id,
    payload: { fromDeviceId: from.id, toDeviceId: to.id, reportNos }
  });
  return { ok: true, from, to, reportNos, moved: reportNos.length, event };
}

export function waitForFleetEvent({ since = 0, deviceId = "", timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    const onEvent = (event) => {
      if (event.seq <= since) return;
      if (deviceId && event.deviceId && event.deviceId !== deviceId) return;
      cleanup();
      resolve(event);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      fleetBus.off("fleet", onEvent);
    }
    fleetBus.on("fleet", onEvent);
  });
}

export function eventVisibleTo(event, deviceId) {
  if (!deviceId) return true;
  if (!event?.deviceId) return true;
  return event.deviceId === deviceId;
}

export function writeSseHeaders(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
}

export function sseChunk(eventName, data) {
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function streamFleetEvents(req, res, { db, deviceId = "", since = 0 } = {}) {
  writeSseHeaders(res);
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  res.write(sseChunk("hello", { ok: true, deviceId: deviceId || "staff", syncSeq: latestSyncSeq(db), pollMs: FLEET_POLL_MS }));

  let closed = false;
  const ping = setInterval(() => {
    if (closed) return;
    try { res.write(sseChunk("ping", { t: Date.now(), syncSeq: latestSyncSeq(db) })); } catch { closed = true; }
  }, 15000);

  const onEvent = (event) => {
    if (closed || !eventVisibleTo(event, deviceId) || event.seq <= since) return;
    since = event.seq;
    try { res.write(sseChunk("fleet", event)); } catch { closed = true; }
  };
  fleetBus.on("fleet", onEvent);

  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(ping);
    fleetBus.off("fleet", onEvent);
    try { res.end(); } catch { /* already closed */ }
  };
  req.on("close", close);
  req.on("aborted", close);
}

export function assigneeFilterValues(deviceId) {
  const device = getFleetDevice(deviceId);
  if (!device) return deviceId ? [deviceId] : [];
  return aliasesFor(device);
}
