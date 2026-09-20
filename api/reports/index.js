import {
  isSupabaseConfigured,
  supabase,
  getLocalDb,
  savePhoto,
  parseBody,
  sendJson,
  ZONES
} from "../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    return handleGet(req, res);
  } else if (req.method === "POST") {
    return handlePost(req, res);
  } else {
    return sendJson(res, 405, { error: "Method not allowed" });
  }
}

async function handleGet(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const status = url.searchParams.get("status") || undefined;
  const zone = url.searchParams.get("zone") || undefined;
  const assignee = url.searchParams.get("assignee") || undefined;
  const q = url.searchParams.get("q")?.trim() || undefined;

  try {
    if (isSupabaseConfigured && supabase) {
      let query = supabase
        .from("reports")
        .select(`
          report_no, status, payment_method, payment_status,
          address, address_detail, latitude, longitude,
          zone, assignee, memo, before_photo, after_photo,
          total_fee, created_at, updated_at, citizen_name, citizen_phone, channel,
          report_items ( name, option_name, quantity, unit_fee )
        `)
        .order("created_at", { ascending: false });

      if (status) query = query.eq("status", status);
      if (zone) query = query.eq("zone", zone);
      if (assignee) query = query.eq("assignee", assignee);
      if (q) {
        query = query.or(
          `report_no.ilike.%${q}%,address.ilike.%${q}%,address_detail.ilike.%${q}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;

      const reports = (data || []).map((r) => ({
        ...r,
        items: r.report_items || []
      }));

      return sendJson(res, 200, { reports, zones: ZONES });
    }

    // SQLite Fallback
    const db = getLocalDb();
    const clauses = [];
    const params = [];
    if (status) { clauses.push("status = ?"); params.push(status); }
    if (zone) { clauses.push("zone = ?"); params.push(zone); }
    if (assignee) { clauses.push("assignee = ?"); params.push(assignee); }
    if (q) {
      clauses.push("(report_no LIKE ? OR address LIKE ? OR address_detail LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const reportSelect = "SELECT report_no, status, payment_method, payment_status, address, address_detail, latitude, longitude, zone, assignee, memo, before_photo, after_photo, total_fee, created_at, updated_at, citizen_name, citizen_phone, channel FROM reports";
    const reports = db.prepare(`${reportSelect} ${where} ORDER BY created_at DESC`).all(...params);
    const items = db.prepare("SELECT report_no, name, option_name, quantity, unit_fee FROM report_items").all();
    const itemsByReport = new Map();
    for (const item of items) {
      if (!itemsByReport.has(item.report_no)) itemsByReport.set(item.report_no, []);
      itemsByReport.get(item.report_no).push(item);
    }
    const merged = reports.map((r) => ({ ...r, items: itemsByReport.get(r.report_no) || [] }));
    return sendJson(res, 200, { reports: merged, zones: ZONES });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "신고 목록을 조회할 수 없습니다." });
  }
}

async function handlePost(req, res) {
  try {
    const body = await parseBody(req);
    const { address, addressDetail, paymentMethod, location, items, beforePhoto, channel: rawChannel, citizenName, citizenPhone } = body;

    const validItems =
      Array.isArray(items) &&
      items.length > 0 &&
      items.every(
        (item) =>
          item.name &&
          item.option &&
          Number.isInteger(item.quantity) &&
          item.quantity > 0 &&
          Number.isInteger(item.fee) &&
          item.fee >= 0
      );

    if (
      !address ||
      !addressDetail ||
      !["kakaopay", "naverpay", "tosspay", "card", "transfer", "cash"].includes(paymentMethod) ||
      !validItems
    ) {
      return sendJson(res, 400, { error: "주소, 상세 장소, 결제수단, 품목을 확인해 주세요." });
    }

    const channel = rawChannel === "PHONE" ? "PHONE" : "WEB";
    const name = typeof citizenName === "string" ? citizenName.trim().slice(0, 80) : "";
    const phone = typeof citizenPhone === "string" ? citizenPhone.trim().slice(0, 40) : "";
    if (channel === "PHONE" && (!name || !phone)) {
      return sendJson(res, 400, { error: "신고자 이름과 연락처를 입력해 주세요." });
    }

    const latitude = Number.isFinite(location?.latitude) ? location.latitude : null;
    const longitude = Number.isFinite(location?.longitude) ? location.longitude : null;
    const reportNo = `JC-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-6)}`;
    const beforePhotoPath = beforePhoto ? await savePhoto(beforePhoto, `${reportNo}-before`) : null;
    const createdAt = new Date().toISOString();
    const totalFee = items.reduce((sum, item) => sum + item.fee * item.quantity, 0);
    const paymentStatus =
      paymentMethod === "cash"
        ? "PENDING_CASH_RECEIPT"
        : paymentMethod === "transfer"
        ? "PENDING_TRANSFER"
        : "COMPLETED";

    if (isSupabaseConfigured && supabase) {
      const { error: reportError } = await supabase.from("reports").insert({
        report_no: reportNo,
        status: "RECEIVED",
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        address,
        address_detail: addressDetail,
        latitude,
        longitude,
        before_photo: beforePhotoPath,
        total_fee: totalFee,
        created_at: createdAt,
        updated_at: createdAt,
        citizen_name: name || null,
        citizen_phone: phone || null,
        channel
      });
      if (reportError) throw reportError;

      const itemRows = items.map((item) => ({
        report_no: reportNo,
        name: item.name,
        option_name: item.option,
        quantity: item.quantity,
        unit_fee: item.fee
      }));
      const { error: itemsError } = await supabase.from("report_items").insert(itemRows);
      if (itemsError) throw itemsError;

      await supabase.from("audit_logs").insert({
        report_no: reportNo,
        action: "REPORT_CREATED",
        actor_role: channel === "PHONE" ? "RECEPTION" : "CITIZEN",
        created_at: createdAt
      });

      return sendJson(res, 201, { reportNo, totalFee, paymentStatus });
    }

    // SQLite Fallback
    const db = getLocalDb();
    db.exec("BEGIN");
    try {
      db.prepare(`
        INSERT INTO reports (
          report_no, status, payment_method, payment_status,
          address, address_detail, latitude, longitude,
          before_photo, total_fee, created_at, updated_at,
          citizen_name, citizen_phone, channel
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        reportNo,
        "RECEIVED",
        paymentMethod,
        paymentStatus,
        address,
        addressDetail,
        latitude,
        longitude,
        beforePhotoPath,
        totalFee,
        createdAt,
        createdAt,
        name || null,
        phone || null,
        channel
      );

      const insertItem = db.prepare(
        "INSERT INTO report_items (report_no, name, option_name, quantity, unit_fee) VALUES (?, ?, ?, ?, ?)"
      );
      for (const item of items) {
        insertItem.run(reportNo, item.name, item.option, item.quantity, item.fee);
      }

      db.prepare(
        "INSERT INTO audit_logs (report_no, action, actor_role, created_at) VALUES (?, ?, ?, ?)"
      ).run(reportNo, "REPORT_CREATED", channel === "PHONE" ? "RECEPTION" : "CITIZEN", createdAt);

      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return sendJson(res, 201, { reportNo, totalFee, paymentStatus });
  } catch (error) {
    return sendJson(res, 400, { error: error.message || "신고 내용을 읽을 수 없습니다." });
  }
}
