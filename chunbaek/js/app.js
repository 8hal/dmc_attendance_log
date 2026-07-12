/**
 * 춘백 시즌3 SPA — 라우팅·뷰 렌더
 */
(function () {
  const state = {
    selectedMemberId: null,
    selectedNickname: "",
    isProcessing: false,
    profile: null,
    todaySlot: null,
  };

  const VIEWS = {
    welcome: "view-welcome",
    pick: "view-pick",
    profile: "view-profile",
    guide: "view-guide",
    today: "view-today",
    timeline: "view-timeline",
    team: "view-team",
    me: "view-me",
  };

  const TAB_VIEWS = ["today", "timeline", "team", "me"];

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showToast(msg, isError) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.className = "toast show" + (isError ? " error" : "");
    setTimeout(() => { el.className = "toast"; }, 2800);
  }

  function showView(name) {
    Object.values(VIEWS).forEach((id) => {
      document.getElementById(id).classList.remove("active");
    });
    const viewId = VIEWS[name];
    if (viewId) document.getElementById(viewId).classList.add("active");

    const tabBar = document.getElementById("tab-bar");
    const isMain = TAB_VIEWS.includes(name);
    tabBar.classList.toggle("visible", isMain);

    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === name);
    });

    const demoSelect = document.getElementById("demo-screen");
    if (demoSelect) demoSelect.value = name;

    if (name === "pick") loadRoster();
    if (name === "today") loadToday();
    if (name === "timeline") {
      closeTrainingModal();
      renderTimeline();
    }
    if (name === "team") renderTeam();
    if (name === "me") renderMe();

    location.hash = name === "welcome" ? "#/welcome" : `#/${name}`;
  }

  function navigateFromHash() {
    const raw = (location.hash || "#/welcome").replace(/^#\/?/, "");
    const hash = raw || "welcome";
    if (TAB_VIEWS.includes(hash) && getToken()) {
      showView(hash);
      return;
    }
    if (hash === "pick" || hash === "profile" || hash === "guide") {
      showView(hash);
      return;
    }
    if (getToken() && state.profile?.profileComplete) {
      showView("today");
      return;
    }
    showView("welcome");
  }

  async function loadRoster() {
    try {
      const data = await apiGet("members-roster");
      const list = document.getElementById("roster-list");
      if (!data.members?.length) {
        list.innerHTML = '<li class="roster-empty">명단을 불러오지 못했습니다</li>';
        return;
      }
      list.innerHTML = data.members.map((m) => `
        <li class="roster-item" data-id="${m.memberId}" data-nick="${m.nickname}" data-complete="${m.profileComplete}">
          <input type="radio" name="member" class="roster-radio" />
          <span class="roster-name">${m.nickname}</span>
          ${m.profileComplete ? '<span class="roster-badge">가입됨 ↩</span>' : ""}
        </li>
      `).join("");
      list.querySelectorAll(".roster-item").forEach((item) => {
        item.addEventListener("click", () => {
          list.querySelectorAll(".roster-item").forEach((i) => i.classList.remove("selected"));
          item.classList.add("selected");
          item.querySelector(".roster-radio").checked = true;
          state.selectedMemberId = item.dataset.id;
          state.selectedNickname = item.dataset.nick;
          document.getElementById("btn-pick-next").disabled = false;
        });
      });
      filterRoster();
    } catch (e) {
      showToast(e.message, true);
    }
  }

  function filterRoster() {
    const input = document.getElementById("roster-search");
    const q = (input?.value || "").trim().toLowerCase();
    let visible = 0;
    document.querySelectorAll(".roster-item").forEach((item) => {
      const nick = (item.dataset.nick || "").toLowerCase();
      const show = !q || nick.includes(q);
      item.style.display = show ? "" : "none";
      if (show) visible += 1;
    });
    const emptyEl = document.getElementById("roster-empty");
    if (emptyEl) {
      emptyEl.hidden = !(q && visible === 0);
    }
  }

  async function onPickNext() {
    if (!state.selectedMemberId) return;
    const item = document.querySelector(`.roster-item[data-id="${state.selectedMemberId}"]`);
    const complete = item?.dataset.complete === "true";
    try {
      if (complete) {
        const data = await apiPost("link-device", { memberId: state.selectedMemberId });
        setToken(data.token);
        showToast("다시 오신 걸 환영해요");
        state.profile = { profileComplete: true, nickname: data.nickname };
        showView("today");
      } else {
        document.getElementById("profile-nickname").textContent = state.selectedNickname;
        document.getElementById("profile-nick-display").textContent = state.selectedNickname;
        showView("profile");
      }
    } catch (e) {
      showToast(e.message, true);
    }
  }

  function selectedGoalRace() {
    const el = document.querySelector('input[name="goal-race"]:checked');
    return el ? el.value : "";
  }

  function syncGoalRaceNote() {
    const noteEl = document.getElementById("goal-race-note");
    if (!noteEl) return;
    noteEl.hidden = selectedGoalRace() !== "other";
  }

  async function onCreateProfile() {
    const goalRace = selectedGoalRace();
    if (!goalRace) {
      showToast("목표 대회를 선택해 주세요", true);
      return;
    }
    const h = parseInt(document.getElementById("goal-h").value, 10) || 0;
    const m = parseInt(document.getElementById("goal-m").value, 10) || 0;
    const s = parseInt(document.getElementById("goal-s").value, 10) || 0;
    const pbH = parseInt(document.getElementById("pb-h").value, 10);
    const pbM = parseInt(document.getElementById("pb-m").value, 10);
    const pbS = parseInt(document.getElementById("pb-s").value, 10);
    if (h < 2 || h > 7 || m < 0 || m > 59 || s < 0 || s > 59) {
      showToast("목표 기록을 2:00:00 ~ 7:00:00 범위로 입력해 주세요", true);
      return;
    }
    const goalMarathonNetTime = h * 3600 + m * 60 + s;
    let existingPbNetTime = null;
    if (!Number.isNaN(pbH) && pbH > 0) {
      const pm = Number.isNaN(pbM) ? 0 : pbM;
      const ps = Number.isNaN(pbS) ? 0 : pbS;
      existingPbNetTime = pbH * 3600 + pm * 60 + ps;
    }
    try {
      const resolutionText = (document.getElementById("resolution-text").value || "").trim();
      const goalRaceNote = (document.getElementById("goal-race-note").value || "").trim();
      const data = await apiPost("create-profile", {
        memberId: state.selectedMemberId,
        goalRace,
        goalRaceNote: goalRace === "other" ? (goalRaceNote || null) : null,
        goalMarathonNetTime,
        existingPbNetTime,
        resolutionText: resolutionText || null,
      });
      setToken(data.token);
      state.profile = { ...state.profile, resolutionText: resolutionText || null };
      showView("guide");
    } catch (e) {
      showToast(e.message, true);
    }
  }

  function formatIsoDateKo(iso) {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-").map(Number);
    const dow = ["일", "월", "화", "수", "목", "금", "토"][new Date(y, m - 1, d).getDay()];
    return `${m}/${d}(${dow})`;
  }

  function daysUntilKst(isoDate) {
    if (!isoDate) return null;
    const today = new Date();
    const kstToday = new Date(today.getTime() + 9 * 3600000);
    const todayIso = kstToday.toISOString().slice(0, 10);
    const [ty, tm, td] = todayIso.split("-").map(Number);
    const [sy, sm, sd] = isoDate.split("-").map(Number);
    const a = Date.UTC(ty, tm - 1, td);
    const b = Date.UTC(sy, sm - 1, sd);
    return Math.round((b - a) / 86400000);
  }

  function paintStatsHeader(prof) {
    const s = prof.stats || {};
    document.getElementById("hdr-nickname").textContent = `${prof.nickname || "—"}님`;
    const dayIdx = s.seasonDayIndex || 0;
    document.getElementById("hdr-day").textContent = dayIdx > 0
      ? `${dayIdx}일차 / 100일`
      : "시작 전";
    document.getElementById("hdr-attend").textContent =
      `출석 ${s.seasonAttendCount || 0}회 · 출석률 ${s.seasonAttendRate || 0}%`;
    const weekEl = document.getElementById("week-bar");
    const weekCount = s.weekAttendCount || 0;
    const weekTarget = s.weekTarget || 3;
    document.getElementById("week-bar-count").textContent = `${weekCount} / ${weekTarget}회`;
    weekEl.classList.toggle("met", weekTarget > 0 && weekCount >= weekTarget);
  }

  function setTodayPanels({ beforeSeason = false, afterSeason = false, active = true, programOff = false }) {
    document.getElementById("before-season-card").hidden = !beforeSeason;
    document.getElementById("after-season-card").hidden = !afterSeason;
    document.getElementById("today-active").hidden = !active;
    document.getElementById("program-off-msg").hidden = !programOff;
    if (!beforeSeason) {
      document.getElementById("before-season-dday").textContent = "";
    }
    const sat = document.getElementById("saturday-notice");
    if (sat) sat.hidden = true;
  }

  function paintBeforeSeason(prof, slotRes) {
    paintStatsHeader(prof);
    setTodayPanels({ beforeSeason: true, afterSeason: false, active: false, programOff: false });
    const start = slotRes.startDate || "2026-07-20";
    const betaStart = slotRes.betaWeekStartDate || null;
    const betaEnd = slotRes.betaWeekEndDate || null;
    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

    document.getElementById("before-season-title").textContent =
      `${formatIsoDateKo(start)} 시작`;

    const showBeta = betaStart && betaEnd && today < start;
    const betaEl = document.getElementById("before-season-beta");
    if (showBeta) {
      betaEl.hidden = false;
      document.getElementById("before-season-beta-range").textContent =
        `${formatIsoDateKo(betaStart)} ~ ${formatIsoDateKo(betaEnd)}`;
      const daysToBeta = daysUntilKst(betaStart);
      const betaDescEl = document.getElementById("before-season-beta-desc");
      if (daysToBeta !== null && daysToBeta > 0) {
        betaDescEl.textContent =
          `프로필은 지금 미리 완료해 주세요. 출석 체험은 ${formatIsoDateKo(betaStart)}부터 (D-${daysToBeta})`;
        document.getElementById("before-season-desc").textContent =
          "아래 베타 기간에 출석을 연습해 보시고, 불편한 점은 단톡이나 운영진에게 알려 주세요.";
      } else if (daysToBeta === 0) {
        betaDescEl.textContent =
          "오늘부터 홈에서 출석 체험이 가능합니다. 연습용이니 부담 없이 써 보세요.";
        document.getElementById("before-season-desc").textContent =
          `${formatIsoDateKo(start)} 본시즌 시작 전까지 베타로 앱을 미리 익혀 주세요.`;
      } else {
        betaDescEl.textContent =
          "베타 출석 체험 중입니다. 연습용이니 부담 없이 써 보세요.";
        document.getElementById("before-season-desc").textContent =
          `${formatIsoDateKo(start)} 본시즌 시작 전까지 피드백 부탁드립니다.`;
      }
    } else {
      betaEl.hidden = true;
      document.getElementById("before-season-desc").textContent =
        "출정식 전에는 온보딩만 미리 해 두시면 됩니다. 7/20부터 매일 홈에서 출석해 주세요.";
    }

    const days = daysUntilKst(start);
    const ddayEl = document.getElementById("before-season-dday");
    if (days === null) {
      ddayEl.textContent = "";
    } else if (days > 0) {
      ddayEl.textContent = `본시즌 D-${days}`;
    } else if (days === 0) {
      ddayEl.textContent = "오늘 본시즌 시작일";
    } else {
      ddayEl.textContent = "";
    }
    state.todaySlot = null;
  }

  function paintAfterSeason(prof, slotRes) {
    paintStatsHeader(prof);
    setTodayPanels({ beforeSeason: false, afterSeason: true, active: false, programOff: false });
    const end = slotRes.endDate || "";
    if (end) {
      document.getElementById("after-season-desc").textContent =
        `${formatIsoDateKo(end)}까지 100일 프로그램이 진행되었습니다. 출석 기록은 내 100일·나 탭에서 확인할 수 있습니다.`;
    }
    state.todaySlot = null;
  }

  function updateSaturdayNotice(slotDate) {
    const el = document.getElementById("saturday-notice");
    if (!el || !slotDate) return;
    const d = new Date(slotDate + "T12:00:00");
    el.hidden = d.getDay() !== 6;
  }

  function setTodayProgramOff(isOff) {
    const offMsg = document.getElementById("program-off-msg");
    const active = document.getElementById("today-active");
    if (offMsg) offMsg.hidden = !isOff;
    if (active) active.hidden = isOff;
  }

  async function loadToday() {
    try {
      const [prof, slotRes] = await Promise.all([
        apiGet("my-profile", {}, true),
        apiGet("today-slot", {}, true),
      ]);
      state.profile = prof;

      if (slotRes.beforeSeason) {
        paintBeforeSeason(prof, slotRes);
        return;
      }
      if (slotRes.afterSeason) {
        paintAfterSeason(prof, slotRes);
        return;
      }

      state.todaySlot = slotRes.slot || null;
      paintStatsHeader(prof);

      const sl = state.todaySlot;
      if (!sl) {
        setTodayPanels({ beforeSeason: false, afterSeason: false, active: false, programOff: false });
        document.getElementById("before-season-title").textContent = "오늘 훈련 슬롯이 없습니다";
        document.getElementById("before-season-desc").textContent = "운영진에게 문의해 주세요.";
        document.getElementById("before-season-card").hidden = false;
        document.getElementById("before-season-eyebrow").textContent = "안내";
        return;
      }

      setTodayPanels({ beforeSeason: false, afterSeason: false, active: true, programOff: false });
      document.getElementById("before-season-eyebrow").textContent = "100일 준비";

      if (sl.isProgramOff) {
        setTodayPanels({ beforeSeason: false, afterSeason: false, active: false, programOff: true });
        return;
      }

      const d = new Date(sl.date + "T12:00:00");
      const dow = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
      const dayNum = sl.displayDayIndex ?? sl.dayIndex;
      const dayLabel = `${dayNum}일차 · ${sl.date.slice(5).replace("-", "월 ")}일 (${dow})`;
      document.getElementById("today-day").textContent = dayLabel;
      document.getElementById("today-training").textContent =
        "📋 " + (sl.trainingTitle || sl.trainingLabel || "훈련 내용 준비 중");
      const detailEl = document.getElementById("today-training-detail");
      const content = sl.trainingContent || "";
      if (detailEl) {
        detailEl.textContent = content;
        detailEl.style.display = content ? "block" : "none";
      }
      updateSaturdayNotice(sl.date);

      const btn = document.getElementById("btn-attend");
      if (sl.attended) {
        btn.textContent = "출석 완료 ✓";
        btn.classList.add("attend-done");
        btn.disabled = true;
      } else {
        btn.textContent = "✓  출석하기";
        btn.classList.remove("attend-done");
        btn.disabled = false;
      }
    } catch (e) {
      if (PREVIEW_MODE) renderTodayPreview();
      else showToast(e.message, true);
    }
  }

  function renderTodayPreview() {
    const p = MOCK.profile;
    const s = MOCK.profile.stats;
    setTodayProgramOff(false);
    document.getElementById("hdr-nickname").textContent = `${p.nickname}님`;
    document.getElementById("hdr-day").textContent = `${s.seasonDayIndex}일차 / 100일`;
    document.getElementById("hdr-attend").textContent =
      `출석 ${s.seasonAttendCount}회 · 출석률 ${s.seasonAttendRate}%`;
    document.getElementById("today-day").textContent = "42일차 · 4월 11일 (토)";
    document.getElementById("today-training").textContent = "📋 동마클 토요일 훈련";
    updateSaturdayNotice(MOCK.todaySlot.date);
    const weekEl = document.getElementById("week-bar");
    document.getElementById("week-bar-count").textContent = `${s.weekAttendCount} / ${s.weekTarget}회`;
    weekEl.classList.toggle("met", s.weekAttendCount >= s.weekTarget);
  }

  async function onAttend() {
    if (state.isProcessing || !state.todaySlot) return;
    state.isProcessing = true;
    const btn = document.getElementById("btn-attend");
    btn.disabled = true;
    try {
      await apiPost("save-attendance", {
        slotId: state.todaySlot.dayIndex,
        attended: true,
        note: document.getElementById("note-input").value || "",
      }, true);
      const dayNum = state.todaySlot.displayDayIndex ?? state.todaySlot.dayIndex;
      showToast(`${dayNum}일차 출석 완료`);
      await loadToday();
    } catch (e) {
      showToast(e.message, true);
      btn.disabled = false;
    } finally {
      state.isProcessing = false;
    }
  }

  function renderTimeline() {
    const container = document.getElementById("timeline-weeks");
    container.innerHTML = '<p class="section-sub">불러오는 중…</p>';
    apiGet("my-timeline", {}, true)
      .then((data) => paintTimeline(data.weeks || MOCK.timeline))
      .catch(() => paintTimeline(MOCK.timeline));
  }

  function slotStatusLabel(status, photo) {
    if (status === "attend") return `출석 완료${photo ? " · 사진 있음" : ""}`;
    if (status === "exception") return "예외 처리됨";
    if (status === "off") return "프로그램 휴무";
    if (status === "today") return "오늘";
    if (status === "future") return "예정";
    return "미출석";
  }

  function slotStatusIcon(status, photo) {
    if (status === "attend") return `✓${photo ? " 📷" : ""}`;
    if (status === "exception") return "예외";
    if (status === "off") return "—";
    if (status === "today") return "오늘";
    return "○";
  }

  function openTrainingModal(slot) {
    const title = slot.title || slot.label || "—";
    document.getElementById("timeline-modal-title").textContent = title;
    document.getElementById("timeline-modal-meta").textContent =
      `${slot.displayDayIndex ?? slot.dayIndex}일차 · ${(slot.date || "").slice(5).replace("-", "월 ")}일`;
    const contentEl = document.getElementById("timeline-modal-content");
    contentEl.textContent = slot.content || "";
    contentEl.style.display = slot.content ? "block" : "none";
    const noteEl = document.getElementById("timeline-modal-note");
    const note = (slot.note || "").trim();
    if (noteEl) {
      if (note) {
        noteEl.textContent = `메모: ${note}`;
        noteEl.hidden = false;
      } else {
        noteEl.textContent = "";
        noteEl.hidden = true;
      }
    }
    document.getElementById("timeline-modal-status").textContent =
      slotStatusLabel(slot.status, slot.photo);
    const modal = document.getElementById("timeline-modal");
    modal.hidden = false;
  }

  function closeTrainingModal() {
    document.getElementById("timeline-modal").hidden = true;
  }

  function bindTimelineEvents() {
    const container = document.getElementById("timeline-weeks");
    container.querySelectorAll(".week-header").forEach((hdr) => {
      hdr.addEventListener("click", () => {
        const block = hdr.closest(".week-block");
        if (block) block.classList.toggle("collapsed");
        const arrow = hdr.querySelector(".week-arrow");
        if (arrow) {
          arrow.textContent = block?.classList.contains("collapsed") ? "▶" : "▼";
        }
      });
    });
    container.querySelectorAll(".slot-row").forEach((row) => {
      row.addEventListener("click", () => {
        const idx = row.dataset.slotIndex;
        const week = row.dataset.week;
        if (!idx || !week) return;
        const weekBlock = container.querySelector(`.week-block[data-week="${week}"]`);
        const slot = (weekBlock?._slots || [])[Number(idx)];
        if (slot) openTrainingModal(slot);
      });
    });
  }

  function paintTimeline(weeks) {
    const container = document.getElementById("timeline-weeks");
    if (!weeks.length) {
      container.innerHTML = '<p class="section-sub">아직 표시할 주차가 없습니다.</p>';
      return;
    }
    container.innerHTML = weeks.map((w) => {
      const collapsed = !!w.collapsed;
      const slots = w.slots || [];
      return `
      <div class="week-block${collapsed ? " collapsed" : ""}" data-week="${w.week}">
        <div class="week-header">
          <span class="week-arrow">${collapsed ? "▶" : "▼"}</span>
          <span>${w.weekLabel || `${w.week}주차`}</span>
          <span class="week-range">${w.range || ""}</span>
          <span class="week-dots">${w.dots || ""}</span>
          <span class="week-summary">${w.attendSummary || ""}</span>
        </div>
        <div class="week-slots">
          ${slots.map((s, i) => {
            const title = s.title || s.label || "—";
            const content = s.content || "";
            const note = (s.note || "").trim();
            const off = s.status === "off";
            return `
            <div class="slot-row ${s.status === "today" ? "today" : ""}${off ? " off-day" : ""}"
                 data-week="${w.week}" data-slot-index="${i}" role="button" tabindex="0">
              <span class="slot-day">${s.displayDayIndex ?? s.dayIndex}일</span>
              <div class="slot-training">
                <div class="slot-training-title">${escapeHtml(title)}</div>
                <div class="slot-training-content">${escapeHtml(content)}</div>
                ${note ? `<div class="slot-training-note">${escapeHtml(note)}</div>` : ""}
              </div>
              <span class="slot-status">${slotStatusIcon(s.status, s.photo)}</span>
            </div>`;
          }).join("")}
        </div>
      </div>`;
    }).join("");

    weeks.forEach((w) => {
      const block = container.querySelector(`.week-block[data-week="${w.week}"]`);
      if (block) block._slots = w.slots || [];
    });

    bindTimelineEvents();
  }

  function renderTeam() {
    const summaryEl = document.getElementById("team-summary");
    const listEl = document.getElementById("team-list");
    summaryEl.innerHTML = '<p class="section-sub">불러오는 중…</p>';
    listEl.innerHTML = "";
    apiGet("team-summary", {}, true)
      .then((data) => paintTeam(data))
      .catch(() => paintTeam(MOCK.team));
  }

  function paintTeam(t) {
    const members = (t.members || []).filter((m) => m.profileComplete !== false);
    const count = members.length;
    const weekMet = members.filter((m) => m.met).length;
    const seasonRate = count > 0
      ? Math.round(members.reduce((sum, m) => sum + (m.seasonAttendRate || 0), 0) / count)
      : (t.seasonRate || 0);
    document.getElementById("team-summary").innerHTML = `
      <div>시즌 출석률 <strong>${seasonRate}%</strong> (팀 평균)</div>
      <div>이번 주 3회 달성 <strong>${weekMet}/${count}명</strong></div>
    `;
    if (!count) {
      document.getElementById("team-list").innerHTML =
        '<p class="section-sub">아직 프로필을 만든 멤버가 없습니다.</p>';
      return;
    }
    document.getElementById("team-list").innerHTML = members.map((m) => `
      <div class="team-row">
        <div>
          <strong>${m.nickname}</strong>
          <div class="team-goal">목표 ${m.goal}${m.goalRaceLabel ? ` · ${escapeHtml(m.goalRaceLabel)}` : ""}</div>
        </div>
        <div style="text-align:right">
          <div class="team-bar">${m.bar}</div>
          <div class="team-goal">${m.week} ${m.met ? "✓" : ""}</div>
        </div>
      </div>
    `).join("");
  }

  function renderMe() {
    const p = state.profile || MOCK.profile;
    const s = p.stats || MOCK.profile.stats;
    document.getElementById("me-dl").innerHTML = `
      <dt>닉네임</dt><dd>${p.nickname || "김러너"}</dd>
      <dt>목표 대회</dt><dd>${p.goalRaceLabel || "—"}</dd>
      <dt>풀 목표</dt><dd>${formatNetTime(p.goalMarathonNetTime)}</dd>
      <dt>기존 PB</dt><dd>${formatNetTime(p.existingPbNetTime)}</dd>
      <dt>각오</dt><dd class="profile-intro">${p.resolutionText ? escapeHtml(p.resolutionText) : "—"}</dd>
      <dt>시즌 출석</dt><dd>${s.seasonAttendCount || 0}회 (출석률 ${s.seasonAttendRate || 0}%)</dd>
      <dt>이번 주</dt><dd>${s.weekAttendCount || 0}/${s.weekTarget || 3}회</dd>
    `;
  }

  function goHome() {
    if (getToken()) {
      showView("today");
    } else {
      showView("welcome");
    }
  }

  function init() {
    document.getElementById("brand-bar").addEventListener("click", goHome);
    document.getElementById("brand-bar").addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        goHome();
      }
    });

    document.getElementById("roster-search").addEventListener("input", filterRoster);

    document.getElementById("btn-start").addEventListener("click", () => showView("pick"));
    document.getElementById("btn-pick-next").addEventListener("click", onPickNext);
    document.getElementById("btn-create-profile").addEventListener("click", onCreateProfile);
    document.querySelectorAll('input[name="goal-race"]').forEach((el) => {
      el.addEventListener("change", syncGoalRaceNote);
    });
    syncGoalRaceNote();
    document.getElementById("btn-guide-done").addEventListener("click", () => showView("today"));
    document.getElementById("btn-attend").addEventListener("click", onAttend);
    document.getElementById("btn-switch-user").addEventListener("click", () => {
      setToken(null);
      state.profile = null;
      showView("welcome");
    });

    document.getElementById("timeline-modal-close").addEventListener("click", closeTrainingModal);
    document.getElementById("timeline-modal").addEventListener("click", (e) => {
      if (e.target.id === "timeline-modal") closeTrainingModal();
    });

    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => showView(btn.dataset.tab));
    });

    document.getElementById("demo-screen").addEventListener("change", (e) => {
      const v = e.target.value;
      if (TAB_VIEWS.includes(v)) {
        if (!getToken()) setToken("preview-token");
      }
      showView(v);
    });

    if (PREVIEW_MODE) {
      document.getElementById("preview-banner").style.display = "block";
      document.getElementById("demo-nav").style.display = "block";
      const hint = document.getElementById("preview-hint");
      if (hint) hint.hidden = false;
    }

    window.addEventListener("hashchange", navigateFromHash);

    if (PREVIEW_MODE && !location.hash) {
      /* 온보딩 플로우 확인용 — 첫 진입은 환영 화면 */
      showView("welcome");
    } else {
      navigateFromHash();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
