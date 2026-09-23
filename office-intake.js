import { OFFICE_ITEM_CATALOG, OFFICE_ADDRESS_PRESETS } from "./office-catalog.js";

const capturePhoto = (...args) => globalThis.capturePhoto(...args);
const won = new Intl.NumberFormat("ko-KR");
const JECHEON_CENTER = [37.1326, 128.1910];
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character]));

const DEFAULT_DEVICES = [
  { id: "tablet-1", name: "1호차", zone: "청전·의림", role: "field" },
  { id: "tablet-2", name: "2호차", zone: "중앙·교동", role: "field" },
  { id: "tablet-spare", name: "예비", zone: "", role: "spare" }
];
const ZONES = ["청전·의림", "중앙·교동", "하소·영천"];

const state = {
  step: 1,
  cart: [],
  location: null,
  beforePhoto: null,
  currentReport: null,
  devices: DEFAULT_DEVICES.map((device) => ({ ...device, online: false, lastSeenAt: null, assignedCount: 0, jobs: [] })),
  zones: [...ZONES],
  pendingTransfers: [],
  selectedDeviceId: "tablet-1"
};

let intakeMap;
let intakeMarker;
let onReportsChanged = async () => {};

function feeTotal() {
  return state.cart.reduce((sum, item) => sum + item.fee * item.quantity, 0);
}

function setStep(step) {
  state.step = step;
  document.querySelectorAll("[data-office-step]").forEach((item) => {
    const value = Number(item.dataset.officeStep);
    item.classList.toggle("is-current", value === step);
    item.classList.toggle("is-done", value < step);
  });
  for (const panel of ["1", "2", "3"]) {
    const node = $(`#office-step-${panel}`);
    if (node) node.hidden = panel !== String(step);
  }
  if (step === 2) refreshTransferQueue();
  if (step === 1) invalidateOfficeMap();
  if (step === 3) renderDispatch();
}

function invalidateOfficeMap() {
  if (!intakeMap) return;
  setTimeout(() => intakeMap.invalidateSize(), 80);
}

function setupIntakeMap() {
  if (!window.L || intakeMap) return;
  const container = document.getElementById("intake-map");
  if (!container) return;
  intakeMap = L.map("intake-map", { zoomControl: false }).setView(JECHEON_CENTER, 13);
  L.control.zoom({ position: "bottomright" }).addTo(intakeMap);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(intakeMap);
  intakeMap.on("click", (event) => {
    setIntakeLocation(event.latlng.lat, event.latlng.lng, "지도에서 선택한 배출 위치");
  });
}

function setIntakeLocation(latitude, longitude, title) {
  state.location = { latitude, longitude };
  if (!intakeMap) return;
  const point = [latitude, longitude];
  if (intakeMarker) intakeMarker.setLatLng(point);
  else intakeMarker = L.marker(point, { title: "배출 위치" }).addTo(intakeMap);
  intakeMap.setView(point, 16, { animate: true });
  const note = $("#intake-map-note");
  if (note) note.textContent = `${title} · ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function selectedCategory() {
  return OFFICE_ITEM_CATALOG.find((category) => category.id === $("#intake-category")?.value) || OFFICE_ITEM_CATALOG[0];
}

function selectedItem() {
  const category = selectedCategory();
  return category.items.find((item) => item.name === $("#intake-item")?.value) || category.items[0];
}

function renderCategoryOptions() {
  const select = $("#intake-category");
  if (!select) return;
  select.innerHTML = OFFICE_ITEM_CATALOG.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join("");
  renderItemOptions();
}

function renderItemOptions() {
  const select = $("#intake-item");
  if (!select) return;
  const category = selectedCategory();
  select.innerHTML = category.items.map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`).join("");
  renderOptionOptions();
}

function renderOptionOptions() {
  const select = $("#intake-option");
  if (!select) return;
  const item = selectedItem();
  select.innerHTML = item.options.map(([label, fee], index) => `<option value="${index}">${escapeHtml(label)} · ${won.format(fee)}원</option>`).join("");
}

function renderCart() {
  const cart = $("#intake-cart");
  const total = $("#intake-fee-total");
  if (!cart) return;
  if (!state.cart.length) {
    cart.innerHTML = `<p class="intake-empty">전화로 들은 품목을 추가해 주세요.</p>`;
  } else {
    cart.innerHTML = state.cart.map((item, index) => `<li>
      <span>${escapeHtml(item.name)} · ${escapeHtml(item.option)} × ${item.quantity}</span>
      <b>${won.format(item.fee * item.quantity)}원</b>
      <button type="button" class="text-button" data-remove-item="${index}">삭제</button>
    </li>`).join("");
    cart.querySelectorAll("[data-remove-item]").forEach((button) => button.addEventListener("click", () => {
      state.cart.splice(Number(button.dataset.removeItem), 1);
      renderCart();
    }));
  }
  if (total) total.textContent = `${won.format(feeTotal())}원`;
}

function addCartItem({ name, option, fee, quantity = 1 } = {}) {
  const item = name ? { name, option, fee, quantity } : null;
  if (!item) {
    const selected = selectedItem();
    const optionIndex = Number($("#intake-option").value);
    const [optionName, optionFee] = selected.options[optionIndex] || selected.options[0];
    const qty = Math.max(1, Number($("#intake-qty").value) || 1);
    state.cart.push({ name: selected.name, option: optionName, fee: optionFee, quantity: qty });
  } else {
    state.cart.push(item);
  }
  renderCart();
}

function renderAddressPresets() {
  const box = $("#intake-address-presets");
  if (!box) return;
  box.innerHTML = OFFICE_ADDRESS_PRESETS.map((preset) => `<button type="button" class="quick-chip" data-preset="${escapeHtml(preset.id)}">${escapeHtml(preset.label)}</button>`).join("");
  box.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => {
    const preset = OFFICE_ADDRESS_PRESETS.find((item) => item.id === button.dataset.preset);
    if (!preset) return;
    $("#intake-address").value = preset.address;
    $("#intake-address-detail").value = preset.addressDetail;
    setIntakeLocation(preset.latitude, preset.longitude, preset.label);
  }));
}

function renderQuickChips() {
  const box = $("#intake-quick-chips");
  if (!box) return;
  const chips = [
    { name: "소파", option: "2인용", fee: 5000, quantity: 1 },
    { name: "장롱", option: "1쪽", fee: 5000, quantity: 1 },
    { name: "책상", option: "1m 미만", fee: 3000, quantity: 1 },
    { name: "매트리스", option: "1인용", fee: 5000, quantity: 1 }
  ];
  box.innerHTML = chips.map((chip, index) => `<button type="button" class="quick-chip" data-quick="${index}">${escapeHtml(chip.name)} ${escapeHtml(chip.option)}</button>`).join("");
  box.querySelectorAll("[data-quick]").forEach((button) => button.addEventListener("click", () => addCartItem(chips[Number(button.dataset.quick)])));
}

function message(id, text) {
  const node = $(id);
  if (node) node.textContent = text || "";
}

async function submitIntake(event) {
  event.preventDefault();
  const citizenName = $("#intake-citizen-name").value.trim();
  const citizenPhone = $("#intake-citizen-phone").value.trim();
  const address = $("#intake-address").value.trim();
  const addressDetail = $("#intake-address-detail").value.trim();
  if (!citizenName || !citizenPhone) return message("#intake-message", "전화로 받은 신고자 이름과 연락처를 입력해 주세요.");
  if (!state.cart.length) return message("#intake-message", "품목을 한 가지 이상 추가해 주세요.");
  if (!address || !addressDetail) return message("#intake-message", "배출 주소와 상세 장소를 입력해 주세요.");
  const button = $("#intake-submit");
  button.disabled = true;
  message("#intake-message", "전화 접수를 등록하고 있습니다…");
  try {
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        address,
        addressDetail,
        paymentMethod: "transfer",
        channel: "PHONE",
        citizenName,
        citizenPhone,
        location: state.location,
        items: state.cart.map((item) => ({ name: item.name, option: item.option, fee: item.fee, quantity: item.quantity })),
        beforePhoto: state.beforePhoto
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "접수를 등록하지 못했습니다.");
    state.currentReport = {
      report_no: result.reportNo,
      total_fee: result.totalFee,
      payment_status: result.paymentStatus,
      status: "RECEIVED",
      citizen_name: citizenName,
      citizen_phone: citizenPhone,
      address,
      address_detail: addressDetail,
      items: state.cart.map((item) => ({ name: item.name, option_name: item.option, quantity: item.quantity, unit_fee: item.fee })),
      channel: "PHONE",
      payment_method: "transfer"
    };
    await onReportsChanged();
    await refreshTransferQueue();
    renderTransferSummary();
    setStep(2);
    message("#transfer-message", `${result.reportNo} 전화 접수를 등록했습니다. 자동이체 입금을 확인해 주세요.`);
  } catch (error) {
    message("#intake-message", error.message);
  } finally {
    button.disabled = false;
  }
}

function reportLabel(report) {
  const items = (report.items || []).map((item) => item.name).join(" · ") || "품목 없음";
  return `${report.report_no} · ${report.address} · ${items} · ${won.format(report.total_fee)}원`;
}

function renderTransferSummary() {
  const box = $("#transfer-report-summary");
  if (!box) return;
  const report = state.currentReport;
  if (!report) {
    box.innerHTML = "<p>입금을 확인할 접수 건을 아래 대기 목록에서 골라 주세요.</p>";
    return;
  }
  const items = (report.items || []).map((item) => `${item.name} ${item.option_name || item.option || ""} × ${item.quantity}`).join(", ");
  box.innerHTML = `
    <p class="report-tag">${escapeHtml(report.report_no)}</p>
    <h3>${escapeHtml(report.address)}</h3>
    <p>${escapeHtml(report.address_detail || "")}</p>
    <p>${escapeHtml(report.citizen_name || "")} · ${escapeHtml(report.citizen_phone || "")}</p>
    <p>${escapeHtml(items)}</p>
    <p class="intake-fee-line">확인할 금액 <strong>${won.format(report.total_fee)}원</strong></p>`;
}

function renderTransferQueue() {
  const list = $("#transfer-queue");
  if (!list) return;
  if (!state.pendingTransfers.length) {
    list.innerHTML = `<p class="intake-empty">자동이체 입금 대기 건이 없습니다.</p>`;
    return;
  }
  list.innerHTML = state.pendingTransfers.map((report) => `<button type="button" class="request-row ${state.currentReport?.report_no === report.report_no ? "active" : ""}" data-transfer="${escapeHtml(report.report_no)}">
    <span><strong>${escapeHtml(report.address)}</strong><small>${escapeHtml(reportLabel(report))}${report.citizen_name ? ` · ${escapeHtml(report.citizen_name)}` : ""}</small></span>
    <i class="badge-warn">입금대기</i>
    <b>›</b>
  </button>`).join("");
  list.querySelectorAll("[data-transfer]").forEach((button) => button.addEventListener("click", () => {
    state.currentReport = state.pendingTransfers.find((report) => report.report_no === button.dataset.transfer) || state.currentReport;
    renderTransferSummary();
    renderTransferQueue();
    message("#transfer-message", "");
  }));
}

async function refreshTransferQueue() {
  try {
    const response = await fetch("/api/reports");
    if (!response.ok) throw new Error();
    const data = await response.json();
    const reports = data.reports || [];
    state.pendingTransfers = reports.filter((report) => report.payment_status === "PENDING_TRANSFER");
    if (state.currentReport) {
      const fresh = reports.find((report) => report.report_no === state.currentReport.report_no);
      if (fresh) state.currentReport = fresh;
    } else if (state.pendingTransfers.length) {
      state.currentReport = state.pendingTransfers[0];
    }
    renderTransferQueue();
    renderTransferSummary();
  } catch {
    message("#transfer-message", "입금 대기 목록을 불러오지 못했습니다.");
  }
}

async function confirmTransfer() {
  const report = state.currentReport;
  if (!report) return message("#transfer-message", "확인할 접수 건이 없습니다.");
  if (report.payment_status === "COMPLETED") {
    setStep(3);
    return message("#dispatch-message", "이미 입금이 확인된 건입니다. 담당자 태블릿으로 보내 주세요.");
  }
  const button = $("#transfer-confirm-btn");
  button.disabled = true;
  message("#transfer-message", "입금 확인을 처리하고 있습니다…");
  try {
    const response = await fetch(`/api/reports/${encodeURIComponent(report.report_no)}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "confirm_transfer" })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "입금 확인에 실패했습니다.");
    state.currentReport = result.report;
    await onReportsChanged();
    await refreshTransferQueue();
    renderDispatch();
    setStep(3);
    message("#dispatch-message", `${result.report.report_no} 자동이체 입금을 확인했습니다. 수거 담당자 태블릿으로 보내 주세요.`);
  } catch (error) {
    message("#transfer-message", error.message);
  } finally {
    button.disabled = false;
  }
}

function suggestedZone() {
  const address = state.currentReport?.address || "";
  if (address.includes("하소") || address.includes("영천")) return "하소·영천";
  if (address.includes("교동") || address.includes("중앙")) return "중앙·교동";
  return "청전·의림";
}

function suggestedDeviceId(zone) {
  if (zone === "중앙·교동") return "tablet-2";
  return "tablet-1";
}

function renderFleetBoard(rootId = "fleet-device-grid") {
  const grid = $(`#${rootId}`);
  if (!grid) return;
  if (!state.devices.length) {
    grid.innerHTML = `<p class="intake-empty">태블릿 현황을 불러오는 중입니다.</p>`;
    return;
  }
  grid.innerHTML = state.devices.map((device) => {
    const online = Boolean(device.online);
    const lastSeen = device.lastSeenAt
      ? new Date(device.lastSeenAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      : "미접속";
    const jobs = (device.jobs || []).slice(0, 3).map((job) => `<li>${escapeHtml(job.report_no.slice(-6))} · ${escapeHtml(job.address || "")}</li>`).join("")
      || "<li>배정 건 없음</li>";
    const selected = state.selectedDeviceId === device.id ? " is-selected" : "";
    return `<article class="fleet-card${selected}${online ? " is-online" : ""}" data-device-id="${escapeHtml(device.id)}">
      <div class="fleet-card-head">
        <strong>${escapeHtml(device.name)}</strong>
        <span class="fleet-online ${online ? "on" : "off"}">${online ? "온라인" : "오프라인"}</span>
      </div>
      <p class="fleet-meta">${device.role === "spare" ? "예비 태블릿" : escapeHtml(device.zone || "구역 미지정")} · 마지막 접속 ${escapeHtml(lastSeen)}</p>
      <p class="fleet-count">배정 ${device.assignedCount || 0}건</p>
      <ul class="fleet-jobs">${jobs}</ul>
      <div class="fleet-card-actions">
        <button type="button" class="button primary" data-send-device="${escapeHtml(device.id)}">이 태블릿으로 보내기</button>
        ${device.role === "spare" ? "" : `<button type="button" class="button outline" data-takeover-from="${escapeHtml(device.id)}">예비가 인수</button>`}
      </div>
    </article>`;
  }).join("");
  grid.querySelectorAll("[data-send-device]").forEach((button) => button.addEventListener("click", () => {
    state.selectedDeviceId = button.dataset.sendDevice;
    sendToTablet(button.dataset.sendDevice);
  }));
  grid.querySelectorAll("[data-takeover-from]").forEach((button) => button.addEventListener("click", () => takeoverRoute(button.dataset.takeoverFrom)));
  grid.querySelectorAll(".fleet-card").forEach((card) => card.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    state.selectedDeviceId = card.dataset.deviceId;
    renderDispatch();
  }));
}

function renderDispatch() {
  const summary = $("#dispatch-report-summary");
  const zoneSelect = $("#dispatch-zone");
  const report = state.currentReport;
  if (summary) {
    summary.innerHTML = report
      ? `<p class="report-tag">${escapeHtml(report.report_no)}</p>
         <h3>${escapeHtml(report.address)}</h3>
         <p>결제상태: ${report.payment_status === "COMPLETED" ? "입금 확인 완료" : "입금 대기"} · ${won.format(report.total_fee)}원</p>
         <p>${escapeHtml((report.items || []).map((item) => item.name).join(" · "))}</p>`
      : "<p>전송할 접수 건이 없습니다.</p>";
  }
  if (zoneSelect) {
    const selected = report?.zone || suggestedZone();
    zoneSelect.innerHTML = state.zones.map((zone) => `<option value="${escapeHtml(zone)}" ${zone === selected ? "selected" : ""}>${escapeHtml(zone)}</option>`).join("");
  }
  const assigned = getFleetDeviceFromAssignee(report?.assignee);
  if (assigned) state.selectedDeviceId = assigned.id;
  renderFleetBoard("dispatch-device-grid");
  renderFleetBoard("fleet-device-grid");
  const paid = report?.payment_status === "COMPLETED";
  const sendBtn = $("#dispatch-send-btn");
  if (sendBtn) sendBtn.disabled = !report || !paid;
  if (!paid && report) message("#dispatch-message", "자동이체 입금을 먼저 확인해 주세요.");
}

function getFleetDeviceFromAssignee(assignee) {
  if (!assignee) return null;
  return state.devices.find((device) => device.id === assignee || device.name === assignee || String(assignee).includes(device.name)) || null;
}

async function sendToTablet(deviceId = state.selectedDeviceId) {
  const report = state.currentReport;
  if (!report) return message("#dispatch-message", "전송할 접수 건이 없습니다.");
  if (report.payment_status !== "COMPLETED") {
    setStep(2);
    return message("#transfer-message", "태블릿으로 보내기 전에 자동이체 입금을 확인해 주세요.");
  }
  const device = state.devices.find((item) => item.id === deviceId);
  if (!device || deviceId === "__ALL__") return message("#dispatch-message", "1호차·2호차·예비 중 보낼 태블릿을 선택해 주세요.");
  const zone = $("#dispatch-zone")?.value || suggestedZone();
  const button = $("#dispatch-send-btn");
  if (button) button.disabled = true;
  message("#dispatch-message", `${device.name} 태블릿으로 전송하고 있습니다…`);
  try {
    const response = await fetch(`/api/reports/${encodeURIComponent(report.report_no)}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "assign", zone, assignee: device.id, deviceId: device.id })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "전송에 실패했습니다.");
    state.currentReport = result.report;
    state.selectedDeviceId = device.id;
    await onReportsChanged();
    await loadFleet();
    renderDispatch();
    const link = $("#dispatch-tablet-link");
    if (link) {
      link.hidden = false;
      link.href = `tablet.html?device=${encodeURIComponent(device.id)}`;
      link.textContent = `${device.name} 태블릿에서 방금 보낸 건 확인`;
    }
    message("#dispatch-message", `${device.name}로 보냈습니다. 해당 안드로이드 태블릿 목록이 바로 갱신됩니다.`);
  } catch (error) {
    message("#dispatch-message", error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

async function takeoverRoute(fromDeviceId) {
  const from = state.devices.find((device) => device.id === fromDeviceId);
  if (!from) return;
  message("#dispatch-message", `${from.name} 경로를 예비 태블릿이 인수합니다…`);
  try {
    const response = await fetch("/api/fleet/takeover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fromDeviceId, toDeviceId: "tablet-spare" })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "인수에 실패했습니다.");
    await onReportsChanged();
    await loadFleet();
    renderDispatch();
    message("#dispatch-message", `${from.name} ${result.moved}건을 예비 태블릿이 인수했습니다.`);
  } catch (error) {
    message("#dispatch-message", error.message);
  }
}

async function loadFleet(snapshot) {
  try {
    const data = snapshot || await (await fetch("/api/fleet")).json();
    if (Array.isArray(data.devices) && data.devices.length) {
      state.devices = data.devices.filter((device) => device.id !== "__ALL__");
    }
    if (Array.isArray(data.zones) && data.zones.length) state.zones = data.zones;
    renderFleetBoard("fleet-device-grid");
    renderFleetBoard("dispatch-device-grid");
  } catch {
    /* 기본 3대 유지 */
  }
}

async function loadAssignees() {
  await loadFleet();
}

export function refreshOfficeIntake() {
  invalidateOfficeMap();
  if (state.step !== 1) refreshTransferQueue();
}

export function applyFleetSnapshot(snapshot) {
  if (snapshot) loadFleet(snapshot);
}

export { loadFleet };

export function setupOfficeIntake(options = {}) {
  onReportsChanged = options.onReportsChanged || (async () => {});
  renderCategoryOptions();
  renderQuickChips();
  renderAddressPresets();
  renderCart();
  setupIntakeMap();
  loadAssignees();

  $("#intake-category")?.addEventListener("change", renderItemOptions);
  $("#intake-item")?.addEventListener("change", renderOptionOptions);
  $("#intake-add-item")?.addEventListener("click", () => addCartItem());
  $("#intake-form")?.addEventListener("submit", submitIntake);
  $("#intake-photo-btn")?.addEventListener("click", () => $("#intake-photo-input").click());
  $("#intake-photo-input")?.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      state.beforePhoto = await capturePhoto(file);
      const preview = $("#intake-photo-preview");
      const img = $("#intake-photo-img");
      if (img) img.src = state.beforePhoto;
      if (preview) preview.hidden = false;
    } catch (error) {
      message("#intake-message", error.message);
    }
  });
  $("#intake-photo-del")?.addEventListener("click", () => {
    state.beforePhoto = null;
    const preview = $("#intake-photo-preview");
    if (preview) preview.hidden = true;
  });
  $("#transfer-confirm-btn")?.addEventListener("click", confirmTransfer);
  $("#dispatch-send-btn")?.addEventListener("click", () => sendToTablet(state.selectedDeviceId));
  $("#dispatch-zone")?.addEventListener("change", () => {
    if (!state.currentReport?.assignee) {
      state.selectedDeviceId = suggestedDeviceId($("#dispatch-zone").value);
      renderDispatch();
    }
  });
  document.querySelectorAll("[data-office-step]").forEach((button) => button.addEventListener("click", () => setStep(Number(button.dataset.officeStep))));
  $("#office-goto-confirm")?.addEventListener("click", () => setStep(2));
  $("#office-goto-intake")?.addEventListener("click", () => setStep(1));
  $("#office-goto-dispatch")?.addEventListener("click", () => setStep(2));
}
