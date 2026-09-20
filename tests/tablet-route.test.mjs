import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateDistanceMeters,
  filterFieldJobs,
  filterByTab,
  sortAndSequenceTasks,
  sequenceRoute,
  isUnpaid,
  paymentBadgeText,
  memoKind,
  navigationLinks,
  nextPending,
  prevPending,
  progressStats,
  formatDistance
} from "../tablet-route.js";

function job(overrides) {
  return {
    report_no: "JC-1",
    status: "ASSIGNED",
    payment_status: "COMPLETED",
    payment_method: "card",
    address: "제천시 의림대로 1",
    address_detail: "분리수거장 옆",
    latitude: 37.14,
    longitude: 128.21,
    zone: "청전·의림",
    assignee: "김수거 (1호차·청전의림)",
    memo: null,
    created_at: "2026-09-20T01:00:00.000Z",
    ...overrides
  };
}

test("현장 배정 목록은 접수·반려 건을 빼고 담당자로 좁힌다", () => {
  const reports = [
    job({ report_no: "A", status: "RECEIVED", assignee: null }),
    job({ report_no: "B", status: "ASSIGNED", assignee: "김수거 (1호차·청전의림)" }),
    job({ report_no: "C", status: "ASSIGNED", assignee: "이청소 (2호차·중앙교동)", zone: "중앙·교동" }),
    job({ report_no: "D", status: "REJECTED", assignee: "김수거 (1호차·청전의림)" })
  ];
  const mine = filterFieldJobs(reports, { assignee: "김수거 (1호차·청전의림)" });
  assert.deepEqual(mine.map((r) => r.report_no), ["B"]);
  const all = filterFieldJobs(reports, { assignee: "__ALL__" });
  assert.deepEqual(all.map((r) => r.report_no), ["B", "C"]);
});

test("미납 배지와 특이사항 제목은 결제·상태 필드를 따른다", () => {
  assert.equal(isUnpaid(job({ payment_status: "PENDING_TRANSFER" })), true);
  assert.equal(isUnpaid(job({ payment_status: "COMPLETED" })), false);
  assert.equal(paymentBadgeText(job({ payment_status: "PENDING_CASH_RECEIPT" })), "현금수납대기");
  assert.equal(paymentBadgeText(job({ payment_status: "PENDING_TRANSFER" })), "계좌입금대기");
  assert.equal(memoKind("UNCOLLECTED"), "미수거 사유");
  assert.equal(memoKind("CHANGE_REQUESTED"), "현장 변경 요청");
  assert.equal(memoKind("ASSIGNED"), "특이사항");
});

test("경로 순서는 현재 위치에서 가까운 미완료 정류를 먼저 둔다", () => {
  const far = job({
    report_no: "FAR",
    latitude: 37.17,
    longitude: 128.23,
    created_at: "2026-09-20T00:00:00.000Z"
  });
  const near = job({
    report_no: "NEAR",
    latitude: 37.133,
    longitude: 128.192,
    created_at: "2026-09-20T03:00:00.000Z"
  });
  const done = job({ report_no: "DONE", status: "COLLECTED", latitude: 37.12, longitude: 128.18 });
  const origin = { latitude: 37.1326, longitude: 128.191 };
  const sequenced = sequenceRoute([far, near, done], origin);
  assert.equal(sequenced[0].report_no, "NEAR");
  assert.equal(sequenced[1].report_no, "FAR");
  assert.equal(sequenced[2].report_no, "DONE");
  assert.equal(sequenced[0]._seq, 1);
});

test("구역 정렬은 청전·의림, 중앙·교동, 하소·영천 순이다", () => {
  const list = [
    job({ report_no: "H", zone: "하소·영천" }),
    job({ report_no: "C", zone: "중앙·교동" }),
    job({ report_no: "Q", zone: "청전·의림" })
  ];
  const sorted = sortAndSequenceTasks(list, { sortBy: "zone" });
  assert.deepEqual(sorted.map((r) => r.report_no), ["Q", "C", "H"]);
});

test("다음·이전 정류는 미완료 건만 이동한다", () => {
  const list = [
    job({ report_no: "1", status: "ASSIGNED" }),
    job({ report_no: "2", status: "COLLECTED" }),
    job({ report_no: "3", status: "ASSIGNED" })
  ];
  assert.equal(nextPending(list, "1").report_no, "3");
  assert.equal(prevPending(list, "3").report_no, "1");
  assert.equal(nextPending(list, "3"), null);
  assert.equal(filterByTab(list, "PENDING").length, 2);
  assert.equal(progressStats(list).collected, 1);
});

test("길찾기 링크는 좌표가 있으면 카카오·네이버·구글 목적지를 연다", () => {
  const links = navigationLinks(job({ latitude: 37.1326, longitude: 128.191, address: "제천시청" }));
  assert.match(links.kakao, /map\.kakao\.com\/link\/to/);
  assert.match(links.naver, /map\.naver\.com/);
  assert.match(links.google, /google\.com\/maps\/dir/);
  const searchOnly = navigationLinks(job({ latitude: null, longitude: null, address: "제천시청" }));
  assert.match(searchOnly.kakao, /link\/search/);
});

test("거리 계산과 표시 형식이 현장 안내용으로 동작한다", () => {
  const meters = calculateDistanceMeters(37.1326, 128.191, 37.1336, 128.191);
  assert.ok(meters > 90 && meters < 130);
  assert.equal(formatDistance(80), "80m");
  assert.equal(formatDistance(1500), "1.5km");
});
