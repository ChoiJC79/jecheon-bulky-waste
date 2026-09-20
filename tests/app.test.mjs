import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("신고 화면은 품목, 위치, 결제 입력 요소를 포함한다", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="item-search"/);
  assert.match(html, /id="get-location"/);
  assert.match(html, /id="report-map"/);
  assert.match(html, /name="payment"/);
});

test("품목 카탈로그는 분류와 계좌이체 납부 안내를 지원한다", async () => {
  const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
  assert.match(app, /거실·침실 가구/);
  assert.match(app, /가전제품/);
  assert.match(app, /재활용·분리배출/);
  assert.match(app, /폐가전 무상방문수거/);
  assert.match(app, /1599-0903/);
  assert.match(app, /\$\{name\} 무상수거 예약하기/);
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /계좌이체/);
  assert.match(html, /예금주/);
  assert.match(html, /계좌번호/);
  assert.match(html, /value="transfer"/);
  assert.doesNotMatch(html, /value="kakaopay"/);
  assert.doesNotMatch(html, /value="naverpay"/);
  assert.doesNotMatch(html, /value="tosspay"/);
  assert.doesNotMatch(html, /value="card"/);
  assert.doesNotMatch(html, /value="cash"/);
  assert.doesNotMatch(html, /카드결제/);
  assert.doesNotMatch(html, /카카오페이/);
  assert.doesNotMatch(html, /네이버페이/);
  assert.doesNotMatch(html, /현금결제/);
  assert.match(app, /fetch\("\/api\/reports"/);
  assert.match(app, /계좌이체는 입금이 확인된 뒤 수거가 배정됩니다/);
  assert.match(html, /현장 확인과 추가요금 안내/);
  assert.match(html, /id="disposal-guide"/);
  assert.match(html, /시에서 실제 수납 계좌로 교체하기 위한 자리표시자/);
});

test("내부 업무 화면은 접수·현장·데이터 검증 역할을 제공한다", async () => {
  const html = await readFile(new URL("../staff.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../staff.js", import.meta.url), "utf8");
  assert.match(html, /접수·배정/);
  assert.match(html, /현장 처리/);
  assert.match(html, /데이터 검증/);
  assert.match(html, /읽기 전용/);
  assert.match(html, /id="staff-map"/);
  assert.match(app, /renderReportMap/);
});

test("시민 신고 화면은 배출 위치 사진 촬영과 접수번호 조회를 지원한다", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
  assert.match(html, /id="before-photo-input"/);
  assert.match(html, /capture="environment"/);
  assert.match(html, /id="lookup-input"/);
  assert.match(app, /capturePhoto\(file\)/);
  assert.match(app, /beforePhoto: state\.beforePhoto/);
  assert.match(app, /fetch\(`\/api\/reports\/\$\{encodeURIComponent\(reportNo\)\}`\)/);
});

test("현장 처리 화면은 실제 배정 건을 불러와 사진과 함께 수거 완료 처리한다", async () => {
  const html = await readFile(new URL("../staff.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../staff.js", import.meta.url), "utf8");
  assert.match(html, /id="after-photo-input"/);
  assert.match(html, /id="field-before-photo"/);
  assert.match(app, /status=ASSIGNED/);
  assert.match(app, /action: "complete", afterPhoto/);
  assert.match(app, /COLLECTED: "수거완료"/);
});

test("내부 업무 화면은 입금 확인 후에만 수거구역을 배정한다고 안내한다", async () => {
  const html = await readFile(new URL("../staff.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../staff.js", import.meta.url), "utf8");
  assert.match(html, /PENDING_TRANSFER/);
  assert.match(app, /입금 확인 \(결제완료 처리\)/);
  assert.match(app, /입금이 확인되지 않은 건은 수거구역을 배정할 수 없습니다/);
  assert.match(app, /confirm_payment/);
});

test("시민 화면은 3단계 스텝 위저드와 자주 찾는 품목, 검색 동의어, 접수증 카드를 지원한다", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
  assert.match(html, /id="step-1"/);
  assert.match(html, /id="step-2"/);
  assert.match(html, /id="step-3"/);
  assert.match(html, /quick-chip/);
  assert.match(html, /id="receipt-card"/);
  assert.match(html, /id="receipt-no"/);
  assert.match(app, /SYNONYMS/);
  assert.match(app, /goToStep/);
  assert.match(app, /쇼파/);
});

test("현장 업무 화면은 지도 표시, 실제 거리 계산, 길찾기, 미수거 및 변경요청 모달을 지원한다", async () => {
  const html = await readFile(new URL("../staff.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../staff.js", import.meta.url), "utf8");
  assert.match(html, /id="field-task-map"/);
  assert.match(html, /id="uncollected-dialog"/);
  assert.match(html, /id="change-request-dialog"/);
  assert.match(html, /id="field-prev-task"/);
  assert.match(html, /id="field-next-task"/);
  assert.match(html, /id="export-csv"/);
  assert.match(app, /calculateDistanceMeters/);
  assert.match(app, /updateFieldTaskMap/);
  assert.match(app, /action: "uncollect"/);
  assert.match(app, /action: "field_change"/);
});

