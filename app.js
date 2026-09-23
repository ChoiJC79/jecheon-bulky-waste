import { CITIZEN_ITEM_CATALOG as catalog, ITEM_SYNONYMS as SYNONYMS } from "./office-catalog.js";

const capturePhoto = (...args) => globalThis.capturePhoto(...args);
const state = { category: catalog[0], selected: null, cart: [], location: null, beforePhoto: null, currentStep: 1 };
const won = new Intl.NumberFormat("ko-KR");
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character]));
const JECHEON_CENTER = [37.1326, 128.1910];
let reportMap;
let reportMarker;

function setupReportMap() {
  if (!window.L) return;
  reportMap = L.map("report-map", { zoomControl: false, scrollWheelZoom: false }).setView(JECHEON_CENTER, 13);
  L.control.zoom({ position: "bottomright" }).addTo(reportMap);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(reportMap);
}

function showReportLocation(latitude, longitude, title = "현재 위치 확인 완료") {
  if (!reportMap) return;
  const point = [latitude, longitude];
  if (reportMarker) reportMarker.setLatLng(point);
  else reportMarker = L.marker(point, { title: "신고 위치" }).addTo(reportMap);
  reportMarker.bindTooltip("신고 위치", { direction: "top" });
  reportMap.setView(point, 16, { animate: true });
  $("#map-title").textContent = title;
}

function geolocationErrorMessage(error) {
  if (error.code === error.PERMISSION_DENIED) return "위치 권한을 허용하지 않았습니다. 브라우저 설정에서 위치 권한을 허용하거나 주소를 직접 입력해 주세요.";
  if (error.code === error.TIMEOUT) return "위치 확인이 시간 내에 끝나지 않았습니다. 실외로 이동한 뒤 다시 시도해 주세요.";
  if (error.code === error.POSITION_UNAVAILABLE) return "현재 위치를 확인할 수 없습니다. GPS 신호가 약한 곳일 수 있습니다. 잠시 후 다시 시도해 주세요.";
  return "위치를 확인하지 못했습니다. 주소를 직접 입력해 주세요.";
}

function renderCategories() {
  $("#category-grid").innerHTML = catalog.map((category) => `
    <button class="category ${state.category.id === category.id ? "active" : ""}" type="button" data-category="${category.id}">
      <span aria-hidden="true">${category.icon}</span><b>${category.name}</b>
    </button>`).join("");
  document.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => {
    state.category = catalog.find((category) => category.id === button.dataset.category);
    $("#item-search").value = "";
    renderCategories(); renderItems();
  }));
}

function renderItems(items = state.category.items, title = state.category.name) {
  $("#item-list-title").textContent = title;
  $("#item-count").textContent = `${items.length}개 품목`;
  $("#item-list").innerHTML = items.length ? items.map((item) => `<button class="item-button" type="button" data-item="${item.name}"><span>${item.name}</span><small>규격 선택</small></button>`).join("") : "<p class=\"no-result\">찾으시는 품목이 없습니다. 담당자 확인을 요청해 주세요.</p>";
  document.querySelectorAll("[data-item]").forEach((button) => button.addEventListener("click", () => {
    state.selected = items.find((item) => item.name === button.dataset.item);
    renderSelection();
  }));
}

function renderSelection() {
  const item = state.selected;
  $("#selection-card").hidden = false;
  $("#selected-item-name").textContent = item.name;
  const guide = $("#disposal-guide");
  if (item.guide) {
    $("#selected-item-detail").textContent = "대형폐기물 신고 목록에 추가하지 않고, 아래 배출 방법을 따라 주세요.";
    $("#selection-controls").hidden = true;
    guide.hidden = false;
    guide.innerHTML = `<div><p class="selection-label">${item.guide.source}</p><h4>${item.guide.title}</h4><ol>${item.guide.steps.map((step) => `<li>${step}</li>`).join("")}</ol><p class="guide-notice">${item.guide.notice}</p></div><div class="guide-actions">${item.guide.reservationUrl ? `<a class="button primary" href="${item.guide.reservationUrl}" target="_blank" rel="noopener noreferrer">${item.guide.reservationLabel}</a>` : ""}<a class="guide-source" href="${item.guide.sourceUrl}" target="_blank" rel="noopener noreferrer">공식 기준 확인</a></div>`;
  } else {
    $("#selected-item-detail").textContent = "규격과 수량을 확인한 뒤 목록에 추가하세요.";
    $("#selection-controls").hidden = false;
    guide.hidden = true;
    guide.innerHTML = "";
    $("#item-option").innerHTML = item.options.map(([label, fee], index) => `<option value="${index}">${label} · ${won.format(fee)}원</option>`).join("");
  }
  $("#selection-card").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderCart() {
  const cart = $("#cart");
  if (!state.cart.length) { cart.innerHTML = "<p class=\"empty-cart\">아직 선택한 품목이 없습니다.</p>"; $("#total-fee").textContent = "0원"; return; }
  const total = state.cart.reduce((sum, item) => sum + item.fee * item.quantity, 0);
  cart.innerHTML = state.cart.map((item, index) => `<div class="cart-row"><span><b>${item.name}</b><small>${item.option} · ${item.quantity}개</small></span><strong>${won.format(item.fee * item.quantity)}원</strong><button type="button" data-remove="${index}" aria-label="${item.name} 삭제">×</button></div>`).join("");
  $("#total-fee").textContent = `${won.format(total)}원`;
  document.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => { state.cart.splice(Number(button.dataset.remove), 1); renderCart(); }));
}

$("#add-item").addEventListener("click", () => {
  const optionIndex = Number($("#item-option").value);
  const [option, fee] = state.selected.options[optionIndex];
  state.cart.push({ name: state.selected.name, option, fee, quantity: Number($("#item-quantity").value) });
  renderCart();
});

$("#item-search").addEventListener("input", (event) => {
  const query = event.target.value.trim().toLowerCase();
  if (!query) return renderItems();
  const canonical = SYNONYMS[query] || "";
  const allItems = catalog.flatMap((category) => category.items);
  const matches = allItems.filter((item) => {
    const nameLower = item.name.toLowerCase();
    return nameLower.includes(query) || (canonical && nameLower.includes(canonical.toLowerCase()));
  });
  renderItems(matches, `“${event.target.value}” 검색 결과`);
});

document.querySelectorAll(".quick-chip").forEach((button) => {
  button.addEventListener("click", () => {
    const query = button.dataset.quick;
    const canonical = SYNONYMS[query] || query;
    const cat = catalog.find((c) => c.items.some((i) => i.name === canonical || i.name === query));
    if (cat) {
      state.category = cat;
      renderCategories();
      renderItems();
      const targetItem = cat.items.find((i) => i.name === canonical || i.name === query);
      if (targetItem) {
        state.selected = targetItem;
        renderSelection();
      }
    }
  });
});

$("#get-location").addEventListener("click", () => {
  const result = $("#location-result");
  if (!navigator.geolocation) { result.textContent = "이 기기에서는 현재 위치 확인을 지원하지 않습니다."; return; }
  result.textContent = "현재 위치를 확인하고 있습니다. 실외에서는 더 정확합니다.";
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      state.location = { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy };
      const accuracyText = Number.isFinite(coords.accuracy) ? `정확도 약 ±${Math.round(coords.accuracy)}m` : "정확도 정보 없음";
      showReportLocation(coords.latitude, coords.longitude);
      $("#map-status").textContent = `위도 ${coords.latitude.toFixed(5)}, 경도 ${coords.longitude.toFixed(5)} · ${accuracyText}. 배출 주소와 일치하는지 확인해 주세요.`;
      result.textContent = coords.accuracy > 100 ? `현재 위치를 확인했지만 ${accuracyText}로 오차가 큽니다. 실외로 이동해 다시 확인하거나 주소를 직접 입력해 주세요.` : `현재 위치를 확인했습니다 (${accuracyText}). 이 좌표는 신고지점 대조와 현장 확인에만 사용합니다.`;
    },
    (error) => { result.textContent = geolocationErrorMessage(error); },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
});

$("#open-address-map").addEventListener("click", () => {
  const address = [$("#address").value.trim(), $("#address-detail").value.trim()].filter(Boolean).join(" ");
  if (!address) { $("#location-result").textContent = "배출 주소를 먼저 입력해 주세요."; return; }
  $("#map-title").textContent = "주소 기준 지도 확인";
  $("#map-status").textContent = "새 창에서 주소 위치를 확인한 뒤 현재 위치로 현장을 대조할 수 있습니다.";
  window.open(`https://map.kakao.com/link/search/${encodeURIComponent(address)}`, "_blank", "noopener,noreferrer");
});

setupReportMap();

const beforePhotoMessage = (text) => { $("#before-photo-message").textContent = text; };
$("#before-photo-button").addEventListener("click", () => $("#before-photo-input").click());
$("#before-photo-input").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  beforePhotoMessage("사진을 처리하고 있습니다…");
  try {
    state.beforePhoto = await capturePhoto(file);
    $("#before-photo-img").src = state.beforePhoto;
    $("#before-photo-preview").hidden = false;
    $("#before-photo-button").hidden = true;
    beforePhotoMessage("");
  } catch (error) {
    beforePhotoMessage(error.message || "사진을 첨부하지 못했습니다.");
  } finally {
    event.target.value = "";
  }
});
$("#before-photo-remove").addEventListener("click", () => {
  state.beforePhoto = null;
  $("#before-photo-preview").hidden = true;
  $("#before-photo-button").hidden = false;
  beforePhotoMessage("");
});

const PAYMENT_METHOD_NAMES = {
  kakaopay: "카카오페이",
  naverpay: "네이버페이",
  tosspay: "토스",
  card: "카드결제",
  transfer: "계좌이체",
  cash: "현금결제"
};
const PAYMENT_STATUS_NAMES = {
  PENDING_PAYMENT: "결제대기",
  PENDING_CASH_RECEIPT: "현금수납대기",
  PENDING_TRANSFER: "계좌입금대기",
  COMPLETED: "결제완료"
};

const LOOKUP_STATUS_LABEL = { RECEIVED: "접수 완료", ASSIGNED: "수거 예정", SUPPLEMENT_REQUESTED: "보완 요청", REJECTED: "반려", COLLECTED: "수거 완료" };
async function lookupReport() {
  const reportNo = $("#lookup-input").value.trim();
  const result = $("#lookup-result");
  if (!reportNo) { result.innerHTML = "<p class=\"lookup-message\">접수번호를 입력해 주세요.</p>"; return; }
  result.innerHTML = "<p class=\"lookup-message\">조회하고 있습니다…</p>";
  try {
    const response = await fetch(`/api/reports/${encodeURIComponent(reportNo)}`);
    const data = await response.json();
    if (!response.ok) { result.innerHTML = `<p class="lookup-message">${data.error || "신고 내용을 찾을 수 없습니다."}</p>`; return; }
    const report = data.report;
    const itemsHtml = report.items.map((item) => `<li><span>${item.name} · ${item.option_name}</span><b>${item.quantity}개</b></li>`).join("");
    const paymentMethodText = PAYMENT_METHOD_NAMES[report.payment_method] || report.payment_method || "기타";
    const isPendingCash = report.payment_status === "PENDING_CASH_RECEIPT";
    const paymentStatusText = PAYMENT_STATUS_NAMES[report.payment_status] || report.payment_status;
    const paymentBadgeClass = report.payment_status === "COMPLETED" ? "badge-pay-ok" : "badge-cash";
    const photosHtml = `
      ${report.before_photo ? `<div><p class="selection-label">내가 등록한 사진</p><img class="lookup-photo" src="${report.before_photo}" alt="신고 시 등록한 배출 위치 사진" /></div>` : ""}
      ${report.after_photo ? `<div><p class="selection-label">수거 완료 사진</p><img class="lookup-photo" src="${report.after_photo}" alt="담당자가 등록한 수거 완료 사진" /></div>` : `<p class="field-help">${report.status === "COLLECTED" ? "" : "수거가 완료되면 이 자리에 완료 사진이 표시돼요."}</p>`}
    `;
    result.innerHTML = `
      <div class="lookup-card">
        <div class="lookup-card-head"><strong>${report.report_no}</strong><span class="status-badge status-${report.status.toLowerCase()}">${LOOKUP_STATUS_LABEL[report.status] || report.status}</span></div>
        <p class="field-help">${report.address}</p>
        <div class="lookup-payment-info">
          <div><span><b>결제 방법:</b> ${paymentMethodText}</span><span class="badge-tag ${paymentBadgeClass}">${paymentStatusText}</span></div>
          ${isPendingCash ? '<p class="lookup-cash-notice">💵 관할 주민센터(행정복지센터) 또는 지정 수납처에 현금을 납부해 주세요. 담당자 수납 확인 후 수거가 진행됩니다.</p>' : ''}
        </div>
        <ul class="detail-items">${itemsHtml}</ul>
        <div class="lookup-photos">${photosHtml}</div>
      </div>`;
  } catch {
    result.innerHTML = "<p class=\"lookup-message\">조회에 실패했습니다. 잠시 후 다시 시도해 주세요.</p>";
  }
}
$("#lookup-button").addEventListener("click", lookupReport);
$("#lookup-input").addEventListener("keydown", (event) => { if (event.key === "Enter") lookupReport(); });

const paymentGuidance = {
  kakaopay: "카카오페이 결제 승인 후 신고가 접수됩니다. 현장 확인으로 추가요금이 발생하면 별도 안내 후 추가 결제가 진행됩니다.",
  naverpay: "네이버페이 결제 승인 후 신고가 접수됩니다. 현장 확인으로 추가요금이 발생하면 별도 안내 후 추가 결제가 진행됩니다.",
  tosspay: "토스 결제 승인 후 신고가 접수됩니다. 현장 확인으로 추가요금이 발생하면 별도 안내 후 추가 결제가 진행됩니다.",
  card: "카드결제 승인 후 신고가 접수됩니다. 현장 확인으로 추가요금이 발생하면 별도 안내 후 추가 결제가 진행됩니다.",
  transfer: "계좌이체는 입금이 확인된 뒤 신고가 정식 접수됩니다. 가상계좌를 선택한 경우 안내된 금액과 기한을 확인해 주세요.",
  cash: "현금결제는 지정 수납처 또는 안내된 수납 방법으로 납부한 뒤, 수납 담당자가 확인해야 신고가 접수됩니다."
};
function updateSubmitButtonText(paymentMethod) {
  const isCash = paymentMethod === "cash";
  const btnText = isCash ? "현금결제로 신고 접수하기" : "신고 접수 및 결제하기";
  if ($("#step3-submit-btn")) $("#step3-submit-btn").textContent = btnText;
  if (state.currentStep === 3 && $("#checkout-step-btn")) $("#checkout-step-btn").textContent = btnText;
}
function renderPaymentGuidance() {
  const selected = document.querySelector("input[name=payment]:checked");
  if (selected) {
    $("#payment-notice").textContent = paymentGuidance[selected.value];
    updateSubmitButtonText(selected.value);
  }
}
document.querySelectorAll("input[name=payment]").forEach((input) => input.addEventListener("change", renderPaymentGuidance));

function goToStep(targetStep) {
  const message = $("#form-message");
  message.textContent = "";

  if (targetStep > 1 && !state.cart.length) {
    message.textContent = "수거할 품목을 한 개 이상 추가해 주세요.";
    return;
  }
  if (targetStep > 2 && (!$("#address").value.trim() || !$("#address-detail").value.trim())) {
    message.textContent = "배출 주소와 상세 배출 장소를 모두 입력해 주세요.";
    return;
  }

  state.currentStep = targetStep;
  document.querySelectorAll(".form-step").forEach((stepEl) => {
    stepEl.classList.toggle("active", stepEl.id === `step-${targetStep}`);
  });

  document.querySelectorAll("#progress-steps li").forEach((li) => {
    const stepNum = Number(li.dataset.step);
    li.classList.toggle("is-current", stepNum === targetStep);
    li.classList.toggle("is-done", stepNum < targetStep);
  });

  const checkoutBtn = $("#checkout-step-btn");
  if (checkoutBtn) {
    if (targetStep === 1) checkoutBtn.textContent = '다음 단계 "결제" ›';
    else if (targetStep === 2) checkoutBtn.textContent = '다음 단계 "결제" ›';
    else {
      const selected = document.querySelector("input[name=payment]:checked");
      updateSubmitButtonText(selected?.value);
    }
  }

  if (targetStep === 2 && reportMap) {
    setTimeout(() => reportMap.invalidateSize(), 150);
  }

  const activeSection = document.getElementById(`step-${targetStep}`);
  if (activeSection) activeSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

$("#step1-next-btn")?.addEventListener("click", () => goToStep(2));
$("#step2-prev-btn")?.addEventListener("click", () => goToStep(1));
$("#step2-next-btn")?.addEventListener("click", () => goToStep(3));
$("#step3-prev-btn")?.addEventListener("click", () => goToStep(2));

$("#checkout-step-btn")?.addEventListener("click", () => {
  if (state.currentStep === 1) goToStep(2);
  else if (state.currentStep === 2) goToStep(3);
  else $("#report-form").requestSubmit();
});

document.querySelectorAll("#progress-steps li").forEach((li) => {
  li.addEventListener("click", () => {
    const stepNum = Number(li.dataset.step);
    goToStep(stepNum);
  });
});

$("#report-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = $("#form-message");
  if (!state.cart.length) { message.textContent = "수거할 품목을 한 개 이상 추가해 주세요."; return; }
  if (!$("#address").value.trim() || !$("#address-detail").value.trim()) { message.textContent = "배출 주소와 상세 배출 장소를 모두 입력해 주세요."; return; }
  const payment = document.querySelector("input[name=payment]:checked");
  const submitButton = event.submitter || $("#checkout-step-btn");
  if (submitButton) submitButton.disabled = true;
  message.textContent = "신고 내용을 저장하고 있습니다.";
  try {
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        address: $("#address").value.trim(),
        addressDetail: $("#address-detail").value.trim(),
        paymentMethod: payment.value,
        location: state.location,
        items: state.cart,
        beforePhoto: state.beforePhoto
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    const paymentName = PAYMENT_METHOD_NAMES[payment.value] || payment.value;
    const isCash = payment.value === "cash";
    message.textContent = isCash
      ? `${result.reportNo}번으로 접수되었습니다. 지정 수납처(주민센터 등) 납부 확인 후 수거 배정이 진행됩니다. 이 접수번호를 저장해두면 아래 "내 신고 확인하기"에서 수거 완료 사진을 볼 수 있어요.`
      : `${result.reportNo}번으로 접수되었습니다. ${paymentName} 승인 확인 후 수거 배정이 진행됩니다. 이 접수번호를 저장해두면 아래 "내 신고 확인하기"에서 수거 완료 사진을 볼 수 있어요.`;

    // Show receipt card
    $("#receipt-no").textContent = result.reportNo;
    const itemsHtml = state.cart.map((item) => `<li><span>${escapeHtml(item.name)} (${escapeHtml(item.option)}) × ${item.quantity}</span><strong>${won.format(item.fee * item.quantity)}원</strong></li>`).join("");
    $("#receipt-summary").innerHTML = `
      <p style="margin:4px 0 8px;color:var(--muted)"><b>배출 장소:</b> ${escapeHtml($("#address").value)} ${escapeHtml($("#address-detail").value)}</p>
      <ul>${itemsHtml}</ul>
      <p style="text-align:right;margin:8px 0 0;font-weight:800;font-size:1rem;color:var(--accent)">총 수수료: ${won.format(result.totalFee)}원 (${paymentName})</p>
      <div style="margin-top:10px;padding:8px 12px;background:var(--bg);border-radius:var(--radius-sm);display:flex;justify-content:space-between;align-items:center;font-size:.84rem;">
        <span><b>결제 상태</b></span>
        <span class="badge-tag ${isCash ? 'badge-cash' : 'badge-pay-ok'}">${isCash ? '💵 현금 수납 대기' : '결제 완료'}</span>
      </div>
    `;

    const cashGuideEl = $("#receipt-cash-guide");
    if (cashGuideEl) {
      if (isCash) {
        cashGuideEl.hidden = false;
        cashGuideEl.innerHTML = `<strong>💵 현금 납부 안내</strong><p>신고가 정상 접수되었습니다. 위 <b>접수번호</b>를 지참하여 관할 <b>행정복지센터(주민센터)에 방문 납부</b>해 주세요. 담당자가 수납 확인을 완료하면 수거 배정이 진행됩니다.</p>`;
      } else {
        cashGuideEl.hidden = true;
      }
    }

    $("#receipt-card").hidden = false;
    $("#report-form").hidden = true;
    $("#receipt-card").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    message.textContent = error.message || "신고 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

$("#copy-receipt-no")?.addEventListener("click", async () => {
  const no = $("#receipt-no").textContent;
  try {
    await navigator.clipboard.writeText(no);
    $("#copy-receipt-no").textContent = "복사 완료! ✓";
    setTimeout(() => { $("#copy-receipt-no").textContent = "접수번호 복사"; }, 2000);
  } catch {
    $("#copy-receipt-no").textContent = "복사 실패";
  }
});
$("#receipt-lookup-btn")?.addEventListener("click", () => {
  const no = $("#receipt-no").textContent;
  $("#lookup-input").value = no;
  document.querySelector(".lookup-section").scrollIntoView({ behavior: "smooth" });
  lookupReport();
});
$("#receipt-new-btn")?.addEventListener("click", () => {
  state.cart = [];
  state.location = null;
  state.beforePhoto = null;
  $("#before-photo-preview").hidden = true;
  $("#before-photo-button").hidden = false;
  $("#address").value = "";
  $("#address-detail").value = "";
  $("#receipt-card").hidden = true;
  $("#report-form").hidden = false;
  renderCart();
  goToStep(1);
});

renderCategories(); renderItems(); renderCart(); renderPaymentGuidance();

