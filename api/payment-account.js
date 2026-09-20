import { sendJson } from "./lib/supabase.js";
import { getBankTransferAccount } from "./lib/payment.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }
  return sendJson(res, 200, getBankTransferAccount());
}
