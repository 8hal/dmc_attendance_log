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
    if (name === "timeline") renderTimeline();
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

  async function onCreateProfile() {
    const h = parseInt(document.getElementById("goal-h").value, 10) || 0;
    const m = parseInt(document.getElementById("goal-m").value, 10) || 0;
    const pbH = parseInt(document.getElementById("pb-h").value, 10);
    const pbM = parseInt(document.getElementById("pb-m").value, 10);
    if (h < 2 || h > 7 || m < 0 || m > 59) {
      showToast("목표 기록을 2~7시간 범위로 입력해 주세요", true);
      return;
    }
    const goalMarathonNetTime = h * 3600 + m * 60;
    let existingPbNetTime = null;
    if (!Number.isNaN(pbH) && pbH > 0) {
      existingPbNetTime = pbH * 3600 + (pbM || 0) * 60;
    }
    try {
      const data = await apiPost("create-profile", {
        memberId: state.selectedMemberId,
        goalMarathonNetTime,
        existingPbNetTime,
      });
      setToken(data.token);
      showView("guide");
    } catch (e) {
      showToast(e.message, true);
    }
  }

  async function loadToday() {
    try {
      const [prof, slot] = await Promise.all([
        apiGet("my-profile", {}, true),
        apiGet("today-slot", {}, true),
      ]);
      state.profile = prof;
      state.todaySlot = slot.slot || slot;

      const s = prof.stats || {};
      document.getElementById("hdr-day").textContent = `${s.seasonDayIndex || 42}일차 / 100일`;
      document.getElementById("hdr-attend").textContent =
        `출석 ${s.seasonAttendCount || 0}회 · 출석률 ${s.seasonAttendRate || 0}%`;

      const sl = state.todaySlot;
      if (sl.isProgramOff) {
        document.getElementById("today-body").innerHTML =
          '<p class="section-sub" style="text-align:center;padding:32px">오늘은 프로그램 휴무일입니다</p>';
        return;
      }

      const d = new Date(sl.date + "T12:00:00");
      const dow = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
      document.getElementById("today-day").textContent =
        `${sl.dayIndex}일차 · ${sl.date.slice(5).replace("-", "월 ")}일 (${dow})`;
      document.getElementById("today-training").textContent = "📋 " + (sl.trainingLabel || "");

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

      document.getElementById("week-bar").textContent =
        `이번 주  ${s.weekAttendCount || 0} / ${s.weekTarget || 3}회 출석`;
    } catch (e) {
      if (PREVIEW_MODE) renderTodayPreview();
      else showToast(e.message, true);
    }
  }

  function renderTodayPreview() {
    const s = MOCK.profile.stats;
    document.getElementById("hdr-day").textContent = `${s.seasonDayIndex}일차 / 100일`;
    document.getElementById("hdr-attend").textContent =
      `출석 ${s.seasonAttendCount}회 · 출석률 ${s.seasonAttendRate}%`;
    document.getElementById("today-day").textContent = "42일차 · 4월 15일 (화)";
    document.getElementById("today-training").textContent = "📋 5km 인터벌 + 코어 20분";
    document.getElementById("week-bar").textContent = `이번 주  ${s.weekAttendCount} / ${s.weekTarget}회 출석`;
  }

  async function onAttend() {
    if (state.isProcessing || !state.todaySlot) return;
    state.isProcessing = true;
    const btn = document.getElementById("btn-attend");
    btn.disabled = true;
    try {
      await apiPost("save-attendance", {
        slotId: state.todaySlot.dayIndex || 42,
        attended: true,
        note: document.getElementById("note-input").value || "",
      }, true);
      showToast(`${state.todaySlot.dayIndex || 42}일차 출석 완료 · 이번 주 3/3`);
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
    const weeks = MOCK.timeline;
    container.innerHTML = weeks.map((w) => `
      <div class="week-block">
        <div class="week-header" data-week="${w.week}">
          <span>${w.collapsed ? "▶" : "▼"}</span>
          <span>${w.week}주차</span>
          <span class="week-dots">${w.dots}</span>
          <span class="week-summary">${w.attendSummary}</span>
        </div>
        ${w.collapsed ? "" : `<div class="week-slots">
          ${w.slots.map((s) => `
            <div class="slot-row ${s.status === "today" ? "today" : ""}">
              <span>${s.dayIndex}일</span>
              <span>${s.label}</span>
              <span class="slot-status">${
                s.status === "attend" ? "✓" + (s.photo ? " 📷" : "") :
                s.status === "off" ? "—" :
                s.status === "today" ? "오늘" : "○"
              }</span>
            </div>
          `).join("")}
        </div>`}
      </div>
    `).join("");
  }

  function renderTeam() {
    const t = MOCK.team;
    document.getElementById("team-summary").innerHTML = `
      <div>시즌 출석률 <strong>${t.seasonRate}%</strong> (팀 평균)</div>
      <div>이번 주 3회 달성 <strong>${t.weekMetCount}/${t.participantCount}명</strong></div>
    `;
    document.getElementById("team-list").innerHTML = t.members.map((m) => `
      <div class="team-row">
        <div>
          <strong>${m.nickname}</strong>
          <div class="team-goal">목표 ${m.goal}</div>
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
      <dt>풀 목표</dt><dd>${formatNetTime(p.goalMarathonNetTime)}</dd>
      <dt>기존 PB</dt><dd>${formatNetTime(p.existingPbNetTime)}</dd>
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
    document.getElementById("btn-guide-done").addEventListener("click", () => showView("today"));
    document.getElementById("btn-attend").addEventListener("click", onAttend);
    document.getElementById("btn-switch-user").addEventListener("click", () => {
      setToken(null);
      state.profile = null;
      showView("welcome");
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
