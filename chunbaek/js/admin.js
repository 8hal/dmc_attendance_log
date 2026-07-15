/**
 * 춘백 S3 운영진 — preview=1 목업 / 실 API 연동
 */
const PREVIEW = new URLSearchParams(location.search).has("preview");

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

let currentWeek = PREVIEW ? 7 : null;
let currentPanel = "grid";
let filterUnderTarget = false;
let modalContext = null;
let isProcessing = false;
let gridApiData = null;
let trainingApiData = null;

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function dowLabel(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return DOW[d.getDay()];
}

function syncWeekSelects() {
  if (currentWeek == null) return;
  const w = String(currentWeek);
  const gridSel = document.getElementById("week-select");
  const trainSel = document.getElementById("week-select-training");
  if (gridSel) gridSel.value = w;
  if (trainSel) trainSel.value = w;
}

function adminWeekParams() {
  return currentWeek != null ? { week: currentWeek } : {};
}

async function resolveDefaultWeek() {
  if (PREVIEW) {
    currentWeek = currentWeek ?? 7;
    return;
  }
  gridApiData = await adminGet("admin-grid", {});
  if (gridApiData.week) currentWeek = gridApiData.week;
  else currentWeek = 1;
}

function weekData(week) {
  return WEEKS[week] || WEEKS[7];
}

function apiCellStatus(cell) {
  if (cell.status === "attend" && cell.photoUrl) return "attend-photo";
  return cell.status;
}

function normalizeGridFromApi(data) {
  const slots = (data.slots || []).map((s) => ({
    slotId: s.slotId ?? s.dayIndex,
    dayIndex: s.dayIndex,
    date: s.date,
    title: s.trainingTitle || "",
    isProgramOff: !!s.isProgramOff,
  }));

  const members = (data.members || []).map((m) => {
    const cells = {};
    const cellPhotos = {};
    (m.cells || []).forEach((c) => {
      if (c.slotId != null) {
        cells[c.slotId] = apiCellStatus(c);
        const urls = Array.isArray(c.photoUrls) && c.photoUrls.length
          ? c.photoUrls
          : (c.photoUrl ? [c.photoUrl] : []);
        if (urls.length) cellPhotos[c.slotId] = urls;
      }
    });
    return {
      id: m.memberId,
      nickname: m.nickname,
      weekCount: m.weekAttendCount,
      weekTarget: m.weekTarget,
      profileComplete: m.profileComplete,
      cells,
      cellPhotos,
    };
  });

  return {
    range: data.range || "",
    slots,
    members,
    weekSummary: data.weekSummary || {},
    seasonDayIndex: data.seasonDayIndex,
    participantCount: data.participantCount,
  };
}

function normalizeTrainingFromApi(data) {
  return {
    range: data.range || "",
    summary: data.summary || {},
    slots: (data.slots || []).map((s) => ({
      slotId: s.slotId ?? s.dayIndex,
      dayIndex: s.dayIndex,
      date: s.date,
      dow: dowLabel(s.date),
      title: s.trainingTitle || "",
      content: s.trainingContent || "",
      isProgramOff: !!s.isProgramOff,
      hasAttendance: !!s.hasAttendance,
    })),
  };
}

function viewGrid() {
  if (PREVIEW) {
    const data = weekData(currentWeek);
    return {
      range: data.range,
      slots: data.slots,
      members: MEMBERS.map((m) => ({
        id: m.id,
        nickname: m.nickname,
        weekCount: data.weekCounts[m.id] || 0,
        weekTarget: 3,
        cells: data.cells[m.id] || {},
      })),
      underTargetCount: MEMBERS.filter((m) => (data.weekCounts[m.id] || 0) < 3).length,
    };
  }
  if (!gridApiData) {
    return { range: "", slots: [], members: [], underTargetCount: 0 };
  }
  const norm = normalizeGridFromApi(gridApiData);
  return {
    ...norm,
    underTargetCount: norm.weekSummary.underTargetCount || 0,
  };
}

function viewTraining() {
  if (PREVIEW) return weekData(currentWeek);
  if (!trainingApiData) return { range: "", slots: [], summary: {} };
  return normalizeTrainingFromApi(trainingApiData);
}

function trainingDayCount(slots) {
  return slots.filter((s) => !s.isProgramOff).length;
}

function cellClass(status) {
  if (status === "attend" || status === "attend-photo") return "cell-attend";
  if (status === "exception") return "cell-exception";
  if (status === "miss" || status === "today" || status === "future") return "cell-miss";
  return "cell-miss";
}

function cellLabel(status, isOff) {
  if (isOff) return "—";
  if (status === "attend" || status === "attend-photo") return "✓";
  if (status === "exception") return "예외";
  if (status === "future") return "·";
  return "—";
}

function renderGrid() {
  const data = viewGrid();
  const allSlots = data.slots;
  let missCount = 0;
  const tbody = document.getElementById("grid-body");
  tbody.innerHTML = "";

  data.members.forEach((m) => {
    const count = m.weekCount ?? 0;
    const target = m.weekTarget ?? 3;
    const under = count < target;
    if (filterUnderTarget && !under) return;

    const tr = document.createElement("tr");
    if (under) tr.classList.add("under-target");

    let rowMiss = 0;
    allSlots.forEach((slot) => {
      if (!slot.isProgramOff) {
        const st = m.cells[slot.slotId];
        if (!st || st === "miss" || st === "today") rowMiss += 1;
      }
    });
    missCount += rowMiss;

    tr.innerHTML = `<td class="member-cell">${m.nickname}<br><small style="color:var(--text-muted);font-weight:600">${count}/${target}</small></td>`;
    allSlots.forEach((slot) => {
      const td = document.createElement("td");
      td.className = "cell";
      if (slot.isProgramOff) {
        td.classList.add("cell-off");
        td.textContent = "—";
      } else {
        const st = m.cells[slot.slotId] || "miss";
        td.className += ` ${cellClass(st)}`;
        if (st === "attend-photo") td.classList.add("cell-photo");
        td.textContent = cellLabel(st, false);
        td.dataset.memberId = m.id;
        td.dataset.slotId = String(slot.slotId);
        td.dataset.memberName = m.nickname;
        td.dataset.slotLabel = `${slot.dayIndex ?? "—"}일 ${slot.date.slice(5).replace("-", "/")}`;
        const photos = m.cellPhotos?.[slot.slotId];
        if (photos && photos.length) td.dataset.photoUrls = JSON.stringify(photos);
        td.addEventListener("click", openCellModal);
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  document.getElementById("grid-week-title").textContent = weekOptionLabel(currentWeek);
  document.getElementById("grid-range").textContent = data.range;
  document.getElementById("grid-miss-chip").textContent = `미출석 셀 ${missCount}개`;
  document.getElementById("grid-under-chip").textContent = `주 3회 미달 ${data.underTargetCount}명`;

  const head = document.getElementById("grid-head-row");
  head.innerHTML = "<th>회원</th>";
  allSlots.forEach((slot) => {
    const th = document.createElement("th");
    th.className = "slot-head";
    th.innerHTML = `${slot.dayIndex ?? "—"}<small>${slot.date.slice(5).replace("-", "/")}</small>`;
    head.appendChild(th);
  });

  if (!PREVIEW && gridApiData) {
    const meta = document.querySelector(".admin-topbar-meta");
    if (meta) {
      meta.textContent = `${gridApiData.seasonDayIndex || "—"}일차 · 참가 ${gridApiData.participantCount || 0}명`;
    }
  }
}

function renderTraining() {
  const data = viewTraining();
  const list = document.getElementById("training-list");
  list.innerHTML = "";

  let filled = 0;
  data.slots.forEach((slot) => {
    if (slot.isProgramOff || (slot.title && slot.title.trim())) filled += 1;
    const card = document.createElement("div");
    card.className = "training-card"
      + (slot.isProgramOff ? " off-day" : "")
      + (!slot.title && !slot.isProgramOff ? " empty" : "");

    card.innerHTML = `
      <div class="training-day-meta">
        ${slot.dayIndex ?? "—"}일차
        <span>${slot.date.slice(5).replace("-", "월 ")}일 (${slot.dow || dowLabel(slot.date)})</span>
        ${slot.hasAttendance ? '<small style="color:var(--warn)">출석 있음</small>' : ""}
      </div>
      <div class="training-fields">
        <label>제목</label>
        <input type="text" value="${escapeAttr(slot.title)}" placeholder="예: 5km 인터벌" data-field="title" data-slot="${slot.slotId ?? ""}" data-day="${slot.dayIndex ?? ""}" data-date="${slot.date}" ${slot.isProgramOff ? "disabled" : ""} />
        <label>내용</label>
        <textarea placeholder="예: 워밍업 10분 → 5×1km…" data-field="content" data-slot="${slot.slotId ?? ""}" ${slot.isProgramOff ? "disabled" : ""}>${escapeHtml(slot.content)}</textarea>
      </div>
      <label class="training-off-toggle">
        <input type="checkbox" data-field="off" data-slot="${slot.slotId ?? ""}" data-day="${slot.dayIndex ?? ""}" data-date="${slot.date}" ${slot.isProgramOff ? "checked" : ""} />
        휴무
      </label>
    `;
    list.appendChild(card);
  });

  const trainDays = trainingDayCount(data.slots);
  document.getElementById("training-week-title").textContent = weekOptionLabel(currentWeek);
  document.getElementById("training-range").textContent = data.range;
  document.getElementById("training-summary").textContent =
    `입력 ${filled}/${data.slots.length}일 · 훈련일 ${trainDays}일`;
  const warn = document.getElementById("training-warning");
  const warnMsg = data.summary?.warning;
  if (trainDays < 3 || warnMsg) {
    warn.style.display = "inline-flex";
    warn.textContent = warnMsg || `훈련일 ${trainDays}일 — 주 3회 목표 불가 (자동 cap)`;
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

  // 사진 표시
  const strip = document.getElementById("modal-photo-strip");
  const rawPhotos = td.dataset.photoUrls;
  if (rawPhotos) {
    const urls = JSON.parse(rawPhotos);
    strip.style.display = "flex";
    strip.innerHTML = urls.map((url, i) =>
      `<img src="${url}" alt="출석 사진 ${i + 1}" class="modal-photo-thumb" />`
    ).join("");
  } else {
    strip.style.display = "none";
    strip.innerHTML = "";
  }

  document.getElementById("cell-modal").classList.add("show");
}

function closeCellModal() {
  document.getElementById("cell-modal").classList.remove("show");
  modalContext = null;
}

async function setCellStatus(status) {
  if (!modalContext || isProcessing) return;

  if (PREVIEW) {
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
    return;
  }

  isProcessing = true;
  try {
    await adminPost("admin-set-attendance", {
      memberId: modalContext.memberId,
      slotId: modalContext.slotId,
      attended: status === "attend",
      exception: status === "exception",
    });
    closeCellModal();
    showToast(status === "exception" ? "예외 처리됨" : status === "attend" ? "출석 처리됨" : "미출석 처리됨");
    await refreshGrid();
  } catch (err) {
    console.error(err);
    showToast(err.message || "저장 실패", true);
  } finally {
    isProcessing = false;
  }
}

function showToast(msg, isError) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.toggle("error", !!isError);
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

async function refreshGrid() {
  if (PREVIEW) {
    renderGrid();
    return;
  }
  gridApiData = await adminGet("admin-grid", adminWeekParams());
  if (gridApiData.week) currentWeek = gridApiData.week;
  syncWeekSelects();
  renderGrid();
}

async function refreshTraining() {
  if (PREVIEW) {
    renderTraining();
    return;
  }
  trainingApiData = await adminGet("admin-week-slots", adminWeekParams());
  if (trainingApiData.week) currentWeek = trainingApiData.week;
  syncWeekSelects();
  renderTraining();
}

function weekOptionLabel(w) {
  return w === 0 ? "0주차 (베타)" : `${w}주차`;
}

function populateWeekSelects() {
  const maxWeek = PREVIEW ? 8 : 15;
  const minWeek = PREVIEW ? 6 : 0;
  ["week-select", "week-select-training"].forEach((id) => {
    const sel = document.getElementById(id);
    const prev = sel.value;
    sel.innerHTML = "";
    for (let w = minWeek; w <= maxWeek; w += 1) {
      const opt = document.createElement("option");
      opt.value = String(w);
      opt.textContent = weekOptionLabel(w);
      sel.appendChild(opt);
    }
    sel.value = prev || String(currentWeek);
  });
}

async function switchPanel(panel) {
  currentPanel = panel;
  document.querySelectorAll(".admin-nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.panel === panel);
  });
  document.querySelectorAll(".admin-panel").forEach((p) => {
    p.classList.toggle("active", p.id === `panel-${panel}`);
  });
  if (panel === "grid") await refreshGrid();
  if (panel === "training") await refreshTraining();
}

async function tryAuth() {
  const pw = document.getElementById("auth-pw").value;
  document.getElementById("auth-error").style.display = "none";

  if (PREVIEW) {
    if (pw.length > 0) {
      sessionStorage.setItem(AUTH_KEY, "1");
      document.getElementById("auth-overlay").classList.add("hidden");
      document.getElementById("admin-shell").style.display = "";
      await init();
    } else {
      document.getElementById("auth-error").style.display = "block";
    }
    return;
  }

  try {
    await verifyAdmin(pw);
    document.getElementById("auth-overlay").classList.add("hidden");
    document.getElementById("admin-shell").style.display = "";
    await init();
  } catch (err) {
    console.error(err);
    document.getElementById("auth-error").style.display = "block";
  }
}

async function init() {
  await resolveDefaultWeek();
  populateWeekSelects();
  syncWeekSelects();

  if (PREVIEW) {
    document.getElementById("preview-banner").style.display = "block";
    document.getElementById("admin-demo-nav").style.display = "block";
  } else {
    document.getElementById("preview-banner").style.display = "none";
  }

  await switchPanel(currentPanel);
}

async function saveTraining() {
  if (PREVIEW) {
    showToast(`${currentWeek}주차 훈련 저장됨 (목업)`);
    return;
  }
  if (isProcessing) return;
  isProcessing = true;
  try {
    const cards = document.querySelectorAll("#training-list .training-card");
    const rows = [];
    cards.forEach((card) => {
      const titleEl = card.querySelector('[data-field="title"]');
      const contentEl = card.querySelector('[data-field="content"]');
      const offEl = card.querySelector('[data-field="off"]');
      const isProgramOff = offEl.checked;
      const dayIndex = titleEl.dataset.day ? Number(titleEl.dataset.day) : undefined;
      rows.push({
        dayIndex: Number.isFinite(dayIndex) ? dayIndex : undefined,
        date: titleEl.dataset.date,
        trainingTitle: isProgramOff ? "휴무" : titleEl.value.trim(),
        trainingContent: isProgramOff ? "" : contentEl.value.trim(),
        isProgramOff,
      });
    });
    const result = await adminPost("admin-save-week-slots", { week: currentWeek, rows });
    showToast(`${currentWeek}주차 훈련 ${result.saved}건 저장됨`);
    if (result.warnings?.length) showToast(result.warnings[0], true);
    await refreshTraining();
  } catch (err) {
    console.error(err);
    showToast(err.message || "저장 실패", true);
  } finally {
    isProcessing = false;
  }
}

async function runImport() {
  if (PREVIEW) {
    showToast("CSV import 완료 (목업)");
    return;
  }
  if (isProcessing) return;
  isProcessing = true;
  try {
    const csv = document.getElementById("import-csv").value;
    const result = await adminPost("admin-import-slots", { mode: "replace", csv });
    showToast(`${result.imported}건 import 완료`);
    if (result.warnings?.length) {
      const w = result.warnings[0];
      const msg = typeof w === "string" ? w : (w.message || JSON.stringify(w));
      showToast(msg, true);
    }
  } catch (err) {
    console.error(err);
    showToast(err.message || "import 실패", true);
  } finally {
    isProcessing = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-auth").addEventListener("click", tryAuth);
  document.getElementById("auth-pw").addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryAuth();
  });

  document.querySelectorAll(".admin-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchPanel(btn.dataset.panel));
  });

  document.getElementById("week-select").addEventListener("change", async (e) => {
    currentWeek = Number(e.target.value);
    syncWeekSelects();
    await refreshGrid();
  });
  document.getElementById("week-select-training").addEventListener("change", async (e) => {
    currentWeek = Number(e.target.value);
    syncWeekSelects();
    await refreshTraining();
  });

  document.getElementById("filter-under").addEventListener("change", (e) => {
    filterUnderTarget = e.target.checked;
    renderGrid();
  });

  document.getElementById("btn-save-training").addEventListener("click", saveTraining);
  document.getElementById("btn-import").addEventListener("click", runImport);

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
  } else if (getAdminPw()) {
    document.getElementById("auth-overlay").classList.add("hidden");
    document.getElementById("admin-shell").style.display = "";
    init();
  }
});
