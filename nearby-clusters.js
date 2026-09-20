/** 접수 담당자가 가까운 미배정 건을 함께 처리하도록 묶는 시범 규칙. 수거 기사 위치는 쓰지 않는다. */

export const CLUSTER_RADIUS_METERS = 300;
export const CLUSTER_MIN_SIZE = 2;
export const CLUSTER_PRIMARY_STATUSES = Object.freeze(["RECEIVED"]);
export const CLUSTER_CONTEXT_STATUSES = Object.freeze(["ASSIGNED"]);

export const CLUSTER_RULE_TEXT = "추천 규칙: 좌표가 있는 미배정(접수) 건만 대상으로, 직선거리 300m 이내로 이어진 2건 이상을 한 묶음으로 보여 줍니다. 이미 배정된 인근 건은 같은 담당자에게 맞출 참고용입니다. 수거 기사 위치는 수집하지 않으며, 신고에 저장된 배출 좌표만 사용합니다.";

export function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function hasCoords(report) {
  return Number.isFinite(Number(report?.latitude)) && Number.isFinite(Number(report?.longitude));
}

function clusterId(members) {
  return members.map((report) => report.report_no).sort().join("__");
}

export function formatClusterDistance(meters) {
  if (!Number.isFinite(meters)) return "거리 미확인";
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1).replace(/\.0$/, "")}km`;
}

export function suggestClusterAssignment(cluster, zones = []) {
  const assigned = cluster?.nearbyAssigned || [];
  const members = cluster?.members || [];
  const zone = assigned.find((report) => report.zone)?.zone
    || members.find((report) => report.zone)?.zone
    || zones[0]
    || "";
  const assignee = assigned.find((report) => report.assignee)?.assignee
    || members.find((report) => report.assignee)?.assignee
    || "";
  return { zone, assignee };
}

export function buildNearbyClusters(reports, options = {}) {
  const radius = Number.isFinite(options.radiusMeters) ? options.radiusMeters : CLUSTER_RADIUS_METERS;
  const minSize = Number.isFinite(options.minSize) ? options.minSize : CLUSTER_MIN_SIZE;
  const primaryStatuses = options.primaryStatuses || CLUSTER_PRIMARY_STATUSES;
  const contextStatuses = options.contextStatuses || CLUSTER_CONTEXT_STATUSES;
  const list = Array.isArray(reports) ? reports : [];

  const withCoords = list.filter(hasCoords);
  const primary = withCoords.filter((report) => primaryStatuses.includes(report.status));
  const n = primary.length;
  const parent = Array.from({ length: n }, (_, index) => index);
  const find = (index) => (parent[index] === index ? index : (parent[index] = find(parent[index])));
  const union = (a, b) => { parent[find(a)] = find(b); };

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const distance = calculateDistanceMeters(primary[i].latitude, primary[i].longitude, primary[j].latitude, primary[j].longitude);
      if (distance <= radius) union(i, j);
    }
  }

  const groups = new Map();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(primary[i]);
  }

  const clusters = [];
  for (const members of groups.values()) {
    if (members.length < minSize) continue;
    members.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.report_no).localeCompare(String(b.report_no)));

    let maxPair = 0;
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        maxPair = Math.max(maxPair, calculateDistanceMeters(members[i].latitude, members[i].longitude, members[j].latitude, members[j].longitude));
      }
    }

    const centroid = {
      latitude: members.reduce((sum, report) => sum + Number(report.latitude), 0) / members.length,
      longitude: members.reduce((sum, report) => sum + Number(report.longitude), 0) / members.length
    };

    const memberNos = new Set(members.map((report) => report.report_no));
    const nearbyAssigned = withCoords.filter((report) => (
      contextStatuses.includes(report.status)
      && !memberNos.has(report.report_no)
      && members.some((member) => calculateDistanceMeters(member.latitude, member.longitude, report.latitude, report.longitude) <= radius)
    )).sort((a, b) => String(a.report_no).localeCompare(String(b.report_no)));

    clusters.push({
      id: clusterId(members),
      members,
      nearbyAssigned,
      centroid,
      maxDistanceMeters: maxPair,
      receivedCount: members.length,
      totalFee: members.reduce((sum, report) => sum + (Number(report.total_fee) || 0), 0)
    });
  }

  clusters.sort((a, b) => b.members.length - a.members.length || a.maxDistanceMeters - b.maxDistanceMeters || a.id.localeCompare(b.id));
  return clusters;
}
