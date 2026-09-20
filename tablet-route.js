/* 현장 태블릿: 배정 목록 필터·경로 순서·결제/내비 표시용 순수 함수.
   브라우저(tablet.js)와 단위 테스트에서 함께 사용한다. */

export const FIELD_STATUSES = ["ASSIGNED", "COLLECTED", "UNCOLLECTED", "CHANGE_REQUESTED"];
export const ZONE_ORDER = ["청전·의림", "중앙·교동", "하소·영천"];

export const STATUS_LABEL = {
  ASSIGNED: "배정완료",
  COLLECTED: "수거완료",
  UNCOLLECTED: "미수거",
  CHANGE_REQUESTED: "변경요청"
};

export const PAYMENT_LABEL = {
  COMPLETED: "결제완료",
  PENDING_CASH_RECEIPT: "현금수납대기",
  PENDING_TRANSFER: "계좌입금대기",
  PENDING_PAYMENT: "결제대기"
};

export const PAYMENT_METHOD_LABEL = {
  cash: "현금",
  transfer: "계좌이체",
  card: "카드",
  kakaopay: "카카오페이",
  naverpay: "네이버페이",
  tosspay: "토스"
};

export function isFieldJob(report) {
  return Boolean(report) && FIELD_STATUSES.includes(report.status);
}

export function isUnpaid(report) {
  return Boolean(report?.payment_status) && report.payment_status !== "COMPLETED";
}

export function paymentBadgeText(report) {
  if (!report) return "";
  if (!report.payment_status || report.payment_status === "COMPLETED") return PAYMENT_LABEL.COMPLETED;
  return PAYMENT_LABEL[report.payment_status] || "미납";
}

export function memoKind(status) {
  if (status === "UNCOLLECTED") return "미수거 사유";
  if (status === "CHANGE_REQUESTED") return "현장 변경 요청";
  if (status === "REJECTED") return "반려 사유";
  if (status === "SUPPLEMENT_REQUESTED") return "보완 요청";
  return "특이사항";
}

export function hasCoords(report) {
  return Number.isFinite(report?.latitude) && Number.isFinite(report?.longitude);
}

export function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "";
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export function isSameLocalDay(iso, now = new Date()) {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function filterFieldJobs(reports, { assignee } = {}) {
  const list = (reports || []).filter(isFieldJob);
  if (!assignee || assignee === "__ALL__") return list;
  return list.filter((report) => report.assignee === assignee);
}

export function attachDistances(list, userCoords) {
  return (list || []).map((task) => {
    let distance = null;
    if (userCoords && hasCoords(task)) {
      distance = calculateDistanceMeters(
        userCoords.latitude,
        userCoords.longitude,
        task.latitude,
        task.longitude
      );
    }
    return { ...task, _distance: distance };
  });
}

function zoneRank(zone) {
  const idx = ZONE_ORDER.indexOf(zone);
  return idx === -1 ? 99 : idx;
}

function sortByZoneThenTime(list) {
  return [...list].sort((a, b) => {
    const zoneDiff = zoneRank(a.zone) - zoneRank(b.zone);
    if (zoneDiff !== 0) return zoneDiff;
    return new Date(a.created_at) - new Date(b.created_at);
  });
}

function nearestNeighborOrder(tasks, origin) {
  const withCoords = [];
  const without = [];
  for (const task of tasks) {
    if (hasCoords(task)) withCoords.push(task);
    else without.push(task);
  }
  if (!withCoords.length) return sortByZoneThenTime(tasks);

  const remaining = [...withCoords];
  const result = [];
  let current = origin && Number.isFinite(origin.latitude) && Number.isFinite(origin.longitude) ? origin : null;

  if (!current) {
    const seeded = sortByZoneThenTime(remaining);
    const first = seeded.shift();
    result.push(first);
    current = { latitude: first.latitude, longitude: first.longitude };
    remaining.length = 0;
    remaining.push(...seeded);
  }

  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const dist = calculateDistanceMeters(
        current.latitude,
        current.longitude,
        remaining[i].latitude,
        remaining[i].longitude
      );
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    result.push(next);
    current = { latitude: next.latitude, longitude: next.longitude };
  }

  return result.concat(sortByZoneThenTime(without));
}

export function sequenceRoute(list, origin) {
  const pending = list.filter((task) => task.status !== "COLLECTED");
  const collected = list.filter((task) => task.status === "COLLECTED");
  const sequenced = nearestNeighborOrder(pending, origin);
  const collectedSorted = [...collected].sort(
    (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
  );
  return sequenced.concat(collectedSorted).map((task, index) => ({ ...task, _seq: index + 1 }));
}

export function sortAndSequenceTasks(list, { sortBy = "route", userCoords } = {}) {
  const withDist = attachDistances(list, userCoords);
  if (sortBy === "time") {
    return [...withDist]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map((task, index) => ({ ...task, _seq: index + 1 }));
  }
  if (sortBy === "zone") {
    return sortByZoneThenTime(withDist).map((task, index) => ({ ...task, _seq: index + 1 }));
  }
  return sequenceRoute(withDist, userCoords);
}

export function filterByTab(list, filter) {
  if (filter === "COLLECTED") return list.filter((task) => task.status === "COLLECTED");
  if (filter === "PENDING") return list.filter((task) => task.status !== "COLLECTED");
  return list;
}

export function progressStats(tasks) {
  const collected = tasks.filter((task) => task.status === "COLLECTED");
  const pending = tasks.filter((task) => task.status !== "COLLECTED");
  const total = tasks.length;
  return {
    pending: pending.length,
    collected: collected.length,
    total,
    percent: total > 0 ? Math.round((collected.length / total) * 100) : 0
  };
}

export function nextPending(list, currentReportNo) {
  const pending = (list || []).filter((task) => task.status !== "COLLECTED");
  if (!pending.length) return null;
  const idx = pending.findIndex((task) => task.report_no === currentReportNo);
  if (idx === -1) return pending[0];
  return pending[idx + 1] || null;
}

export function prevPending(list, currentReportNo) {
  const pending = (list || []).filter((task) => task.status !== "COLLECTED");
  if (!pending.length) return null;
  const idx = pending.findIndex((task) => task.report_no === currentReportNo);
  if (idx <= 0) return null;
  return pending[idx - 1];
}

export function navigationLinks(report) {
  const title = encodeURIComponent(report?.address || "대형폐기물 수거");
  const lat = report?.latitude;
  const lng = report?.longitude;
  const coordsOk = hasCoords(report);
  return {
    kakao: coordsOk
      ? `https://map.kakao.com/link/to/${title},${lat},${lng}`
      : `https://map.kakao.com/link/search/${title}`,
    naver: coordsOk
      ? `https://map.naver.com/p/directions/-/${lng},${lat},${title}/-/car`
      : `https://map.naver.com/p/search/${title}`,
    google: coordsOk
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${title}`
  };
}
