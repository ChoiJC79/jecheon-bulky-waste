const STATUS_LABEL = {
  RECEIVED: "미배정",
  ASSIGNED: "배정완료",
  UNCOLLECTED: "미수거",
  CHANGE_REQUESTED: "현장변경요청",
  SUPPLEMENT_REQUESTED: "보완요청",
  REJECTED: "반려",
  COLLECTED: "수거완료"
};
const PAYMENT_LABEL = {
  PENDING_PAYMENT: "결제대기",
  PENDING_CASH_RECEIPT: "현금수납대기",
  PENDING_TRANSFER: "계좌입금대기",
  COMPLETED: "결제완료"
};
const PAYMENT_METHOD_LABEL = {
  cash: "현금결제 (지정 수납처)",
  transfer: "계좌이체",
  card: "카드결제",
  kakaopay: "카카오페이",
  naverpay: "네이버페이",
  tosspay: "토스"
};
const won = new Intl.NumberFormat("ko-KR");
const state = {
  allReports: [],
  zones: ["청전·의림", "중앙·교동", "하소·영천"],
  filters: { q: "", status: "", payment: "", zone: "" },
  selected: null,
  fieldQueue: [],
  fieldIndex: 0,
  fieldReport: null,
  userCoords: null
};
const JECHEON_CENTER = [37.1326, 128.1910];
let staffMap;
let reportLayer;
let fieldTaskMap;
let fieldReportMarker;
let fieldUserMarker;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character]));
const debounce = (fn, delay) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; };

function getFiltered() {
  const term = state.filters.q.trim().toLowerCase();
  return state.allReports.filter((report) => {
    if (state.filters.status && report.status !== state.filters.status) return false;
    if (state.filters.payment && report.payment_status !== state.filters.payment) return false;
    if (state.filters.zone && report.zone !== state.filters.zone) return false;
    if (term && !(report.report_no.toLowerCase().includes(term) || report.address.toLowerCase().includes(term) || report.address_detail.toLowerCase().includes(term))) return false;
    return true;
  });
}

function isUnpaid(report) {
  return report.payment_status !== "COMPLETED";
}

function paymentBadgeHtml(report) {
  if (!isUnpaid(report)) {
    return `<span class="badge-tag badge-pay-ok">결제완료</span>`;
  }
  const label = PAYMENT_LABEL[report.payment_status] || "입금대기";
  return `<span class="badge-tag badge-cash">${label}</span>`;
}
  const todayStr = new Date().toISOString().slice(0, 10);
  const today = all.filter((report) => report.created_at.slice(0, 10) === todayStr).length;
  const unassigned = all.filter((report) => report.status === "RECEIVED").length;
  const pendingTransfer = all.filter((report) => report.payment_status !== "COMPLETED").length;
  const assigned = all.filter((report) => report.status === "ASSIGNED").length;
  const attentionCount = all.filter((report) => ["UNCOLLECTED", "CHANGE_REQUESTED", "SUPPLEMENT_REQUESTED"].includes(report.status)).length;
  const cards = [
    ["오늘 접수", today, `전체 ${all.length}건 중`, false],
    ["입금대기", pendingTransfer, pendingTransfer ? "계좌 입금 확인 후 수거구역을 배정할 수 있습니다." : "대기 건이 없습니다.", pendingTransfer > 0],
    ["미배정", unassigned, "수거구역 배정이 필요합니다.", unassigned > 0],
    ["배정완료", assigned, "수거 예정으로 전달되었습니다.", false],
    ["확인 필요", attentionCount, attentionCount ? "미수거·현장변경 건 확인이 필요합니다." : "확인 건이 없습니다.", attentionCount > 0]
  ];
  $("#metric-grid").innerHTML = cards.map(([label, value, note, attention]) => `<article class="${attention ? "attention" : ""}"><small>${label}</small><strong>${value}</strong><span>${escapeHtml(note)}</span></article>`).join("");
}

function renderZoneCounts(all) {
  document.querySelectorAll(".zone-chip").forEach((marker) => {
    const zone = marker.dataset.zone;
    marker.querySelector("b").textContent = String(all.filter((report) => report.zone === zone).length);
    marker.classList.toggle("marker-active", state.filters.zone === zone);
  });
  $("#zone-note").textContent = state.filters.zone ? `“${state.filters.zone}” 구역에 배정된 건만 표시 중입니다.` : "좌표가 저장된 신고 위치를 지도에서 선택하면 접수 상세를 바로 확인할 수 있습니다.";
}

function setupStaffMap() {
  if (!window.L) return;
  staffMap = L.map("staff-map", { zoomControl: false }).setView(JECHEON_CENTER, 13);
  L.control.zoom({ position: "bottomright" }).addTo(staffMap);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(staffMap);
  reportLayer = L.layerGroup().addTo(staffMap);
}

function renderReportMap() {
  if (!reportLayer) return;
  reportLayer.clearLayers();
  const visible = getFiltered().filter((report) => Number.isFinite(report.latitude) && Number.isFinite(report.longitude));
  visible.forEach((report) => {
    const marker = L.circleMarker([report.latitude, report.longitude], {
      radius: report.report_no === state.selected ? 10 : 7,
      color: "#ffffff",
      weight: 2,
      fillColor: report.status === "RECEIVED" ? "#ff5a36" : "#2c7a4b",
      fillOpacity: 1
    }).addTo(reportLayer);
    marker.bindTooltip(`${escapeHtml(report.report_no)} · ${escapeHtml(report.address)}`, { direction: "top", offset: [0, -7] });
    marker.on("click", () => { state.selected = report.report_no; renderList(); renderDetail(); renderReportMap(); });
  });
}

function renderList() {
  const filtered = getFiltered();
  $("#list-title").textContent = `접수 목록 (${filtered.length}건)`;
  if (!state.allReports.length) { $("#list-status").textContent = "표시할 접수 건이 없습니다."; $("#request-list").innerHTML = ""; return; }
  if (!filtered.length) { $("#list-status").textContent = "조건에 맞는 접수 건이 없습니다."; $("#request-list").innerHTML = ""; return; }
  $("#list-status").textContent = "";
  $("#request-list").innerHTML = filtered.map((report) => {
    const itemSummary = report.items.map((item) => item.name).join(" · ") || "품목 정보 없음";
    const badgeClass = report.status === "RECEIVED" ? "badge-warn" : report.status === "ASSIGNED" ? "badge-ok" : "badge-alert";
    const paymentBadge = paymentBadgeHtml(report);
    return `<button class="request-row ${report.report_no === state.selected ? "active" : ""}" type="button" data-report="${report.report_no}">
      <span>
        <strong>${escapeHtml(report.address)}</strong>
        <small>${escapeHtml(itemSummary)} · ${won.format(report.total_fee)}원</small>
        <span class="request-badges">${paymentBadge}</span>
      </span>
      <i class="${badgeClass}">${STATUS_LABEL[report.status] || report.status}</i>
      <b>›</b>
    </button>`;
  }).join("");
  document.querySelectorAll("[data-report]").forEach((button) => button.addEventListener("click", () => { state.selected = button.dataset.report; renderList(); renderDetail(); renderReportMap(); focusSelectedReport(); }));
}

function focusSelectedReport() {
  const report = state.allReports.find((candidate) => candidate.report_no === state.selected);
  if (staffMap && report && Number.isFinite(report.latitude) && Number.isFinite(report.longitude)) staffMap.setView([report.latitude, report.longitude], 16, { animate: true });
}

function renderDetail() {
  const report = state.allReports.find((candidate) => candidate.report_no === state.selected);
  const drawer = $("#request-detail");
  if (!report) { drawer.innerHTML = "<p>왼쪽 목록에서 신고 건을 선택하면 품목, 위치, 결제 상태를 확인하고 수거구역을 배정하거나 보완요청·반려를 처리할 수 있습니다.</p>"; return; }
  const itemsHtml = report.items.length ? report.items.map((item) => `<li><span>${escapeHtml(item.name)} · ${escapeHtml(item.option_name)}</span><b>${item.quantity}개 · ${won.format(item.unit_fee * item.quantity)}원</b></li>`).join("") : "<li>등록된 품목이 없습니다.</li>";
  const location = report.latitude != null && report.longitude != null ? `${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}` : "좌표 미확인";
  const unpaid = isUnpaid(report);
  const isPendingCash = report.payment_status === "PENDING_CASH_RECEIPT";

  const paymentConfirmBlock = unpaid ? `
    <div class="cash-confirm-panel">
      <div class="cash-confirm-info">
        <strong>${isPendingCash ? "현금 수납 확인 대기" : "계좌 입금 확인 대기"} (수수료: ${won.format(report.total_fee)}원)</strong>
        <p>${isPendingCash
          ? "신고자가 지정 수납처에 현금을 납부했는지 확인한 뒤, 아래 버튼을 눌러 수납 완료 처리해 주세요. 납부 확인 전에는 수거구역을 배정할 수 없습니다."
          : "시민이 안내된 시 지정 계좌로 이체했는지 확인한 뒤, 입금 확인을 눌러 주세요. 입금 확인 전에는 수거구역을 배정할 수 없습니다."}</p>
      </div>
      <button class="button primary" type="button" id="confirm-payment-btn">${isPendingCash ? "현금 수납 확인 (결제완료 처리)" : "입금 확인 (결제완료 처리)"}</button>
    </div>` : "";

  const actions = report.status === "REJECTED" || report.status === "COLLECTED" ? "" : `
    ${paymentConfirmBlock}
    <div class="assignment">
      <label>수거구역<select id="assign-zone" ${unpaid ? "disabled" : ""}>${state.zones.map((zone) => `<option value="${escapeHtml(zone)}" ${report.zone === zone ? "selected" : ""}>${escapeHtml(zone)}</option>`).join("")}</select></label>
      <label>수거 담당자<input id="assign-name" type="text" placeholder="담당자명 (선택)" value="${report.assignee ? escapeHtml(report.assignee) : ""}" ${unpaid ? "disabled" : ""} /></label>
      <button class="button secondary" type="button" id="assign-request" ${unpaid ? "disabled" : ""}>${report.status === "ASSIGNED" ? "재배정" : "수거구역 배정"}</button>
    </div>
    ${unpaid ? `<p class="assign-payment-note">입금이 확인되지 않은 건은 수거구역을 배정할 수 없습니다. 먼저 입금 확인을 처리해 주세요.</p>` : ""}
    <div class="reason-actions">
      <label>보완·반려 사유<input id="action-reason" type="text" placeholder="사유를 입력하세요" /></label>
      <button class="button outline" type="button" id="request-supplement">보완요청</button>
      <button class="button danger" type="button" id="reject-request">반려</button>
    </div>`;

  drawer.innerHTML = `
    <div class="detail-head">
      <div><p class="report-tag">${escapeHtml(report.report_no)}</p><h2>${escapeHtml(report.address)}</h2><p>${escapeHtml(report.address_detail)}</p></div>
      <span class="status-badge status-${report.status.toLowerCase()}">${STATUS_LABEL[report.status] || report.status}</span>
    </div>
    <div class="detail-data">
      <span><b>결제수단</b>${PAYMENT_METHOD_LABEL[report.payment_method] || report.payment_method || "기타"}</span>
      <span><b>결제상태</b><i class="badge-tag ${unpaid ? "badge-cash" : "badge-pay-ok"}">${PAYMENT_LABEL[report.payment_status] || report.payment_status}</i></span>
      <span><b>총 수수료</b>${won.format(report.total_fee)}원</span>
      <span><b>위치 좌표</b>${location}</span>
      <span><b>접수일시</b>${new Date(report.created_at).toLocaleString("ko-KR")}</span>
      <span><b>배정 구역</b>${report.zone ? escapeHtml(report.zone) : "미배정"}</span>
      <span><b>수거 담당자</b>${report.assignee ? escapeHtml(report.assignee) : "미지정"}</span>
    </div>
    <ul class="detail-items">${itemsHtml}</ul>
    ${report.before_photo || report.after_photo ? `<div class="detail-photos">
      ${report.before_photo ? `<div><p class="selection-label">신고자 사진</p><img class="detail-photo" src="${report.before_photo}" alt="신고자가 등록한 배출 위치 사진" /></div>` : ""}
      ${report.after_photo ? `<div><p class="selection-label">수거 완료 사진</p><img class="detail-photo" src="${report.after_photo}" alt="담당자가 등록한 수거 완료 사진" /></div>` : ""}
    </div>` : ""}
    ${report.memo ? `<p class="detail-memo"><b>${report.status === "REJECTED" ? "반려 사유" : "사유 / 메모"}</b> ${escapeHtml(report.memo)}</p>` : ""}
    ${actions}
    <p class="form-message" id="detail-message"></p>`;

  if (unpaid) {
    $("#confirm-payment-btn")?.addEventListener("click", () => {
      runAction(report.report_no, { action: "confirm_payment" });
    });
  }

  if (report.status === "REJECTED" || report.status === "COLLECTED") return;

  $("#assign-request")?.addEventListener("click", () => {
    if (isUnpaid(report)) {
      $("#detail-message").textContent = "입금 확인 후에만 수거구역을 배정할 수 있습니다.";
      return;
    }
    runAction(report.report_no, { action: "assign", zone: $("#assign-zone").value, assignee: $("#assign-name").value });
  });
  $("#request-supplement").addEventListener("click", () => {
    const reason = $("#action-reason").value.trim();
    if (!reason) return void ($("#detail-message").textContent = "보완요청 사유를 입력해 주세요.");
    runAction(report.report_no, { action: "supplement", reason });
  });
  $("#reject-request").addEventListener("click", () => {
    const reason = $("#action-reason").value.trim();
    if (!reason) return void ($("#detail-message").textContent = "반려 사유를 입력해 주세요.");
    runAction(report.report_no, { action: "reject", reason });
  });
}

async function runAction(reportNo, payload) {
  const message = $("#detail-message");
  message.textContent = "처리하고 있습니다…";
  document.querySelectorAll(".assignment button, .reason-actions button").forEach((button) => { button.disabled = true; });
  try {
    const response = await fetch(`/api/reports/${encodeURIComponent(reportNo)}/status`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "처리에 실패했습니다.");
    await loadReports({ keepDetail: true });
    const filtered = getFiltered();
    const nextUnassigned = payload.action === "assign" ? filtered.find((candidate) => candidate.status === "RECEIVED" && candidate.report_no !== reportNo) : null;
    state.selected = nextUnassigned ? nextUnassigned.report_no : reportNo;
    renderList();
    renderDetail();
    $("#list-status").textContent = payload.action === "assign" ? (nextUnassigned ? "배정을 완료하고 다음 미배정 건으로 이동했습니다." : "배정을 완료했습니다.") : "처리를 완료했습니다.";
  } catch (error) {
    message.textContent = error.message;
    document.querySelectorAll(".assignment button, .reason-actions button").forEach((button) => { button.disabled = false; });
  }
}

async function loadReports({ quiet = false, keepDetail = false } = {}) {
  if (!quiet) $("#list-status").textContent = "불러오는 중입니다…";
  try {
    const response = await fetch("/api/reports");
    if (!response.ok) throw new Error();
    const data = await response.json();
    state.allReports = data.reports;
    if (Array.isArray(data.zones) && data.zones.length) state.zones = data.zones;
    renderMetrics(state.allReports);
    renderZoneCounts(state.allReports);
    renderList();
    renderReportMap();
    if (!keepDetail) renderDetail();
  } catch {
    $("#list-status").textContent = "목록을 불러오지 못했습니다. 새로고침을 눌러 다시 시도해 주세요.";
  }
}

function setupReception() {
  $("#request-search").addEventListener("input", debounce(() => { state.filters.q = $("#request-search").value; renderList(); }, 200));
  $("#status-filter").addEventListener("change", () => { state.filters.status = $("#status-filter").value; renderList(); });
  $("#payment-filter")?.addEventListener("change", () => { state.filters.payment = $("#payment-filter").value; renderList(); });
  $("#zone-reset").addEventListener("click", () => { state.filters.zone = ""; renderZoneCounts(state.allReports); renderList(); renderReportMap(); });
  document.querySelectorAll(".zone-chip").forEach((marker) => marker.addEventListener("click", () => {
    state.filters.zone = state.filters.zone === marker.dataset.zone ? "" : marker.dataset.zone;
    renderZoneCounts(state.allReports); renderList(); renderReportMap();
  }));
  $("#refresh-reports").addEventListener("click", () => loadReports());
  setupStaffMap();
  loadReports();
  setInterval(() => loadReports({ quiet: true, keepDetail: true }), 30000);
}

async function loadVerification() {
  try {
    const response = await fetch("/api/verification");
    if (!response.ok) throw new Error();
    const data = await response.json();
    const paymentOk = data.totalReports - data.pendingPayment;
    const locationOk = data.totalReports - data.missingLocation;
    const cards = [
      ["전체 접수", data.totalReports, "전체 신고 건수", "ok"],
      ["결제 정합성", `${paymentOk} / ${data.totalReports}`, "결제완료 처리된 건수", paymentOk === data.totalReports ? "ok" : "warn"],
      ["위치 정합성", `${locationOk} / ${data.totalReports}`, "좌표가 확인된 건수", locationOk === data.totalReports ? "ok" : "warn"],
      ["배정 지연", data.unassignedOver24h, "접수 24시간 초과 미배정 건수", data.unassignedOver24h > 0 ? "warn" : "ok"]
    ];
    $("#verification-grid").innerHTML = cards.map(([title, value, detail, status]) => `<article class="verification-card ${status}"><small>${title}</small><strong>${value}</strong><span>${detail}</span></article>`).join("");
    $("#issue-list").innerHTML = data.flagged.length ? data.flagged.map((issue) => `<tr><td>${escapeHtml(issue.reportNo)}</td><td>${escapeHtml(issue.category)}</td><td>${escapeHtml(issue.detail)}</td><td>${escapeHtml(issue.owner)}</td></tr>`).join("") : '<tr><td colspan="4">확인이 필요한 항목이 없습니다.</td></tr>';
  } catch {
    $("#verification-grid").innerHTML = "<p>검증 결과를 불러오지 못했습니다.</p>";
    $("#issue-list").innerHTML = "";
  }
}

function setupTabs() {
  document.querySelectorAll("[data-tab]").forEach((tab) => tab.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach((other) => other.setAttribute("aria-selected", String(other === tab)));
    document.querySelectorAll(".staff-panel").forEach((panel) => { const active = panel.id === tab.dataset.tab; panel.hidden = !active; panel.classList.toggle("active", active); });
    if (tab.dataset.tab === "reception") loadReports({ quiet: true, keepDetail: true });
    if (tab.dataset.tab === "field") loadFieldQueue();
    if (tab.dataset.tab === "verify") loadVerification();
  }));
}

function fieldMessage(message) { $("#field-message").textContent = message; }

function setupFieldTaskMap() {
  if (!window.L || fieldTaskMap) return;
  const container = document.getElementById("field-task-map");
  if (!container) return;
  fieldTaskMap = L.map("field-task-map", { zoomControl: false, scrollWheelZoom: false }).setView(JECHEON_CENTER, 14);
  L.control.zoom({ position: "bottomright" }).addTo(fieldTaskMap);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(fieldTaskMap);
}

function updateFieldTaskMap(report, userCoords) {
  setupFieldTaskMap();
  if (!fieldTaskMap) return;
  setTimeout(() => { if (fieldTaskMap) fieldTaskMap.invalidateSize(); }, 80);

  const points = [];
  if (report && Number.isFinite(report.latitude) && Number.isFinite(report.longitude)) {
    const reportPos = [report.latitude, report.longitude];
    points.push(reportPos);
    if (!fieldReportMarker) {
      fieldReportMarker = L.circleMarker(reportPos, { radius: 8, fillColor: "#ff5a36", color: "#ffffff", weight: 2, fillOpacity: 1 }).addTo(fieldTaskMap);
    } else {
      fieldReportMarker.setLatLng(reportPos);
    }
    fieldReportMarker.bindTooltip(`신고지: ${escapeHtml(report.address)}`, { direction: "top", offset: [0, -6] });
  } else if (fieldReportMarker) {
    fieldTaskMap.removeLayer(fieldReportMarker);
    fieldReportMarker = null;
  }

  if (userCoords && Number.isFinite(userCoords.latitude) && Number.isFinite(userCoords.longitude)) {
    const userPos = [userCoords.latitude, userCoords.longitude];
    points.push(userPos);
    if (!fieldUserMarker) {
      fieldUserMarker = L.circleMarker(userPos, { radius: 8, fillColor: "#2563eb", color: "#ffffff", weight: 2, fillOpacity: 1 }).addTo(fieldTaskMap);
    } else {
      fieldUserMarker.setLatLng(userPos);
    }
    fieldUserMarker.bindTooltip("현재 내 위치", { direction: "bottom", offset: [0, 6] });
  }

  if (points.length === 2) {
    fieldTaskMap.fitBounds(points, { padding: [25, 25], maxZoom: 16 });
  } else if (points.length === 1) {
    fieldTaskMap.setView(points[0], 16);
  } else {
    fieldTaskMap.setView(JECHEON_CENTER, 13);
  }
}

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function renderFieldEmpty(message) {
  state.fieldReport = null;
  $("#field-task-state").textContent = "배정 건 없음";
  $("#field-task-state").className = "task-state";
  $("#field-task-no").textContent = "";
  $("#field-task-address").textContent = message;
  $("#field-task-items").innerHTML = "";
  $("#field-before-photo").hidden = true;
  $("#field-note").hidden = true;
  $("#field-map").hidden = true;
  $("#field-task-indicator").textContent = "0 / 0";
  $("#field-prev-task").disabled = true;
  $("#field-next-task").disabled = true;
  document.querySelectorAll(".field-actions button").forEach((button) => { button.disabled = true; });
  fieldMessage("");
}

function renderFieldTask() {
  const total = state.fieldQueue.length;
  if (!total) { renderFieldEmpty("배정된 수거 건이 없습니다."); return; }
  if (state.fieldIndex < 0) state.fieldIndex = 0;
  if (state.fieldIndex >= total) state.fieldIndex = total - 1;

  $("#field-task-indicator").textContent = `${state.fieldIndex + 1} / ${total}`;
  $("#field-prev-task").disabled = state.fieldIndex <= 0;
  $("#field-next-task").disabled = state.fieldIndex >= total - 1;

  const report = state.fieldQueue[state.fieldIndex];
  state.fieldReport = report;
  $("#field-task-state").textContent = STATUS_LABEL[report.status] || report.status;
  $("#field-task-state").className = `task-state status-${report.status.toLowerCase()}`;
  $("#field-task-no").textContent = report.report_no;
  $("#field-task-address").innerHTML = `${escapeHtml(report.address)}<br /><small style="color:var(--muted);font-weight:normal">${escapeHtml(report.address_detail)}</small>`;
  $("#field-task-items").innerHTML = report.items.length ? report.items.map((item) => `<span>${escapeHtml(item.name)} ${escapeHtml(item.option_name)} × ${item.quantity}</span>`).join("") : "<span>품목 정보 없음</span>";
  if (report.before_photo) {
    $("#field-before-photo-img").src = report.before_photo;
    $("#field-before-photo").hidden = false;
  } else {
    $("#field-before-photo").hidden = true;
  }
  $("#field-note").hidden = false;
  $("#field-map").hidden = false;
  document.querySelectorAll(".field-actions button").forEach((button) => { button.disabled = false; });
  fieldMessage("");
  updateFieldTaskMap(report, state.userCoords);
}

async function loadFieldQueue() {
  $("#field-date").textContent = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  try {
    const [assignedRes, collectedRes] = await Promise.all([fetch("/api/reports?status=ASSIGNED"), fetch("/api/reports?status=COLLECTED")]);
    if (!assignedRes.ok || !collectedRes.ok) throw new Error();
    const assigned = await assignedRes.json();
    const collected = await collectedRes.json();
    state.fieldQueue = assigned.reports.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const total = state.fieldQueue.length + collected.reports.length;
    $("#field-progress-label").textContent = total ? `${total}건 중` : "배정된 건 없음";
    $("#field-progress-count").textContent = total ? `${collected.reports.length}건 완료` : "";
    $("#field-progress-fill").style.width = total ? `${Math.round((collected.reports.length / total) * 100)}%` : "0%";
  } catch {
    fieldMessage("배정 건을 불러오지 못했습니다. 새로고침해 주세요.");
    return;
  }
  renderFieldTask();
}

$("#field-prev-task").addEventListener("click", () => {
  if (state.fieldIndex > 0) {
    state.fieldIndex--;
    renderFieldTask();
  }
});
$("#field-next-task").addEventListener("click", () => {
  if (state.fieldIndex < state.fieldQueue.length - 1) {
    state.fieldIndex++;
    renderFieldTask();
  }
});

$("#field-location").addEventListener("click", () => {
  const message = $("#field-location-message");
  if (!navigator.geolocation) { message.textContent = "이 기기에서는 위치 확인을 지원하지 않습니다."; return; }
  message.textContent = "현재 위치를 확인하고 있습니다…";
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      state.userCoords = { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy };
      updateFieldTaskMap(state.fieldReport, state.userCoords);
      if (state.fieldReport && Number.isFinite(state.fieldReport.latitude) && Number.isFinite(state.fieldReport.longitude)) {
        const dist = calculateDistanceMeters(coords.latitude, coords.longitude, state.fieldReport.latitude, state.fieldReport.longitude);
        const accuracyText = Number.isFinite(coords.accuracy) ? `(정확도 ±${Math.round(coords.accuracy)}m)` : "";
        if (dist <= 100) {
          message.textContent = `현재 위치 확인: 신고지점과 약 ${dist}m 거리 (현장 인접) ${accuracyText}`;
        } else {
          message.textContent = `현재 위치 확인: 신고지점과 약 ${dist}m 거리 (이동 중) ${accuracyText}`;
        }
      } else {
        message.textContent = `현재 위치를 확인했습니다 (위도 ${coords.latitude.toFixed(4)}, 경도 ${coords.longitude.toFixed(4)}). 신고 좌표가 없으므로 주소지를 확인해 주세요.`;
      }
    },
    () => { message.textContent = "위치 권한이 필요합니다. 신고지점 지도를 기준으로 현장을 확인해 주세요."; },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
});

$("#navigate").addEventListener("click", () => {
  if (!state.fieldReport) return fieldMessage("배정 건을 먼저 선택해 주세요.");
  const report = state.fieldReport;
  const title = encodeURIComponent(report.address);
  let url = "";
  if (Number.isFinite(report.latitude) && Number.isFinite(report.longitude)) {
    url = `https://map.kakao.com/link/to/${title},${report.latitude},${report.longitude}`;
  } else {
    url = `https://map.kakao.com/link/search/${title}`;
  }
  window.open(url, "_blank", "noopener,noreferrer");
  fieldMessage("카카오맵 길찾기로 연결했습니다.");
});

// 미수거 처리 모달 흐름
let uncollectedPhotoData = null;
const uncollectedDialog = $("#uncollected-dialog");
$("#not-collected").addEventListener("click", () => {
  if (!state.fieldReport) return fieldMessage("처리할 배정 건이 없습니다.");
  uncollectedPhotoData = null;
  $("#uncollected-photo-preview").hidden = true;
  $("#uncollected-photo-btn").hidden = false;
  $("#uncollected-modal-msg").textContent = "";
  document.querySelector('input[name="uncollected-preset"][value="품목 미배출 (현장에 폐기물 없음)"]').checked = true;
  $("#uncollected-reason").value = "품목 미배출 (현장에 폐기물 없음)";
  if (uncollectedDialog.showModal) uncollectedDialog.showModal();
  else uncollectedDialog.setAttribute("open", "");
});
document.querySelectorAll('input[name="uncollected-preset"]').forEach((radio) => {
  radio.addEventListener("change", (e) => {
    $("#uncollected-reason").value = e.target.value === "기타" ? "" : e.target.value;
    if (e.target.value === "기타") $("#uncollected-reason").focus();
  });
});
$("#uncollected-modal-close").addEventListener("click", () => uncollectedDialog.close());
$("#uncollected-cancel-btn").addEventListener("click", () => uncollectedDialog.close());
$("#uncollected-photo-btn").addEventListener("click", () => $("#uncollected-photo-file").click());
$("#uncollected-photo-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    uncollectedPhotoData = await capturePhoto(file);
    $("#uncollected-photo-img").src = uncollectedPhotoData;
    $("#uncollected-photo-preview").hidden = false;
    $("#uncollected-photo-btn").hidden = true;
    $("#uncollected-modal-msg").textContent = "";
  } catch (err) {
    $("#uncollected-modal-msg").textContent = err.message || "사진 처리 실패";
  }
});
$("#uncollected-photo-del").addEventListener("click", () => {
  uncollectedPhotoData = null;
  $("#uncollected-photo-preview").hidden = true;
  $("#uncollected-photo-btn").hidden = false;
});
$("#uncollected-submit-btn").addEventListener("click", async () => {
  const reason = $("#uncollected-reason").value.trim();
  if (!reason) { $("#uncollected-modal-msg").textContent = "미수거 사유를 입력해 주세요."; return; }
  const reportNo = state.fieldReport.report_no;
  $("#uncollected-submit-btn").disabled = true;
  $("#uncollected-modal-msg").textContent = "등록하고 있습니다…";
  try {
    const res = await fetch(`/api/reports/${encodeURIComponent(reportNo)}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "uncollect", reason, proofPhoto: uncollectedPhotoData })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "처리에 실패했습니다.");
    uncollectedDialog.close();
    fieldMessage(`${reportNo}번을 미수거 처리했습니다. 접수 담당자에게 전달되었습니다.`);
    await loadFieldQueue();
  } catch (err) {
    $("#uncollected-modal-msg").textContent = err.message;
  } finally {
    $("#uncollected-submit-btn").disabled = false;
  }
});

// 현장 변경 요청 모달 흐름
let changePhotoData = null;
const changeDialog = $("#change-request-dialog");
$("#change-request").addEventListener("click", () => {
  if (!state.fieldReport) return fieldMessage("처리할 배정 건이 없습니다.");
  changePhotoData = null;
  $("#change-photo-preview").hidden = true;
  $("#change-photo-btn").hidden = false;
  $("#change-modal-msg").textContent = "";
  document.querySelector('input[name="change-preset"][value="품목·규격 상이 (추가 수수료 필요)"]').checked = true;
  $("#change-reason").value = "품목·규격 상이 (추가 수수료 필요)";
  if (changeDialog.showModal) changeDialog.showModal();
  else changeDialog.setAttribute("open", "");
});
document.querySelectorAll('input[name="change-preset"]').forEach((radio) => {
  radio.addEventListener("change", (e) => {
    $("#change-reason").value = e.target.value === "기타" ? "" : e.target.value;
    if (e.target.value === "기타") $("#change-reason").focus();
  });
});
$("#change-modal-close").addEventListener("click", () => changeDialog.close());
$("#change-cancel-btn").addEventListener("click", () => changeDialog.close());
$("#change-photo-btn").addEventListener("click", () => $("#change-photo-file").click());
$("#change-photo-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    changePhotoData = await capturePhoto(file);
    $("#change-photo-img").src = changePhotoData;
    $("#change-photo-preview").hidden = false;
    $("#change-photo-btn").hidden = true;
    $("#change-modal-msg").textContent = "";
  } catch (err) {
    $("#change-modal-msg").textContent = err.message || "사진 처리 실패";
  }
});
$("#change-photo-del").addEventListener("click", () => {
  changePhotoData = null;
  $("#change-photo-preview").hidden = true;
  $("#change-photo-btn").hidden = false;
});
$("#change-submit-btn").addEventListener("click", async () => {
  const reason = $("#change-reason").value.trim();
  if (!reason) { $("#change-modal-msg").textContent = "변경 요청 내용을 입력해 주세요."; return; }
  const reportNo = state.fieldReport.report_no;
  $("#change-submit-btn").disabled = true;
  $("#change-modal-msg").textContent = "전송하고 있습니다…";
  try {
    const res = await fetch(`/api/reports/${encodeURIComponent(reportNo)}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "field_change", reason, proofPhoto: changePhotoData })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "요청에 실패했습니다.");
    changeDialog.close();
    fieldMessage(`${reportNo}번 현장 변경 요청이 접수 담당자에게 전달되었습니다.`);
    await loadFieldQueue();
  } catch (err) {
    $("#change-modal-msg").textContent = err.message;
  } finally {
    $("#change-submit-btn").disabled = false;
  }
});

// 수거 완료 흐름
$("#complete-collection").addEventListener("click", () => {
  if (!state.fieldReport) return fieldMessage("처리할 배정 건이 없습니다.");
  $("#after-photo-input").click();
});
$("#after-photo-input").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file || !state.fieldReport) return;
  const reportNo = state.fieldReport.report_no;
  const buttons = document.querySelectorAll(".field-actions button");
  buttons.forEach((button) => { button.disabled = true; });
  fieldMessage("사진을 처리하고 있습니다…");
  try {
    const afterPhoto = await capturePhoto(file);
    const response = await fetch(`/api/reports/${encodeURIComponent(reportNo)}/status`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "complete", afterPhoto }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "처리에 실패했습니다.");
    fieldMessage(`${reportNo}번 수거를 완료 처리했습니다. 신고자가 접수번호로 사진을 확인할 수 있어요.`);
    await loadFieldQueue();
  } catch (error) {
    fieldMessage(error.message || "사진 등록에 실패했습니다. 다시 시도해 주세요.");
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
});

$("#refresh-verification").addEventListener("click", () => { loadVerification(); $("#refresh-verification").textContent = "방금 검증했습니다"; });

setupReception(); setupTabs();
