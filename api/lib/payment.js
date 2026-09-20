import { readFileSync } from "node:fs";
import { join } from "node:path";

/** 시에서 실제 수납 계좌로 교체하기 위한 자리표시자. 실제 개인 계좌가 아닙니다. */
export const PLACEHOLDER_BANK_ACCOUNT = {
  bankName: "(시 지정 은행 — 교체 필요)",
  accountHolder: "제천시 (대형폐기물 수수료) — 교체 필요",
  accountNumber: "000-00-000000",
  placeholder: true,
  notice: "이 계좌 정보는 시에서 실제 수납 계좌로 교체하기 위한 자리표시자입니다. 실제 개인 계좌가 아닙니다."
};

export const PAYMENT_METHOD_TRANSFER = "transfer";
export const PAYMENT_STATUS_PENDING_TRANSFER = "PENDING_TRANSFER";
export const PAYMENT_STATUS_COMPLETED = "COMPLETED";

function loadFileConfig() {
  try {
    const raw = readFileSync(join(process.cwd(), "payment-account.json"), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

export function getBankTransferAccount() {
  const file = loadFileConfig();
  const bankName = process.env.PAYMENT_BANK_NAME || file.bankName || PLACEHOLDER_BANK_ACCOUNT.bankName;
  const accountHolder = process.env.PAYMENT_ACCOUNT_HOLDER || file.accountHolder || PLACEHOLDER_BANK_ACCOUNT.accountHolder;
  const accountNumber = process.env.PAYMENT_ACCOUNT_NUMBER || file.accountNumber || PLACEHOLDER_BANK_ACCOUNT.accountNumber;
  const envOverride = Boolean(
    process.env.PAYMENT_BANK_NAME || process.env.PAYMENT_ACCOUNT_HOLDER || process.env.PAYMENT_ACCOUNT_NUMBER
  );
  const placeholder = envOverride ? false : file.placeholder !== false && (
    bankName === PLACEHOLDER_BANK_ACCOUNT.bankName ||
    accountNumber === PLACEHOLDER_BANK_ACCOUNT.accountNumber
  );
  return {
    bankName,
    accountHolder,
    accountNumber,
    placeholder,
    notice: file.notice || PLACEHOLDER_BANK_ACCOUNT.notice
  };
}

export function isAllowedPaymentMethod(method) {
  return method === PAYMENT_METHOD_TRANSFER;
}

export function paymentStatusForNewReport() {
  return PAYMENT_STATUS_PENDING_TRANSFER;
}

export function isPaymentCompleted(status) {
  return status === PAYMENT_STATUS_COMPLETED;
}

export function unpaidAssignError() {
  return "계좌 입금이 확인되지 않은 건은 수거구역을 배정할 수 없습니다. 입금 확인 후 배정해 주세요.";
}
