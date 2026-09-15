import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const ZONES = ["청전·의림", "중앙·교동", "하소·영천"];
const PHOTO_MIME_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey && !supabaseUrl.includes("your-project-id"));

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

const root = process.cwd();
let localDb = null;

export function getLocalDb() {
  if (!localDb) {
    localDb = new DatabaseSync(join(root, "data", "waste.db"));
    localDb.exec(`
      CREATE TABLE IF NOT EXISTS reports (
        report_no TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        payment_status TEXT NOT NULL,
        address TEXT NOT NULL,
        address_detail TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        zone TEXT,
        assignee TEXT,
        memo TEXT,
        before_photo TEXT,
        after_photo TEXT,
        total_fee INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS report_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_no TEXT NOT NULL,
        name TEXT NOT NULL,
        option_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_fee INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_no TEXT NOT NULL,
        action TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    const reportColumns = localDb.prepare("PRAGMA table_info(reports)").all().map((c) => c.name);
    for (const [col, type] of [
      ["latitude", "REAL"], ["longitude", "REAL"], ["zone", "TEXT"],
      ["assignee", "TEXT"], ["memo", "TEXT"], ["updated_at", "TEXT"],
      ["before_photo", "TEXT"], ["after_photo", "TEXT"]
    ]) {
      if (!reportColumns.includes(col)) {
        localDb.exec(`ALTER TABLE reports ADD COLUMN ${col} ${type}`);
      }
    }
  }
  return localDb;
}

export async function savePhoto(dataUrl, filenameBase) {
  const match = typeof dataUrl === "string" && dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) return null;
  const [, contentType, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > 6_000_000) return null;

  const ext = PHOTO_MIME_EXT[contentType] || "jpg";
  const filename = `${filenameBase}.${ext}`;

  if (isSupabaseConfigured && supabase) {
    try {
      const bucket = process.env.SUPABASE_STORAGE_BUCKET || "waste-photos";
      const { error } = await supabase.storage.from(bucket).upload(filename, buffer, {
        contentType,
        upsert: true
      });
      if (!error) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(filename);
        return data.publicUrl;
      }
      console.warn("Supabase storage upload failed, falling back to local/dataURL:", error.message);
    } catch (e) {
      console.warn("Supabase storage error:", e.message);
    }
  }

  // 로컬 파일 시스템 저장 (Vercel Serverless의 임시 /tmp 또는 로컬 uploads)
  try {
    const uploadDir = join(root, "uploads");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, filename), buffer);
    return `/uploads/${filename}`;
  } catch {
    // Vercel 읽기전용 파일시스템 환경 폴백: dataURL 그대로 사용 가능
    return dataUrl;
  }
}

export async function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 8_000_000) throw new Error("payload too large");
  }
  return JSON.parse(raw || "{}");
}

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}
