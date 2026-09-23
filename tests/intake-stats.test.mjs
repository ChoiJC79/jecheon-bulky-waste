import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  STATUS_LABELS,
  barPercent,
  buildIntakeStats,
  dayKey,
  shiftDay,
  tabletName
} from "../intake-stats.js";

function report(overrides = {}) {
  return {
    report_no: "JC-1",
    status: "RECEIVED",
    payment_status: "PENDING_TRANSFER",
    channel: "PHONE",
    address: "제천시 의림대로 1",
    zone: null,
    assignee: null,
    total_fee: 5000,
    items: [{ name: "소파", option_name: "2인용", quantity: 1, unit_fee: 5000 }],
    created_at: "2026-09-23T01:00:00.000Z",
    ...overrides
  };
}

test("날짜·태블릿 이름은 접수 통계에서 전화접수 운영 기준으로 읽는다", () => {
  assert.equal(dayKey("2026-09-23T12:00:00.000Z"), "2026-09-23");
  assert.equal(shiftDay("2026-09-23", -1), "2026-09-22");
  assert.equal(tabletName("tablet-1"), "1호차");
  assert.equal(tabletName("김수거 (1호차·청전의림)"), "1호차");
  assert.equal(tabletName("tablet-spare"), "예비");
  assert.equal(tabletName(""), "미배정");
  assert.equal(tabletName("__ALL__"), "미배정");
  assert.equal(STATUS_LABELS.UNCOLLECTED, "미수거");
  assert.equal(barPercent(2, 4), 50);
  assert.equal(barPercent(0, 0), 0);
});

test("접수 통계는 상태·구역·태블릿·입금·일자·수수료·품목을 나눈다", () => {
  const now = new Date("2026-09-23T12:00:00.000Z");
  const stats = buildIntakeStats([
    report({ report_no: "A", total_fee: 5000 }),
    report({
      report_no: "B",
      status: "ASSIGNED",
      payment_status: "COMPLETED",
      zone: "청전·의림",
      assignee: "tablet-1",
      total_fee: 3000,
      items: [{ name: "책상", quantity: 2, unit_fee: 1500 }]
    }),
    report({
      report_no: "C",
      status: "COLLECTED",
      payment_status: "COMPLETED",
      zone: "중앙·교동",
      assignee: "tablet-2",
      total_fee: 8000,
      channel: "PHONE",
      created_at: "2026-09-22T10:00:00.000Z",
      items: [{ name: "소파", quantity: 1, unit_fee: 8000 }]
    }),
    report({
      report_no: "D",
      status: "UNCOLLECTED",
      payment_status: "COMPLETED",
      zone: "하소·영천",
      assignee: "tablet-spare",
      total_fee: 2000
    }),
    report({
      report_no: "E",
      status: "CHANGE_REQUESTED",
      payment_status: "COMPLETED",
      assignee: "tablet-1",
      zone: "청전·의림",
      total_fee: 1000
    })
  ], { now });

  assert.equal(stats.totalCount, 5);
  assert.equal(stats.todayCount, 4);
  assert.equal(stats.phoneCount, 5);
  assert.equal(stats.feeTotal, 19000);
  assert.equal(stats.feeToday, 11000);
  assert.equal(stats.collectedFee, 8000);
  assert.equal(stats.pendingPaymentCount, 1);
  assert.equal(stats.unassignedCount, 1);
  assert.equal(stats.assignedCount, 1);
  assert.equal(stats.uncollectedCount, 1);
  assert.equal(stats.changeRequestedCount, 1);
  assert.equal(stats.fieldIssueCount, 2);
  assert.equal(stats.pipeline.waitingDeposit, 1);
  assert.equal(stats.pipeline.waitingDispatch, 0);
  assert.equal(stats.pipeline.inField, 1);
  assert.equal(stats.pipeline.done, 1);

  const tablet1 = stats.byTablet.find((row) => row.key === "1호차");
  const unassigned = stats.byTablet.find((row) => row.key === "미배정");
  assert.equal(tablet1.count, 2);
  assert.equal(unassigned.count, 1);
  assert.equal(stats.byZone.find((row) => row.key === "청전·의림").count, 2);
  assert.equal(stats.byZone.find((row) => row.key === "미지정").count, 1);
  assert.equal(stats.byDay.length, 7);
  assert.equal(stats.byDay.at(-1).day, "2026-09-23");
  assert.equal(stats.byDay.at(-1).count, 4);
  assert.equal(stats.byItem[0].name, "소파");
  assert.equal(stats.byItem[0].quantity, 4);
  assert.equal(stats.byItem.find((row) => row.name === "책상").quantity, 2);
});

test("관리 페이지는 접수 통계 영역과 실시간 갱신을 포함한다", async () => {
  const html = await readFile(new URL("../staff.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../staff.js", import.meta.url), "utf8");
  assert.match(html, /data-tab="stats"/);
  assert.match(html, /id="intake-stats"/);
  assert.match(html, /id="intake-stats-strip"/);
  assert.match(html, /id="stats-status"/);
  assert.match(html, /id="stats-by-status"/);
  assert.match(html, /id="stats-by-tablet"/);
  assert.match(html, /id="stats-by-day"/);
  assert.match(app, /buildIntakeStats/);
  assert.match(app, /renderIntakeStats/);
  assert.match(app, /from "\.\/intake-stats\.js"/);
});
