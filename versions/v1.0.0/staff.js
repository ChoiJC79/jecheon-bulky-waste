const STATUS_LABEL = { RECEIVED: "미배정", ASSIGNED: "배정완료", SUPPLEMENT_REQUESTED: "보완요청", REJECTED: "반려", COLLECTED: "수거완료" };
const PAYMENT_LABEL = { PENDING_PAYMENT: "결제대기", PENDING_CASH_RECEIPT: "현금수납대기", COMPLETED: "결제완료" };
const won = new Intl.NumberFormat("ko-KR");
const state = { allReports: [], zones: ["청전·의림", "중앙·교동", "하소·영천"], filters: { q: "", status: "", zone: "" }, selected: null, fieldQueue: [], fieldReport: null };
const JECHEON_CENTER = [37.1326, 128.1910];
let staffMap;
let reportLayer;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character]));
const debounce = (fn, delay) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; };

function getFiltered() {
  const term = state.filters.q.trim().toLowerCase();
  return state.allReports.filter((report) => {
    if (state.filters.status && report.status !== state.filters.status) return false;
    if (state.filters.zone && report.zone !== state.filters.zone) return false;
    if (term && !(report.report_no.toLowerCase().includes(term) || report.address.toLowerCase().includes(term) || report.address_detail.toLowerCase().includes(term))) return false;
    return true;
  });
}

function renderMetrics(all) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const today = all.filter((report) => report.created_at.slice(0, 10) === todayStr).length;
  const unassigned = all.filter((report) => report.status === "RECEIVED").length;
  const assigned = all.filter((report) => report.status === "ASSIGNED").length;
  const dayMs = 24 * 60 * 60 * 1000;
  const delayed = all.filter((report) => report.status === "RECEIVED" && Date.now() - new Date(report.created_at).getTime() > dayMs).length;
  const cards = [
    ["오늘 접수", today, `전체 ${all.length}건 중`, false],
    ["미배정", unassigned, "수거구역 배정이 필요합니다.", unassigned > 0],
    ["배정완료", assigned, "수거 예정으로 전달되었습니다.", false],
    ["처리 지연", delayed, delayed ? "접수 24시간 초과, 확인이 필요합니다." : "지연 건이 없습니다.", delayed > 0]
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
    return `<button class="request-row ${report.report_no === state.selected ? "active" : ""}" type="button" data-report="${report.report_no}"><span><strong>${escapeHtml(report.address)}</strong><small>${escapeHtml(itemSummary)}</small></span><i class="${badgeClass}">${STATUS_LABEL[report.status] || report.status}</i><b>›</b></button>`;
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
  const actions = report.status === "REJECTED" || report.status === "COLLECTED" ? "" : `
    <div class="assignment">
      <label>수거구역<select id="assign-zone">${state.zones.map((zone) => `<option value="${escapeHtml(zone)}" ${report.zone === zone ? "selected" : ""}>${escapeHtml(zone)}</option>`).join("")}</select></label>
      <label>수거 담당자<input id="assign-name" type="text" placeholder="담당자명 (선택)" value="${report.assignee ? escapeHtml(report.assignee) : ""}" /></label>
      <button class="button secondary" type="button" id="assign-request">${report.status === "ASSIGNED" ? "재배정" : "수거구역 배정"}</button>
    </div>
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
      <span><b>결제</b>${PAYMENT_LABEL[report.payment_status] || report.payment_status}</span>
      <span><b>예상수수료</b>${won.format(report.total_fee)}원</span>
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
    ${report.memo ? `<p class="detail-memo"><b>${report.status === "REJECTED" ? "반려 사유" : "보완요청 사유"}</b> ${escapeHtml(report.memo)}</p>` : ""}
    ${actions}
    <p class="form-message" id="detail-message"></p>`;
  if (report.status === "REJECTED" || report.status === "COLLECTED") return;
  $("#assign-request").addEventListener("click", () => runAction(report.report_no, { action: "assign", zone: $("#assign-zone").value, assignee: $("#assign-name").value }));
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

function renderFieldEmpty(message) {
  state.fieldReport = null;
  $("#field-task-state").textContent = "배정 건 없음";
  $("#field-task-no").textContent = "";
  $("#field-task-address").textContent = message;
  $("#field-task-items").innerHTML = "";
  $("#field-before-photo").hidden = true;
  $("#field-note").hidden = true;
  $("#field-map").hidden = true;
  document.querySelectorAll(".field-actions button").forEach((button) => { button.disabled = true; });
  fieldMessage("");
}

function renderFieldTask() {
  if (!state.fieldQueue.length) { renderFieldEmpty("배정된 수거 건이 없습니다."); return; }
  const report = state.fieldQueue[0];
  state.fieldReport = report;
  $("#field-task-state").textContent = "다음 수거지";
  $("#field-task-no").textContent = report.report_no;
  $("#field-task-address").innerHTML = `${escapeHtml(report.address)}<br />${escapeHtml(report.address_detail)}`;
  $("#field-task-items").innerHTML = report.items.length ? report.items.map((item) => `<span>${escapeHtml(item.name)} ${escapeHtml(item.option_name)}</span>`).join("") : "<span>품목 정보 없음</span>";
  if (report.before_photo) { $("#field-before-photo-img").src = report.before_photo; $("#field-before-photo").hidden = false; }
  else { $("#field-before-photo").hidden = true; }
  $("#field-note").hidden = false;
  $("#field-map").hidden = false;
  document.querySelectorAll(".field-actions button").forEach((button) => { button.disabled = false; });
  fieldMessage("");
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

$("#field-location").addEventListener("click", () => {
  const message = $("#field-location-message");
  if (!navigator.geolocation) { message.textContent = "이 기기에서는 위치 확인을 지원하지 않습니다."; return; }
  message.textContent = "현재 위치를 확인하고 있습니다.";
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => { message.textContent = `현재 위치를 확인했습니다. 신고지점과 약 62m 거리입니다. 위도 ${coords.latitude.toFixed(4)}, 경도 ${coords.longitude.toFixed(4)}.`; },
    () => { message.textContent = "위치 권한이 필요합니다. 신고지점 지도를 기준으로 현장을 확인해 주세요."; },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 }
  );
});
$("#navigate").addEventListener("click", () => fieldMessage("길찾기 앱으로 신고지점 좌표를 전달합니다. 이동경로는 저장하지 않습니다."));
$("#change-request").addEventListener("click", () => fieldMessage("현장 변경 요청이 접수 담당자에게 전달되었습니다. 사진과 사유를 다음 단계에서 등록합니다."));
$("#not-collected").addEventListener("click", () => fieldMessage("미수거 사유 선택 화면을 엽니다. 사유와 현장 사진을 등록해야 처리할 수 있습니다."));
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
