import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../server.mjs";

const TINY_JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";

async function withServer(run) {
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  const { port } = app.address();
  const base = `http://127.0.0.1:${port}`;
  try { await run(base); } finally { await new Promise((resolve) => app.close(resolve)); }
}

test("신고자가 등록한 배출 위치 사진은 저장되고, 담당자가 배정·완료 처리하면 수거 완료 사진이 접수번호 조회에 나타난다", async () => {
  await withServer(async (base) => {
    const createRes = await fetch(`${base}/api/reports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        address: "제천시 의림대로 00",
        addressDetail: "테스트 분리수거장",
        paymentMethod: "card",
        location: null,
        items: [{ name: "소파", option: "1인용", fee: 3000, quantity: 1 }],
        beforePhoto: TINY_JPEG
      })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    const { reportNo } = created;
    assert.match(reportNo, /^JC-\d{8}-\d{6}$/);

    const afterCreateLookup = await fetch(`${base}/api/reports/${reportNo}`);
    const afterCreateBody = await afterCreateLookup.json();
    assert.match(afterCreateBody.report.before_photo, /^\/uploads\/.*-before\.jpg$/);
    assert.equal(afterCreateBody.report.after_photo, null);

    const photoRes = await fetch(`${base}${afterCreateBody.report.before_photo}`);
    assert.equal(photoRes.status, 200);
    assert.equal(photoRes.headers.get("content-type"), "image/jpeg");

    const completeBeforeAssignRes = await fetch(`${base}/api/reports/${reportNo}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "complete", afterPhoto: TINY_JPEG })
    });
    assert.equal(completeBeforeAssignRes.status, 409, "배정 전 건은 수거 완료 처리할 수 없어야 한다");

    const assignRes = await fetch(`${base}/api/reports/${reportNo}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "assign", zone: "청전·의림", assignee: "테스트담당자" })
    });
    assert.equal(assignRes.status, 200);

    const completeMissingPhotoRes = await fetch(`${base}/api/reports/${reportNo}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "complete" })
    });
    assert.equal(completeMissingPhotoRes.status, 400, "완료 사진 없이는 수거 완료 처리할 수 없어야 한다");

    const completeRes = await fetch(`${base}/api/reports/${reportNo}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "complete", afterPhoto: TINY_JPEG })
    });
    assert.equal(completeRes.status, 200);
    const completed = await completeRes.json();
    assert.equal(completed.report.status, "COLLECTED");
    assert.match(completed.report.after_photo, /^\/uploads\/.*-after\.jpg$/);

    const finalLookup = await fetch(`${base}/api/reports/${reportNo}`);
    const finalBody = await finalLookup.json();
    assert.equal(finalBody.report.status, "COLLECTED");
    assert.ok(finalBody.report.before_photo);
    assert.ok(finalBody.report.after_photo);

    const missingLookup = await fetch(`${base}/api/reports/JC-00000000-000000`);
    assert.equal(missingLookup.status, 404);
  });
});

test("현장 담당자는 미수거 및 현장변경을 사유·사진과 함께 등록하고, 접수 담당자는 재배정할 수 있으며 CSV 내보내기와 검증에 반영된다", async () => {
  await withServer(async (base) => {
    const createRes = await fetch(`${base}/api/reports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        address: "제천시 의림대로 123",
        addressDetail: "정문 분리수거장",
        paymentMethod: "kakaopay",
        location: { latitude: 37.1326, longitude: 128.1910 },
        items: [{ name: "침대", option: "프레임", fee: 5000, quantity: 1 }],
        beforePhoto: TINY_JPEG
      })
    });
    assert.equal(createRes.status, 201);
    const { reportNo } = await createRes.json();

    const assignRes = await fetch(`${base}/api/reports/${reportNo}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "assign", zone: "중앙·교동", assignee: "이현장" })
    });
    assert.equal(assignRes.status, 200);

    const changeFailRes = await fetch(`${base}/api/reports/${reportNo}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "field_change", reason: "" })
    });
    assert.equal(changeFailRes.status, 400);

    const changeRes = await fetch(`${base}/api/reports/${reportNo}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "field_change", reason: "매트리스 추가 배출되어 수수료 추가 필요", proofPhoto: TINY_JPEG })
    });
    assert.equal(changeRes.status, 200);
    const changed = await changeRes.json();
    assert.equal(changed.report.status, "CHANGE_REQUESTED");
    assert.equal(changed.report.memo, "매트리스 추가 배출되어 수수료 추가 필요");
    assert.match(changed.report.after_photo, /^\/uploads\/.*-fieldchange\.jpg$/);

    const uncollectRes = await fetch(`${base}/api/reports/${reportNo}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "uncollect", reason: "신고자 부재 및 규격 차이로 미수거", proofPhoto: TINY_JPEG })
    });
    assert.equal(uncollectRes.status, 200);
    const uncollected = await uncollectRes.json();
    assert.equal(uncollected.report.status, "UNCOLLECTED");
    assert.equal(uncollected.report.memo, "신고자 부재 및 규격 차이로 미수거");

    const verifyRes = await fetch(`${base}/api/verification`);
    assert.equal(verifyRes.status, 200);
    const verifyBody = await verifyRes.json();
    const flagged = verifyBody.flagged.find((f) => f.reportNo === reportNo);
    assert.ok(flagged, "미수거 건이 검증 목록에 포함되어야 한다");
    assert.equal(flagged.category, "현장 미수거");

    const reassignRes = await fetch(`${base}/api/reports/${reportNo}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "assign", zone: "청전·의림", assignee: "박수거" })
    });
    assert.equal(reassignRes.status, 200);
    const reassigned = await reassignRes.json();
    assert.equal(reassigned.report.status, "ASSIGNED");
    assert.equal(reassigned.report.zone, "청전·의림");
    assert.equal(reassigned.report.assignee, "박수거");
    assert.equal(reassigned.report.memo, null);

    const csvRes = await fetch(`${base}/api/reports/export.csv`);
    assert.equal(csvRes.status, 200);
    assert.match(csvRes.headers.get("content-type"), /text\/csv/);
    const csvText = await csvRes.text();
    assert.ok(csvText.includes("접수번호"));
    assert.ok(csvText.includes(reportNo));
  });
});

test("시민이 현금결제로 신고하면 현금수납대기(PENDING_CASH_RECEIPT)로 저장되고, 담당자가 수납 확인 처리(COMPLETED)할 수 있다", async () => {
  await withServer(async (base) => {
    // 1. 신고자가 현금결제로 신고 등록
    const createRes = await fetch(`${base}/api/reports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        address: "제천시 의림대로 50",
        addressDetail: "행정복지센터 앞",
        paymentMethod: "cash",
        location: { latitude: 37.132, longitude: 128.192 },
        items: [{ name: "소파", option: "1인용", fee: 3000, quantity: 1 }]
      })
    });
    assert.equal(createRes.status, 201);
    const { reportNo, paymentStatus, totalFee } = await createRes.json();
    assert.equal(paymentStatus, "PENDING_CASH_RECEIPT");
    assert.equal(totalFee, 3000);

    // 2. 단건 조회 시 payment_method와 payment_status 확인
    const lookupRes = await fetch(`${base}/api/reports/${reportNo}`);
    assert.equal(lookupRes.status, 200);
    const lookupData = await lookupRes.json();
    assert.equal(lookupData.report.payment_method, "cash");
    assert.equal(lookupData.report.payment_status, "PENDING_CASH_RECEIPT");
    assert.equal(lookupData.report.status, "RECEIVED");

    // 3. 접수 담당자 목록 조회에 포함 확인
    const listRes = await fetch(`${base}/api/reports`);
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    const cashReport = listData.reports.find((r) => r.report_no === reportNo);
    assert.ok(cashReport, "목록에 현금 결제 건이 조회되어야 한다");
    assert.equal(cashReport.payment_status, "PENDING_CASH_RECEIPT");

    // 4. 수납 담당자가 현금 수납 확인 처리
    const confirmRes = await fetch(`${base}/api/reports/${reportNo}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "confirm_payment" })
    });
    assert.equal(confirmRes.status, 200);
    const confirmedData = await confirmRes.json();
    assert.equal(confirmedData.report.payment_status, "COMPLETED");

    // 5. 수납 완료 후 단건 조회
    const afterLookup = await fetch(`${base}/api/reports/${reportNo}`);
    const afterData = await afterLookup.json();
    assert.equal(afterData.report.payment_status, "COMPLETED");
  });
});

test("태블릿용 배정 목록 API는 담당자 기준으로 현장 건을 걸러 주고 결제·메모를 포함한다", async () => {
  await withServer(async (base) => {
    const driverA = "김수거 (1호차·청전의림)";
    const driverB = "이청소 (2호차·중앙교동)";

    const createA = await fetch(`${base}/api/reports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        address: "충청북도 제천시 의병대로 123",
        addressDetail: "101동 앞 분리수거장 옆",
        paymentMethod: "transfer",
        location: { latitude: 37.1425, longitude: 128.2114 },
        items: [{ name: "소파", option: "1인용", fee: 3000, quantity: 1 }]
      })
    });
    assert.equal(createA.status, 201);
    const { reportNo: a1 } = await createA.json();
    const assignA = await fetch(`${base}/api/reports/${a1}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "assign", zone: "청전·의림", assignee: driverA })
    });
    assert.equal(assignA.status, 200);

    const createB = await fetch(`${base}/api/reports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        address: "충청북도 제천시 중앙로 45",
        addressDetail: "상가 뒤편 골목 전신주 앞",
        paymentMethod: "cash",
        location: { latitude: 37.135, longitude: 128.208 },
        items: [{ name: "의자", option: "회전의자", fee: 5000, quantity: 1 }]
      })
    });
    assert.equal(createB.status, 201);
    const { reportNo: b1 } = await createB.json();
    const assignB = await fetch(`${base}/api/reports/${b1}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "assign", zone: "중앙·교동", assignee: driverB })
    });
    assert.equal(assignB.status, 200);

    const mineRes = await fetch(`${base}/api/reports?assignee=${encodeURIComponent(driverA)}`);
    assert.equal(mineRes.status, 200);
    const mine = await mineRes.json();
    const nos = mine.reports.map((r) => r.report_no);
    assert.ok(nos.includes(a1));
    assert.equal(nos.includes(b1), false);
    const mineReport = mine.reports.find((r) => r.report_no === a1);
    assert.equal(mineReport.status, "ASSIGNED");
    assert.equal(mineReport.payment_status, "PENDING_TRANSFER");
    assert.equal(mineReport.address_detail, "101동 앞 분리수거장 옆");
    assert.ok("memo" in mineReport);

    const changeRes = await fetch(`${base}/api/reports/${a1}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "field_change", reason: "4인용 소파로 규격 상이" })
    });
    assert.equal(changeRes.status, 200);
    const after = await changeRes.json();
    assert.equal(after.report.memo, "4인용 소파로 규격 상이");
    assert.equal(after.report.status, "CHANGE_REQUESTED");
  });
});
