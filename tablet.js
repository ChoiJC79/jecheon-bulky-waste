/* ==========================================================================
   제천시 대형폐기물 현장 수거 전용 태블릿 스크립트 (tablet.js)
   - 기사(담당자) 기준 오늘 배정 목록 및 경로 순서
   - 사진 촬영 → 미리보기 → 수거 완료
   - 기기 GPS는 길찾기 보조만 (서버에 위치를 보내지 않음)
   - 미납·특이사항·배출 위치를 목록/상세에 표시
   ========================================================================== */

import {
  STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  filterFieldJobs,
  filterByTab,
  sortAndSequenceTasks,
  progressStats,
  isUnpaid,
  paymentBadgeText,
  memoKind,
  formatDistance,
  nextPending,
  prevPending,
  navigationLinks,
  hasCoords
} from "./tablet-route.js";

const won = new Intl.NumberFormat("ko-KR");
const JECHEON_CENTER = [37.1326, 128.1910];

const state = {
  assignee: localStorage.getItem("waste_tablet_assignee") || "",
  tasks: [],
  selectedReportNo: null,
  filter: "PENDING",
  sortBy: "route",
  mapMode: "current",
  userCoords: null,
  geoStatus: "idle",
  watchId: null,
  pendingAfterPhoto: null,
  isVoiceEnabled: localStorage.getItem("waste_tablet_voice") !== "false",
  isOutdoorContrast: localStorage.getItem("waste_tablet_contrast") === "true",
  map: null,
  reportMarker: null,
  userMarker: null,
  routeLayer: null
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const escapeHtml = (val) => String(val ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const statusClass = {
  ASSIGNED: "badge-assigned",
  COLLECTED: "badge-collected",
  UNCOLLECTED: "badge-uncollected",
  CHANGE_REQUESTED: "badge-change"
};

function todayLabel(now = new Date()) {
  return `${now.getMonth() + 1}월 ${now.getDate()}일`;
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

function openDialog(modal) {
  if (!modal) return;
  if (modal.showModal) modal.showModal();
  else modal.setAttribute("open", "");
}

function closeDialog(modal) {
  if (!modal) return;
  if (modal.close) modal.close();
  else modal.removeAttribute("open");
}

function orderedTasks() {
  return sortAndSequenceTasks(state.tasks, { sortBy: state.sortBy, userCoords: state.userCoords });
}

function visibleTasks() {
  return filterByTab(orderedTasks(), state.filter);
}

function currentReport() {
  return state.tasks.find((task) => task.report_no === state.selectedReportNo) || null;
}

function updateGeoUi() {
  const label = $("#geo-status-display");
  const hint = $("#map-geo-hint");
  const btn = $("#btn-geo-refresh");
  const texts = {
    idle: "위치 대기",
    pending: "위치 확인 중…",
    granted: "위치 사용 중",
    denied: "위치 권한 거부",
    unavailable: "위치 불가",
    error: "위치 오류"
  };
  if (label) {
    label.textContent = texts[state.geoStatus] || "위치 대기";
    label.dataset.status = state.geoStatus;
  }
  if (btn) btn.classList.toggle("active", state.geoStatus === "granted");
  if (hint) {
    if (state.geoStatus === "denied") {
      hint.textContent = "위치 권한이 꺼져 있습니다. 브라우저 설정에서 허용한 뒤 [내 위치]를 다시 눌러 주세요. 위치는 서버에 저장되지 않습니다.";
    } else if (state.geoStatus === "unavailable") {
      hint.textContent = "이 기기에서는 위치를 쓸 수 없습니다. 주소와 외부 길찾기로 이동해 주세요.";
    } else if (state.geoStatus === "granted" && state.userCoords) {
      const acc = Number.isFinite(state.userCoords.accuracy) ? ` ±${Math.round(state.userCoords.accuracy)}m` : "";
      hint.textContent = `이 기기 위치만 사용합니다(서버 저장 없음). 정확도${acc || " 확인됨"}.`;
    } else {
      hint.textContent = "위치는 이 기기에서 다음 정류를 찾는 데만 쓰이며, 서버에 저장하지 않습니다.";
    }
  }
}

function initMap() {
  if (!window.L || state.map) return;
  const mapEl = document.getElementById("tablet-map");
  if (!mapEl) return;
  state.map = window.L.map("tablet-map", { zoomControl: false, scrollWheelZoom: false }).setView(JECHEON_CENTER, 14);
  window.L.control.zoom({ position: "bottomright" }).addTo(state.map);
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(state.map);
}

function clearRouteLayer() {
  if (state.routeLayer && state.map) {
    state.map.removeLayer(state.routeLayer);
    state.routeLayer = null;
  }
}

function seqIcon(seq, active) {
  return window.L.divIcon({
    className: `route-seq-marker${active ? " is-active" : ""}`,
    html: `<span>${seq}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

function updateMap(report, userCoords) {
  initMap();
  if (!state.map) return;
  setTimeout(() => {
    if (state.map) state.map.invalidateSize();
  }, 60);

  clearRouteLayer();
  if (state.reportMarker) {
    state.map.removeLayer(state.reportMarker);
    state.reportMarker = null;
  }

  const points = [];
  const routeJobs = orderedTasks().filter((task) => task.status !== "COLLECTED" && hasCoords(task));

  if (state.mapMode === "route" && routeJobs.length) {
    state.routeLayer = window.L.layerGroup().addTo(state.map);
    const latlngs = routeJobs.map((task) => [task.latitude, task.longitude]);
    if (latlngs.length >= 2) {
      window.L.polyline(latlngs, {
        color: "#15803d",
        weight: 3,
        dashArray: "8 6",
        opacity: 0.85
      }).addTo(state.routeLayer);
    }
    routeJobs.forEach((task) => {
      const active = task.report_no === state.selectedReportNo;
      const marker = window.L.marker([task.latitude, task.longitude], {
        icon: seqIcon(task._seq, active),
        keyboard: true,
        title: task.address
      }).addTo(state.routeLayer);
      marker.bindTooltip(`${task._seq}. ${task.address}`, { direction: "top", offset: [0, -10] });
      marker.on("click", () => selectTask(task.report_no));
      points.push([task.latitude, task.longitude]);
    });
  } else if (report && hasCoords(report)) {
    const rPos = [report.latitude, report.longitude];
    points.push(rPos);
    state.reportMarker = window.L.circleMarker(rPos, {
      radius: 10,
      fillColor: "#ff5a36",
      color: "#ffffff",
      weight: 3,
      fillOpacity: 1
    }).addTo(state.map);
    state.reportMarker.bindTooltip(`<b>신고지:</b> ${escapeHtml(report.address)}`, { direction: "top", offset: [0, -8] });

    const upcoming = nextPending(orderedTasks(), report.report_no);
    if (upcoming && hasCoords(upcoming)) {
      state.routeLayer = window.L.layerGroup().addTo(state.map);
      window.L.circleMarker([upcoming.latitude, upcoming.longitude], {
        radius: 7,
        fillColor: "#65a30d",
        color: "#ffffff",
        weight: 2,
        fillOpacity: 0.9
      }).addTo(state.routeLayer).bindTooltip(`다음: ${upcoming.address}`, { direction: "top" });
      points.push([upcoming.latitude, upcoming.longitude]);
    }
  }

  if (userCoords && Number.isFinite(userCoords.latitude) && Number.isFinite(userCoords.longitude)) {
    const uPos = [userCoords.latitude, userCoords.longitude];
    points.push(uPos);
    if (!state.userMarker) {
      state.userMarker = window.L.circleMarker(uPos, {
        radius: 9,
        fillColor: "#1d4ed8",
        color: "#ffffff",
        weight: 3,
        fillOpacity: 1
      }).addTo(state.map);
    } else {
      state.userMarker.setLatLng(uPos);
    }
    state.userMarker.bindTooltip("현재 이 기기 위치 (서버 저장 없음)", { direction: "bottom", offset: [0, 8] });
  } else if (state.userMarker) {
    state.map.removeLayer(state.userMarker);
    state.userMarker = null;
  }

  if (points.length >= 2) {
    state.map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
  } else if (points.length === 1) {
    state.map.setView(points[0], 16);
  } else {
    state.map.setView(JECHEON_CENTER, 13);
  }
}

function updateHeaderBadge() {
  const display = $("#assignee-name-display");
  const icon = $("#assignee-icon");
  const hint = $("#assignee-scope-hint");
  const title = $("#today-progress-title");
  if (title) title.textContent = `${todayLabel()} 수거 현황`;
  if (!state.assignee || state.assignee === "__ALL__") {
    if (display) display.textContent = "전체 배정 건 (공용/순회)";
    if (icon) icon.textContent = "🌐";
    if (hint) hint.textContent = "공용 모드입니다. 담당자를 지정하면 오늘 내 배정 건만 보입니다.";
  } else {
    if (display) display.textContent = state.assignee;
    if (icon) icon.textContent = "🚜";
    if (hint) hint.textContent = `${state.assignee} 기사님의 배정 건만 표시합니다. 위치는 이 기기에만 사용됩니다.`;
  }
}

async function setupDeviceConfig() {
  const modal = $("#modal-device-config");

  try {
    const res = await fetch("/api/staff-assignees");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.assignees) && data.assignees.length) {
        const grid = $("#assignee-preset-grid");
        const currentOpts = Array.from(grid.querySelectorAll('input[type="radio"]')).map((r) => r.value);
        data.assignees.forEach((assignee) => {
          if (!currentOpts.includes(assignee) && assignee !== "__ALL__") {
            const label = document.createElement("label");
            label.className = "modal-chip-radio";
            label.innerHTML = `<input type="radio" name="device-assignee-opt" value="${escapeHtml(assignee)}" /><span>🚜 ${escapeHtml(assignee)}</span>`;
            grid.insertBefore(label, grid.lastElementChild);
          }
        });
      }
    }
  } catch {
    // 기본 프리셋 사용
  }

  updateHeaderBadge();
  if (!state.assignee) {
    openDialog(modal);
  }

  $("#btn-device-setting").addEventListener("click", () => {
    const radios = $$('input[name="device-assignee-opt"]');
    let matched = false;
    radios.forEach((r) => {
      if (r.value === state.assignee) {
        r.checked = true;
        matched = true;
      }
    });
    if (!matched && state.assignee && state.assignee !== "__ALL__") {
      $("#custom-assignee-input").value = state.assignee;
    }
    openDialog(modal);
  });

  $("#btn-close-device-modal").addEventListener("click", () => closeDialog(modal));
  $("#btn-cancel-device-modal").addEventListener("click", () => closeDialog(modal));

  $("#btn-save-device-modal").addEventListener("click", () => {
    const custom = $("#custom-assignee-input").value.trim();
    let selected = custom;
    if (!selected) {
      const checked = $('input[name="device-assignee-opt"]:checked');
      if (checked) selected = checked.value;
    }
    if (!selected) selected = "__ALL__";

    state.assignee = selected;
    localStorage.setItem("waste_tablet_assignee", selected);
    updateHeaderBadge();
    closeDialog(modal);
    showToast(`태블릿 담당자가 [${selected === "__ALL__" ? "전체 건" : selected}]으로 설정되었습니다.`);
    loadTasks();
  });
}

async function loadTasks({ quiet = false } = {}) {
  const syncLabel = $("#sync-time-display");
  if (!quiet && syncLabel) syncLabel.textContent = "동기화 중…";

  try {
    let url = "/api/reports";
    if (state.assignee && state.assignee !== "__ALL__") {
      url += `?assignee=${encodeURIComponent(state.assignee)}`;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const data = await res.json();
    state.tasks = filterFieldJobs(data.reports || [], { assignee: state.assignee });

    const now = new Date();
    if (syncLabel) {
      syncLabel.textContent = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} 동기화`;
    }

    updateProgressAndMetrics();
    const visibleList = visibleTasks();
    if (!state.selectedReportNo || !state.tasks.some((t) => t.report_no === state.selectedReportNo)) {
      const firstPending = visibleList.find((t) => t.status !== "COLLECTED") || visibleList[0];
      state.selectedReportNo = firstPending ? firstPending.report_no : null;
    }

    renderSidebarList();
    renderMainStage(currentReport());
  } catch {
    if (syncLabel) syncLabel.textContent = "동기화 실패";
    if (!quiet) showToast("수거 목록을 불러오지 못했습니다.", "warn");
  }
}

function updateProgressAndMetrics() {
  const stats = progressStats(state.tasks);
  $("#count-pending").textContent = String(stats.pending);
  $("#count-collected").textContent = String(stats.collected);
  $("#count-all").textContent = String(stats.total);
  $("#progress-text").textContent = stats.total > 0 ? `${stats.collected} / ${stats.total}건 (${stats.percent}%)` : "0 / 0건 (0%)";
  $("#progress-bar-fill").style.width = `${stats.percent}%`;
}

function selectTask(reportNo) {
  state.selectedReportNo = reportNo;
  renderSidebarList();
  renderMainStage(currentReport());
}

function renderSidebarList() {
  const container = $("#task-list-container");
  const list = visibleTasks();

  if (!list.length) {
    container.innerHTML = `
      <div style="padding:40px 20px;text-align:center;color:var(--tb-muted);">
        <p style="font-size:16px;font-weight:700;margin-bottom:6px;">해당 조건의 작업이 없습니다.</p>
        <small>담당자·필터를 변경하거나 상단 새로고침을 눌러주세요.</small>
      </div>`;
    return;
  }

  container.innerHTML = list.map((task) => {
    const isActive = task.report_no === state.selectedReportNo;
    const isCollected = task.status === "COLLECTED";
    const itemsSummary = (task.items || []).map((i) => `${i.name} ${i.option_name}×${i.quantity}`).join(", ") || "품목 정보 없음";
    const unpaid = isUnpaid(task);

    let distHtml = "";
    if (task._distance !== null && task._distance !== undefined) {
      const isNear = task._distance <= 60;
      distHtml = `<span class="card-distance-pill ${isNear ? "near" : ""}">${isNear ? "📍 인접 " : ""}${formatDistance(task._distance)}</span>`;
    }

    return `
      <article class="task-card ${isActive ? "active" : ""} ${isCollected ? "status-collected" : ""} ${unpaid ? "has-unpaid" : ""}" data-no="${escapeHtml(task.report_no)}">
        <div class="card-top">
          <span class="card-seq">#${task._seq} · ${escapeHtml(task.report_no.slice(-6))}</span>
          <span class="card-status-badge ${statusClass[task.status] || "badge-assigned"}">${STATUS_LABEL[task.status] || task.status}</span>
        </div>
        <div class="card-address">${escapeHtml(task.address)}</div>
        <div class="card-detail-loc">📍 ${escapeHtml(task.address_detail || "배출 위치 미입력")}</div>
        ${unpaid ? `<div class="card-unpaid-flag">⚠ ${escapeHtml(paymentBadgeText(task))} · ${escapeHtml(PAYMENT_METHOD_LABEL[task.payment_method] || task.payment_method || "")}</div>` : ""}
        ${task.memo ? `<div class="card-note-flag">특이 ${escapeHtml(task.memo)}</div>` : ""}
        <div class="card-bottom">
          <span class="card-items-summary" title="${escapeHtml(itemsSummary)}">${escapeHtml(itemsSummary)}</span>
          ${distHtml}
        </div>
      </article>
    `;
  }).join("");

  container.querySelectorAll(".task-card").forEach((card) => {
    card.addEventListener("click", () => selectTask(card.dataset.no));
  });
}

function renderMainStage(report) {
  const emptyView = $("#stage-empty-view");
  const contentView = $("#stage-content-view");

  if (!report) {
    emptyView.hidden = false;
    contentView.hidden = true;
    return;
  }

  emptyView.hidden = true;
  contentView.hidden = false;

  const sequenced = orderedTasks();
  const seqIndex = sequenced.findIndex((task) => task.report_no === report.report_no);
  const pendingCount = sequenced.filter((task) => task.status !== "COLLECTED").length;
  $("#stage-seq-label").textContent = seqIndex >= 0 ? `${seqIndex + 1} / ${sequenced.length}` : "-";
  $("#btn-prev-stop").disabled = !prevPending(sequenced, report.report_no);
  $("#btn-next-stop").disabled = !nextPending(sequenced, report.report_no);
  $("#btn-next-stop").textContent = pendingCount ? "다음 정류 →" : "다음 없음";

  $("#stage-report-no").textContent = report.report_no;
  $("#stage-status-badge").textContent = STATUS_LABEL[report.status] || report.status;
  $("#stage-status-badge").className = `card-status-badge ${statusClass[report.status] || "badge-assigned"}`;
  $("#stage-payment-badge").textContent = paymentBadgeText(report);
  $("#stage-payment-badge").className = `card-status-badge ${isUnpaid(report) ? "badge-unpaid" : "badge-collected"}`;
  $("#stage-zone-badge").textContent = report.zone ? `구역: ${report.zone}` : "구역 미지정";
  $("#stage-address").textContent = report.address;
  $("#stage-address-detail").textContent = `📍 배출·접근: ${report.address_detail || "상세 위치 없음"}`;

  const unpaidAlert = $("#stage-unpaid-alert");
  if (isUnpaid(report)) {
    unpaidAlert.hidden = false;
    $("#stage-unpaid-title").textContent = paymentBadgeText(report);
    $("#stage-unpaid-text").textContent = `${PAYMENT_METHOD_LABEL[report.payment_method] || "결제"} 건입니다. 현장 수거는 가능하나 접수처 수납 확인이 남아 있습니다.`;
  } else {
    unpaidAlert.hidden = true;
  }

  const notesAlert = $("#stage-notes-alert");
  if (report.memo) {
    notesAlert.hidden = false;
    $("#stage-notes-title").textContent = memoKind(report.status);
    $("#stage-notes-text").textContent = report.memo;
  } else {
    notesAlert.hidden = true;
  }

  const links = navigationLinks(report);
  const bindNav = (id, url, label) => {
    const btn = $(id);
    btn.onclick = () => {
      window.open(url, "_blank", "noopener,noreferrer");
      showToast(`${label}로 연결합니다.`);
    };
  };
  bindNav("#btn-navigate-kakao", links.kakao, "카카오맵 길찾기");
  bindNav("#btn-navigate-naver", links.naver, "네이버지도 길찾기");
  bindNav("#btn-navigate-google", links.google, "구글맵 길찾기");

  const distTag = $("#stage-dist-tag");
  let dist = null;
  if (state.userCoords && hasCoords(report)) {
    dist = sequenced.find((task) => task.report_no === report.report_no)?._distance ?? null;
  }
  if (Number.isFinite(dist)) {
    if (dist <= 60) {
      distTag.textContent = `🟢 현장 도착 (약 ${formatDistance(dist)})`;
      distTag.className = "map-dist-tag near";
    } else {
      distTag.textContent = `🟡 이동 중 (약 ${formatDistance(dist)})`;
      distTag.className = "map-dist-tag";
    }
  } else if (hasCoords(report)) {
    distTag.textContent = state.geoStatus === "denied" ? "위치 권한 없음" : "현재 위치 확인 중…";
    distTag.className = "map-dist-tag";
  } else {
    distTag.textContent = "신고 좌표 없음";
    distTag.className = "map-dist-tag";
  }

  updateMap(report, state.userCoords);

  const photoWrap = $("#citizen-photo-container");
  const beforeImg = $("#stage-before-photo");
  const noPhoto = $("#stage-no-photo");
  if (report.before_photo) {
    beforeImg.src = report.before_photo;
    photoWrap.hidden = false;
    noPhoto.hidden = true;
    photoWrap.onclick = () => openImageZoom(report.before_photo);
  } else {
    photoWrap.hidden = true;
    noPhoto.hidden = false;
  }

  const tbody = $("#stage-items-tbody");
  tbody.innerHTML = (report.items || []).map((item) => `
    <tr>
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td>${escapeHtml(item.option_name)}</td>
      <td><span class="item-qty-badge">${item.quantity}개</span></td>
    </tr>
  `).join("") || `<tr><td colspan="3" style="text-align:center;color:var(--tb-muted)">품목 정보가 없습니다.</td></tr>`;
  $("#stage-total-fee").textContent = `수수료 ${won.format(report.total_fee || 0)}원`;

  const completeBtn = $("#btn-tablet-complete");
  const uncollectBtn = $("#btn-tablet-uncollected");
  const changeBtn = $("#btn-tablet-change");
  if (report.status === "COLLECTED") {
    completeBtn.innerHTML = `<span>✅</span> <span>수거 완료됨</span>`;
    completeBtn.disabled = true;
    uncollectBtn.disabled = true;
    changeBtn.disabled = true;
  } else if (report.status === "ASSIGNED") {
    completeBtn.innerHTML = `<span style="font-size:26px;">📸</span> <span>사진 찍고 수거 완료</span>`;
    completeBtn.disabled = false;
    uncollectBtn.disabled = false;
    changeBtn.disabled = false;
  } else {
    completeBtn.innerHTML = `<span>📸</span> <span>배정 건만 완료 가능</span>`;
    completeBtn.disabled = true;
    uncollectBtn.disabled = report.status !== "CHANGE_REQUESTED";
    changeBtn.disabled = true;
  }
}

function openImageZoom(src) {
  const modal = $("#modal-image-zoom");
  $("#zoom-img").src = src;
  openDialog(modal);
}

function setupCollectionAction() {
  const fileInput = $("#camera-file-input");
  const completeBtn = $("#btn-tablet-complete");
  const modal = $("#modal-complete-photo");

  completeBtn.addEventListener("click", () => {
    const report = currentReport();
    if (!report) return showToast("처리할 건을 선택해 주세요.", "warn");
    if (report.status !== "ASSIGNED") return showToast("배정된 건만 수거 완료할 수 있습니다.", "warn");
    fileInput.click();
  });

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file || !state.selectedReportNo) return;
    try {
      state.pendingAfterPhoto = await window.capturePhoto(file, { maxSize: 1024, quality: 0.82 });
      $("#complete-photo-img").src = state.pendingAfterPhoto;
      openDialog(modal);
    } catch {
      state.pendingAfterPhoto = null;
      showToast("사진을 읽지 못했습니다. 다시 촬영해 주세요.", "warn");
    }
  });

  $("#btn-close-complete").addEventListener("click", () => {
    state.pendingAfterPhoto = null;
    closeDialog(modal);
  });

  $("#btn-retake-complete").addEventListener("click", () => {
    state.pendingAfterPhoto = null;
    fileInput.click();
  });

  $("#btn-confirm-complete").addEventListener("click", async () => {
    if (!state.pendingAfterPhoto) return showToast("현장 사진을 먼저 촬영해 주세요.", "warn");
    const reportNo = state.selectedReportNo;
    const confirmBtn = $("#btn-confirm-complete");
    confirmBtn.disabled = true;
    completeBtn.disabled = true;
    completeBtn.innerHTML = `<span>⏳</span> <span>사진 저장 및 수거 완료 처리 중…</span>`;
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(reportNo)}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "complete", afterPhoto: state.pendingAfterPhoto })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "수거 완료 처리 실패");

      state.pendingAfterPhoto = null;
      closeDialog(modal);
      showToast(`🎉 ${reportNo.slice(-6)}번 수거가 완료되었습니다!`, "success");
      speak("수거가 완료되었습니다.");
      await loadTasks({ quiet: true });

      const next = nextPending(orderedTasks(), reportNo);
      if (next) {
        selectTask(next.report_no);
        speak(`다음 수거지는 ${next.address}입니다.`);
      } else {
        showToast("오늘 배정된 모든 수거 작업을 완수했습니다!", "success");
        speak("오늘 배정된 모든 수거 작업을 완료했습니다. 수고하셨습니다.");
      }
    } catch (err) {
      showToast(err.message || "처리에 실패했습니다. 다시 시도해 주세요.", "warn");
    } finally {
      confirmBtn.disabled = false;
      completeBtn.disabled = false;
      renderMainStage(currentReport());
    }
  });
}

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
    openDialog(modal);
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
      uncollectedPhotoData = await window.capturePhoto(file);
      $("#uncollected-photo-img").src = uncollectedPhotoData;
      $("#uncollected-photo-preview").hidden = false;
      $("#btn-uncollected-photo").hidden = true;
    } catch {
      showToast("사진 처리 오류", "warn");
    }
  });
  $("#btn-del-uncollected-photo").addEventListener("click", () => {
    uncollectedPhotoData = null;
    $("#uncollected-photo-preview").hidden = true;
    $("#btn-uncollected-photo").hidden = false;
  });

  $("#btn-close-uncollected").addEventListener("click", () => closeDialog(modal));
  $("#btn-cancel-uncollected").addEventListener("click", () => closeDialog(modal));

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

      closeDialog(modal);
      showToast(`미수거 사유를 등록했습니다. (${reportNo.slice(-6)})`);
      await loadTasks({ quiet: true });
      const next = nextPending(orderedTasks(), reportNo);
      if (next) selectTask(next.report_no);
    } catch (err) {
      showToast(err.message, "warn");
    } finally {
      submitBtn.disabled = false;
    }
  });
}

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
    openDialog(modal);
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
      changePhotoData = await window.capturePhoto(file);
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

  $("#btn-close-change").addEventListener("click", () => closeDialog(modal));
  $("#btn-cancel-change").addEventListener("click", () => closeDialog(modal));

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

      closeDialog(modal);
      showToast("현장 변경 요청이 접수처로 전달되었습니다.");
      await loadTasks({ quiet: true });
    } catch (err) {
      showToast(err.message, "warn");
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function stopWatching() {
  if (state.watchId != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }
}

function onPosSuccess({ coords }) {
  state.userCoords = {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy
  };
  state.geoStatus = "granted";
  updateGeoUi();
  renderSidebarList();
  renderMainStage(currentReport());
}

function onPosError(err) {
  if (err && err.code === 1) state.geoStatus = "denied";
  else state.geoStatus = "error";
  updateGeoUi();
}

function requestLocation({ watch = true } = {}) {
  if (!navigator.geolocation) {
    state.geoStatus = "unavailable";
    updateGeoUi();
    return;
  }
  state.geoStatus = "pending";
  updateGeoUi();
  const opts = { enableHighAccuracy: true, timeout: 12000, maximumAge: 8000 };
  navigator.geolocation.getCurrentPosition(onPosSuccess, onPosError, { ...opts, maximumAge: 0 });
  if (watch && state.watchId == null) {
    state.watchId = navigator.geolocation.watchPosition(onPosSuccess, onPosError, opts);
  }
}

function setupGeolocation() {
  updateGeoUi();
  $("#btn-geo-refresh").addEventListener("click", () => {
    stopWatching();
    requestLocation({ watch: true });
    showToast("현재 위치를 다시 확인합니다.");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopWatching();
    } else {
      requestLocation({ watch: true });
    }
  });
  requestLocation({ watch: true });
}

function setupHeaderTools() {
  $("#btn-refresh").addEventListener("click", () => {
    loadTasks();
    showToast("목록을 새로고침했습니다.");
  });

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

  $$(".filter-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".filter-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      state.filter = tab.dataset.filter;
      renderSidebarList();
    });
  });

  $("#sort-order").addEventListener("change", (e) => {
    state.sortBy = e.target.value;
    renderSidebarList();
    renderMainStage(currentReport());
  });

  $$(".map-mode-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".map-mode-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      state.mapMode = tab.dataset.mapMode;
      renderMainStage(currentReport());
    });
  });

  $("#btn-prev-stop").addEventListener("click", () => {
    const prev = prevPending(orderedTasks(), state.selectedReportNo);
    if (prev) selectTask(prev.report_no);
  });
  $("#btn-next-stop").addEventListener("click", () => {
    const next = nextPending(orderedTasks(), state.selectedReportNo);
    if (next) selectTask(next.report_no);
    else showToast("다음 미완료 정류가 없습니다.");
  });

  $("#btn-close-zoom").addEventListener("click", () => closeDialog($("#modal-image-zoom")));
}

async function init() {
  setupHeaderTools();
  await setupDeviceConfig();
  setupCollectionAction();
  setupUncollectedAction();
  setupChangeAction();
  setupGeolocation();
  await loadTasks();
  setInterval(() => loadTasks({ quiet: true }), 30000);
}

init();
