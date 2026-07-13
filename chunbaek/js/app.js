/**
 * 춘백 시즌3 SPA — 라우팅·뷰 렌더
 */
(function () {
  const TIMELINE_PHOTO_MAX = 5;

  const state = {
    selectedMemberId: null,
    selectedNickname: "",
    isProcessing: false,
    profile: null,
    todaySlot: null,
    profileFormMode: "create",
    teamMembers: [],
    timelineSlot: null,
    timelinePhotoRequired: false,
    timelinePhotos: [],
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
    if (name === "team") {
      closeTeamProfileModal();
      renderTeam();
    }
    if (name === "me") renderMe();

    const main = document.querySelector(".main");
    if (main) main.scrollTop = 0;

    location.hash = name === "welcome" ? "#/welcome" : `#/${name}`;
  }

  async function ensureSession() {
    if (!getToken() || state.profile?.profileComplete) return;
    try {
      state.profile = await apiGet("my-profile", {}, true);
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        setToken(null);
        state.profile = null;
      }
    }
  }

  async function navigateFromHash() {
    const raw = (location.hash || "").replace(/^#\/?/, "");
    const hash = raw || "";

    if (hash === "pick" || hash === "profile" || hash === "guide") {
      showView(hash);
      return;
    }

    await ensureSession();

    const loggedIn = getToken() && state.profile?.profileComplete;
    if (loggedIn) {
      const dest = TAB_VIEWS.includes(hash) ? hash : "today";
      showView(dest);
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
        if (!setToken(data.token)) {
          showToast("로그인 정보를 저장하지 못했습니다. 새로고침 시 다시 선택해야 할 수 있습니다", true);
        }
        showToast("다시 오신 걸 환영해요");
        state.profile = { profileComplete: true, nickname: data.nickname };
        showView("today");
      } else {
        state.profileFormMode = "create";
        document.getElementById("profile-nickname").textContent = state.selectedNickname;
        document.getElementById("profile-nick-display").textContent = state.selectedNickname;
        setProfileFormUi();
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

  function formatBodyWeightKg(kg) {
    if (kg == null || !Number.isFinite(Number(kg))) return "—";
    const n = Number(kg);
    const text = Number.isInteger(n) ? String(n) : String(n);
    return `${text} kg`;
  }

  function teamWeightDisplay(m, isMe) {
    if (isMe && state.profile?.goalBodyWeightKg != null) {
      const label = formatBodyWeightKg(state.profile.goalBodyWeightKg);
      if (state.profile.goalBodyWeightPrivate) return `${label} (팀 비공개)`;
      return label;
    }
    if (m.goalBodyWeightKg != null) return formatBodyWeightKg(m.goalBodyWeightKg);
    if (m.goalBodyWeightPrivate) return "비공개";
    return "—";
  }

  function syncGoalWeightPrivate() {
    const input = document.getElementById("goal-weight-kg");
    const priv = document.getElementById("goal-weight-private");
    if (!input || !priv) return;
    const hasWeight = String(input.value || "").trim() !== "";
    priv.disabled = !hasWeight;
    if (!hasWeight) priv.checked = false;
  }

  function splitNetTime(seconds) {
    if (seconds === null || seconds === undefined || seconds === "") {
      return { h: "", m: "", s: "" };
    }
    const total = Number(seconds);
    if (!Number.isFinite(total) || total < 0) return { h: "", m: "", s: "" };
    return {
      h: Math.floor(total / 3600),
      m: Math.floor((total % 3600) / 60),
      s: total % 60,
    };
  }

  function setProfileFormUi() {
    const isEdit = state.profileFormMode === "edit";
    const nick = state.profile?.nickname || state.selectedNickname || "—";
    const titleEl = document.getElementById("profile-section-title");
    const subEl = document.getElementById("profile-section-sub");
    const submitBtn = document.getElementById("btn-create-profile");
    const cancelBtn = document.getElementById("btn-profile-cancel");

    if (isEdit) {
      titleEl.textContent = "프로필 수정";
      subEl.textContent = "목표 대회·기록·각오를 수정할 수 있습니다.";
      document.getElementById("profile-nick-display").textContent = nick;
      submitBtn.textContent = "저장";
      if (cancelBtn) cancelBtn.hidden = false;
    } else {
      titleEl.textContent = `${nick}님의 프로필`;
      subEl.textContent = "자신의 가을 시즌 목표와 간단한 각오·자기소개를 남겨 주세요";
      document.getElementById("profile-nick-display").textContent = nick;
      submitBtn.textContent = "프로필 만들기";
      if (cancelBtn) cancelBtn.hidden = true;
    }
  }

  function fillProfileForm(p) {
    const goalRace = p.goalRace || "chuncheon";
    document.querySelectorAll('input[name="goal-race"]').forEach((el) => {
      el.checked = el.value === goalRace;
    });
    const goal = splitNetTime(p.goalMarathonNetTime);
    document.getElementById("goal-h").value = goal.h !== "" ? goal.h : 4;
    document.getElementById("goal-m").value = goal.m !== "" ? goal.m : 30;
    document.getElementById("goal-s").value = goal.s !== "" ? goal.s : 0;
    const pb = splitNetTime(p.existingPbNetTime);
    document.getElementById("pb-h").value = pb.h;
    document.getElementById("pb-m").value = pb.m;
    document.getElementById("pb-s").value = pb.s;
    document.getElementById("goal-race-note").value = p.goalRaceNote || "";
    document.getElementById("resolution-text").value = p.resolutionText || "";
    const weightInput = document.getElementById("goal-weight-kg");
    const weightPrivate = document.getElementById("goal-weight-private");
    if (weightInput) {
      weightInput.value = p.goalBodyWeightKg != null ? String(p.goalBodyWeightKg) : "";
    }
    if (weightPrivate) {
      weightPrivate.checked = !!p.goalBodyWeightPrivate;
    }
    syncGoalWeightPrivate();
    syncGoalRaceNote();
  }

  function readProfileFormFromDom() {
    const goalRace = selectedGoalRace();
    if (!goalRace) {
      return { error: "목표 대회를 선택해 주세요" };
    }
    const h = parseInt(document.getElementById("goal-h").value, 10) || 0;
    const m = parseInt(document.getElementById("goal-m").value, 10) || 0;
    const s = parseInt(document.getElementById("goal-s").value, 10) || 0;
    const pbH = parseInt(document.getElementById("pb-h").value, 10);
    const pbM = parseInt(document.getElementById("pb-m").value, 10);
    const pbS = parseInt(document.getElementById("pb-s").value, 10);
    if (h < 2 || h > 7 || m < 0 || m > 59 || s < 0 || s > 59) {
      return { error: "목표 기록을 2:00:00 ~ 7:00:00 범위로 입력해 주세요" };
    }
    const goalMarathonNetTime = h * 3600 + m * 60 + s;
    let existingPbNetTime = null;
    if (!Number.isNaN(pbH) && pbH > 0) {
      const pm = Number.isNaN(pbM) ? 0 : pbM;
      const ps = Number.isNaN(pbS) ? 0 : pbS;
      existingPbNetTime = pbH * 3600 + pm * 60 + ps;
    }
    const resolutionText = (document.getElementById("resolution-text").value || "").trim();
    const goalRaceNote = (document.getElementById("goal-race-note").value || "").trim();
    const weightRaw = String(document.getElementById("goal-weight-kg")?.value || "").trim();
    let goalBodyWeightKg = null;
    let goalBodyWeightPrivate = false;
    if (weightRaw) {
      const w = Number(weightRaw);
      if (!Number.isFinite(w) || w < 30 || w > 200) {
        return { error: "목표 몸무게는 30~200kg 범위로 입력해 주세요" };
      }
      goalBodyWeightKg = Math.round(w * 10) / 10;
      goalBodyWeightPrivate = !!document.getElementById("goal-weight-private")?.checked;
    }
    return {
      goalRace,
      goalRaceNote: goalRace === "other" ? (goalRaceNote || null) : null,
      goalMarathonNetTime,
      existingPbNetTime,
      resolutionText: resolutionText || null,
      goalBodyWeightKg,
      goalBodyWeightPrivate,
    };
  }

  async function openProfileEdit() {
    if (state.isProcessing) {
      showToast("처리 중입니다. 잠시 후 다시 시도해 주세요", true);
      return;
    }
    state.profileFormMode = "edit";
    setProfileFormUi();
    showView("profile");
    try {
      let p = state.profile;
      if (!p?.profileComplete || p.goalMarathonNetTime == null) {
        p = await apiGet("my-profile", {}, true);
        state.profile = p;
      }
      if (!p.profileComplete) {
        showToast("프로필을 먼저 만든 뒤 수정할 수 있습니다", true);
        showView("me");
        return;
      }
      fillProfileForm(p);
      setProfileFormUi();
    } catch (e) {
      showToast(e.message, true);
      showView("me");
    }
  }

  async function onCreateProfile() {
    const form = readProfileFormFromDom();
    if (form.error) {
      showToast(form.error, true);
      return;
    }
    try {
      const data = await apiPost("create-profile", {
        memberId: state.selectedMemberId,
        ...form,
      });
      if (!setToken(data.token)) {
        showToast("로그인 정보를 저장하지 못했습니다. 새로고침 시 다시 선택해야 할 수 있습니다", true);
      }
      state.profile = {
        profileComplete: true,
        nickname: data.nickname,
        resolutionText: form.resolutionText,
      };
      showView("guide");
    } catch (e) {
      showToast(e.message, true);
    }
  }

  async function onUpdateProfile() {
    if (state.isProcessing) return;
    const form = readProfileFormFromDom();
    if (form.error) {
      showToast(form.error, true);
      return;
    }
    state.isProcessing = true;
    try {
      const data = await apiPost("update-profile", form, true);
      state.profile = data;
      showToast("프로필이 저장되었습니다");
      renderMe();
      paintStatsHeader(data);
      showView("me");
    } catch (e) {
      showToast(e.message, true);
    } finally {
      state.isProcessing = false;
    }
  }

  async function onProfileSubmit() {
    if (state.profileFormMode === "edit") {
      await onUpdateProfile();
    } else {
      await onCreateProfile();
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
    const dayEl = document.getElementById("hdr-day");
    if (dayIdx > 0) {
      dayEl.textContent = s.inBetaWeek
        ? `베타 ${dayIdx}일차`
        : `${dayIdx}일차 / 100일`;
    } else {
      dayEl.textContent = "시작 전";
    }
    const attendSuffix = s.inBetaWeek ? " (0주차 체험)" : "";
    document.getElementById("hdr-attend").textContent =
      `출석 ${s.seasonAttendCount || 0}회 · 출석률 ${s.seasonAttendRate || 0}%${attendSuffix}`;
    const weekEl = document.getElementById("week-bar");
    const weekCount = s.weekAttendCount || 0;
    const weekTarget = s.weekTarget || 3;
    document.getElementById("week-bar-count").textContent = `${weekCount} / ${weekTarget}회`;
    weekEl.classList.toggle("met", weekTarget > 0 && weekCount >= weekTarget);
  }

  function setElementVisible(el, visible) {
    if (!el) return;
    el.hidden = !visible;
    el.style.display = visible ? "" : "none";
  }

  function setTodayPanels({ beforeSeason = false, afterSeason = false, active = true, programOff = false }) {
    document.getElementById("before-season-card").hidden = !beforeSeason;
    document.getElementById("after-season-card").hidden = !afterSeason;
    document.getElementById("today-active").hidden = !active;
    document.getElementById("program-off-msg").hidden = !programOff;
    if (!beforeSeason) {
      document.getElementById("before-season-dday").textContent = "";
    }
    setElementVisible(document.getElementById("saturday-notice"), false);
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
    if (!el) return;
    if (!slotDate) {
      setElementVisible(el, false);
      return;
    }
    const [y, m, d] = slotDate.split("-").map(Number);
    setElementVisible(el, new Date(y, m - 1, d).getDay() === 6);
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
        updateSaturdayNotice(null);
        paintBeforeSeason(prof, slotRes);
        return;
      }
      if (slotRes.afterSeason) {
        updateSaturdayNotice(null);
        paintAfterSeason(prof, slotRes);
        return;
      }

      state.todaySlot = enrichTodaySlot(slotRes.slot || null, slotRes);
      paintStatsHeader(prof);
      updateSaturdayNotice(null);

      const sl = state.todaySlot;
      if (!sl) {
        setTodayPanels({ beforeSeason: false, afterSeason: false, active: false, programOff: false });
        const betaNoSlot = !!slotRes.betaNoSlotToday;
        document.getElementById("before-season-title").textContent = betaNoSlot
          ? "오늘 0주차 훈련이 아직 등록되지 않았습니다"
          : "오늘 훈련 슬롯이 없습니다";
        document.getElementById("before-season-desc").textContent = betaNoSlot
          ? "운영진이 admin에서 0주차(베타) 훈련을 저장하면 여기에 표시됩니다."
          : "운영진에게 문의해 주세요.";
        document.getElementById("before-season-card").hidden = false;
        const eyebrow = document.getElementById("before-season-eyebrow");
        if (eyebrow) eyebrow.textContent = betaNoSlot ? "0주차 베타" : "안내";
        return;
      }

      setTodayPanels({ beforeSeason: false, afterSeason: false, active: true, programOff: false });

      if (sl.isProgramOff) {
        setTodayPanels({ beforeSeason: false, afterSeason: false, active: false, programOff: true });
        return;
      }

      paintTodaySlot(sl, slotRes);

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
      console.error("[chunbaek] loadToday failed", e);
      setTodayPanels({ beforeSeason: false, afterSeason: false, active: true, programOff: false });
      paintTodaySlot(null);
      if (PREVIEW_MODE) renderTodayPreview();
      else showToast(e.message, true);
    }
  }

  function kstTodayIso() {
    return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  }

  function addDaysIso(iso, offset) {
    const [y, m, d] = iso.split("-").map(Number);
    const ms = Date.UTC(y, m - 1, d) + offset * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }

  function normalizeClientDate(value) {
    if (!value) return "";
    if (typeof value === "string") return value.slice(0, 10);
    if (typeof value === "object") {
      const sec = value._seconds ?? value.seconds;
      if (sec != null) return new Date(sec * 1000).toISOString().slice(0, 10);
    }
    return "";
  }

  function betaStartFromSlotRes(slotRes) {
    if (slotRes?.betaWeekStartDate) return slotRes.betaWeekStartDate;
    if (slotRes?.startDate) return addDaysIso(slotRes.startDate, -7);
    return "2026-07-13";
  }

  function resolveSlotDateForPaint(sl, slotRes) {
    const direct = normalizeClientDate(sl?.date);
    if (direct) return direct;
    return deriveBetaDate(sl, slotRes);
  }

  function enrichTodaySlot(sl, slotRes) {
    if (!sl) return sl;
    const date = resolveSlotDateForPaint(sl, slotRes);
    if (date) sl.date = date;
    if (sl.dayIndex == null && sl.slotId != null) sl.dayIndex = sl.slotId;
    return sl;
  }

  function paintTodaySlot(sl, slotRes = {}) {
    const date = resolveSlotDateForPaint(sl, slotRes);
    if (!sl || !date) {
      document.getElementById("today-day").textContent = "오늘 훈련 정보를 불러오지 못했습니다";
      document.getElementById("today-training").textContent =
        slotRes.betaNoSlotToday
          ? "0주차 슬롯이 DB에 없습니다. seed-chunbaek-week0 실행 후 admin에서 훈련을 저장해 주세요."
          : "잠시 후 다시 시도하거나 운영진에게 문의해 주세요.";
      const detailEl = document.getElementById("today-training-detail");
      if (detailEl) {
        detailEl.textContent = "";
        detailEl.style.display = "none";
      }
      return;
    }

    const [y, m, d] = String(date).slice(0, 10).split("-").map(Number);
    const dow = ["일", "월", "화", "수", "목", "금", "토"][new Date(y, m - 1, d).getDay()];
    const dayNum = sl.displayDayIndex ?? sl.dayIndex;
    const dayLabel = `${dayNum}일차 · ${String(date).slice(5, 7)}월 ${String(date).slice(8, 10)}일 (${dow})`;
    document.getElementById("today-day").textContent = dayLabel;

    const title = sl.trainingTitle || sl.trainingLabel || "";
    document.getElementById("today-training").textContent = title
      ? `📋 ${title}`
      : "📋 훈련 제목이 아직 없습니다 (admin에서 0주차 저장 필요)";

    const detailEl = document.getElementById("today-training-detail");
    const content = sl.trainingContent || "";
    if (detailEl) {
      detailEl.textContent = content;
      detailEl.style.display = content ? "block" : "none";
    }
    updateSaturdayNotice(date);
  }

  function deriveBetaDate(sl, slotRes) {
    if (!sl) return "";
    const betaStart = betaStartFromSlotRes(slotRes);
    const di = sl.dayIndex ?? sl.slotId;
    let offset = null;
    if (Number.isFinite(di) && di >= 901 && di <= 907) offset = di - 901;
    else if (sl.displayDayIndex >= 1 && sl.displayDayIndex <= 7) {
      offset = sl.displayDayIndex - 1;
    }
    if (offset != null) return addDaysIso(betaStart, offset);
    if (slotRes?.betaWeek) return kstTodayIso();
    return "";
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
        slotId: state.todaySlot.dayIndex ?? state.todaySlot.slotId,
        attended: true,
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
      .then((data) => {
        state.timelinePhotoRequired = !!data.photoRequired;
        paintTimeline(data.weeks || MOCK.timeline);
      })
      .catch(() => {
        state.timelinePhotoRequired = false;
        paintTimeline(MOCK.timeline);
      });
  }

  function getSlotPhotoUrls(slot) {
    if (!slot) return [];
    if (Array.isArray(slot.photoUrls) && slot.photoUrls.length) return slot.photoUrls.slice(0, TIMELINE_PHOTO_MAX);
    if (slot.photoUrl) return [slot.photoUrl];
    return [];
  }

  function clearTimelinePhotoPicker() {
    state.timelinePhotos.forEach((item) => {
      if (item.kind === "pending" && item.objectUrl) URL.revokeObjectURL(item.objectUrl);
    });
    state.timelinePhotos = [];
    const fileInput = document.getElementById("timeline-modal-photo-file");
    if (fileInput) fileInput.value = "";
    renderTimelinePhotoGrid();
  }

  function renderTimelinePhotoGrid() {
    const grid = document.getElementById("timeline-modal-photo-grid");
    const pickLabel = document.getElementById("timeline-modal-photo-pick");
    const countEl = document.getElementById("timeline-modal-photo-count");
    if (!grid) return;

    grid.innerHTML = state.timelinePhotos.map((item, index) => {
      const src = item.kind === "url" ? item.url : item.objectUrl;
      return `<div class="timeline-photo-thumb">
        <img src="${escapeAttr(src)}" alt="출석 사진 ${index + 1}" />
        <button type="button" class="timeline-photo-thumb-remove" data-photo-remove="${index}" aria-label="사진 제거">×</button>
      </div>`;
    }).join("");

    const count = state.timelinePhotos.length;
    if (countEl) countEl.textContent = count ? `${count}/${TIMELINE_PHOTO_MAX}` : "";
    if (pickLabel) pickLabel.hidden = count >= TIMELINE_PHOTO_MAX;
  }

  function renderReadonlyPhotoGrid(urls) {
    const wrap = document.getElementById("timeline-modal-photo-readonly");
    if (!wrap) return;
    if (!urls.length) {
      wrap.hidden = true;
      wrap.innerHTML = "";
      return;
    }
    wrap.hidden = false;
    wrap.innerHTML = urls.map((url, index) => (
      `<div class="timeline-photo-thumb">
        <img src="${escapeAttr(url)}" alt="출석 사진 ${index + 1}" />
      </div>`
    )).join("");
  }

  function removeTimelinePhotoAt(index) {
    const item = state.timelinePhotos[index];
    if (!item) return;
    if (item.kind === "pending" && item.objectUrl) URL.revokeObjectURL(item.objectUrl);
    state.timelinePhotos.splice(index, 1);
    renderTimelinePhotoGrid();
  }

  function formatSlotDateMeta(slot) {
    const di = slot.displayDayIndex ?? slot.dayIndex;
    const date = slot.date || "";
    if (!date) return `${di}일차`;
    const [, m, d] = date.split("-").map(Number);
    const dow = ["일", "월", "화", "수", "목", "금", "토"][
      new Date(date.replace(/-/g, "/")).getDay()
    ];
    return `${di}일차 · ${m}/${d} (${dow})`;
  }

  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;");
  }

  function timelineEditHint(slot) {
    if (slot.status === "future") return "아직 출석할 수 없는 날입니다.";
    if (slot.status === "off") return "프로그램 휴무일입니다.";
    if (slot.exception) return "예외 처리된 날입니다. 변경은 운영진에게 문의해 주세요.";
    if (slot.editLocked) return "이번 주 출석 수정 마감이 지났습니다 (일요일 23:59 KST).";
    return "이번 주 일요일 23:59까지 출석·메모·사진을 수정할 수 있습니다.";
  }

  function resizeImageFile(file, maxEdge = 1200) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let { width, height } = img;
        const scale = Math.min(1, maxEdge / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("사진 처리에 실패했습니다"));
            return;
          }
          resolve(blob);
        }, "image/jpeg", 0.82);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("사진을 불러올 수 없습니다"));
      };
      img.src = objectUrl;
    });
  }

  async function readBlobAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("사진 인코딩 실패"));
      reader.readAsDataURL(blob);
    });
  }

  async function uploadTimelinePhotos(slotId) {
    const urls = [];
    for (let i = 0; i < state.timelinePhotos.length; i += 1) {
      const item = state.timelinePhotos[i];
      if (item.kind === "url") {
        urls.push(item.url);
        continue;
      }
      const dataUrl = await readBlobAsDataUrl(item.blob);
      const data = await apiPost("upload-attendance-photo", {
        slotId,
        imageBase64: dataUrl,
        photoIndex: i,
      }, true);
      if (!data.photoUrl) throw new Error("사진 업로드에 실패했습니다");
      urls.push(data.photoUrl);
    }
    return urls;
  }

  async function saveTimelineAttendance() {
    const slot = state.timelineSlot;
    if (!slot || !slot.canEdit || state.isProcessing) return;

    const note = (document.getElementById("timeline-modal-note-input")?.value || "").trim();
    const photoCount = state.timelinePhotos.length;

    if (state.timelinePhotoRequired && photoCount === 0) {
      showToast("사진을 첨부해 주세요", true);
      return;
    }

    state.isProcessing = true;
    const saveBtn = document.getElementById("timeline-modal-save");
    const saveBtnLabel = saveBtn?.textContent || "";
    if (saveBtn) saveBtn.disabled = true;
    try {
      const body = {
        slotId: slot.slotId,
        attended: true,
        note,
      };
      const hasPending = state.timelinePhotos.some((item) => item.kind === "pending");
      if (hasPending) {
        if (saveBtn) saveBtn.textContent = "사진 업로드 중…";
      }
      body.photoUrls = await uploadTimelinePhotos(slot.slotId);
      const data = await apiPost("save-attendance", body, true);
      if (data.stats && state.profile) state.profile.stats = data.stats;
      const dayNum = slot.displayDayIndex ?? slot.dayIndex;
      showToast(`${dayNum}일차 출석 저장됨`);
      closeTrainingModal();
      renderTimeline();
      if (state.todaySlot
        && (state.todaySlot.dayIndex === slot.slotId
          || state.todaySlot.slotId === slot.slotId)) {
        await loadToday();
      }
    } catch (e) {
      showToast(e.message, true);
    } finally {
      state.isProcessing = false;
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = saveBtnLabel;
      }
    }
  }

  async function cancelTimelineAttendance() {
    const slot = state.timelineSlot;
    if (!slot || !slot.canEdit || !slot.attended || state.isProcessing) return;
    if (!window.confirm("이 날 출석을 취소할까요?")) return;

    state.isProcessing = true;
    const cancelBtn = document.getElementById("timeline-modal-cancel-attend");
    const cancelZone = document.getElementById("timeline-modal-cancel-zone");
    if (cancelBtn) cancelBtn.disabled = true;
    try {
      const data = await apiPost("save-attendance", {
        slotId: slot.slotId,
        attended: false,
        note: "",
        photoUrls: [],
      }, true);
      if (data.stats && state.profile) state.profile.stats = data.stats;
      showToast("출석이 취소되었습니다");
      closeTrainingModal();
      renderTimeline();
      if (state.todaySlot
        && (state.todaySlot.dayIndex === slot.slotId
          || state.todaySlot.slotId === slot.slotId)) {
        await loadToday();
      }
    } catch (e) {
      showToast(e.message, true);
    } finally {
      state.isProcessing = false;
      if (cancelBtn) cancelBtn.disabled = false;
    }
  }

  function openTrainingModal(slot) {
    state.timelineSlot = slot;
    clearTimelinePhotoPicker();

    const title = slot.title || slot.label || "—";
    document.getElementById("timeline-modal-title").textContent = title;
    document.getElementById("timeline-modal-meta").textContent = formatSlotDateMeta(slot);
    const contentEl = document.getElementById("timeline-modal-content");
    contentEl.textContent = slot.content || "";
    contentEl.style.display = slot.content ? "block" : "none";
    document.getElementById("timeline-modal-status").textContent =
      slotStatusLabel(slot.status, slot.photo);

    const readonlyEl = document.getElementById("timeline-modal-readonly");
    const editEl = document.getElementById("timeline-modal-edit");
    const noteRead = document.getElementById("timeline-modal-note");
    const photoReadWrap = document.getElementById("timeline-modal-photo-readonly");
    const noteInput = document.getElementById("timeline-modal-note-input");
    const hintEl = document.getElementById("timeline-modal-hint");
    const saveBtn = document.getElementById("timeline-modal-save");
    const cancelBtn = document.getElementById("timeline-modal-cancel-attend");
    const cancelZone = document.getElementById("timeline-modal-cancel-zone");
    const photoSection = document.getElementById("timeline-modal-photo-section");

    if (slot.canEdit) {
      if (readonlyEl) readonlyEl.hidden = true;
      if (editEl) editEl.hidden = false;
      if (noteInput) noteInput.value = slot.note || "";
      if (hintEl) hintEl.textContent = timelineEditHint(slot);
      if (photoSection) {
        photoSection.hidden = false;
        const photoLabel = photoSection.querySelector(".field-label");
        if (photoLabel) {
          photoLabel.textContent = state.timelinePhotoRequired
            ? `사진 (필수, 최대 ${TIMELINE_PHOTO_MAX}장)`
            : `사진 (선택, 최대 ${TIMELINE_PHOTO_MAX}장)`;
        }
      }
      state.timelinePhotos = getSlotPhotoUrls(slot).map((url) => ({ kind: "url", url }));
      renderTimelinePhotoGrid();
      const attended = !!slot.attended;
      if (saveBtn) saveBtn.textContent = attended ? "저장" : "출석하기";
      if (cancelZone) cancelZone.hidden = !attended;
    } else {
      if (editEl) editEl.hidden = true;
      if (readonlyEl) readonlyEl.hidden = false;
      const note = (slot.note || "").trim();
      if (noteRead) {
        if (note) {
          noteRead.textContent = `메모: ${note}`;
          noteRead.hidden = false;
        } else {
          noteRead.textContent = "";
          noteRead.hidden = true;
        }
      }
      if (photoReadWrap) {
        renderReadonlyPhotoGrid(getSlotPhotoUrls(slot));
      }
      if (hintEl) hintEl.textContent = "";
    }

    document.getElementById("timeline-modal").hidden = false;
  }

  function closeTrainingModal() {
    clearTimelinePhotoPicker();
    state.timelineSlot = null;
    document.getElementById("timeline-modal").hidden = true;
  }

  async function onTimelinePhotoSelected(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length || !state.timelineSlot) return;

    let added = 0;
    for (const file of files) {
      if (state.timelinePhotos.length >= TIMELINE_PHOTO_MAX) {
        showToast(`사진은 최대 ${TIMELINE_PHOTO_MAX}장까지입니다`, true);
        break;
      }
      if (!file.type.startsWith("image/")) {
        showToast("이미지 파일만 선택할 수 있습니다", true);
        continue;
      }
      try {
        const blob = await resizeImageFile(file);
        state.timelinePhotos.push({
          kind: "pending",
          blob,
          objectUrl: URL.createObjectURL(blob),
        });
        added += 1;
      } catch (err) {
        showToast(err.message || "사진 처리 실패", true);
      }
    }
    if (added) renderTimelinePhotoGrid();
    e.target.value = "";
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

  function closeTeamProfileModal() {
    const modal = document.getElementById("team-profile-modal");
    if (modal) modal.hidden = true;
  }

  function openTeamProfileModal(memberId) {
    const m = state.teamMembers.find((x) => x.memberId === memberId);
    if (!m) return;
    const me = state.profile?.memberId;
    const isMe = me && m.memberId === me;
    document.getElementById("team-profile-title").textContent = m.nickname || "—";
    document.getElementById("team-profile-meta").textContent = isMe ? "나" : "팀원";
    const goalTime = m.goalMarathonNetTime != null
      ? formatNetTime(m.goalMarathonNetTime)
      : (m.goal || "—");
    const weekTarget = m.weekTarget || 3;
    document.getElementById("team-profile-dl").innerHTML = `
      <dt>목표 대회</dt><dd>${m.goalRaceLabel ? escapeHtml(m.goalRaceLabel) : "—"}</dd>
      <dt>풀 목표</dt><dd>${escapeHtml(goalTime)}</dd>
      <dt>기존 PB</dt><dd>${m.existingPbNetTime != null ? escapeHtml(formatNetTime(m.existingPbNetTime)) : (m.existingPb && m.existingPb !== "—" ? escapeHtml(m.existingPb) : "—")}</dd>
      <dt>목표 몸무게</dt><dd>${escapeHtml(teamWeightDisplay(m, isMe))}</dd>
      <dt>각오</dt><dd class="profile-intro">${m.resolutionText ? escapeHtml(m.resolutionText) : "—"}</dd>
      <dt>시즌 출석</dt><dd>${m.seasonAttendCount ?? 0}회 (출석률 ${m.seasonAttendRate ?? 0}%)</dd>
      <dt>이번 주</dt><dd>
        <span class="week-dots team-week-dots" aria-hidden="true">${m.weekDots || ""}</span>
        ${escapeHtml(m.week || `0/${weekTarget}`)}${m.met ? " ✓" : ""}
      </dd>
    `;
    document.getElementById("team-profile-modal").hidden = false;
  }

  function bindTeamListEvents() {
    const listEl = document.getElementById("team-list");
    if (!listEl || listEl._teamBound) return;
    listEl._teamBound = true;
    listEl.addEventListener("click", (e) => {
      const row = e.target.closest("[data-member-id]");
      if (!row) return;
      openTeamProfileModal(row.dataset.memberId);
    });
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

  function sortTeamMembersForDisplay(members) {
    const me = state.profile?.memberId || null;
    return [...members].sort((a, b) => {
      if (me) {
        if (a.memberId === me) return -1;
        if (b.memberId === me) return 1;
      }
      return (a.nickname || "").localeCompare(b.nickname || "", "ko");
    });
  }

  function paintTeam(t) {
    const members = sortTeamMembersForDisplay(
      (t.members || []).filter((m) => m.profileComplete !== false),
    );
    state.teamMembers = members;
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
      <button type="button" class="team-row team-row--clickable" data-member-id="${escapeHtml(m.memberId || "")}" aria-label="${escapeHtml(m.nickname || "팀원")} 프로필 보기">
        <div>
          <strong>${escapeHtml(m.nickname || "")}</strong>
          <div class="team-goal">목표 ${escapeHtml(m.goal || "")}${m.goalRaceLabel ? ` · ${escapeHtml(m.goalRaceLabel)}` : ""}</div>
        </div>
        <div style="text-align:right">
          <div class="week-dots team-week-dots" aria-hidden="true">${m.weekDots || m.bar}</div>
          <div class="team-goal">${escapeHtml(m.week || "")} ${m.met ? "✓" : ""}</div>
        </div>
      </button>
    `).join("");
    bindTeamListEvents();
  }

  function renderMe() {
    const p = state.profile || MOCK.profile;
    const s = p.stats || MOCK.profile.stats;
    const editBtn = document.getElementById("btn-edit-profile");
    if (editBtn) {
      const canEdit = !!p.profileComplete;
      editBtn.disabled = !canEdit;
      editBtn.title = canEdit ? "" : "프로필 등록 후 수정할 수 있습니다";
    }
    document.getElementById("me-dl").innerHTML = `
      <dt>닉네임</dt><dd>${p.nickname || "김러너"}</dd>
      <dt>목표 대회</dt><dd>${p.goalRaceLabel || "—"}</dd>
      <dt>풀 목표</dt><dd>${formatNetTime(p.goalMarathonNetTime)}</dd>
      <dt>기존 PB</dt><dd>${formatNetTime(p.existingPbNetTime)}</dd>
      <dt>목표 몸무게</dt><dd>${formatBodyWeightKg(p.goalBodyWeightKg)}${p.goalBodyWeightPrivate ? " (팀 비공개)" : ""}</dd>
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

  async function init() {
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
    document.getElementById("btn-create-profile").addEventListener("click", onProfileSubmit);
    document.getElementById("btn-edit-profile").addEventListener("click", openProfileEdit);
    document.getElementById("btn-profile-cancel").addEventListener("click", () => showView("me"));
    document.querySelectorAll('input[name="goal-race"]').forEach((el) => {
      el.addEventListener("change", syncGoalRaceNote);
    });
    const goalWeightInput = document.getElementById("goal-weight-kg");
    if (goalWeightInput) {
      goalWeightInput.addEventListener("input", syncGoalWeightPrivate);
    }
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
    document.getElementById("timeline-modal-save").addEventListener("click", saveTimelineAttendance);
    document.getElementById("timeline-modal-cancel-attend").addEventListener("click", cancelTimelineAttendance);
    document.getElementById("timeline-modal-photo-file").addEventListener("change", onTimelinePhotoSelected);
    document.getElementById("timeline-modal-photo-grid").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-photo-remove]");
      if (!btn) return;
      removeTimelinePhotoAt(Number(btn.dataset.photoRemove));
    });

    document.getElementById("team-profile-close").addEventListener("click", closeTeamProfileModal);
    document.getElementById("team-profile-modal").addEventListener("click", (e) => {
      if (e.target.id === "team-profile-modal") closeTeamProfileModal();
    });
    bindTeamListEvents();

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

    const scenarioSelect = document.getElementById("demo-scenario");
    if (scenarioSelect) {
      const params = new URLSearchParams(location.search);
      const currentScenario = params.get("scenario") || "beta-mon";
      scenarioSelect.value = currentScenario;
      scenarioSelect.addEventListener("change", async (e) => {
        const next = new URLSearchParams(location.search);
        next.set("preview", "1");
        next.set("scenario", e.target.value);
        location.search = next.toString();
      });
    }

    if (PREVIEW_MODE) {
      document.getElementById("preview-banner").style.display = "block";
      document.getElementById("demo-nav").style.display = "block";
      const hint = document.getElementById("preview-hint");
      if (hint) hint.hidden = false;
    }

    window.addEventListener("hashchange", () => { navigateFromHash(); });

    if (PREVIEW_MODE && !location.hash) {
      if (!getToken()) setToken("preview-token");
      const params = new URLSearchParams(location.search);
      if (params.get("scenario")) {
        showView("today");
        await loadToday();
      } else {
        /* 온보딩 플로우 확인용 — 첫 진입은 환영 화면 */
        showView("welcome");
      }
    } else {
      await navigateFromHash();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
