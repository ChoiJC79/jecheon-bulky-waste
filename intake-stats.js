const STATUS_ORDER = [
  "RECEIVED",
  "ASSIGNED",
  "COLLECTED",
  "UNCOLLECTED",
  "CHANGE_REQUESTED",
  "SUPPLEMENT_REQUESTED",
  "REJECTED"
];

export const STATUS_LABELS = {
  RECEIVED: "미배정",
  ASSIGNED: "배정완료",
  COLLECTED: "수거완료",
  UNCOLLECTED: "미수거",
  CHANGE_REQUESTED: "현장변경요청",
  SUPPLEMENT_REQUESTED: "보완요청",
  REJECTED: "반려"
};

export const PAYMENT_LABELS = {
  PENDING_TRANSFER: "자동이체 입금대기",
  PENDING_CASH_RECEIPT: "현금수납대기",
  PENDING_PAYMENT: "결제대기",
  COMPLETED: "입금·결제완료"
};

export const TABLET_STATS = [
  { id: "tablet-1", name: "1호차" },
  { id: "tablet-2", name: "2호차" },
  { id: "tablet-spare", name: "예비" }
];

export const ZONE_STATS = ["청전·의림", "중앙·교동", "하소·영천"];

export function dayKey(value) {
  if (typeof value !== "string" || value.length < 10) return "";
  return value.slice(0, 10);
}

export function shiftDay(day, delta) {
  const date = new Date(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return day;
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function tabletName(assignee) {
  const raw = String(assignee || "").trim();
  if (!raw || raw === "__ALL__") return "미배정";
  if (raw === "tablet-1" || raw.includes("1호차")) return "1호차";
  if (raw === "tablet-2" || raw.includes("2호차")) return "2호차";
  if (raw === "tablet-spare" || raw.includes("예비") || raw.includes("3호차")) return "예비";
  return raw;
}

function bump(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function rowsFromMap(map, order, labels, extra) {
  const keys = order.length ? order : [...map.keys()];
  const seen = new Set();
  const rows = [];
  for (const key of keys) {
    seen.add(key);
    rows.push({
      key,
      label: labels?.[key] || key,
      count: map.get(key) || 0,
      ...(extra?.get(key) ? extra.get(key) : {})
    });
  }
  for (const [key, count] of map.entries()) {
    if (seen.has(key)) continue;
    rows.push({ key, label: labels?.[key] || key, count, ...(extra?.get(key) || {}) });
  }
  return rows;
}

export function buildIntakeStats(reports = [], { now = new Date() } = {}) {
  const list = Array.isArray(reports) ? reports : [];
  const today = now.toISOString().slice(0, 10);
  const statusCounts = new Map();
  const statusFees = new Map();
  const paymentCounts = new Map();
  const zoneCounts = new Map();
  const tabletCounts = new Map();
  const tabletFees = new Map();
  const dayCounts = new Map();
  const dayFees = new Map();
  const itemQty = new Map();
  const itemFee = new Map();

  let feeTotal = 0;
  let feeToday = 0;
  let collectedFee = 0;
  let phoneCount = 0;
  let todayCount = 0;
  let todayPhoneCount = 0;
  let pendingPaymentCount = 0;
  let pendingPaymentFee = 0;
  let paidCount = 0;
  let waitingDispatch = 0;
  let inField = 0;

  for (const report of list) {
    const fee = Number(report.total_fee) || 0;
    const created = dayKey(report.created_at);
    const isToday = created === today;
    const status = report.status || "RECEIVED";
    const payment = report.payment_status || "";
    const zone = report.zone || "미지정";
    const tablet = tabletName(report.assignee);

    feeTotal += fee;
    bump(statusCounts, status);
    bump(statusFees, status, fee);
    if (payment) bump(paymentCounts, payment);
    bump(zoneCounts, zone);
    bump(tabletCounts, tablet);
    bump(tabletFees, tablet, fee);
    if (created) {
      bump(dayCounts, created);
      bump(dayFees, created, fee);
    }
    if (isToday) {
      todayCount += 1;
      feeToday += fee;
    }
    if (report.channel === "PHONE") {
      phoneCount += 1;
      if (isToday) todayPhoneCount += 1;
    }
    if (payment === "COMPLETED") paidCount += 1;
    if (payment === "PENDING_TRANSFER" || payment === "PENDING_CASH_RECEIPT" || payment === "PENDING_PAYMENT") {
      pendingPaymentCount += 1;
      pendingPaymentFee += fee;
    }
    if (status === "COLLECTED") collectedFee += fee;
    if (status === "RECEIVED" && payment === "COMPLETED") waitingDispatch += 1;
    if (status === "ASSIGNED") inField += 1;

    for (const item of report.items || []) {
      const name = item.name || "기타";
      bump(itemQty, name, Number(item.quantity) || 1);
      const line = Number.isFinite(item.unit_fee)
        ? item.unit_fee * (Number(item.quantity) || 1)
        : 0;
      bump(itemFee, name, line);
    }
  }

  const byDay = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = shiftDay(today, -offset);
    byDay.push({ day, count: dayCounts.get(day) || 0, fee: dayFees.get(day) || 0 });
  }

  const byItem = [...itemQty.entries()]
    .map(([name, quantity]) => ({ name, quantity, fee: itemFee.get(name) || 0 }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 8);

  const tabletOrder = ["1호차", "2호차", "예비", "미배정"];
  const zoneOrder = [...ZONE_STATS, "미지정"];

  return {
    totalCount: list.length,
    todayCount,
    phoneCount,
    todayPhoneCount,
    feeTotal,
    feeToday,
    collectedFee,
    pendingPaymentCount,
    pendingPaymentFee,
    paidCount,
    unassignedCount: statusCounts.get("RECEIVED") || 0,
    assignedCount: statusCounts.get("ASSIGNED") || 0,
    collectedCount: statusCounts.get("COLLECTED") || 0,
    uncollectedCount: statusCounts.get("UNCOLLECTED") || 0,
    changeRequestedCount: statusCounts.get("CHANGE_REQUESTED") || 0,
    fieldIssueCount: (statusCounts.get("UNCOLLECTED") || 0) + (statusCounts.get("CHANGE_REQUESTED") || 0),
    byStatus: rowsFromMap(statusCounts, STATUS_ORDER, STATUS_LABELS, new Map(
      [...statusFees.entries()].map(([key, fee]) => [key, { fee }])
    )),
    byPayment: rowsFromMap(paymentCounts, ["PENDING_TRANSFER", "PENDING_CASH_RECEIPT", "PENDING_PAYMENT", "COMPLETED"], PAYMENT_LABELS),
    byZone: rowsFromMap(zoneCounts, zoneOrder, null),
    byTablet: rowsFromMap(tabletCounts, tabletOrder, null, new Map(
      [...tabletFees.entries()].map(([key, fee]) => [key, { fee }])
    )),
    byDay,
    byItem,
    pipeline: {
      waitingDeposit: pendingPaymentCount,
      waitingDispatch,
      inField,
      done: statusCounts.get("COLLECTED") || 0
    }
  };
}

export function barPercent(value, max) {
  if (!max || max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}
