/* ==========================================================================
   제천시 대형폐기물 현장 수거 전용 태블릿 스크립트 (tablet.js)
   - 기기별 담당자 지정 및 유지
   - 2열 분할 레이아웃 & 대형 터치 타깃
   - 원터치 카메라 촬영 -> 즉시 수거 완료 & 다음 건 자동 이동
   - 실시간 GPS 거리 계산 & 카카오맵 내비 연동
   - 음성 안내(TTS) 및 야외 고대비 모드
   ========================================================================== */

import { connectFleetSync } from "./fleet-sync.js";

const capturePhoto = (...args) => globalThis.capturePhoto(...args);

const won = new Intl.NumberFormat("ko-KR");
const JECHEON_CENTER = [37.1326, 128.1910];
const DEVICE_CATALOG = [
  { id: "tablet-1", name: "1호차", zone: "청전·의림", role: "field", pin: "1111" },
  { id: "tablet-2", name: "2호차", zone: "중앙·교동", role: "field", pin: "2222" },
  { id: "tablet-spare", name: "예비", zone: "", role: "spare", pin: "0000" }
];
const DEVICE_STORAGE_KEY = "waste_tablet_device_id";

function readStoredDeviceId() {
  const fromUrl = new URLSearchParams(location.search).get("device");
  if (fromUrl && DEVICE_CATALOG.some((device) => device.id === fromUrl)) return fromUrl;
  const sessionValue = sessionStorage.getItem(DEVICE_STORAGE_KEY);
  if (sessionValue && DEVICE_CATALOG.some((device) => device.id === sessionValue)) return sessionValue;
  const localValue = localStorage.getItem(DEVICE_STORAGE_KEY);
  if (localValue && DEVICE_CATALOG.some((device) => device.id === localValue)) return localValue;
  const legacy = localStorage.getItem("waste_tablet_assignee") || "";
  const migrated = DEVICE_CATALOG.find((device) => legacy.includes(device.name) || legacy === device.id);
  return migrated?.id || "";
}

const state = {
  deviceId: readStoredDeviceId(),
  device: null,
  tasks: [],
  selectedReportNo: null,
  filter: "PENDING", // PENDING | COLLECTED | ALL
  sortBy: "distance", // distance | time
  userCoords: null,
  isVoiceEnabled: localStorage.getItem("waste_tablet_voice") !== "false",
  isOutdoorContrast: localStorage.getItem("waste_tablet_contrast") === "true",
  map: null,
  reportMarker: null,
  userMarker: null
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const escapeHtml = (val) => String(val ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// --------------------------------------------------------------------------
// 유틸리티 함수들
// --------------------------------------------------------------------------
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) return null;
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function showToast(msg, type = "success") {
  const toast = $("#tablet-toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.className = `tablet-toast show toast-${type}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.className = "tablet-toast";
  }, 3000);
}

function speak(text) {
  if (!state.isVoiceEnabled || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  utterance.rate = 1.05;
  window.speechSynthesis.speak(utterance);
}

// --------------------------------------------------------------------------
// 지도 관리
// --------------------------------------------------------------------------
function initMap() {
  if (!window.L || state.map) return;
  const mapEl = document.getElementById("tablet-map");
  if (!mapEl) return;
  state.map = L.map("tablet-map", { zoomControl: false, scrollWheelZoom: false }).setView(JECHEON_CENTER, 14);
  L.control.zoom({ position: "bottomright" }).addTo(state.map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(state.map);
}

function updateMap(report, userCoords) {
  initMap();
  if (!state.map) return;
  setTimeout(() => { if (state.map) state.map.invalidateSize(); }, 60);

  const points = [];
  if (report && Number.isFinite(report.latitude) && Number.isFinite(report.longitude)) {
    const rPos = [report.latitude, report.longitude];
    points.push(rPos);
    if (!state.reportMarker) {
      state.reportMarker = L.circleMarker(rPos, {
        radius: 10,
        fillColor: "#ff5a36",
        color: "#ffffff",
        weight: 3,
        fillOpacity: 1
      }).addTo(state.map);
    } else {
      state.reportMarker.setLatLng(rPos);
    }
    state.reportMarker.bindTooltip(`<b>신고지:</b> ${escapeHtml(report.address)}`, { direction: "top", offset: [0, -8] });
  } else if (state.reportMarker) {
    state.map.removeLayer(state.reportMarker);
    state.reportMarker = null;
  }

  const distToUser = report && userCoords
    ? calculateDistanceMeters(report.latitude, report.longitude, userCoords.latitude, userCoords.longitude)
    : null;
  const userIsNearby = distToUser !== null && distToUser <= 20000;

  if (userIsNearby) {
    const uPos = [userCoords.latitude, userCoords.longitude];
    points.push(uPos);
    if (!state.userMarker) {
      state.userMarker = L.circleMarker(uPos, {
        radius: 9,
        fillColor: "#1d4ed8",
        color: "#ffffff",
        weight: 3,
        fillOpacity: 1
      }).addTo(state.map);
    } else {
      state.userMarker.setLatLng(uPos);
    }
    state.userMarker.bindTooltip("🚜 현재 위치 (이 작업 건)", { direction: "bottom", offset: [0, 8] });
  } else if (state.userMarker) {
    state.map.removeLayer(state.userMarker);
    state.userMarker = null;
  }

  if (points.length === 2) {
    state.map.fitBounds(points, { padding: [40, 40], maxZoom: 17 });
  } else if (points.length === 1) {
    state.map.setView(points[0], 16);
  } else {
    state.map.setView(JECHEON_CENTER, 13);
  }
}

function deviceById(id) {
  return DEVICE_CATALOG.find((device) => device.id === id) || null;
}

function persistDevice(deviceId) {
  state.deviceId = deviceId;
  state.device = deviceById(deviceId);
  sessionStorage.setItem(DEVICE_STORAGE_KEY, deviceId);
  localStorage.setItem(DEVICE_STORAGE_KEY, deviceId);
  localStorage.removeItem("waste_tablet_assignee");
}

// --------------------------------------------------------------------------
// 기기 배정 설정
// --------------------------------------------------------------------------
async function setupDeviceConfig() {
  const modal = $("#modal-device-config");
  const display = $("#assignee-name-display");
  const icon = $("#assignee-icon");

  function updateHeaderBadge() {
    const device = state.device || deviceById(state.deviceId);
    if (!device) {
      display.textContent = "태블릿 미지정";
      icon.textContent = "🚜";
      return;
    }
    display.textContent = device.role === "spare" ? "예비 태블릿" : `${device.name}${device.zone ? ` · ${device.zone}` : ""}`;
    icon.textContent = device.role === "spare" ? "🛠️" : "🚜";
  }

  state.device = deviceById(state.deviceId);
  if (!state.deviceId || !state.device) {
    if (modal.showModal) modal.showModal();
    else modal.setAttribute("open", "");
  } else {
    updateHeaderBadge();
  }

  $("#btn-device-setting").addEventListener("click", () => {
    $$('input[name="device-assignee-opt"]').forEach((radio) => {
      radio.checked = radio.value === state.deviceId;
    });
    $("#device-pin-input").value = "";
    if (modal.showModal) modal.showModal();
    else modal.setAttribute("open", "");
  });

  $("#btn-close-device-modal").addEventListener("click", () => modal.close());
  $("#btn-cancel-device-modal").addEventListener("click", () => modal.close());

  $("#btn-save-device-modal").addEventListener("click", async () => {
    const checked = $('input[name="device-assignee-opt"]:checked');
    const selected = checked?.value || "";
    if (!selected || selected === "__ALL__" || !deviceById(selected)) {
      return showToast("1호차·2호차·예비 중 하나를 선택해 주세요.", "warn");
    }
    const pin = $("#device-pin-input").value.trim();
    try {
      const res = await fetch("/api/fleet/bind", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: selected, pin })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "기기 등록에 실패했습니다.");
      persistDevice(selected);
      updateHeaderBadge();
      modal.close();
      showToast(`${state.device.name} 태블릿으로 연결했습니다.`);
      startRealtime();
      await loadTasks();
    } catch (error) {
      showToast(error.message || "PIN을 확인해 주세요.", "warn");
    }
  });
}

// --------------------------------------------------------------------------
// 작업 목록 로드 및 렌더링
// --------------------------------------------------------------------------
async function loadTasks({ quiet = false } = {}) {
  const syncLabel = $("#sync-time-display");
  if (!state.deviceId) {
    state.tasks = [];
    if (syncLabel) syncLabel.textContent = "기기 미지정";
    updateProgressAndMetrics();
    renderSidebarList();
    renderMainStage(null);
    return;
  }
  if (!quiet) syncLabel.textContent = "동기화 중…";

  try {
    const url = `/api/reports?deviceId=${encodeURIComponent(state.deviceId)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const data = await res.json();
    state.tasks = data.reports || [];

    // 동기화 시각 업데이트
    const now = new Date();
    syncLabel.textContent = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} 동기화`;

    updateProgressAndMetrics();
    renderSidebarList();

    // 현재 선택된 건이 유효한지 확인하고 우측 스테이지 렌더
    const visibleList = getFilteredAndSortedTasks();
    if (!state.selectedReportNo || !state.tasks.some((t) => t.report_no === state.selectedReportNo)) {
      // 미완료 중 첫 번째 건을 우선 선택
      const firstPending = visibleList.find((t) => t.status !== "COLLECTED") || visibleList[0];
      state.selectedReportNo = firstPending ? firstPending.report_no : null;
    }

    const currentReport = state.tasks.find((t) => t.report_no === state.selectedReportNo);
    renderMainStage(currentReport);
  } catch (err) {
    syncLabel.textContent = "동기화 실패";
    if (!quiet) showToast("수거 목록을 불러오지 못했습니다.", "warn");
  }
}

function updateProgressAndMetrics() {
  const collected = state.tasks.filter((t) => t.status === "COLLECTED").length;
  const pending = state.tasks.filter((t) => t.status !== "COLLECTED").length;
  const total = state.tasks.length;
  const percent = total > 0 ? Math.round((collected / total) * 100) : 0;

  $("#count-pending").textContent = String(pending);
  $("#count-collected").textContent = String(collected);
  $("#count-all").textContent = String(total);

  $("#progress-text").textContent = total > 0 ? `${collected} / ${total}건 (${percent}%)` : "0 / 0건 (0%)";
  $("#progress-bar-fill").style.width = `${percent}%`;
}

function getFilteredAndSortedTasks() {
  let list = state.tasks.slice();

  // 1) 필터
  if (state.filter === "PENDING") {
    list = list.filter((t) => t.status !== "COLLECTED");
  } else if (state.filter === "COLLECTED") {
    list = list.filter((t) => t.status === "COLLECTED");
  }

  // 2) 거리 계산 붙이기
  list.forEach((t) => {
    if (state.userCoords && Number.isFinite(t.latitude) && Number.isFinite(t.longitude)) {
      const meters = calculateDistanceMeters(state.userCoords.latitude, state.userCoords.longitude, t.latitude, t.longitude);
      t._distance = meters != null && meters <= 20000 ? meters : null;
    } else {
      t._distance = null;
    }
  });

  // 3) 정렬
  if (state.sortBy === "distance" && state.userCoords) {
    list.sort((a, b) => {
      if (a._distance === null) return 1;
      if (b._distance === null) return -1;
      return a._distance - b._distance;
    });
  } else {
    // 접수 순 (시간순)
    list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  return list;
}

function renderSidebarList() {
  const container = $("#task-list-container");
  const list = getFilteredAndSortedTasks();

  if (!list.length) {
    container.innerHTML = `
      <div style="padding:40px 20px;text-align:center;color:var(--tb-muted);">
        <p style="font-size:16px;font-weight:700;margin-bottom:6px;">해당 조건의 작업이 없습니다.</p>
        <small>필터를 변경하거나 상단 새로고침을 눌러주세요.</small>
      </div>`;
    return;
  }

  const statusLabel = {
    ASSIGNED: "배정완료",
    COLLECTED: "수거완료",
    UNCOLLECTED: "미수거",
    CHANGE_REQUESTED: "변경요청"
  };

  const statusClass = {
    ASSIGNED: "badge-assigned",
    COLLECTED: "badge-collected",
    UNCOLLECTED: "badge-uncollected",
    CHANGE_REQUESTED: "badge-change"
  };

  container.innerHTML = list.map((task, idx) => {
    const isActive = task.report_no === state.selectedReportNo;
    const isCollected = task.status === "COLLECTED";
    const itemsSummary = task.items.map((i) => `${i.name} ${i.option_name}×${i.quantity}`).join(", ") || "품목 정보 없음";

    let distHtml = "";
    if (task._distance !== null) {
      const isNear = task._distance <= 60;
      distHtml = `<span class="card-distance-pill ${isNear ? "near" : ""}">${isNear ? "📍 인접 " : ""}${task._distance}m</span>`;
    }

    return `
      <article class="task-card ${isActive ? "active" : ""} ${isCollected ? "status-collected" : ""}" data-no="${escapeHtml(task.report_no)}">
        <div class="card-top">
          <span class="card-seq">#${idx + 1} · ${escapeHtml(task.report_no.slice(-6))}</span>
          <span class="card-status-badge ${statusClass[task.status] || "badge-assigned"}">${statusLabel[task.status] || task.status}${task.channel === "PHONE" ? " · 전화" : ""}</span>
        </div>
        <div class="card-address">${escapeHtml(task.address)}</div>
        <div class="card-detail-loc">📍 ${escapeHtml(task.address_detail)}</div>
        <div class="card-bottom">
          <span class="card-items-summary" title="${escapeHtml(itemsSummary)}">${escapeHtml(itemsSummary)}</span>
          ${distHtml}
        </div>
      </article>
    `;
  }).join("");

  container.querySelectorAll(".task-card").forEach((card) => {
    card.addEventListener("click", () => {
      const reportNo = card.dataset.no;
      state.selectedReportNo = reportNo;
      renderSidebarList();
      const report = state.tasks.find((t) => t.report_no === reportNo);
      lastLocatedReportNo = null;
      renderMainStage(report);
    });
  });
}

// --------------------------------------------------------------------------
// 우측 메인 스테이지 렌더링
// --------------------------------------------------------------------------
let lastLocatedReportNo = null;
function renderMainStage(report, { skipLocation = false } = {}) {
  const emptyView = $("#stage-empty-view");
  const contentView = $("#stage-content-view");

  if (!report) {
    emptyView.hidden = false;
    contentView.hidden = true;
    return;
  }

  emptyView.hidden = true;
  contentView.hidden = false;
  if (!skipLocation && report.report_no !== lastLocatedReportNo) {
    lastLocatedReportNo = report.report_no;
    requestJobLocation();
  }

  // 1) 배너 정보
  $("#stage-report-no").textContent = report.report_no;
  $("#stage-payment-badge").textContent = report.channel === "PHONE"
    ? (report.payment_status === "COMPLETED" ? "전화접수 · 결제완료" : "전화접수")
    : (report.payment_status === "COMPLETED" ? "결제완료" : (report.payment_status === "PENDING_CASH_RECEIPT" ? "현금수납대기" : "결제대기"));
  $("#stage-payment-badge").className = `card-status-badge ${report.payment_status === "COMPLETED" ? "badge-collected" : "badge-change"}`;
  $("#stage-zone-badge").textContent = report.zone ? `구역: ${report.zone}` : "구역 미지정";
  $("#stage-address").textContent = report.address;
  $("#stage-address-detail").textContent = report.citizen_name
    ? `📍 배출위치: ${report.address_detail} · 신고자 ${report.citizen_name}`
    : `📍 배출위치: ${report.address_detail}`;

  // 2) 카카오맵 길찾기 버튼
  const navBtn = $("#btn-navigate-kakao");
  navBtn.onclick = () => {
    const title = encodeURIComponent(report.address);
    let url = "";
    if (Number.isFinite(report.latitude) && Number.isFinite(report.longitude)) {
      url = `https://map.kakao.com/link/to/${title},${report.latitude},${report.longitude}`;
    } else {
      url = `https://map.kakao.com/link/search/${title}`;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    showToast("카카오맵 길찾기로 연결합니다.");
  };

  // 3) 거리 계산 및 태그
  const distTag = $("#stage-dist-tag");
  let dist = null;
  if (state.userCoords && Number.isFinite(report.latitude) && Number.isFinite(report.longitude)) {
    const meters = calculateDistanceMeters(state.userCoords.latitude, state.userCoords.longitude, report.latitude, report.longitude);
    dist = meters != null && meters <= 20000 ? meters : null;
  }
  if (dist !== null) {
    if (dist <= 60) {
      distTag.textContent = `🟢 현장 도착 (약 ${dist}m 거리)`;
      distTag.className = "map-dist-tag near";
    } else {
      distTag.textContent = `🟡 이동 중 (약 ${dist}m 거리)`;
      distTag.className = "map-dist-tag";
    }
  } else {
    distTag.textContent = report.latitude ? "신고 위치" : "신고 좌표 없음";
    distTag.className = "map-dist-tag";
  }

  // 4) 지도 갱신
  updateMap(report, state.userCoords);

  // 5) 시민 등록 배출 사진
  const photoWrap = $("#citizen-photo-container");
  const beforeImg = $("#stage-before-photo");
  const noPhoto = $("#stage-no-photo");
  if (report.before_photo) {
    beforeImg.src = report.before_photo;
    photoWrap.hidden = false;
    noPhoto.hidden = true;
    photoWrap.onclick = () => {
      openImageZoom(report.before_photo);
    };
  } else {
    photoWrap.hidden = true;
    noPhoto.hidden = false;
  }

  // 6) 품목 테이블
  const tbody = $("#stage-items-tbody");
  tbody.innerHTML = (report.items || []).map((item) => `
    <tr>
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td>${escapeHtml(item.option_name)}</td>
      <td><span class="item-qty-badge">${item.quantity}개</span></td>
    </tr>
  `).join("") || `<tr><td colspan="3" style="text-align:center;color:var(--tb-muted)">품목 정보가 없습니다.</td></tr>`;
  $("#stage-total-fee").textContent = `수수료 ${won.format(report.total_fee || 0)}원`;

  // 7) 하단 버튼 상태
  const completeBtn = $("#btn-tablet-complete");
  if (report.status === "COLLECTED") {
    completeBtn.innerHTML = `<span>✅</span> <span>수거 완료됨 (사진 재등록/수정)</span>`;
    completeBtn.style.background = "#2b5942";
  } else {
    completeBtn.innerHTML = `<span style="font-size:26px;">📸</span> <span>사진 찍고 즉시 수거 완료</span>`;
    completeBtn.style.background = "var(--tb-primary)";
  }
}

function openImageZoom(src) {
  const modal = $("#modal-image-zoom");
  $("#zoom-img").src = src;
  if (modal.showModal) modal.showModal();
  else modal.setAttribute("open", "");
}
$("#btn-close-zoom").addEventListener("click", () => $("#modal-image-zoom").close());

// --------------------------------------------------------------------------
// 즉각 처리 1: 카메라 촬영 후 수거 완료
// --------------------------------------------------------------------------
function setupCollectionAction() {
  const fileInput = $("#camera-file-input");
  const completeBtn = $("#btn-tablet-complete");

  completeBtn.addEventListener("click", () => {
    if (!state.selectedReportNo) return showToast("처리할 건을 선택해 주세요.", "warn");
    fileInput.click();
  });

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file || !state.selectedReportNo) return;

    const reportNo = state.selectedReportNo;
    completeBtn.disabled = true;
    completeBtn.innerHTML = `<span>⏳</span> <span>사진 저장 및 수거 완료 처리 중…</span>`;

    try {
      // 사진 압축 및 Base64 변환
      const afterPhoto = await capturePhoto(file, { maxSize: 1024, quality: 0.82 });
      const res = await fetch(`/api/reports/${encodeURIComponent(reportNo)}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "complete", afterPhoto })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "수거 완료 처리 실패");

      showToast(`🎉 ${reportNo.slice(-6)}번 수거가 완료되었습니다!`, "success");
      speak("수거가 완료되었습니다.");

      // 데이터 다시 불러오기
      await loadTasks({ quiet: true });

      // 자동 다음 미완료 건으로 이동! (Auto-advance)
      const nextPending = state.tasks.find((t) => t.status !== "COLLECTED");
      if (nextPending) {
        state.selectedReportNo = nextPending.report_no;
        renderSidebarList();
        renderMainStage(nextPending);
        speak(`다음 수거지는 ${nextPending.address}입니다.`);
      } else {
        showToast("🎊 오늘 배정된 모든 수거 작업을 완수했습니다!", "success");
        speak("오늘 배정된 모든 수거 작업을 완료했습니다. 수고하셨습니다.");
      }
    } catch (err) {
      showToast(err.message || "처리에 실패했습니다. 다시 시도해 주세요.", "warn");
    } finally {
      completeBtn.disabled = false;
      const cur = state.tasks.find((t) => t.report_no === state.selectedReportNo);
      renderMainStage(cur);
    }
  });
}

// --------------------------------------------------------------------------
// 즉각 처리 2: 미수거 등록
// --------------------------------------------------------------------------
function setupUncollectedAction() {
  const modal = $("#modal-uncollected");
  const openBtn = $("#btn-tablet-uncollected");
  const fileInput = $("#uncollected-photo-file");
  let uncollectedPhotoData = null;

  openBtn.addEventListener("click", () => {
    if (!state.selectedReportNo) return showToast("처리할 건을 선택해 주세요.", "warn");
    uncollectedPhotoData = null;
    $("#uncollected-photo-preview").hidden = true;
    $("#btn-uncollected-photo").hidden = false;
    $('input[name="uncollected-chip"][value="품목 미배출 (현장에 폐기물 없음)"]').checked = true;
    $("#uncollected-reason-text").value = "품목 미배출 (현장에 폐기물 없음)";
    if (modal.showModal) modal.showModal();
    else modal.setAttribute("open", "");
  });

  $$('input[name="uncollected-chip"]').forEach((r) => {
    r.addEventListener("change", (e) => {
      $("#uncollected-reason-text").value = e.target.value === "기타" ? "" : e.target.value;
      if (e.target.value === "기타") $("#uncollected-reason-text").focus();
    });
  });

  $("#btn-uncollected-photo").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      uncollectedPhotoData = await capturePhoto(file);
      $("#uncollected-photo-img").src = uncollectedPhotoData;
      $("#uncollected-photo-preview").hidden = false;
      $("#btn-uncollected-photo").hidden = true;
    } catch (err) {
      showToast("사진 처리 오류", "warn");
    }
  });
  $("#btn-del-uncollected-photo").addEventListener("click", () => {
    uncollectedPhotoData = null;
    $("#uncollected-photo-preview").hidden = true;
    $("#btn-uncollected-photo").hidden = false;
  });

  $("#btn-close-uncollected").addEventListener("click", () => modal.close());
  $("#btn-cancel-uncollected").addEventListener("click", () => modal.close());

  $("#btn-submit-uncollected").addEventListener("click", async () => {
    const reason = $("#uncollected-reason-text").value.trim();
    if (!reason) return showToast("미수거 사유를 입력해 주세요.", "warn");
    const reportNo = state.selectedReportNo;
    const submitBtn = $("#btn-submit-uncollected");

    submitBtn.disabled = true;
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(reportNo)}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "uncollect", reason, proofPhoto: uncollectedPhotoData })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "등록 실패");

      modal.close();
      showToast(`미수거 사유를 등록했습니다. (${reportNo.slice(-6)})`);
      await loadTasks({ quiet: true });

      // 다음 미완료 건으로 이동
      const nextPending = state.tasks.find((t) => t.status !== "COLLECTED" && t.report_no !== reportNo);
      if (nextPending) {
        state.selectedReportNo = nextPending.report_no;
        renderSidebarList();
        renderMainStage(nextPending);
      }
    } catch (err) {
      showToast(err.message, "warn");
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// --------------------------------------------------------------------------
// 즉각 처리 3: 현장 변경 요청
// --------------------------------------------------------------------------
function setupChangeAction() {
  const modal = $("#modal-change-request");
  const openBtn = $("#btn-tablet-change");
  const fileInput = $("#change-photo-file");
  let changePhotoData = null;

  openBtn.addEventListener("click", () => {
    if (!state.selectedReportNo) return showToast("처리할 건을 선택해 주세요.", "warn");
    changePhotoData = null;
    $("#change-photo-preview").hidden = true;
    $("#btn-change-photo").hidden = false;
    $('input[name="change-chip"][value="품목·규격 상이 (추가 수수료 필요)"]').checked = true;
    $("#change-reason-text").value = "품목·규격 상이 (추가 수수료 필요)";
    if (modal.showModal) modal.showModal();
    else modal.setAttribute("open", "");
  });

  $$('input[name="change-chip"]').forEach((r) => {
    r.addEventListener("change", (e) => {
      $("#change-reason-text").value = e.target.value === "기타" ? "" : e.target.value;
      if (e.target.value === "기타") $("#change-reason-text").focus();
    });
  });

  $("#btn-change-photo").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      changePhotoData = await capturePhoto(file);
      $("#change-photo-img").src = changePhotoData;
      $("#change-photo-preview").hidden = false;
      $("#btn-change-photo").hidden = true;
    } catch {
      showToast("사진 처리 오류", "warn");
    }
  });
  $("#btn-del-change-photo").addEventListener("click", () => {
    changePhotoData = null;
    $("#change-photo-preview").hidden = true;
    $("#btn-change-photo").hidden = false;
  });

  $("#btn-close-change").addEventListener("click", () => modal.close());
  $("#btn-cancel-change").addEventListener("click", () => modal.close());

  $("#btn-submit-change").addEventListener("click", async () => {
    const reason = $("#change-reason-text").value.trim();
    if (!reason) return showToast("변경 요청 내용을 입력해 주세요.", "warn");
    const reportNo = state.selectedReportNo;
    const submitBtn = $("#btn-submit-change");

    submitBtn.disabled = true;
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(reportNo)}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "field_change", reason, proofPhoto: changePhotoData })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "전송 실패");

      modal.close();
      showToast(`현장 변경 요청이 접수처로 전달되었습니다.`);
      await loadTasks({ quiet: true });
    } catch (err) {
      showToast(err.message, "warn");
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// --------------------------------------------------------------------------
// 위치는 작업 건을 열거나 처리할 때만 확인 (상시 추적 없음)
// --------------------------------------------------------------------------
function requestJobLocation() {
  if (!navigator.geolocation || !state.selectedReportNo) return;
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      state.userCoords = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy
      };
      const current = state.tasks.find((t) => t.report_no === state.selectedReportNo);
      if (current) {
        renderMainStage(current, { skipLocation: true });
        renderSidebarList();
      }
    },
    () => {},
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 20000 }
  );
}

function setupGeolocation() {
  // 상시 watchPosition/페이지 진입 GPS는 쓰지 않습니다.
}

async function sendHeartbeat() {
  if (!state.deviceId) return;
  try {
    await fetch("/api/fleet/heartbeat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId: state.deviceId,
        activeReportNo: state.selectedReportNo
      })
    });
  } catch {
    /* 오프라인 허용 */
  }
}

let fleetLive = null;
function startRealtime() {
  if (fleetLive) fleetLive.stop();
  fleetLive = null;
  if (!state.deviceId) return;
  sendHeartbeat();
  fleetLive = connectFleetSync({
    deviceId: state.deviceId,
    pollMs: 3000,
    onEvent(event) {
      if (event?.type === "assigned" || event?.type === "takeover") {
        showToast("새 수거 건이 이 태블릿으로 들어왔습니다.");
        speak("새 수거 건이 배정되었습니다.");
      }
      loadTasks({ quiet: true });
    },
    onSnapshot() {
      loadTasks({ quiet: true });
    }
  });
}

// --------------------------------------------------------------------------
// 상단 도구 및 필터 바
// --------------------------------------------------------------------------
function setupHeaderTools() {
  // 1) 새로고침
  $("#btn-refresh").addEventListener("click", () => {
    loadTasks();
    showToast("목록을 새로고침했습니다.");
  });

  // 2) 고대비 모드
  const contrastBtn = $("#btn-contrast");
  if (state.isOutdoorContrast) {
    document.body.classList.add("outdoor-contrast");
    contrastBtn.classList.add("active");
  }
  contrastBtn.addEventListener("click", () => {
    state.isOutdoorContrast = !state.isOutdoorContrast;
    document.body.classList.toggle("outdoor-contrast", state.isOutdoorContrast);
    contrastBtn.classList.toggle("active", state.isOutdoorContrast);
    localStorage.setItem("waste_tablet_contrast", String(state.isOutdoorContrast));
    showToast(state.isOutdoorContrast ? "☀️ 야외 고대비 모드 켜짐" : "표준 모드로 전환");
  });

  // 3) 음성 안내 토글
  const voiceBtn = $("#btn-voice");
  function updateVoiceBtn() {
    voiceBtn.textContent = state.isVoiceEnabled ? "🔊 음성 켜짐" : "🔇 음성 꺼짐";
    voiceBtn.classList.toggle("active", state.isVoiceEnabled);
  }
  updateVoiceBtn();
  voiceBtn.addEventListener("click", () => {
    state.isVoiceEnabled = !state.isVoiceEnabled;
    localStorage.setItem("waste_tablet_voice", String(state.isVoiceEnabled));
    updateVoiceBtn();
    showToast(state.isVoiceEnabled ? "🔊 음성 안내를 켰습니다." : "🔇 음성 안내를 껐습니다.");
    if (state.isVoiceEnabled) speak("음성 안내가 켜졌습니다.");
  });

  // 4) 전체화면
  const fsBtn = $("#btn-fullscreen");
  fsBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      fsBtn.textContent = "⛶ 창모드";
    } else {
      document.exitFullscreen().catch(() => {});
      fsBtn.textContent = "⛶ 전체화면";
    }
  });

  // 5) 사이드바 필터 탭
  $$(".filter-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".filter-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      state.filter = tab.dataset.filter;
      renderSidebarList();
    });
  });

  // 6) 정렬 셀렉트
  $("#sort-order").addEventListener("change", (e) => {
    state.sortBy = e.target.value;
    renderSidebarList();
  });
}

// --------------------------------------------------------------------------
// 초기화
// --------------------------------------------------------------------------
async function init() {
  setupHeaderTools();
  await setupDeviceConfig();
  setupCollectionAction();
  setupUncollectedAction();
  setupChangeAction();
  setupGeolocation();
  if (state.deviceId) {
    startRealtime();
    await loadTasks();
  }
  setInterval(() => {
    if (state.deviceId) sendHeartbeat();
  }, 8000);
}

init();
