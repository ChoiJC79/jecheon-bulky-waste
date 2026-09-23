import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { app } from "../server.mjs";

async function withServer(run) {
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  const { port } = app.address();
  const base = `http://127.0.0.1:${port}`;
  try { await run(base); } finally { await new Promise((resolve) => app.close(resolve)); }
}

async function createPaidReport(base, address = "제천시 의림대로 1") {
  const createRes = await fetch(`${base}/api/reports`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      address,
      addressDetail: "현관 앞",
      paymentMethod: "transfer",
      channel: "PHONE",
      citizenName: "홍길동",
      citizenPhone: "010-1234-5678",
      location: { latitude: 37.1326, longitude: 128.1910 },
      items: [{ name: "소파", option: "2인용", fee: 5000, quantity: 1 }]
    })
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  await fetch(`${base}/api/reports/${created.reportNo}/status`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "confirm_transfer" })
  });
  return created.reportNo;
}

test("현장 함대는 1호차·2호차·예비 3대이며 전체 배정 모드가 없다", async () => {
  const tablet = await readFile(new URL("../tablet.html", import.meta.url), "utf8");
  const tabletJs = await readFile(new URL("../tablet.js", import.meta.url), "utf8");
  assert.match(tablet, /value="tablet-1"/);
  assert.match(tablet, /value="tablet-2"/);
  assert.match(tablet, /value="tablet-spare"/);
  assert.doesNotMatch(tablet, /value="__ALL__"/);
  assert.doesNotMatch(tabletJs, /geolocation\.watchPosition/);
  assert.match(tabletJs, /requestJobLocation/);
  assert.match(tabletJs, /\/api\/reports\?deviceId=/);

  await withServer(async (base) => {
    const fleetRes = await fetch(`${base}/api/fleet`);
    assert.equal(fleetRes.status, 200);
    const fleet = await fleetRes.json();
    assert.equal(fleet.allMode, false);
    assert.equal(fleet.devices.length, 3);
    assert.deepEqual(fleet.devices.map((d) => d.id), ["tablet-1", "tablet-2", "tablet-spare"]);
    assert.ok(fleet.devices.every((d) => d.id !== "__ALL__"));
    assert.equal(fleet.devices.find((d) => d.id === "tablet-spare").role, "spare");

    const assignees = await (await fetch(`${base}/api/staff-assignees`)).json();
    assert.equal(assignees.allMode, false);
    assert.ok(assignees.devices.every((d) => !("pin" in d)));

    const rejected = await fetch(`${base}/api/reports/JC-00000000-000000/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "assign", zone: "청전·의림", assignee: "__ALL__" })
    });
    assert.ok(rejected.status === 400 || rejected.status === 404);
  });
});

test("사무실이 1호차로 보내면 해당 태블릿만 즉시 받고 2호차는 받지 않으며 예비가 인수할 수 있다", async () => {
  await withServer(async (base) => {
    const reportNo = await createPaidReport(base);

    const bindBad = await fetch(`${base}/api/fleet/bind`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: "tablet-1", pin: "0000" })
    });
    assert.equal(bindBad.status, 401);

    const bindOk = await fetch(`${base}/api/fleet/bind`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: "tablet-1", pin: "1111" })
    });
    assert.equal(bindOk.status, 200);

    await fetch(`${base}/api/fleet/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: "tablet-1" })
    });

    const waiting = fetch(`${base}/api/fleet/wait?deviceId=tablet-1&since=0&timeoutMs=4000`);
    await new Promise((resolve) => setTimeout(resolve, 80));
    const assignRes = await fetch(`${base}/api/reports/${reportNo}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "assign", zone: "청전·의림", deviceId: "tablet-1", assignee: "tablet-1" })
    });
    assert.equal(assignRes.status, 200);
    const assigned = await assignRes.json();
    assert.equal(assigned.report.assignee, "tablet-1");

    const waited = await (await waiting).json();
    assert.equal(waited.timedOut, false);
    assert.equal(waited.event?.deviceId, "tablet-1");
    assert.equal(waited.event?.type, "assigned");
    assert.equal(waited.event?.reportNo, reportNo);

    const one = await (await fetch(`${base}/api/reports?deviceId=tablet-1`)).json();
    const two = await (await fetch(`${base}/api/reports?deviceId=tablet-2`)).json();
    const spare = await (await fetch(`${base}/api/reports?deviceId=tablet-spare`)).json();
    assert.ok(one.reports.some((r) => r.report_no === reportNo));
    assert.ok(!two.reports.some((r) => r.report_no === reportNo), "2호차는 1호차 배정 건을 받으면 안 된다");
    assert.ok(!spare.reports.some((r) => r.report_no === reportNo));

    const allReject = await fetch(`${base}/api/reports/${reportNo}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "assign", zone: "청전·의림", assignee: "__ALL__" })
    });
    assert.equal(allReject.status, 400);

    const takeover = await fetch(`${base}/api/fleet/takeover`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fromDeviceId: "tablet-1", toDeviceId: "tablet-spare" })
    });
    assert.equal(takeover.status, 200);
    const moved = await takeover.json();
    assert.ok(moved.moved >= 1);
    assert.ok(moved.reportNos.includes(reportNo));
    assert.equal(moved.to.id, "tablet-spare");

    const afterOne = await (await fetch(`${base}/api/reports?deviceId=tablet-1`)).json();
    const afterSpare = await (await fetch(`${base}/api/reports?deviceId=tablet-spare`)).json();
    const afterTwo = await (await fetch(`${base}/api/reports?deviceId=tablet-2`)).json();
    assert.ok(!afterOne.reports.some((r) => r.report_no === reportNo));
    assert.ok(afterSpare.reports.some((r) => r.report_no === reportNo));
    assert.ok(!afterTwo.reports.some((r) => r.report_no === reportNo));

    const snapshot = await (await fetch(`${base}/api/fleet`)).json();
    const tablet1 = snapshot.devices.find((d) => d.id === "tablet-1");
    const spareDev = snapshot.devices.find((d) => d.id === "tablet-spare");
    assert.equal(tablet1.online, true);
    assert.ok(spareDev.jobs.some((job) => job.report_no === reportNo));
    assert.ok(!tablet1.jobs.some((job) => job.report_no === reportNo));
  });
});
