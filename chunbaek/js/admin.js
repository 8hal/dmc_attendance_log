/**
 * 춘백 S3 운영진 — 목업 (preview=1, API 없음)
 */
const PREVIEW = new URLSearchParams(location.search).has("preview")
  || location.hostname === "localhost"
  || location.hostname === "127.0.0.1";

const AUTH_KEY = "chunbaekAdminPreviewAuth";

const MEMBERS = [
  { id: "m1", nickname: "김러너" },
  { id: "m2", nickname: "이페이스" },
  { id: "m3", nickname: "박풀코스" },
  { id: "m4", nickname: "최인터벌" },
  { id: "m5", nickname: "게살볶음밥" },
  { id: "m6", nickname: "홍길동" },
  { id: "m7", nickname: "정마왕" },
  { id: "m8", nickname: "한이지" },
];

const WEEKS = {
  7: {
    range: "4/7 ~ 4/13",
    slots: [
      { slotId: 36, dayIndex: 36, date: "2026-04-07", dow: "월", title: "5km 인터벌", content: "워밍업 10분, 5×1km (r:90s)", isProgramOff: false },
      { slotId: 37, dayIndex: 37, date: "2026-04-08", dow: "화", title: "인터벌", content: "6×800m", isProgramOff: false },
      { slotId: 38, dayIndex: 38, date: "2026-04-09", dow: "수", title: "휴무", content: "", isProgramOff: true },
      { slotId: 39, dayIndex: 39, date: "2026-04-10", dow: "목", title: "장거리", content: "15km 이지", isProgramOff: false },
      { slotId: 40, dayIndex: 40, date: "2026-04-11", dow: "금", title: "이지런", content: "", isProgramOff: false },
      { slotId: 41, dayIndex: 41, date: "2026-04-12", dow: "토", title: "동마클 토요", content: "정모 + 춘백 출석", isProgramOff: false },
      { slotId: 42, dayIndex: 42, date: "2026-04-13", dow: "일", title: "인터벌", content: "", isProgramOff: false },
    ],
    cells: {
      m1: { 36: "attend", 37: "attend", 39: "attend", 40: "miss", 41: "attend-photo", 42: "miss" },
      m2: { 36: "attend", 37: "miss", 39: "attend", 40: "attend", 41: "attend", 42: "miss" },
      m3: { 36: "attend", 37: "attend", 39: "exception", 40: "attend", 41: "miss", 42: "miss" },
      m4: { 36: "miss", 37: "miss", 39: "miss", 40: "miss", 41: "miss", 42: "miss" },
      m5: { 36: "attend", 37: "attend", 39: "attend", 40: "attend", 41: "attend", 42: "attend" },
      m6: { 36: "attend", 37: "attend", 39: "attend", 40: "miss", 41: "attend", 42: "attend" },
      m7: { 36: "attend", 37: "miss", 39: "attend", 40: "attend", 41: "attend", 42: "miss" },
      m8: { 36: "attend", 37: "attend", 39: "miss", 40: "attend", 41: "attend", 42: "miss" },
    },
    weekCounts: { m1: 3, m2: 2, m3: 2, m4: 0, m5: 5, m6: 4, m7: 3, m8: 3 },
  },
};

let currentWeek = 7;
let currentPanel = "grid";
let filterUnderTarget = false;
let modalContext = null;

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function weekData(week) {
  return WEEKS[week] || WEEKS[7];
}

function trainingDayCount(slots) {
  return slots.filter((s) => !s.isProgramOff).length;
}

function cellClass(status) {
  if (status === "attend" || status === "attend-photo") return "cell-attend";
  if (status === "exception") return "cell-exception";
  if (status === "miss") return "cell-miss";
  return "cell-miss";
}

function cellLabel(status, isOff) {
  if (isOff) return "—";
  if (status === "attend" || status === "attend-photo") return "✓";
  if (status === "exception") return "예외";
  return "—";
}

function renderGrid() {
  const data = weekData(currentWeek);
  const slots = data.slots.filter((s) => !s.isProgramOff);
  const offSlots = data.slots.filter((s) => s.isProgramOff);
  const allSlots = data.slots;

  let missCount = 0;
  const tbody = document.getElementById("grid-body");
  tbody.innerHTML = "";

  MEMBERS.forEach((m) => {
    const count = data.weekCounts[m.id] || 0;
    const under = count < 3;
    if (filterUnderTarget && !under) return;

    const tr = document.createElement("tr");
    if (under) tr.classList.add("under-target");

    let rowMiss = 0;
    allSlots.forEach((slot) => {
      if (!slot.isProgramOff) {
        const st = (data.cells[m.id] || {})[slot.slotId];
        if (!st || st === "miss") rowMiss += 1;
      }
    });
    missCount += rowMiss;

    tr.innerHTML = `<td class="member-cell">${m.nickname}<br><small style="color:var(--text-muted);font-weight:600">${count}/3</small></td>`;
    allSlots.forEach((slot) => {
      const td = document.createElement("td");
      td.className = "cell";
      if (slot.isProgramOff) {
        td.classList.add("cell-off");
        td.textContent = "—";
      } else {
        const st = (data.cells[m.id] || {})[slot.slotId] || "miss";
        td.className += ` ${cellClass(st)}`;
        if (st === "attend-photo") td.classList.add("cell-photo");
        td.textContent = cellLabel(st, false);
        td.dataset.memberId = m.id;
        td.dataset.slotId = String(slot.slotId);
        td.dataset.memberName = m.nickname;
        td.dataset.slotLabel = `${slot.dayIndex}일 ${slot.date.slice(5).replace("-", "/")}`;
        td.addEventListener("click", openCellModal);
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  document.getElementById("grid-week-title").textContent = `${currentWeek}주차`;
  document.getElementById("grid-range").textContent = data.range;
  document.getElementById("grid-miss-chip").textContent = `미출석 셀 ${missCount}개`;
  document.getElementById("grid-under-chip").textContent =
    `주 3회 미달 ${MEMBERS.filter((m) => (data.weekCounts[m.id] || 0) < 3).length}명`;

  const head = document.getElementById("grid-head-row");
  head.innerHTML = "<th>회원</th>";
  allSlots.forEach((slot) => {
    const th = document.createElement("th");
    th.className = "slot-head";
    th.innerHTML = `${slot.dayIndex}<small>${slot.date.slice(5).replace("-", "/")}</small>`;
    head.appendChild(th);
  });
}

function renderTraining() {
  const data = weekData(currentWeek);
  const list = document.getElementById("training-list");
  list.innerHTML = "";

  let filled = 0;
  data.slots.forEach((slot) => {
    if (slot.isProgramOff || (slot.title && slot.title.trim())) filled += 1;
    const card = document.createElement("div");
    card.className = "training-card" + (slot.isProgramOff ? " off-day" : "") + (!slot.title && !slot.isProgramOff ? " empty" : "");

    card.innerHTML = `
      <div class="training-day-meta">
        ${slot.dayIndex}일차
        <span>${slot.date.slice(5).replace("-", "월 ")}일 (${slot.dow})</span>
      </div>
      <div class="training-fields">
        <label>제목</label>
        <input type="text" value="${escapeAttr(slot.title)}" placeholder="예: 5km 인터벌" data-field="title" data-slot="${slot.slotId}" ${slot.isProgramOff ? "disabled" : ""} />
        <label>내용</label>
        <textarea placeholder="예: 워밍업 10분 → 5×1km…" data-field="content" data-slot="${slot.slotId}" ${slot.isProgramOff ? "disabled" : ""}>${escapeHtml(slot.content)}</textarea>
      </div>
      <label class="training-off-toggle">
        <input type="checkbox" data-field="off" data-slot="${slot.slotId}" ${slot.isProgramOff ? "checked" : ""} />
        휴무
      </label>
    `;
    list.appendChild(card);
  });

  const trainDays = trainingDayCount(data.slots);
  document.getElementById("training-week-title").textContent = `${currentWeek}주차`;
  document.getElementById("training-range").textContent = data.range;
  document.getElementById("training-summary").textContent =
    `입력 ${filled}/${data.slots.length}일 · 훈련일 ${trainDays}일`;
  const warn = document.getElementById("training-warning");
  if (trainDays < 3) {
    warn.style.display = "inline-flex";
    warn.textContent = `훈련일 ${trainDays}일 — 주 3회 목표 불가 (자동 cap)`;
  } else {
    warn.style.display = "none";
  }
}

function escapeAttr(s) {
  return String(s || "").replace(/"/g, "&quot;");
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function openCellModal(e) {
  const td = e.currentTarget;
  modalContext = {
    memberId: td.dataset.memberId,
    slotId: Number(td.dataset.slotId),
    memberName: td.dataset.memberName,
    slotLabel: td.dataset.slotLabel,
    td,
  };
  document.getElementById("modal-title").textContent = modalContext.memberName;
  document.getElementById("modal-sub").textContent = modalContext.slotLabel;
  document.getElementById("cell-modal").classList.add("show");
}

function closeCellModal() {
  document.getElementById("cell-modal").classList.remove("show");
  modalContext = null;
}

function setCellStatus(status) {
  if (!modalContext) return;
  const data = weekData(currentWeek);
  if (!data.cells[modalContext.memberId]) data.cells[modalContext.memberId] = {};
  data.cells[modalContext.memberId][modalContext.slotId] = status;

  const td = modalContext.td;
  td.className = `cell ${cellClass(status)}`;
  td.textContent = cellLabel(status, false);
  if (status === "attend-photo") td.classList.add("cell-photo");

  closeCellModal();
  showToast(status === "exception" ? "예외 처리됨" : status === "attend" ? "출석 처리됨" : "미출석 처리됨");
  renderGrid();
}

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

function switchPanel(panel) {
  currentPanel = panel;
  document.querySelectorAll(".admin-nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.panel === panel);
  });
  document.querySelectorAll(".admin-panel").forEach((p) => {
    p.classList.toggle("active", p.id === `panel-${panel}`);
  });
  if (panel === "grid") renderGrid();
  if (panel === "training") renderTraining();
}

function tryAuth() {
  const pw = document.getElementById("auth-pw").value;
  if (PREVIEW || pw.length > 0) {
    sessionStorage.setItem(AUTH_KEY, "1");
    document.getElementById("auth-overlay").classList.add("hidden");
    document.getElementById("admin-shell").style.display = "";
    init();
    return;
  }
  document.getElementById("auth-error").style.display = "block";
}

function init() {
  document.getElementById("week-select").value = String(currentWeek);
  document.getElementById("week-select-training").value = String(currentWeek);

  if (PREVIEW) {
    document.getElementById("preview-banner").style.display = "block";
    document.getElementById("admin-demo-nav").style.display = "block";
  }

  switchPanel(currentPanel);
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-auth").addEventListener("click", tryAuth);
  document.getElementById("auth-pw").addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryAuth();
  });

  document.querySelectorAll(".admin-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchPanel(btn.dataset.panel));
  });

  document.getElementById("week-select").addEventListener("change", (e) => {
    currentWeek = Number(e.target.value);
    document.getElementById("week-select-training").value = e.target.value;
    renderGrid();
  });
  document.getElementById("week-select-training").addEventListener("change", (e) => {
    currentWeek = Number(e.target.value);
    document.getElementById("week-select").value = e.target.value;
    renderTraining();
  });

  document.getElementById("filter-under").addEventListener("change", (e) => {
    filterUnderTarget = e.target.checked;
    renderGrid();
  });

  document.getElementById("btn-save-training").addEventListener("click", () => {
    showToast("7주차 훈련 저장됨 (목업)");
  });

  document.getElementById("btn-import").addEventListener("click", () => {
    showToast("CSV import 완료 (목업)");
  });

  document.querySelectorAll("[data-modal-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.modalAction;
      if (action === "cancel") closeCellModal();
      else if (action === "attend") setCellStatus("attend");
      else if (action === "miss") setCellStatus("miss");
      else if (action === "exception") setCellStatus("exception");
    });
  });

  document.getElementById("demo-screen").addEventListener("change", (e) => {
    const v = e.target.value;
    if (v === "auth") {
      document.getElementById("auth-overlay").classList.remove("hidden");
      document.getElementById("admin-shell").style.display = "none";
      return;
    }
    document.getElementById("auth-overlay").classList.add("hidden");
    document.getElementById("admin-shell").style.display = "";
    switchPanel(v);
  });

  if (PREVIEW && sessionStorage.getItem(AUTH_KEY) === "1") {
    document.getElementById("auth-overlay").classList.add("hidden");
    document.getElementById("admin-shell").style.display = "";
    init();
  } else if (PREVIEW) {
    document.getElementById("auth-pw").placeholder = "목업: 아무 값이나 입력";
  }
});
