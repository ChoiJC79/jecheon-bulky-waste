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
