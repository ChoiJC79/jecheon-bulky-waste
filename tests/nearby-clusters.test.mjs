import test from "node:test";
import assert from "node:assert/strict";
import {
  CLUSTER_RADIUS_METERS,
  CLUSTER_PRIMARY_STATUSES,
  CLUSTER_CONTEXT_STATUSES,
  CLUSTER_RULE_TEXT,
  buildNearbyClusters,
  calculateDistanceMeters,
  formatClusterDistance,
  suggestClusterAssignment
} from "../nearby-clusters.js";

function report(overrides) {
  return {
    report_no: "JC-1",
    status: "RECEIVED",
    address: "제천시 의림대로 1",
    latitude: 37.1326,
    longitude: 128.1910,
    total_fee: 3000,
    items: [{ name: "소파" }],
    created_at: "2026-09-20T01:00:00.000Z",
    ...overrides
  };
}

test("근거리 묶음 기본 규칙은 미배정·300m·2건 이상이다", () => {
  assert.equal(CLUSTER_RADIUS_METERS, 300);
  assert.deepEqual([...CLUSTER_PRIMARY_STATUSES], ["RECEIVED"]);
  assert.deepEqual([...CLUSTER_CONTEXT_STATUSES], ["ASSIGNED"]);
  assert.match(CLUSTER_RULE_TEXT, /300m/);
  assert.match(CLUSTER_RULE_TEXT, /미배정/);
  assert.match(CLUSTER_RULE_TEXT, /수거 기사 위치는 수집하지 않/);
});

test("가까운 미배정 2건은 한 묶음으로 추천하고, 먼 건과 수거완료 건은 제외한다", () => {
  const nearA = report({ report_no: "JC-A", latitude: 37.1326, longitude: 128.1910 });
  const nearB = report({ report_no: "JC-B", latitude: 37.1334, longitude: 128.1915, address: "제천시 의림대로 12" });
  const far = report({ report_no: "JC-C", latitude: 37.1500, longitude: 128.2100 });
  const collected = report({ report_no: "JC-D", status: "COLLECTED", latitude: 37.1327, longitude: 128.1911 });
  const noCoords = report({ report_no: "JC-E", latitude: null, longitude: null });

  const nearDistance = calculateDistanceMeters(nearA.latitude, nearA.longitude, nearB.latitude, nearB.longitude);
  assert.ok(nearDistance <= 300, `가까운 두 점은 ${nearDistance}m 이어야 한다`);

  const clusters = buildNearbyClusters([nearA, nearB, far, collected, noCoords]);
  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0].members.map((item) => item.report_no), ["JC-A", "JC-B"]);
  assert.equal(clusters[0].receivedCount, 2);
  assert.ok(clusters[0].maxDistanceMeters <= 300);
});

test("300m로 이어진 미배정 건은 한 묶음이 되고, 이미 배정된 인근 건은 참고로만 붙는다", () => {
  const a = report({ report_no: "JC-A", latitude: 37.1326, longitude: 128.1910 });
  const b = report({ report_no: "JC-B", latitude: 37.1349, longitude: 128.1910 });
  const c = report({ report_no: "JC-C", latitude: 37.1372, longitude: 128.1910 });
  const assigned = report({
    report_no: "JC-Z",
    status: "ASSIGNED",
    latitude: 37.1327,
    longitude: 128.1911,
    zone: "청전·의림",
    assignee: "김수거 (1호차·청전의림)"
  });

  const ab = calculateDistanceMeters(a.latitude, a.longitude, b.latitude, b.longitude);
  const bc = calculateDistanceMeters(b.latitude, b.longitude, c.latitude, c.longitude);
  const ac = calculateDistanceMeters(a.latitude, a.longitude, c.latitude, c.longitude);
  assert.ok(ab <= 300 && bc <= 300, "A-B, B-C는 300m 이내여야 한다");
  assert.ok(ac > 300, "A-C는 직접 300m를 넘어도 연결 요소로 묶여야 한다");

  const clusters = buildNearbyClusters([a, b, c, assigned]);
  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0].members.map((item) => item.report_no), ["JC-A", "JC-B", "JC-C"]);
  assert.equal(clusters[0].nearbyAssigned.length, 1);
  assert.equal(clusters[0].nearbyAssigned[0].report_no, "JC-Z");
  assert.deepEqual(suggestClusterAssignment(clusters[0], ["하소·영천", "청전·의림"]), {
    zone: "청전·의림",
    assignee: "김수거 (1호차·청전의림)"
  });
});

test("미배정 1건만 있거나 배정 건만 가까우면 추천 묶음을 만들지 않는다", () => {
  const alone = report({ report_no: "JC-A" });
  const assignedNear = report({ report_no: "JC-B", status: "ASSIGNED", latitude: 37.1327, longitude: 128.1911 });
  assert.deepEqual(buildNearbyClusters([alone, assignedNear]), []);
  assert.equal(formatClusterDistance(180), "180m");
  assert.equal(formatClusterDistance(1200), "1.2km");
});
