(function () {
  const IS_LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname.startsWith("192.168.") || location.hostname.startsWith("172.");
  const IS_STAGING = location.hostname.includes("dmc-attendance-staging");
  const PROD_URL = "https://asia-northeast3-dmc-attendance.cloudfunctions.net/attendance";
  const STAGING_URL = "https://asia-northeast3-dmc-attendance-staging.cloudfunctions.net/attendance";
  const LOCAL_URL = "http://" + location.hostname + ":5001/dmc-attendance/asia-northeast3/attendance";
  const BASE_URL = IS_LOCAL ? LOCAL_URL : (IS_STAGING ? STAGING_URL : PROD_URL);
  const KIOSK_READ_URLS = IS_LOCAL ? [LOCAL_URL, PROD_URL] : [BASE_URL];
  const RACE_LOG_API = IS_LOCAL
    ? "http://" + location.hostname + ":5001/dmc-attendance/asia-northeast3/race"
    : "https://race-nszximpvtq-du.a.run.app";

  const LS_PROFILE = "dmc_attendance_v2_profile";
  const CHECKIN_BTN_LABEL = "출석 체크";
  const CHECKIN_DONE_LABEL = "출석 완료";
  let myAttendViewMode = "list";
  let checkinAlreadyDone = false;
  const SUCCESS_CHEERS_MEMBER = [
    "정모 출석이 기록에 반영되었어요.",
    "출석 등록이 완료되었습니다.",
    "클럽 출석에 참여해 주셔서 감사합니다."
  ];
  const SUCCESS_CHEERS_GUEST = ["함께해 주셔서 감사해요!", "출석이 기록되었습니다."];
  const NOT_ON_ROSTER_HELP =
    "출석 명부 추가, 수정은 IT운영 총무 게살볶음밥에게 알려주세요.";

  const TEAM_OPTIONS = [
    { value: "S", label: "S팀" },
    { value: "T1", label: "1팀" },
    { value: "T2", label: "2팀" },
    { value: "T3", label: "3팀" },
    { value: "T4", label: "4팀" },
    { value: "T5", label: "5팀" }
  ];
  /** 팀 미지정 회원 선택 후 팀 모달에서 프로필 완성할 때 사용 */
  let pendingProfilePick = null;
  const KIOSK_INITIAL_BUCKETS = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ", "A-Z", "0-9"];
  const KIOSK_IDLE_TIMEOUT_MS = 30_000;
  const HANGUL_INITIALS = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
  const HANGUL_DOUBLE_INITIAL_MAP = { "ㄲ": "ㄱ", "ㄸ": "ㄷ", "ㅃ": "ㅂ", "ㅆ": "ㅅ", "ㅉ": "ㅈ" };
  const DOW_SHORT_TO_FULL_KO = {
    Sun: "일요일",
    Mon: "월요일",
    Tue: "화요일",
    Wed: "수요일",
    Thu: "목요일",
    Fri: "금요일",
    Sat: "토요일"
  };
  const DOW_SHORT_TO_COMPACT_KO = {
    Sun: "일",
    Mon: "월",
    Tue: "화",
    Wed: "수",
    Thu: "목",
    Fri: "금",
    Sat: "토"
  };

  const elSearch = document.getElementById("viewSearch");
  const elDash = document.getElementById("viewDashboard");
  const elSuccess = document.getElementById("viewSuccess");
  const elKiosk = document.getElementById("viewKiosk");
  const elKioskWrap = document.getElementById("kioskWrap");
  const elAppShell = document.getElementById("app-shell");
  const elSearchInput = document.getElementById("searchInput");
  const elMemberList = document.getElementById("memberList");
  const elSearchMsg = document.getElementById("searchMsg");
  const elDashDateTypeLine = document.getElementById("dashDateTypeLine");
  const elDashNicknameLine = document.getElementById("dashNicknameLine");
  const elDashTeamRole = document.getElementById("dashTeamRole");
  const elMeetingDate = document.getElementById("meetingDate");
  const elMeetingType = document.getElementById("meetingType");
  const elMeetingTypeAutoHint = document.getElementById("meetingTypeAutoHint");
  const elCheckinBtn = document.getElementById("checkinBtn");
  const meetingTypeHelper =
    typeof window !== "undefined" && window.DmcAttendanceMeetingType
      ? window.DmcAttendanceMeetingType
      : null;
  const MEETING_TYPE_LABELS = {
    TUE: "화요일 정모",
    THU: "목요일 정모",
    SAT: "토요일 정모",
    ETC: "기타",
  };
  const elDashMsg = document.getElementById("dashMsg");
  const elSuccessLine = document.getElementById("successLine");
  const elSuccessCheer = document.getElementById("successCheer");
  const elSuccessPanelCal = document.getElementById("successPanelCal");
  const elSuccessStatsLine = document.getElementById("successStatsLine");
  const elSuccessSessionLine = document.getElementById("successSessionLine");
  const elDashSessionRow = document.getElementById("dashSessionRow");
  const elDashSessionFigures = document.getElementById("dashSessionFigures");
  const elTodayRosterCard = document.getElementById("todayRosterCard");
  const elTodayRosterList = document.getElementById("todayRosterList");
  const elTodayRosterCount = document.getElementById("todayRosterCount");
  const elTodayRosterMeetingLabel = document.getElementById("todayRosterMeetingLabel");
  const elGuestModal = document.getElementById("guestModal");
  const elGuestModalTitle = document.getElementById("guestModalTitle");
  const elGuestModalHelp = document.getElementById("guestModalHelp");
  const elGuestMeetingFields = document.getElementById("guestMeetingFields");
  const elKioskMemberNotOnRosterBtn = document.getElementById("kioskMemberNotOnRosterBtn");
  const elTeamModal = document.getElementById("teamModal");
  const elSessionRosterModal = document.getElementById("sessionRosterModal");
  const elSessionRosterTitle = document.getElementById("sessionRosterTitle");
  const elSessionRosterList = document.getElementById("sessionRosterList");
  const elSessionRosterCloseBtn = document.getElementById("sessionRosterCloseBtn");
  const elKioskMeetingTitleFull = document.getElementById("kioskMeetingTitleFull");
  const elKioskMeetingTitleCompact = document.getElementById("kioskMeetingTitleCompact");
  const elKioskIdlePanel = document.getElementById("kioskIdlePanel");
  const elKioskHomePanel = document.getElementById("kioskHomePanel");
  const elKioskInitialPanel = document.getElementById("kioskInitialPanel");
  const elKioskTeamPanel = document.getElementById("kioskTeamPanel");
  const elKioskMemberPanel = document.getElementById("kioskMemberPanel");
  const elKioskAssignTeamPanel = document.getElementById("kioskAssignTeamPanel");
  const elKioskAssignTeamGrid = document.getElementById("kioskAssignTeamGrid");
  const elKioskAssignTeamHelp = document.getElementById("kioskAssignTeamHelp");
  const elKioskNotOnRosterPanel = document.getElementById("kioskNotOnRosterPanel");
  const elKioskRosterPanel = document.getElementById("kioskRosterPanel");
  const elKioskDonePanel = document.getElementById("kioskDonePanel");
  const elKioskGuestNickname = document.getElementById("kioskGuestNickname");
  const elKioskNotOnRosterHelp = document.getElementById("kioskNotOnRosterHelp");
  const elKioskNotOnRosterSubmitBtn = document.getElementById("kioskNotOnRosterSubmitBtn");
  const elKioskRosterTitle = document.getElementById("kioskRosterTitle");
  const elKioskRosterList = document.getElementById("kioskRosterList");
  const elKioskInitialGrid = document.getElementById("kioskInitialGrid");
  const elKioskTeamGrid = document.getElementById("kioskTeamGrid");
  const elKioskMemberGrid = document.getElementById("kioskMemberGrid");
  const elKioskMemberTitle = document.getElementById("kioskMemberTitle");
  const elKioskMemberBackBtn = document.getElementById("kioskMemberBackBtn");
  const elKioskDoneName = document.getElementById("kioskDoneName");
  const elKioskDoneStatus = document.getElementById("kioskDoneStatus");
  const elKioskDoneStats = document.getElementById("kioskDoneStats");
  const elKioskDoneMonthCount = document.getElementById("kioskDoneMonthCount");
  const elKioskDoneStreakCount = document.getElementById("kioskDoneStreakCount");
  const elKioskMsg = document.getElementById("kioskMsg");
  const elKioskWakeLockStatus = document.getElementById("kioskWakeLockStatus");

  let membersCache = [];
  let myProfile = null;
  /** 같은 페이지 세션에서 대시보드 정모 필드 기본값은 최초 1회만 채움(완료 후 복귀 시 사용자 선택 유지). */
  let meetingFieldsAppliedOnce = false;
  let sessionCountAbort = null;
  let sessionCountReqId = 0;
  let lastSuccessMeetingDateKey = "";
  let lastSuccessGuest = false;
  let lastSuccessStatsLoaded = false;
  let lastSuccessStats = {
    thisMonthCount: 0,
    attendanceRate: 0,
    consecutiveClubSessions: 0,
    totalPossible: 0
  };
  /** 출석 완료 미니달력: 해당 월에 기록된 정회원 출석일(YYYY/MM/DD) */
  let lastSuccessCalendarAttendedKeys = new Set();
  /** stats/history 조회에 쓴 YYYY-MM (통계 문구 "이번 달" vs "해당 월") */
  let lastSuccessStatsMonthKey = "";
  let kioskState = {
    meetingDateKey: "",
    meetingType: "",
    previousPicker: "home",
    selectedInitial: "",
    selectedTeam: "",
    members: [],
    rosterItems: [],
    pendingMemberId: "",
    loading: false,
    error: "",
    doneStatsReqId: 0,
    returnTimer: null,
    applyingHistory: false,
    wakeLockSentinel: null,
    wakeLockEnabled: false,
    notOnRosterReturn: "home",
    training: null,
    trainingLoading: false,
    idleTimer: null,
    assignTeamMember: null,
  };
  let isKioskProcessing = false;

  function parseSlashDateKey(key) {
    const m = String(key || "").match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    if (!m) return null;
    return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
  }

  function monthKeyFromMeetingDateKeySlash(dk) {
    const p = parseSlashDateKey(dk);
    if (!p) return currentMonthKey();
    return String(p.y) + "-" + String(p.mo).padStart(2, "0");
  }

  /** 그레고리력 월 일수(타임존 무관) */
  function daysInMonthCivil(y, month1to12) {
    return new Date(y, month1to12, 0).getDate();
  }

  /** 해당 연·월 1일의 요일(일=0 … 토=6), 달력 첫 열이 일요일일 때 패딩용 — KST */
  function firstOfMonthSundayPadKst(y, month1to12) {
    const noonKst = new Date(
      String(y) + "-" + String(month1to12).padStart(2, "0") + "-01T12:00:00+09:00"
    );
    if (isNaN(noonKst.getTime())) return 0;
    const wEn = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Seoul" }).format(noonKst);
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[wEn] !== undefined ? map[wEn] : 0;
  }


  function paintSuccessSummary() {
    if (lastSuccessGuest) {
      elSuccessStatsLine.textContent = "출석 명부에 없는 경우로 기록된 출석은 월 통계와 별도로 관리됩니다.";
      return;
    }
    if (!lastSuccessStatsLoaded) {
      elSuccessStatsLine.textContent = "이번 달 통계를 불러오는 중…";
      return;
    }
    const s = lastSuccessStats;
    const streak = Number(s.consecutiveClubSessions) || 0;
    const streakMid =
      streak > 0
        ? "<span class=\"success-streak-tag\">연속 " + streak + "회</span> · "
        : "연속 정모 " + streak + "회 · ";
    const monthLabel =
      lastSuccessStatsMonthKey && lastSuccessStatsMonthKey !== currentMonthKey() ? "해당 월" : "이번 달";
    elSuccessStatsLine.innerHTML =
      monthLabel +
      " 출석 " +
      s.thisMonthCount +
      "회 · 출석률 " +
      s.attendanceRate +
      "% · " +
      streakMid +
      "정모일 " +
      s.totalPossible +
      "일";
  }

  function paintSuccessCalendar() {
    const p = parseSlashDateKey(lastSuccessMeetingDateKey);
    if (!p) {
      elSuccessPanelCal.innerHTML =
        '<p class="success-stats-line" style="margin:0;">모임 날짜를 알 수 없어 달력을 표시하지 못했습니다.</p>';
      return;
    }
    const year = p.y;
    const month = p.mo;
    const pad = firstOfMonthSundayPadKst(year, month);
    const dim = daysInMonthCivil(year, month);
    const dows = ["일", "월", "화", "수", "목", "금", "토"];
    function keyForDay(dd) {
      return year + "/" + String(month).padStart(2, "0") + "/" + String(dd).padStart(2, "0");
    }
    let html = '<div class="mini-cal"><p class="mini-cal-title">' + year + "년 " + month + "월</p>";
    html += '<div class="mini-cal-dows">';
    for (let i = 0; i < 7; i++) html += "<span>" + dows[i] + "</span>";
    html += '</div><div class="mini-cal-grid">';
    for (let u = 0; u < pad; u++) html += '<div class="mini-cal-cell mini-cal-pad"></div>';
    for (let d = 1; d <= dim; d++) {
      const dk = keyForDay(d);
      const isJust = dk === lastSuccessMeetingDateKey;
      const inMonth = lastSuccessCalendarAttendedKeys.has(dk);
      let cls = "mini-cal-cell";
      if (isJust) cls += " mini-cal-checkin mini-cal-checkin-animate";
      else if (inMonth) cls += " mini-cal-month-hit";
      html += "<div class=\"" + cls + "\">" + d + (isJust ? '<span class="mini-cal-sub">방금</span>' : "") + "</div>";
    }
    html += "</div>";
    html += '</div>';
    elSuccessPanelCal.innerHTML = html;
  }

  function paintSuccessViews() {
    paintSuccessCalendar();
    paintSuccessSummary();
  }

  function showView(name) {
    elSearch.classList.toggle("hidden", name !== "search");
    elDash.classList.toggle("hidden", name !== "dashboard");
    elSuccess.classList.toggle("hidden", name !== "success");
    if (name === "kiosk") {
      setKioskShellVisible(true);
    } else {
      setKioskShellVisible(false);
      if (elKiosk) elKiosk.classList.add("hidden");
    }
    if (name !== "kiosk") releaseKioskWakeLock().catch(() => {});
  }

  function setKioskShellVisible(isKiosk) {
    document.body.classList.toggle("kiosk-mode", isKiosk);
    if (elKioskWrap) elKioskWrap.hidden = !isKiosk;
    if (elKiosk) elKiosk.classList.toggle("hidden", !isKiosk);
  }

  const shellRouter =
    typeof globalThis !== "undefined" && globalThis.DmcAttendanceShellRouter
      ? globalThis.DmcAttendanceShellRouter
      : null;
  const SHELL_TABS = shellRouter
    ? shellRouter.SHELL_TABS
    : ["today", "my-attendance", "team-attendance", "more"];

  function parseShellHash() {
    if (shellRouter) return shellRouter.parseShellHash(location.hash);
    const h = (location.hash || "#today").replace(/^#/, "");
    return SHELL_TABS.indexOf(h) >= 0 ? h : "today";
  }

  function showShellTab(tabId) {
    if (isKioskMode()) return;
    SHELL_TABS.forEach((id) => {
      const el = document.getElementById("view-" + id);
      if (el) {
        const on = id === tabId;
        el.classList.toggle("active", on);
        el.hidden = !on;
      }
      const btn = document.querySelector('.tab-btn[data-tab="' + id + '"]');
      if (btn) btn.classList.toggle("active", id === tabId);
    });
    if (location.hash !== "#" + tabId) {
      history.replaceState(null, "", "#" + tabId);
    }
    if (tabId === "more") refreshMoreProfileCard();
    if (tabId === "my-attendance") loadMyAttendancePanel().catch(() => {});
    if (tabId === "team-attendance") loadTeamAttendancePanel().catch(() => {});
  }

  function refreshMoreProfileCard() {
    const nameEl = document.getElementById("moreProfileName");
    const metaEl = document.getElementById("moreProfileMeta");
    const resetBtn = document.getElementById("resetProfileBtn");
    if (!nameEl || !metaEl) return;
    const p = myProfile || loadProfile();
    if (!p) {
      nameEl.textContent = "프로필 없음";
      metaEl.textContent = "오늘 탭에서 본인을 선택해 주세요";
      if (resetBtn) resetBtn.hidden = true;
      return;
    }
    nameEl.textContent = p.nickname || "회원";
    metaEl.textContent = teamLabel(p.team) + (p.memberId ? " · 저장됨" : "");
    if (resetBtn) resetBtn.hidden = false;
  }

  let myAttendMonthKey = "";
  let teamAttendMonthKey = "";
  let teamAttendFilter = "";
  let teamAttendLastAgg = null;
  let teamMemberSheetPbReqId = 0;

  const teamMonthHelper =
    typeof window !== "undefined" && window.DmcAttendanceTeamMonth
      ? window.DmcAttendanceTeamMonth
      : null;

  function currentMonthKeyKst() {
    return new Date()
      .toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
      .slice(0, 7);
  }

  function shiftMonthKey(monthKey, delta) {
    const m = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
    if (!m) return currentMonthKeyKst();
    const d = new Date(Number(m[1]), Number(m[2]) - 1 + delta, 1);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    return y + "-" + mo;
  }

  function formatMonthLabel(monthKey) {
    const m = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
    if (!m) return monthKey || "—";
    return m[1] + "년 " + Number(m[2]) + "월";
  }

  /** 개인 취소용 — URL meetingDate/Type 무시, 서버 resolveDefaultMeeting과 동일 */
  function activeSessionForCancel() {
    const urlParams = new URLSearchParams(window.location.search);
    const testDateParam = urlParams.get("testDate");
    let now = new Date();
    if ((IS_LOCAL || IS_STAGING) && testDateParam) {
      const parsed = new Date(testDateParam + "T10:00:00+09:00");
      if (!isNaN(parsed.getTime())) now = parsed;
    }
    const dow = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      weekday: "short"
    }).format(now);
    let dayOffset = 0;
    let meetingType = "SAT";
    switch (dow) {
      case "Mon": dayOffset = -2; meetingType = "SAT"; break;
      case "Tue": dayOffset = 0; meetingType = "TUE"; break;
      case "Wed": dayOffset = -1; meetingType = "TUE"; break;
      case "Thu": dayOffset = 0; meetingType = "THU"; break;
      case "Fri": dayOffset = -1; meetingType = "THU"; break;
      case "Sat": dayOffset = 0; meetingType = "SAT"; break;
      case "Sun": dayOffset = -1; meetingType = "SAT"; break;
    }
    const kstDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    kstDate.setDate(kstDate.getDate() + dayOffset);
    const year = kstDate.getFullYear();
    const month = String(kstDate.getMonth() + 1).padStart(2, "0");
    const day = String(kstDate.getDate()).padStart(2, "0");
    return { dateKey: year + "/" + month + "/" + day, meetingType };
  }

  function isRowActiveSession(item, active) {
    if (shellRouter && shellRouter.isActiveSessionMatch) {
      return shellRouter.isActiveSessionMatch(
        { dateKey: item.meetingDate, meetingType: item.meetingType },
        active
      );
    }
    return (
      String(item.meetingDate || "") === String(active.dateKey || "") &&
      String(item.meetingType || "").toUpperCase() === String(active.meetingType || "").toUpperCase()
    );
  }

  async function loadMyAttendancePanel() {
    const listEl = document.getElementById("myAttendList");
    const statsEl = document.getElementById("myAttendStats");
    const labelEl = document.getElementById("myAttendMonthLabel");
    const calGrid = document.getElementById("myAttendCalGrid");
    if (!listEl || !statsEl) return;

    if (!myAttendMonthKey) myAttendMonthKey = currentMonthKeyKst();
    if (labelEl) labelEl.textContent = formatMonthLabel(myAttendMonthKey);
    applyMyAttendViewMode();

    const p = myProfile || loadProfile();
    if (!p || !p.nickname) {
      statsEl.innerHTML =
        '<div class="stat" style="grid-column:1/-1;text-align:left;font-size:13px;color:var(--dmc-color-text-muted)">프로필 없음</div>';
      listEl.innerHTML =
        '<li style="padding:20px 16px;text-align:center;color:var(--dmc-color-text-muted);font-size:14px">오늘 탭에서 프로필을 설정해 주세요</li>';
      if (calGrid) {
        calGrid.innerHTML =
          '<div class="cal-dow" style="grid-column:1/-1;padding:16px;color:var(--dmc-color-text-muted)">오늘 탭에서 프로필을 설정해 주세요</div>';
      }
      return;
    }

    statsEl.innerHTML = '<div class="stat" style="grid-column:1/-1">불러오는 중…</div>';
    listEl.innerHTML = "";
    if (calGrid) calGrid.innerHTML = "";

    try {
      const histUrl =
        BASE_URL +
        "?action=history&nickname=" +
        encodeURIComponent(p.nickname) +
        "&month=" +
        encodeURIComponent(myAttendMonthKey);
      const statsUrl =
        BASE_URL +
        "?action=stats&month=" +
        encodeURIComponent(myAttendMonthKey) +
        (p.memberId
          ? "&memberId=" + encodeURIComponent(p.memberId)
          : "&nickname=" + encodeURIComponent(p.nickname));

      const [histJson, statsJson] = await Promise.all([
        fetch(histUrl).then((r) => r.json()),
        fetch(statsUrl).then((r) => r.json()),
      ]);
      if (!histJson.ok) throw new Error(histJson.error || "history 실패");

      const items = Array.isArray(histJson.items) ? histJson.items : [];
      const memberItems = items.filter((it) => it.isGuest !== true);

      const monthCount =
        statsJson.ok && statsJson.thisMonthCount != null
          ? Number(statsJson.thisMonthCount)
          : memberItems.length;
      const rate =
        statsJson.ok && statsJson.attendanceRate != null
          ? Number(statsJson.attendanceRate)
          : histJson.attendanceRate != null
            ? Number(histJson.attendanceRate)
            : 0;
      const streak =
        statsJson.ok && statsJson.consecutiveClubSessions != null
          ? Number(statsJson.consecutiveClubSessions)
          : 0;

      statsEl.innerHTML =
        '<div class="stat"><strong>' +
        monthCount +
        '</strong><span>출석</span></div>' +
        '<div class="stat"><strong>' +
        rate +
        '%</strong><span>출석률</span></div>' +
        '<div class="stat"><strong>' +
        streak +
        '</strong><span>연속</span></div>';

      renderMyAttendCalendar(memberItems);

      if (!memberItems.length) {
        listEl.innerHTML =
          '<li style="padding:20px 16px;text-align:center;color:var(--dmc-color-text-muted);font-size:14px">이 달 출석 기록이 없습니다</li>';
        return;
      }

      const active = activeSessionForCancel();
      listEl.innerHTML = memberItems
        .map((it) => {
          const canCancel = p.memberId && isRowActiveSession(it, active);
          const day = String(it.meetingDate || "").split("/")[2] || "";
          const label = it.meetingTypeLabel || it.meetingType || "";
          const cancelBtn = canCancel
            ? '<button type="button" class="btn-cancel-attend" data-cancel-date="' +
              String(it.meetingDate || "").replace(/"/g, "") +
              '" data-cancel-type="' +
              String(it.meetingType || "").replace(/"/g, "") +
              '">출석 취소</button>'
            : "";
          return (
            '<li class="attend-log-item" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--dmc-line-subtle,var(--dmc-color-border-light))">' +
            '<div style="width:40px;text-align:center"><div style="font-size:18px;font-weight:800;line-height:1">' +
            day +
            '</div></div>' +
            '<div style="flex:1;min-width:0"><strong style="display:block;font-size:14px">' +
            (label || "정모") +
            '</strong><span style="font-size:12px;color:var(--dmc-color-text-secondary)">' +
            (it.meetingDate || "") +
            (canCancel ? " · 활성 세션" : "") +
            (it.timeText ? " · " + it.timeText : "") +
            "</span></div>" +
            '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">' +
            '<span style="font-size:11px;font-weight:700;color:var(--dmc-attend-fg,var(--dmc-color-success))">출석</span>' +
            cancelBtn +
            "</div></li>"
          );
        })
        .join("");
    } catch (e) {
      statsEl.innerHTML =
        '<div class="stat" style="grid-column:1/-1;color:var(--dmc-color-danger)">로드 실패</div>';
      listEl.innerHTML =
        '<li style="padding:20px 16px;text-align:center;color:var(--dmc-color-danger);font-size:14px">' +
        (e.message || "오류") +
        "</li>";
      if (calGrid) {
        calGrid.innerHTML =
          '<div class="cal-dow" style="grid-column:1/-1;padding:16px;color:var(--dmc-color-danger)">' +
          escapeHtml(e.message || "오류") +
          "</div>";
      }
    }
  }

  function applyMyAttendViewMode() {
    const listPanel = document.getElementById("myAttendListPanel");
    const calPanel = document.getElementById("myAttendCalPanel");
    const btnList = document.getElementById("myViewList");
    const btnCal = document.getElementById("myViewCal");
    const isList = myAttendViewMode !== "cal";
    if (listPanel) listPanel.hidden = !isList;
    if (calPanel) calPanel.hidden = isList;
    if (btnList) {
      btnList.classList.toggle("active", isList);
      btnList.setAttribute("aria-selected", isList ? "true" : "false");
    }
    if (btnCal) {
      btnCal.classList.toggle("active", !isList);
      btnCal.setAttribute("aria-selected", !isList ? "true" : "false");
    }
  }

  function kstTodayDateKeySlash() {
    const s = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
    return s.replace(/-/g, "/");
  }

  function renderMyAttendCalendar(memberItems) {
    const calGrid = document.getElementById("myAttendCalGrid");
    if (!calGrid) return;
    const helper =
      typeof globalThis !== "undefined" && globalThis.DmcAttendanceMyCalendar
        ? globalThis.DmcAttendanceMyCalendar
        : null;
    if (!helper) {
      calGrid.innerHTML =
        '<div class="cal-dow" style="grid-column:1/-1;padding:16px">달력 헬퍼 로드 실패</div>';
      return;
    }
    const attended = helper.attendedDateKeySet(memberItems || []);
    const cells = helper.buildMyAttendCalendarCells({
      monthKey: myAttendMonthKey || currentMonthKeyKst(),
      attendedDateKeys: Array.from(attended),
      todayKey: kstTodayDateKeySlash(),
    });
    const dows = ["일", "월", "화", "수", "목", "금", "토"];
    let html = dows.map((d) => '<div class="cal-dow">' + d + "</div>").join("");
    cells.forEach((c) => {
      if (c.kind === "pad") {
        html += '<div class="cal-day muted" aria-hidden="true"></div>';
        return;
      }
      let cls = "cal-day";
      if (c.attend) cls += " attend";
      if (c.today) cls += " today-ring";
      const title = c.attend ? "출석" : c.today ? "오늘" : "";
      html +=
        '<div class="' +
        cls +
        '"' +
        (title ? ' title="' + title + '"' : "") +
        ">" +
        c.day +
        "</div>";
    });
    calGrid.innerHTML = html;
  }

  function setCheckinButtonDone(done) {
    checkinAlreadyDone = !!done;
    if (!elCheckinBtn) return;
    if (done) {
      elCheckinBtn.disabled = true;
      elCheckinBtn.textContent = CHECKIN_DONE_LABEL;
      elCheckinBtn.classList.add("dash-checkin-done");
    } else {
      elCheckinBtn.disabled = false;
      elCheckinBtn.textContent = CHECKIN_BTN_LABEL;
      elCheckinBtn.classList.remove("dash-checkin-done");
    }
  }

  async function refreshCheckinButtonState() {
    if (!elCheckinBtn) return;
    const p = myProfile || loadProfile();
    const dateKey = inputValueToDateKey(elMeetingDate && elMeetingDate.value);
    const meetingType = elMeetingType && elMeetingType.value;
    if (!p || !dateKey || !meetingType) {
      setCheckinButtonDone(false);
      return;
    }
    try {
      const q =
        BASE_URL +
        "?action=status&date=" +
        encodeURIComponent(dateKey) +
        "&meetingType=" +
        encodeURIComponent(meetingType);
      const json = await fetch(q).then((r) => r.json());
      if (!json.ok) {
        setCheckinButtonDone(false);
        return;
      }
      const helper =
        typeof globalThis !== "undefined" && globalThis.DmcAttendanceMyCalendar
          ? globalThis.DmcAttendanceMyCalendar
          : null;
      const items = Array.isArray(json.items) ? json.items : [];
      const done = helper
        ? helper.isProfileCheckedInSession(items, meetingType, p)
        : items.some(
            (it) =>
              String(it.meetingType || "").toUpperCase() ===
                String(meetingType).toUpperCase() &&
              ((p.memberId && it.memberId === p.memberId) ||
                String(it.nickname || "").toLowerCase() ===
                  String(p.nickname || "").toLowerCase())
          );
      setCheckinButtonDone(done);
    } catch (_) {
      setCheckinButtonDone(false);
    }
  }

  function formatShortAttendDate(dateKey) {
    const m = String(dateKey || "").match(/^\d{4}\/(\d{2})\/(\d{2})$/);
    if (!m) return dateKey || "";
    return Number(m[1]) + "/" + Number(m[2]);
  }

  function renderTeamAttendChips() {
    const chipsEl = document.getElementById("teamAttendChips");
    if (!chipsEl) return;
    const p = myProfile || loadProfile();
    const myTeam = p && p.team ? String(p.team) : "";
    if (!teamAttendFilter) {
      teamAttendFilter = myTeam || "ALL";
    }
    const chips = [];
    if (myTeam) {
      chips.push({ value: myTeam, label: teamLabel(myTeam) });
    }
    chips.push({ value: "ALL", label: "동마클 전체" });
    TEAM_OPTIONS.forEach((t) => {
      if (String(t.value) === myTeam) return;
      chips.push({ value: t.value, label: t.label });
    });
    chipsEl.innerHTML = chips
      .map((c) => {
        const active = String(teamAttendFilter) === String(c.value);
        return (
          '<button type="button" class="chip' +
          (active ? " active" : "") +
          '" data-team-filter="' +
          String(c.value).replace(/"/g, "") +
          '">' +
          c.label +
          "</button>"
        );
      })
      .join("");
  }

  function attendDotLabel(dateKey, state) {
    const short = formatShortAttendDate(dateKey);
    if (state === "attended") return short + " 출석";
    if (state === "missed") return short + " 미출석";
    return short + " 예정";
  }

  function renderAttendDotsHtml(meetingDateKeys, attendedDateKeys) {
    if (!teamMonthHelper || typeof teamMonthHelper.buildMeetingDots !== "function") {
      return "";
    }
    const dots = teamMonthHelper.buildMeetingDots({
      meetingDateKeys: meetingDateKeys,
      attendedDateKeys: attendedDateKeys,
      todayKey: kstTodayDateKeySlash(),
    });
    return (
      '<span class="attend-dots" role="img" aria-label="정모 출석 도트">' +
      dots
        .map(function (d) {
          const label = attendDotLabel(d.dateKey, d.state);
          return (
            '<span class="attend-dot" data-state="' +
            escapeHtml(d.state) +
            '" title="' +
            escapeHtml(label) +
            '" aria-label="' +
            escapeHtml(label) +
            '"></span>'
          );
        })
        .join("") +
      "</span>"
    );
  }

  async function loadTeamAttendancePanel() {
    const listEl = document.getElementById("teamAttendList");
    const summaryEl = document.getElementById("teamAttendSummary");
    const labelEl = document.getElementById("teamAttendMonthLabel");
    if (!listEl || !summaryEl) return;

    if (!teamAttendMonthKey) teamAttendMonthKey = currentMonthKeyKst();
    if (labelEl) labelEl.textContent = formatMonthLabel(teamAttendMonthKey);
    renderTeamAttendChips();

    if (!teamMonthHelper) {
      summaryEl.textContent = "헬퍼 로드 실패";
      listEl.innerHTML =
        '<li class="member-row"><div class="member-name">attendance-team-month.js 필요</div></li>';
      return;
    }

    summaryEl.innerHTML = "불러오는 중…";
    listEl.innerHTML = "";

    try {
      const membersJson = await fetch(BASE_URL + "?action=members").then((r) => r.json());
      if (!membersJson.ok) throw new Error(membersJson.error || "members 실패");
      const members = Array.isArray(membersJson.members) ? membersJson.members : [];

      const dateKeys = teamMonthHelper.listRegularMeetingDateKeys(teamAttendMonthKey);
      const statusByDate = {};
      const chunkSize = 4;
      for (let i = 0; i < dateKeys.length; i += chunkSize) {
        const chunk = dateKeys.slice(i, i + chunkSize);
        const results = await Promise.all(
          chunk.map((dk) =>
            fetch(BASE_URL + "?action=status&date=" + encodeURIComponent(dk))
              .then((r) => r.json())
              .then((j) => ({ dk, j }))
          )
        );
        results.forEach(({ dk, j }) => {
          statusByDate[dk] = j && j.ok && Array.isArray(j.items) ? j.items : [];
        });
      }

      const agg = teamMonthHelper.aggregateTeamMonth({
        monthKey: teamAttendMonthKey,
        members: members,
        statusByDate: statusByDate,
        teamFilter: teamAttendFilter,
      });

      summaryEl.innerHTML =
        "<div>이번 달 정모<br /><strong>" +
        dateKeys.length +
        "회</strong></div>" +
        '<div style="text-align:right">출석한 인원<br /><strong>' +
        agg.attended +
        " / " +
        agg.roster +
        " · " +
        agg.rate +
        "%</strong></div>";

      const membersById = {};
      members.forEach(function (m) {
        if (m && m.id) {
          membersById[m.id] = {
            nickname: m.nickname || "",
            realName: m.realName || m.name || "",
            team: m.team || "",
          };
        }
      });
      teamAttendLastAgg = {
        monthKey: teamAttendMonthKey,
        meetingDateKeys: dateKeys,
        rows: agg.rows,
        membersById: membersById,
      };

      if (!agg.rows.length) {
        listEl.innerHTML =
          '<li class="member-row"><div class="member-name" style="font-weight:500;color:var(--dmc-color-text-muted)">해당 팀 회원이 없습니다</div></li>';
        return;
      }

      listEl.innerHTML = agg.rows
        .map(function (row) {
          const nick = escapeHtml(row.nickname);
          const dots = renderAttendDotsHtml(dateKeys, row.dates || []);
          const mid = row.memberId ? escapeHtml(row.memberId) : "";
          return (
            '<li class="member-row" role="button" tabindex="0" data-member-id="' +
            mid +
            '" data-nickname="' +
            escapeHtml(row.nickname) +
            '" data-team="' +
            escapeHtml(row.team || "") +
            '" data-count="' +
            String(row.count) +
            '" data-dates="' +
            (row.dates || []).join(",") +
            '">' +
            '<div class="member-name">' +
            nick +
            dots +
            "</div>" +
            '<div class="member-count">' +
            row.count +
            "회</div></li>"
          );
        })
        .join("");
    } catch (e) {
      summaryEl.innerHTML =
        '<span style="color:var(--dmc-color-danger)">' + (e.message || "로드 실패") + "</span>";
      listEl.innerHTML =
        '<li class="member-row"><div class="member-name" style="color:var(--dmc-color-danger)">오류</div></li>';
    }
  }

  function closeTeamMemberSheet() {
    const el = document.getElementById("teamMemberSheet");
    if (el) el.classList.add("hidden");
  }

  const PB_SLOT_DISTS = ["full", "half", "10K"];
  const PB_DIST_LABELS = { full: "풀", half: "하프", "10K": "10K" };

  function raceRecordTime(r) {
    return String((r && (r.record || r.netTime || r.gunTime || r.time)) || "").trim();
  }

  function timeToSeconds(t) {
    const parts = String(t || "")
      .split(":")
      .map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return Infinity;
  }

  function flattenConfirmedRaceResults(races) {
    const all = [];
    (Array.isArray(races) ? races : []).forEach(function (race) {
      (Array.isArray(race && race.results) ? race.results : []).forEach(function (r) {
        all.push({
          realName: r.realName || "",
          nickname: r.nickname || "",
          distance: r.distance || "",
          record: raceRecordTime(r),
          raceName: (race && race.raceName) || r.raceName || "",
          raceDate: (race && race.raceDate) || r.raceDate || "",
        });
      });
    });
    return all;
  }

  function pickPbSlots(personRows) {
    const best = {};
    personRows.forEach(function (r) {
      const dist = String(r.distance || "").trim();
      if (PB_SLOT_DISTS.indexOf(dist) < 0) return;
      const sec = timeToSeconds(r.record);
      if (!best[dist] || sec < timeToSeconds(best[dist].record)) best[dist] = r;
    });
    return best;
  }

  async function loadTeamMemberSheetPb(nickname, memberId) {
    const pbEl = document.getElementById("teamMemberSheetPb");
    if (!pbEl) return;
    pbEl.hidden = true;
    pbEl.innerHTML = "";
    const reqId = ++teamMemberSheetPbReqId;

    let realName = "";
    const snap =
      teamAttendLastAgg &&
      memberId &&
      teamAttendLastAgg.membersById &&
      teamAttendLastAgg.membersById[memberId];
    if (snap) realName = snap.realName || "";

    try {
      const json = await fetch(RACE_LOG_API + "?action=confirmed-races").then(function (r) {
        return r.json();
      });
      if (reqId !== teamMemberSheetPbReqId) return;
      if (!json || !json.ok) return;
      const flat = flattenConfirmedRaceResults(json.races || []);
      const nickLc = String(nickname || "").toLowerCase();
      const realLc = String(realName || "").toLowerCase();
      const mine = flat.filter(function (r) {
        const rn = String(r.realName || "").toLowerCase();
        const nn = String(r.nickname || "").toLowerCase();
        if (realLc && rn === realLc) return true;
        if (nickLc && (nn === nickLc || rn === nickLc)) return true;
        return false;
      });
      const slots = pickPbSlots(mine);
      const hasAny = PB_SLOT_DISTS.some(function (d) {
        return !!slots[d];
      });
      if (!hasAny) return;
      if (reqId !== teamMemberSheetPbReqId) return;

      pbEl.innerHTML =
        '<div class="pb-strip">' +
        PB_SLOT_DISTS.map(function (dist) {
          const pb = slots[dist];
          const label = PB_DIST_LABELS[dist] || dist;
          if (!pb) {
            return (
              '<div class="pb-cell"><div class="pb-cell-dist">' +
              escapeHtml(label) +
              '</div><div class="pb-cell-time empty">-</div></div>'
            );
          }
          return (
            '<div class="pb-cell"><div class="pb-cell-dist">' +
            escapeHtml(label) +
            '</div><div class="pb-cell-time">' +
            escapeHtml(String(pb.record)) +
            "</div></div>"
          );
        }).join("") +
        "</div>";
      pbEl.hidden = false;
    } catch (_) {
      /* keep hidden */
    }
  }

  function openTeamMemberSheetFromRow(rowEl) {
    const sheet = document.getElementById("teamMemberSheet");
    const title = document.getElementById("teamMemberSheetTitle");
    const meta = document.getElementById("teamMemberSheetMeta");
    const body = document.getElementById("teamMemberSheetBody");
    const pb = document.getElementById("teamMemberSheetPb");
    if (!sheet || !title || !body) return;

    const nickname = rowEl.getAttribute("data-nickname") || "";
    const team = rowEl.getAttribute("data-team") || "";
    const memberId = rowEl.getAttribute("data-member-id") || "";
    const count = Number(rowEl.getAttribute("data-count") || 0);
    const dates = String(rowEl.getAttribute("data-dates") || "")
      .split(",")
      .filter(Boolean);
    const meetingDateKeys =
      (teamAttendLastAgg && teamAttendLastAgg.meetingDateKeys) || [];
    const rate =
      teamMonthHelper && teamMonthHelper.memberMonthAttendRate
        ? teamMonthHelper.memberMonthAttendRate(count, meetingDateKeys.length)
        : 0;

    title.textContent = nickname || "회원";
    if (meta) {
      meta.textContent =
        teamLabel(team) +
        " · " +
        formatMonthLabel(teamAttendMonthKey || currentMonthKeyKst()) +
        " · " +
        count +
        "회 · 출석률 " +
        rate +
        "%";
    }
    if (pb) {
      pb.hidden = true;
      pb.innerHTML = "";
    }
    body.innerHTML =
      renderAttendDotsHtml(meetingDateKeys, dates) +
      '<ul class="team-member-date-list">' +
      (dates.length
        ? dates
            .map(function (dk) {
              return "<li>" + escapeHtml(formatShortAttendDate(dk)) + "</li>";
            })
            .join("")
        : '<li class="muted">이번 달 출석 없음</li>') +
      "</ul>";

    sheet.classList.remove("hidden");
    loadTeamMemberSheetPb(nickname, memberId).catch(function () {});
  }

  async function cancelMyActiveAttendance(meetingDate, meetingType) {
    const p = myProfile || loadProfile();
    if (!p || !p.memberId) {
      alert("프로필(memberId)이 필요합니다.");
      return;
    }
    if (!confirm("이 정모 출석을 취소할까요?")) return;
    try {
      const res = await fetch(BASE_URL + "?action=delete-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: p.memberId,
          meetingDate: meetingDate,
          meetingType: meetingType
        })
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.message || data.error || "취소 실패");
      }
      alert("출석이 취소되었습니다.");
      await loadMyAttendancePanel();
      if (typeof renderDashboard === "function" && myProfile) {
        try {
          renderDashboard();
        } catch (_) {}
      }
    } catch (e) {
      alert(e.message || "취소 실패");
    }
  }

  function setKioskEntryLinks() {
    /* Shell-1: 오늘 탭 키오스크 링크 제거. 이용 안내 시트(#btn-kiosk-mode)만 사용 */
  }

  function loadProfile() {
    try {
      const raw = localStorage.getItem(LS_PROFILE);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (!p || !p.nickname || !p.memberId || !p.team) return null;
      return p;
    } catch (e) {
      return null;
    }
  }

  function saveProfile(p) {
    localStorage.setItem(LS_PROFILE, JSON.stringify({ ...p, savedAt: new Date().toISOString() }));
    myProfile = p;
  }

  function clearProfile() {
    localStorage.removeItem(LS_PROFILE);
    myProfile = null;
    meetingFieldsAppliedOnce = false;
  }

  function dateKeyToInputValue(dateKey) {
    if (!/^\d{4}\/\d{2}\/\d{2}$/.test(dateKey)) return "";
    return dateKey.replace(/\//g, "-");
  }

  function inputValueToDateKey(v) {
    const s = String(v || "").trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    return m[1] + "/" + m[2] + "/" + m[3];
  }

  function getDefaultDateAndMeetingType() {
    const urlParams = new URLSearchParams(window.location.search);
    const queryMeetingDate = urlParams.get("meetingDate");
    const queryMeetingType = urlParams.get("meetingType");
    if (/^\d{4}-\d{2}-\d{2}$/.test(queryMeetingDate || "")) {
      return {
        dateKey: inputValueToDateKey(queryMeetingDate),
        meetingType: queryMeetingType || "SAT"
      };
    }
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(queryMeetingDate || "")) {
      return {
        dateKey: queryMeetingDate,
        meetingType: queryMeetingType || "SAT"
      };
    }
    const testDateParam = urlParams.get("testDate");
    let now = new Date();
    if ((IS_LOCAL || IS_STAGING) && testDateParam) {
      const parsed = new Date(testDateParam + "T10:00:00+09:00");
      if (!isNaN(parsed.getTime())) now = parsed;
    }
    const kstFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      weekday: "short"
    });
    const dow = kstFormatter.format(now);
    let dayOffset = 0;
    let meetingType = "SAT";
    switch (dow) {
      case "Mon": dayOffset = -2; meetingType = "SAT"; break;
      case "Tue": dayOffset = 0; meetingType = "TUE"; break;
      case "Wed": dayOffset = -1; meetingType = "TUE"; break;
      case "Thu": dayOffset = 0; meetingType = "THU"; break;
      case "Fri": dayOffset = -1; meetingType = "THU"; break;
      case "Sat": dayOffset = 0; meetingType = "SAT"; break;
      case "Sun": dayOffset = -1; meetingType = "SAT"; break;
    }
    const kstDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    kstDate.setDate(kstDate.getDate() + dayOffset);
    const year = kstDate.getFullYear();
    const month = String(kstDate.getMonth() + 1).padStart(2, "0");
    const day = String(kstDate.getDate()).padStart(2, "0");
    const dateKey = year + "/" + month + "/" + day;
    return { dateKey, meetingType };
  }

  function teamLabel(code) {
    const f = TEAM_OPTIONS.find((t) => t.value === code);
    return f ? f.label : code;
  }

  /** 명단 team → 유효 코드. 없거나 잘못되면 "" (S로 추정하지 않음) */
  function normalizeRosterTeam(team) {
    const code = String(team || "").trim().toUpperCase();
    if (TEAM_OPTIONS.some((t) => t.value === code)) return code;
    return "";
  }

  async function persistMemberTeam(memberId, team) {
    const id = String(memberId || "").trim();
    const code = normalizeRosterTeam(team);
    if (!id || !code) return;
    try {
      const res = await fetch(RACE_LOG_API + "?action=update-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id, team: code }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "update-member failed");
      if (Array.isArray(membersCache)) {
        const row = membersCache.find((m) => m && m.id === id);
        if (row) row.team = code;
      }
      if (kioskState && Array.isArray(kioskState.members)) {
        const row = kioskState.members.find((m) => m && m.id === id);
        if (row) row.team = code;
      }
    } catch (e) {
      console.error("persistMemberTeam", e);
    }
  }

  function meetingTypeLabel(code) {
    const map = { TUE: "화요일 정모", THU: "목요일 정모", SAT: "토요일 정모", ETC: "기타" };
    return map[code] || String(code || "");
  }

  function kstWeekdayShortForDate(year, month, day) {
    const noonKst = new Date(
      String(year) + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0") + "T12:00:00+09:00"
    );
    if (isNaN(noonKst.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Seoul" }).format(noonKst);
  }

  function formatKioskMeetingTitle(dateKeySlash, meetingType, compact) {
    const p = parseSlashDateKey(dateKeySlash);
    if (!p) return meetingTypeLabel(meetingType);
    const dowShort = kstWeekdayShortForDate(p.y, p.mo, p.d);
    const suffix = String(meetingType || "").toUpperCase() === "ETC" ? "기타" : "정모";
    if (compact) {
      const weekday = DOW_SHORT_TO_COMPACT_KO[dowShort] || "";
      return p.mo + "/" + p.d + " " + weekday + " " + suffix;
    }
    const weekday = DOW_SHORT_TO_FULL_KO[dowShort] || "";
    return p.mo + "월 " + p.d + "일 " + weekday + " " + suffix;
  }

  function updateKioskMeetingTitle(dateKeySlash, meetingType) {
    elKioskMeetingTitleFull.textContent = formatKioskMeetingTitle(dateKeySlash, meetingType, false);
    elKioskMeetingTitleCompact.textContent = formatKioskMeetingTitle(dateKeySlash, meetingType, true);
  }

  /** yyyy-mm-dd → "4월 22일 (수)" (해당 달력일의 요일을 KST 기준으로 표시) */
  function formatKoreanDateLine(iso) {
    const m = String(iso || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const y = m[1];
    const noonKst = new Date(y + "-" + m[2] + "-" + m[3] + "T12:00:00+09:00");
    if (isNaN(noonKst.getTime())) return "";
    const wEn = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Seoul" }).format(noonKst);
    const map = { Sun: "일", Mon: "월", Tue: "화", Wed: "수", Thu: "목", Fri: "금", Sat: "토" };
    const w = map[wEn] || "?";
    return mo + "월 " + d + "일 (" + w + ")";
  }

  function formatSessionFiguresHtml(memberCount, guestCount) {
    const m = Number(memberCount) || 0;
    const g = Number(guestCount) || 0;
    let h = '<span class="dash-session-num">' + m + "</span>명";
    if (g > 0) h += '<span class="dash-session-g">·명부 외 ' + g + "</span>";
    return h;
  }

  async function refreshSessionCountLine() {
    if (!elDashSessionFigures || !elDashSessionRow) return;
    const myReq = ++sessionCountReqId;
    if (sessionCountAbort) sessionCountAbort.abort();
    sessionCountAbort = new AbortController();
    const signal = sessionCountAbort.signal;
    const dk = inputValueToDateKey(elMeetingDate.value);
    const mt = elMeetingType.value;
    elDashSessionRow.classList.add("muted");
    elDashSessionFigures.textContent = "…";
    if (!dk || !mt) {
      elDashSessionFigures.textContent = "–";
      refreshTodayRosterList().catch(() => {});
      refreshCheckinButtonState().catch(() => {});
      return;
    }
    try {
      const q =
        BASE_URL +
        "?action=sessionCount&meetingDate=" +
        encodeURIComponent(elMeetingDate.value) +
        "&meetingType=" +
        encodeURIComponent(mt);
      const res = await fetch(q, { signal });
      const json = await res.json();
      if (myReq !== sessionCountReqId) return;
      if (!json.ok) throw new Error(json.error || "bad response");
      elDashSessionRow.classList.remove("muted");
      const m = Number(json.memberCount) || 0;
      const g = Number(json.guestCount) || 0;
      elDashSessionFigures.innerHTML = formatSessionFiguresHtml(m, g);
    } catch (e) {
      if (e.name === "AbortError" || myReq !== sessionCountReqId) return;
      elDashSessionRow.classList.add("muted");
      elDashSessionFigures.textContent = "–";
    }
    refreshTodayRosterList().catch(() => {});
    refreshCheckinButtonState().catch(() => {});
  }

  function scrollToTodayRoster() {
    if (!elTodayRosterCard) return;
    elTodayRosterCard.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      elTodayRosterCard.focus({ preventScroll: true });
    } catch (_) {
      /* ignore */
    }
  }

  let todayRosterReqId = 0;

  function renderTodayRosterList(items) {
    if (!elTodayRosterList) return;
    const helper =
      typeof globalThis !== "undefined" && globalThis.DmcAttendanceTodayRoster
        ? globalThis.DmcAttendanceTodayRoster
        : null;
    const sorted = helper
      ? helper.sortSessionRosterNewestFirst(items)
      : (Array.isArray(items) ? items.slice() : []).sort(
          (a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0)
        );
    if (elTodayRosterCount) {
      elTodayRosterCount.textContent = sorted.length ? sorted.length + "명" : "0명";
    }
    if (!sorted.length) {
      elTodayRosterList.innerHTML =
        '<li class="member-row"><div class="member-name" style="font-weight:500;color:var(--dmc-color-text-muted)">아직 출석자가 없습니다</div></li>';
      return;
    }
    elTodayRosterList.innerHTML = sorted
      .map((item) => {
        const nickname = item && item.nickname ? item.nickname : "이름 없음";
        const teamText = (item && (item.teamLabel || teamLabel(item.team))) || "팀 미정";
        const timeText = item && item.timeText ? item.timeText : "";
        const meta = timeText ? teamText + " · " + timeText : teamText;
        return (
          '<li class="member-row">' +
          '<div class="member-name">' +
          escapeHtml(nickname) +
          '<span class="member-dates">' +
          escapeHtml(meta) +
          "</span></div></li>"
        );
      })
      .join("");
  }

  async function refreshTodayRosterList() {
    if (!elTodayRosterList) return;
    const myReq = ++todayRosterReqId;
    const dateKey = inputValueToDateKey(elMeetingDate.value);
    const meetingType = elMeetingType.value;
    if (elTodayRosterMeetingLabel) {
      elTodayRosterMeetingLabel.textContent = meetingTypeLabel(meetingType) || "—";
    }
    if (!dateKey || !meetingType) {
      if (elTodayRosterCount) elTodayRosterCount.textContent = "–";
      elTodayRosterList.innerHTML =
        '<li class="member-row"><div class="member-name" style="font-weight:500;color:var(--dmc-color-text-muted)">날짜와 유형을 선택해 주세요</div></li>';
      return;
    }
    elTodayRosterList.innerHTML =
      '<li class="member-row"><div class="member-name" style="font-weight:500;color:var(--dmc-color-text-muted)">불러오는 중…</div></li>';
    try {
      const q =
        BASE_URL +
        "?action=status&date=" +
        encodeURIComponent(dateKey) +
        "&meetingType=" +
        encodeURIComponent(meetingType);
      const res = await fetch(q);
      const json = await res.json();
      if (myReq !== todayRosterReqId) return;
      if (!json.ok) throw new Error(json.error || "bad response");
      const helper =
        typeof globalThis !== "undefined" && globalThis.DmcAttendanceTodayRoster
          ? globalThis.DmcAttendanceTodayRoster
          : null;
      const filtered = helper
        ? helper.filterStatusByMeetingType(json.items || [], meetingType)
        : (json.items || []).filter(
            (it) =>
              String((it && it.meetingType) || "").toUpperCase() ===
              String(meetingType).toUpperCase()
          );
      renderTodayRosterList(filtered);
    } catch (e) {
      if (myReq !== todayRosterReqId) return;
      if (elTodayRosterCount) elTodayRosterCount.textContent = "–";
      elTodayRosterList.innerHTML =
        '<li class="member-row"><div class="member-name" style="color:var(--dmc-color-danger)">출석 명단을 불러오지 못했습니다</div></li>';
    }
  }

  function formatSessionRosterTitle(dateKeySlash, meetingTypeValue) {
    const dateLine = formatKoreanDateLine(dateKeyToInputValue(dateKeySlash));
    const typeLine = meetingTypeLabel(meetingTypeValue);
    if (dateLine && typeLine) return dateLine + " · " + typeLine + " 출석 명단";
    return "출석 명단";
  }

  function rosterEmptyStateHtml(text) {
    const cls = isKioskMode() ? "kiosk-empty" : "member-list-empty";
    return '<div class="' + cls + '" role="status">' + escapeHtml(text) + "</div>";
  }

  function renderSessionRosterItems(items) {
    const rows = Array.isArray(items)
      ? items
          .slice()
          .sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0))
      : [];
    if (rows.length === 0) {
      elSessionRosterList.innerHTML = rosterEmptyStateHtml("아직 출석자가 없습니다.");
      return;
    }
    elSessionRosterList.innerHTML = rows
      .map((item) => {
        const nickname = item && item.nickname ? item.nickname : "이름 없음";
        const teamText = (item && (item.teamLabel || teamLabel(item.team))) || "팀 미정";
        const timeText = item && item.timeText ? item.timeText : "";
        const meta = timeText ? teamText + " · " + timeText : teamText;
        return (
          '<div class="session-roster-row"><span class="session-roster-name">' +
          escapeHtml(nickname) +
          '</span><span class="session-roster-meta">' +
          escapeHtml(meta) +
          "</span></div>"
        );
      })
      .join("");
  }

  async function openSessionRosterModal(dateKeyOverride, meetingTypeOverride) {
    if (isKioskMode()) {
      await renderKioskRosterScreen({ history: "push" });
      return;
    }
    if (!elSessionRosterModal || !elSessionRosterList || !elSessionRosterTitle) return;
    const dateKey = dateKeyOverride || inputValueToDateKey(elMeetingDate.value);
    const meetingType = meetingTypeOverride || elMeetingType.value;
    if (!dateKey || !meetingType) {
      elDashMsg.textContent = "날짜와 유형을 먼저 선택해 주세요.";
      elDashMsg.className = "msg error";
      return;
    }
    elSessionRosterTitle.textContent = formatSessionRosterTitle(dateKey, meetingType);
    elSessionRosterList.innerHTML = rosterEmptyStateHtml("불러오는 중입니다.");
    elSessionRosterModal.classList.remove("hidden");
    try {
      const q =
        BASE_URL +
        "?action=status&date=" +
        encodeURIComponent(dateKey) +
        "&meetingType=" +
        encodeURIComponent(meetingType);
      const res = await fetch(q);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "bad response");
      renderSessionRosterItems(json.items || []);
    } catch (e) {
      elSessionRosterList.innerHTML = rosterEmptyStateHtml(
        "출석 명단을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
      );
    }
  }

  function closeSessionRosterModal() {
    if (elSessionRosterModal) elSessionRosterModal.classList.add("hidden");
  }

  function setSuccessSessionLineFromPayload(sessionCount, isGuest) {
    if (!elSuccessSessionLine) return;
    elSuccessSessionLine.classList.add("hidden");
    elSuccessSessionLine.innerHTML = "";
    if (!sessionCount || typeof sessionCount.memberCount !== "number") return;
    elSuccessSessionLine.classList.remove("hidden");
    const m = Number(sessionCount.memberCount) || 0;
    const g = Number(sessionCount.guestCount) || 0;
    const tail = isGuest ? "명부 외 반영" : "방금 반영";
    elSuccessSessionLine.innerHTML =
      '<span class="dash-session-label">현재 참여 인원</span><span class="dash-session-figures">' +
      formatSessionFiguresHtml(m, g) +
      '<span class="dash-session-g">· ' +
      tail +
      "</span></span>";
  }

  function refreshDashPrimaryLines() {
    const dateLine = formatKoreanDateLine(elMeetingDate.value);
    const typeLine = meetingTypeLabel(elMeetingType.value);
    elDashDateTypeLine.textContent = dateLine ? dateLine + " · " + typeLine : typeLine;
    if (myProfile) {
      elDashNicknameLine.textContent = myProfile.nickname;
      elDashTeamRole.textContent = teamLabel(myProfile.team) + " · 정회원";
    } else {
      elDashNicknameLine.textContent = "";
      elDashTeamRole.textContent = "";
    }
    setKioskEntryLinks();
    refreshSessionCountLine().catch(() => {});
  }

  function currentMonthKey() {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    const s = fmt.format(new Date());
    const y = s.slice(0, 4);
    const mo = s.slice(5, 7);
    return y + "-" + mo;
  }

  function meetingTypeForDateKeyLocal(dateKey) {
    if (meetingTypeHelper && typeof meetingTypeHelper.meetingTypeForDateKey === "function") {
      return meetingTypeHelper.meetingTypeForDateKey(dateKey);
    }
    const raw = String(dateKey || "").trim();
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? raw.replace(/-/g, "/")
      : raw;
    const m = normalized.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    if (!m) return "ETC";
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
    if (Number.isNaN(d.getTime())) return "ETC";
    const dow = d.getUTCDay();
    if (dow === 2) return "TUE";
    if (dow === 4) return "THU";
    if (dow === 6) return "SAT";
    return "ETC";
  }

  function syncMeetingTypeFromDate() {
    if (!elMeetingDate || !elMeetingType) return;
    const inputVal = elMeetingDate.value;
    if (!inputVal) return;
    const type = meetingTypeForDateKeyLocal(inputVal);
    elMeetingType.value = type;
    if (elMeetingTypeAutoHint) {
      elMeetingTypeAutoHint.textContent =
        "정모 유형: " + (MEETING_TYPE_LABELS[type] || type) + " (요일에 맞춰 자동)";
    }
  }

  function applyDefaultMeetingFields() {
    const { dateKey } = getDefaultDateAndMeetingType();
    elMeetingDate.value = dateKeyToInputValue(dateKey);
    syncMeetingTypeFromDate();
  }

  function renderDashboard() {
    if (!myProfile) return;
    if (!meetingFieldsAppliedOnce) {
      applyDefaultMeetingFields();
      meetingFieldsAppliedOnce = true;
    }
    refreshDashPrimaryLines();
    elDashMsg.textContent = "";
    elDashMsg.className = "msg";
    loadTodayTrainingNotice().catch(() => {});
  }

  async function loadTodayTrainingNotice() {
    const card = document.getElementById("todayTrainCard");
    const body = document.getElementById("todayTrainBody");
    if (!card || !body) return;

    const dateKey = inputValueToDateKey(elMeetingDate && elMeetingDate.value);
    const meetingType = String((elMeetingType && elMeetingType.value) || "").toUpperCase();
    if (!dateKey || !["TUE", "THU", "SAT"].includes(meetingType)) {
      card.hidden = true;
      return;
    }

    card.hidden = false;
    body.innerHTML =
      '<tr><td colspan="2" style="color:var(--dmc-color-text-muted)">불러오는 중…</td></tr>';

    try {
      const url =
        BASE_URL +
        "?action=meeting-training&meetingDate=" +
        encodeURIComponent(dateKey) +
        "&meetingType=" +
        encodeURIComponent(meetingType);
      const json = await fetch(url).then((r) => r.json());
      if (!json.ok) throw new Error(json.error || "훈련 조회 실패");
      const item = json.item || {};
      const hasContent = [
        item.time,
        item.place,
        item.trainBefore,
        item.trainMain,
        item.trainAfter,
        item.supporters,
        item.note
      ].some((v) => String(v || "").trim());

      if (!hasContent) {
        body.innerHTML =
          '<tr><td colspan="2" style="color:var(--dmc-color-text-muted)">등록된 훈련 공지가 없습니다</td></tr>';
        return;
      }

      const timePlace = [item.time, item.place].filter(Boolean).join(" ");
      const phases = [
        item.trainBefore ? '<div class="train-phase"><span>전</span> ' + escapeHtml(item.trainBefore) + "</div>" : "",
        item.trainMain ? '<div class="train-phase"><span>본</span> ' + escapeHtml(item.trainMain) + "</div>" : "",
        item.trainAfter ? '<div class="train-phase"><span>후</span> ' + escapeHtml(item.trainAfter) + "</div>" : ""
      ].join("");

      body.innerHTML =
        (timePlace
          ? "<tr><th scope=\"row\">시간/장소</th><td>" + escapeHtml(timePlace) + "</td></tr>"
          : "") +
        (phases
          ? "<tr><th scope=\"row\">훈련</th><td>" + phases + "</td></tr>"
          : "") +
        (item.supporters
          ? "<tr><th scope=\"row\">급수·서포터즈</th><td>" +
            escapeHtml(item.supporters) +
            "</td></tr>"
          : "") +
        (item.note
          ? "<tr><th scope=\"row\">메모</th><td>" + escapeHtml(item.note) + "</td></tr>"
          : "");
    } catch (e) {
      body.innerHTML =
        '<tr><td colspan="2" style="color:var(--dmc-color-danger)">' +
        escapeHtml(e.message || "로드 실패") +
        "</td></tr>";
    }
  }

  async function fetchMembers() {
    const res = await fetch(BASE_URL + "?action=members");
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "members failed");
    membersCache = json.members || [];
    return membersCache;
  }

  async function ensureSearchMembersLoaded() {
    elSearchMsg.textContent = "명단 불러오는 중…";
    elSearchMsg.className = "msg";
    try {
      await fetchMembers();
      elSearchMsg.textContent = "";
      renderMemberList(elSearchInput.value || "");
    } catch (e) {
      elSearchMsg.textContent = "명단을 불러오지 못했습니다. 네트워크를 확인해 주세요.";
      elSearchMsg.className = "msg error";
    }
  }

  function renderMemberList(filter) {
    const q = (filter || "").trim().toLowerCase();
    const list = !q
      ? membersCache.slice(0, 80)
      : membersCache.filter((m) => m.nickname.toLowerCase().includes(q)).slice(0, 120);
    if (list.length === 0) {
      if (membersCache.length === 0) {
        elMemberList.innerHTML =
          '<div class="member-list-empty" role="status">아직 불러온 명단이 없습니다. 잠시 후 다시 열어 보세요.</div>';
      } else if (q) {
        elMemberList.innerHTML =
          '<div class="member-list-empty" role="status">‘' +
          escapeHtml(q) +
          "’에 맞는 닉네임이 없어요. 철자를 줄이거나 바꿔 검색해 보세요.</div>" +
          '<p class="search-help" style="margin-top:8px">현장은 키오스크 출석을 이용해 주세요.</p>';
      } else {
        elMemberList.innerHTML = "";
      }
      return;
    }
    elMemberList.innerHTML = list
      .map(
        (m) =>
          '<div class="member-row" data-id="' +
          encodeURIComponent(m.id) +
          '" data-nick="' +
          escapeHtml(m.nickname) +
          '" data-team="' +
          escapeHtml(m.team || "") +
          '"><span><span class="member-name">' +
          escapeHtml(m.nickname) +
          '</span><div class="member-meta">' +
          escapeHtml(teamLabel(m.team) || "팀 미정") +
          "</div></span></div>"
      )
      .join("");
    elMemberList.querySelectorAll(".member-row").forEach((row) => {
      row.addEventListener("click", () => {
        const id = decodeURIComponent(row.getAttribute("data-id"));
        const nickname = row.getAttribute("data-nick");
        const team = normalizeRosterTeam(row.getAttribute("data-team"));
        if (!team) {
          pendingProfilePick = { nickname: nickname, memberId: id };
          openTeamChangeModal();
          return;
        }
        saveProfile({ nickname, memberId: id, team });
        showView("dashboard");
        renderDashboard();
      });
    });
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isKioskMode() {
    return new URLSearchParams(location.search).get("mode") === "kiosk";
  }

  function getAttendanceLogMode() {
    if (isKioskMode()) return "kiosk";
    if (elDash && !elDash.classList.contains("hidden")) return "dashboard";
    if (elSearch && !elSearch.classList.contains("hidden")) return "search";
    return "search";
  }

  function logAttendanceEvent(event, data) {
    const mode = (data && data.mode) || getAttendanceLogMode();
    const page = isKioskMode() ? "attendance-kiosk" : "attendance-v2";
    fetch(RACE_LOG_API + "?action=log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        data: {
          logSource: "client",
          page,
          mode,
          ...data,
        },
      }),
    }).catch(() => {});
  }

  function shouldReloadRosterOnError(code) {
    if (code === "ALREADY_CHECKED_IN" || code === "MEMBER_NOT_FOUND") return true;
    return !code || code === "unknown";
  }

  function renderKioskRosterListItems(items) {
    if (!elKioskRosterList) return;
    const rows = Array.isArray(items)
      ? items
          .slice()
          .sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0))
      : [];
    if (rows.length === 0) {
      elKioskRosterList.innerHTML = rosterEmptyStateHtml("아직 출석자가 없습니다.");
      return;
    }
    elKioskRosterList.innerHTML = rows
      .map((item) => {
        const nickname = item && item.nickname ? item.nickname : "이름 없음";
        const teamText = (item && (item.teamLabel || teamLabel(item.team))) || "팀 미정";
        const timeText = item && item.timeText ? item.timeText : "";
        const meta = timeText ? teamText + " · " + timeText : teamText;
        return (
          '<div class="kiosk-member-card static done"><strong>' +
          escapeHtml(nickname) +
          "</strong><span>" +
          escapeHtml(meta) +
          "</span></div>"
        );
      })
      .join("");
  }

  async function renderKioskRosterScreen(opts) {
    if (!elKioskRosterPanel || !elKioskRosterList || !elKioskRosterTitle) return;
    resetKioskIdleTimer();
    setKioskPanels("roster");
    setKioskMessage("");
    elKioskRosterTitle.textContent = formatSessionRosterTitle(
      kioskState.meetingDateKey,
      kioskState.meetingType
    );
    elKioskRosterList.innerHTML = rosterEmptyStateHtml("불러오는 중입니다.");
    if (opts && opts.history) {
      syncKioskHistory(kioskHistoryRoute("roster"), opts.history);
    }
    try {
      await reloadKioskRoster("roster_panel_open");
      renderKioskRosterListItems(kioskState.rosterItems);
    } catch (e) {
      elKioskRosterList.innerHTML = rosterEmptyStateHtml(
        "출석 명단을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
      );
    }
  }

  function renderKioskNotOnRosterScreen(opts) {
    if (!elKioskNotOnRosterPanel) return;
    resetKioskIdleTimer();
    setKioskPanels("not_on_roster");
    setKioskMessage("");
    if (elKioskGuestNickname) elKioskGuestNickname.value = "";
    if (elKioskNotOnRosterHelp) elKioskNotOnRosterHelp.textContent = NOT_ON_ROSTER_HELP;
    if (opts && opts.history) {
      syncKioskHistory(kioskHistoryRoute("not_on_roster"), opts.history);
    }
    if (elKioskGuestNickname) {
      window.setTimeout(() => {
        try {
          elKioskGuestNickname.focus();
        } catch (_) {
          /* ignore */
        }
      }, 0);
    }
  }

  function openKioskNotOnRosterScreen(fromMemberList) {
    kioskState.notOnRosterReturn = fromMemberList ? "member" : "home";
    renderKioskNotOnRosterScreen({ history: "push" });
  }

  function handleKioskNotOnRosterBack() {
    if (kioskState.notOnRosterReturn === "member") {
      renderKioskCurrentMemberScreen({ history: "replace" });
      return;
    }
    renderKioskHomeScreen({ history: "replace" });
  }

  function openPersonalNotOnRosterModal() {
    const g = getDefaultDateAndMeetingType();
    document.getElementById("guestNickname").value = "";
    if (elGuestModalTitle) elGuestModalTitle.textContent = "출석 명부에 없는 경우";
    if (elGuestModalHelp) {
      elGuestModalHelp.textContent = NOT_ON_ROSTER_HELP;
      elGuestModalHelp.classList.remove("hidden");
    }
    if (elGuestMeetingFields) elGuestMeetingFields.classList.remove("hidden");
    document.getElementById("guestMeetingType").value = g.meetingType;
    document.getElementById("guestMeetingDate").value = dateKeyToInputValue(g.dateKey);
    elGuestModal.classList.remove("hidden");
  }

  async function postCheckin(body) {
    const params = new URLSearchParams();
    Object.keys(body).forEach((k) => {
      const v = body[k];
      if (v === undefined || v === null) return;
      if (typeof v === "boolean") {
        params.append(k, v ? "true" : "false");
      } else {
        params.append(k, String(v));
      }
    });
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: params.toString()
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      const err = new Error(json.error || json.message || "request failed");
      err.code = json.error;
      err.payload = json;
      throw err;
    }
    return json;
  }

  async function showSuccessAfterCheckin(nickname, memberId, isGuest, meetingDateKey, sessionCountFromPost) {
    lastSuccessCalendarAttendedKeys = new Set();
    lastSuccessStatsMonthKey = "";
    elSuccessLine.textContent = nickname + "님, 출석이 등록되었습니다.";
    const cheers = isGuest ? SUCCESS_CHEERS_GUEST : SUCCESS_CHEERS_MEMBER;
    elSuccessCheer.textContent = cheers[Math.floor(Math.random() * cheers.length)];
    setSuccessSessionLineFromPayload(sessionCountFromPost, isGuest);
    // 대시보드 세션 카운트도 즉시 갱신 (POST 응답의 최신값 활용)
    if (sessionCountFromPost && typeof sessionCountFromPost.memberCount === "number") {
      if (elDashSessionFigures && elDashSessionRow) {
        const m = Number(sessionCountFromPost.memberCount) || 0;
        const g = Number(sessionCountFromPost.guestCount) || 0;
        elDashSessionFigures.innerHTML = formatSessionFiguresHtml(m, g);
        elDashSessionRow.classList.remove("muted");
      }
    }
    refreshTodayRosterList().catch(() => {});
    lastSuccessMeetingDateKey = meetingDateKey || "";
    lastSuccessGuest = !!isGuest;
    lastSuccessStatsLoaded = false;
    lastSuccessStats = { thisMonthCount: 0, attendanceRate: 0, consecutiveClubSessions: 0, totalPossible: 0 };
    paintSuccessViews();
    showView("success");

    if (isGuest || !memberId) return;

    try {
      const monthKey = monthKeyFromMeetingDateKeySlash(meetingDateKey);
      lastSuccessStatsMonthKey = monthKey;
      const statsUrl =
        BASE_URL +
        "?action=stats&memberId=" +
        encodeURIComponent(memberId) +
        "&month=" +
        encodeURIComponent(monthKey);
      const histUrl =
        BASE_URL +
        "?action=history&nickname=" +
        encodeURIComponent(nickname) +
        "&month=" +
        encodeURIComponent(monthKey);
      const [statsJson, histJson] = await Promise.all([
        fetch(statsUrl).then((r) => r.json()),
        fetch(histUrl).then((r) => r.json()),
      ]);
      if (!statsJson.ok) {
        elSuccessStatsLine.textContent = "통계 응답을 받지 못했습니다.";
      } else {
        lastSuccessStats = {
          thisMonthCount: Number(statsJson.thisMonthCount) || 0,
          attendanceRate: Number(statsJson.attendanceRate) || 0,
          consecutiveClubSessions: Number(statsJson.consecutiveClubSessions) || 0,
          totalPossible: Number(statsJson.totalPossible) || 0,
        };
        lastSuccessStatsLoaded = true;
      }
      if (histJson.ok && Array.isArray(histJson.items)) {
        histJson.items.forEach(function (it) {
          if (it.isGuest === true) return;
          const md = it.meetingDate;
          if (md && typeof md === "string") lastSuccessCalendarAttendedKeys.add(md);
        });
      }
      paintSuccessViews();
    } catch (e) {
      elSuccessStatsLine.textContent = "통계를 불러오지 못했습니다. 닫기 후 다시 시도해 보세요.";
    }
  }

  function clearKioskReturnTimer() {
    if (kioskState.returnTimer) {
      clearTimeout(kioskState.returnTimer);
      kioskState.returnTimer = null;
    }
  }

  function clearKioskIdleTimer() {
    if (kioskState.idleTimer) {
      clearTimeout(kioskState.idleTimer);
      kioskState.idleTimer = null;
    }
  }

  function resetKioskIdleTimer() {
    clearKioskIdleTimer();
    if (!isKioskVisible()) return;
    // 아이들·완료 화면에서는 별도 흐름이 있으므로 타이머 없음
    if (elKioskIdlePanel && !elKioskIdlePanel.classList.contains("hidden")) return;
    if (!elKioskDonePanel.classList.contains("hidden")) return;
    kioskState.idleTimer = setTimeout(() => {
      renderKioskIdleScreen({ history: "replace" });
    }, KIOSK_IDLE_TIMEOUT_MS);
  }

  function kioskDoneMemberIds() {
    const ids = new Set();
    kioskState.rosterItems.forEach((item) => {
      if (item && item.isGuest !== true && item.memberId) ids.add(item.memberId);
    });
    return ids;
  }

  function isKioskMemberDone(member) {
    if (!member) return false;
    const ids = kioskDoneMemberIds();
    if (member.id && ids.has(member.id)) return true;
    const memberKey = String(member.nickname || "").trim().toLowerCase();
    return kioskState.rosterItems.some((item) => {
      if (!item || item.isGuest === true) return false;
      if (item.memberId) return false;
      return String(item.nicknameKey || item.nickname || "").trim().toLowerCase() === memberKey;
    });
  }

  function isKioskNicknameOnRoster(nickname) {
    const nicknameKey = String(nickname || "").trim().toLowerCase();
    if (!nicknameKey) return false;
    return kioskState.rosterItems.some((item) => {
      if (!item) return false;
      return String(item.nicknameKey || item.nickname || "").trim().toLowerCase() === nicknameKey;
    });
  }

  function kioskTeamAttendanceCount(team) {
    return kioskState.rosterItems.filter((item) => {
      if (!item || item.isGuest === true || item.team === "GUEST") return false;
      return item.team === team;
    }).length;
  }

  function kioskInitialBucket(nickname) {
    const text = String(nickname || "").trim();
    if (!text) return "기타";
    const first = text.charAt(0);
    const code = first.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const initial = HANGUL_INITIALS[Math.floor((code - 0xac00) / 588)] || "기타";
      return HANGUL_DOUBLE_INITIAL_MAP[initial] || initial;
    }
    if (/^[A-Za-z]$/.test(first)) return "A-Z";
    if (/^[0-9]$/.test(first)) return "0-9";
    return "기타";
  }

  function kioskInitialLabel(bucket) {
    if (bucket === "A-Z") return "영문";
    if (bucket === "0-9") return "숫자";
    if (bucket === "기타") return "기타";
    return bucket || "첫 글자";
  }

  function kioskInitialCounts() {
    const counts = {};
    kioskState.members.forEach((member) => {
      const bucket = kioskInitialBucket(member.nickname);
      counts[bucket] = (counts[bucket] || 0) + 1;
    });
    return counts;
  }

  function kioskSortedMembers(members) {
    return members.slice().sort((a, b) => {
      const ad = isKioskMemberDone(a) ? 1 : 0;
      const bd = isKioskMemberDone(b) ? 1 : 0;
      if (ad !== bd) return ad - bd;
      return String(a.nickname || "").localeCompare(String(b.nickname || ""), "ko");
    });
  }

  function kioskInitialMembers(bucket) {
    return kioskSortedMembers(kioskState.members.filter((member) => kioskInitialBucket(member.nickname) === bucket));
  }

  function kioskTeamMembers(team) {
    return kioskSortedMembers(kioskState.members.filter((member) => member.team === team));
  }

  function kioskHistoryRoute(screen, source, value) {
    return {
      view: "kiosk",
      screen,
      source: source || "",
      value: value || ""
    };
  }

  function syncKioskHistory(route, action) {
    if (!action || kioskState.applyingHistory || !window.history) return;
    const nextState = Object.assign({}, window.history.state || {}, { dmcAttendanceKiosk: route });
    try {
      if (action === "replace") window.history.replaceState(nextState, "", window.location.href);
      if (action === "push") window.history.pushState(nextState, "", window.location.href);
    } catch (e) {
      // Embedded browser history writes can fail; the visible flow remains usable.
    }
  }

  function setKioskPanels(name) {
    if (elKioskIdlePanel) elKioskIdlePanel.classList.toggle("hidden", name !== "idle");
    elKioskHomePanel.classList.toggle("hidden", name !== "home");
    elKioskInitialPanel.classList.toggle("hidden", name !== "initial");
    elKioskTeamPanel.classList.toggle("hidden", name !== "team");
    elKioskMemberPanel.classList.toggle("hidden", name !== "member");
    if (elKioskAssignTeamPanel) elKioskAssignTeamPanel.classList.toggle("hidden", name !== "assign-team");
    if (elKioskNotOnRosterPanel) elKioskNotOnRosterPanel.classList.toggle("hidden", name !== "not_on_roster");
    if (elKioskRosterPanel) elKioskRosterPanel.classList.toggle("hidden", name !== "roster");
    elKioskDonePanel.classList.toggle("hidden", name !== "done");
  }

  function setKioskMessage(text, type) {
    elKioskMsg.textContent = text || "";
    elKioskMsg.className = "msg";
    if (type) elKioskMsg.classList.add(type);
    if (!text) elKioskMsg.classList.add("hidden");
    else elKioskMsg.classList.remove("hidden");
  }

  function isKioskVisible() {
    return !elKiosk.classList.contains("hidden") && document.visibilityState === "visible";
  }

  function setKioskWakeLockStatus(text, type) {
    if (!elKioskWakeLockStatus) return;
    elKioskWakeLockStatus.textContent = text || "";
    elKioskWakeLockStatus.className = "kiosk-wake-lock-status";
    if (type) elKioskWakeLockStatus.classList.add(type);
    if (!text) elKioskWakeLockStatus.classList.add("hidden");
    else elKioskWakeLockStatus.classList.remove("hidden");
  }

  async function releaseKioskWakeLock() {
    const wakeLock = kioskState.wakeLockSentinel;
    kioskState.wakeLockSentinel = null;
    kioskState.wakeLockEnabled = false;
    if (!wakeLock) return;
    try {
      await wakeLock.release();
    } catch (e) {
      // The lock may already have been released by the browser or OS.
    }
  }

  async function requestKioskWakeLock() {
    if (!("wakeLock" in navigator)) {
      setKioskWakeLockStatus("이 브라우저에서는 화면 켜짐 유지를 요청할 수 없습니다", "warn");
      return;
    }
    if (!isKioskVisible()) return;
    if (kioskState.wakeLockSentinel) {
      kioskState.wakeLockEnabled = true;
      setKioskWakeLockStatus("화면 켜짐 유지 중", "active");
      return;
    }
    try {
      const wakeLock = await navigator.wakeLock.request("screen");
      kioskState.wakeLockSentinel = wakeLock;
      kioskState.wakeLockEnabled = true;
      setKioskWakeLockStatus("화면 켜짐 유지 중", "active");
      wakeLock.addEventListener("release", () => {
        if (kioskState.wakeLockSentinel === wakeLock) kioskState.wakeLockSentinel = null;
        kioskState.wakeLockEnabled = false;
        if (isKioskVisible()) {
          setKioskWakeLockStatus("화면 켜짐 유지가 해제되었습니다. 다시 요청합니다.", "warn");
          requestKioskWakeLock().catch(() => {});
        } else {
          setKioskWakeLockStatus("");
        }
      });
    } catch (err) {
      kioskState.wakeLockSentinel = null;
      kioskState.wakeLockEnabled = false;
      setKioskWakeLockStatus("배터리 또는 브라우저 설정 때문에 화면 켜짐 유지 요청이 거절되었습니다", "warn");
    }
  }

  async function fetchKioskTraining() {
    const { meetingDateKey, meetingType } = kioskState;
    if (!["TUE", "THU", "SAT"].includes(meetingType)) {
      kioskState.training = null;
      return null;
    }
    const url =
      BASE_URL +
      "?action=meeting-training&meetingDate=" +
      encodeURIComponent(meetingDateKey) +
      "&meetingType=" +
      encodeURIComponent(meetingType);
    const json = await fetch(url).then((r) => r.json());
    if (!json.ok) throw new Error(json.error || "training fetch failed");
    const item = json.item || {};
    const hasContent = [
      item.time,
      item.place,
      item.trainBefore,
      item.trainMain,
      item.trainAfter,
      item.supporters,
      item.note,
    ].some((v) => String(v || "").trim());
    kioskState.training = hasContent ? item : null;
    return kioskState.training;
  }

  function updateKioskIdleContent() {
    const elBody = document.getElementById("kioskIdleTrainBody");
    if (!elBody) return;

    if (kioskState.trainingLoading) {
      elBody.outerHTML =
        '<p class="kiosk-idle-train-empty" id="kioskIdleTrainBody">훈련 정보를 불러오는 중…</p>';
      return;
    }

    const item = kioskState.training;
    if (!item) {
      elBody.outerHTML =
        '<p class="kiosk-idle-train-empty" id="kioskIdleTrainBody">등록된 훈련 공지가 없습니다</p>';
      return;
    }

    const timePlace = [item.time, item.place].filter(Boolean).join("  ·  ");
    const phases = [
      item.trainBefore ? ["전", item.trainBefore] : null,
      item.trainMain ? ["본", item.trainMain] : null,
      item.trainAfter ? ["후", item.trainAfter] : null,
    ].filter(Boolean);

    let html = "";
    if (timePlace) {
      html += '<div class="kiosk-idle-timeplace">' + escapeHtml(timePlace) + "</div>";
    }
    if (phases.length) {
      html += '<div class="kiosk-idle-phases">';
      for (const [label, text] of phases) {
        html +=
          '<div class="kiosk-idle-phase">' +
          '<span class="kiosk-idle-phase-label">' +
          escapeHtml(label) +
          "</span>" +
          "<span>" +
          escapeHtml(text) +
          "</span>" +
          "</div>";
      }
      html += "</div>";
    }
    if (item.note) {
      html +=
        '<div class="kiosk-idle-phase" style="margin-top:4px;opacity:0.75">' +
        '<span class="kiosk-idle-phase-label">메</span>' +
        "<span>" +
        escapeHtml(item.note) +
        "</span></div>";
    }

    if (!html) {
      elBody.outerHTML =
        '<p class="kiosk-idle-train-empty" id="kioskIdleTrainBody">등록된 훈련 공지가 없습니다</p>';
      return;
    }
    elBody.outerHTML = '<div id="kioskIdleTrainBody">' + html + "</div>";
  }

  function renderKioskIdleScreen(options = {}) {
    clearKioskReturnTimer();
    clearKioskIdleTimer();
    kioskState.previousPicker = "home";
    kioskState.selectedInitial = "";
    kioskState.selectedTeam = "";
    setKioskPanels("idle");
    syncKioskHistory(kioskHistoryRoute("idle"), options.history);
    updateKioskIdleContent();
    if (isKioskVisible()) requestKioskWakeLock().catch(() => {});
  }

  function renderKioskHomeScreen(options = {}) {
    clearKioskReturnTimer();
    kioskState.previousPicker = "home";
    kioskState.selectedInitial = "";
    kioskState.selectedTeam = "";
    setKioskPanels("home");
    syncKioskHistory(kioskHistoryRoute("home"), options.history);
    resetKioskIdleTimer();
    if (kioskState.loading) {
      setKioskMessage("출석 명부를 불러오는 중입니다.");
    } else if (kioskState.error) {
      setKioskMessage("출석 명부 연결 대기 중입니다.");
    } else {
      setKioskMessage("");
    }
    if (isKioskVisible()) requestKioskWakeLock().catch(() => {});
  }

  function renderKioskInitialScreen(options = {}) {
    clearKioskReturnTimer();
    kioskState.previousPicker = "initial";
    kioskState.selectedInitial = "";
    kioskState.selectedTeam = "";
    setKioskPanels("initial");
    syncKioskHistory(kioskHistoryRoute("initial"), options.history);
    resetKioskIdleTimer();
    if (kioskState.loading) {
      elKioskInitialGrid.innerHTML = '<div class="kiosk-empty" role="status">출석 명부를 불러오는 중입니다.</div>';
      setKioskMessage("");
      return;
    }
    if (kioskState.error) {
      elKioskInitialGrid.innerHTML = '<div class="kiosk-empty" role="status">' + escapeHtml(kioskState.error) + "</div>";
      setKioskMessage("");
      return;
    }
    const counts = kioskInitialCounts();
    const buckets = KIOSK_INITIAL_BUCKETS.filter((bucket) => counts[bucket] || bucket === "A-Z" || bucket === "0-9");
    elKioskInitialGrid.innerHTML = buckets
      .map((bucket) => {
        const count = counts[bucket] || 0;
        const disabled = count === 0 ? " disabled" : "";
        return (
          '<button type="button" class="kiosk-initial-button" data-initial="' +
          encodeURIComponent(bucket) +
          '"' +
          disabled +
          "><strong>" +
          escapeHtml(kioskInitialLabel(bucket)) +
          "</strong><span>" +
          count +
          "명</span></button>"
        );
      })
      .join("");
    elKioskInitialGrid.querySelectorAll(".kiosk-initial-button").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        renderKioskMemberScreen("initial", decodeURIComponent(btn.getAttribute("data-initial") || ""), { history: "push" });
      });
    });
    setKioskMessage("");
  }

  function renderKioskTeamScreen(options = {}) {
    clearKioskReturnTimer();
    kioskState.previousPicker = "team";
    kioskState.selectedInitial = "";
    kioskState.selectedTeam = "";
    setKioskPanels("team");
    syncKioskHistory(kioskHistoryRoute("team"), options.history);
    resetKioskIdleTimer();
    if (kioskState.loading) {
      elKioskTeamGrid.innerHTML = '<div class="kiosk-empty" role="status">출석 명부를 불러오는 중입니다.</div>';
      setKioskMessage("");
      return;
    }
    if (kioskState.error) {
      elKioskTeamGrid.innerHTML = '<div class="kiosk-empty" role="status">' + escapeHtml(kioskState.error) + "</div>";
      setKioskMessage("");
      return;
    }
    elKioskTeamGrid.innerHTML = TEAM_OPTIONS.map((team) => {
      const count = kioskTeamAttendanceCount(team.value);
      return (
        '<button type="button" class="kiosk-team-button" data-team="' +
        escapeHtml(team.value) +
        '"><strong>' +
        escapeHtml(team.label) +
        "</strong><span>현재 출석 " +
        count +
        "명</span></button>"
      );
    }).join("");
    elKioskTeamGrid.querySelectorAll(".kiosk-team-button").forEach((btn) => {
      btn.addEventListener("click", () => {
        renderKioskMemberScreen("team", btn.getAttribute("data-team") || "", { history: "push" });
      });
    });
    setKioskMessage("");
  }

  function renderKioskAssignTeamScreen(member) {
    clearKioskReturnTimer();
    resetKioskIdleTimer();
    kioskState.assignTeamMember = member;
    setKioskPanels("assign-team");
    setKioskMessage("");
    if (elKioskAssignTeamHelp) {
      elKioskAssignTeamHelp.textContent =
        member.nickname + "님은 팀이 지정되지 않았습니다. 출석을 위해 팀을 선택해 주세요.";
    }
    if (!elKioskAssignTeamGrid) return;
    elKioskAssignTeamGrid.innerHTML = TEAM_OPTIONS.map((team) =>
      '<button type="button" class="kiosk-team-button" data-team="' +
      escapeHtml(team.value) +
      '"><strong>' +
      escapeHtml(team.label) +
      "</strong></button>"
    ).join("");
    elKioskAssignTeamGrid.querySelectorAll(".kiosk-team-button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const team = btn.getAttribute("data-team");
        const m = kioskState.assignTeamMember;
        if (m && team) {
          kioskState.assignTeamMember = null;
          handleKioskMemberCheckin({ ...m, team }).catch(() => {});
        }
      });
    });
  }

  function renderKioskMemberScreen(source, value, options = {}) {
    clearKioskReturnTimer();
    resetKioskIdleTimer();
    const fromTeam = source === "team";
    let members = [];
    kioskState.previousPicker = source === "team" ? "team" : "initial";
    if (fromTeam) {
      kioskState.selectedInitial = "";
      kioskState.selectedTeam = value;
      members = kioskTeamMembers(value);
      const teamInfo = TEAM_OPTIONS.find((team) => team.value === value);
      elKioskMemberTitle.textContent = teamInfo ? teamInfo.label : "팀";
      elKioskMemberBackBtn.setAttribute("aria-label", "팀 선택으로 돌아가기");
    } else {
      kioskState.selectedInitial = value;
      kioskState.selectedTeam = "";
      members = kioskInitialMembers(value);
      elKioskMemberTitle.textContent = kioskInitialLabel(value);
      elKioskMemberBackBtn.setAttribute("aria-label", "첫 글자 선택으로 돌아가기");
    }
    setKioskPanels("member");
    syncKioskHistory(kioskHistoryRoute("member", fromTeam ? "team" : "initial", value), options.history);
    if (members.length === 0) {
      elKioskMemberGrid.innerHTML =
        '<div class="kiosk-empty" role="status">출석 명부에 해당 닉네임이 없습니다</div>';
    } else {
      elKioskMemberGrid.innerHTML = members.map((member) => {
        const done = isKioskMemberDone(member);
        const pending = kioskState.pendingMemberId === member.id;
        if (done) {
          return (
            '<div class="kiosk-member-card done" aria-disabled="true" data-member-id="' +
            encodeURIComponent(member.id) +
            '"><strong>' +
            escapeHtml(member.nickname) +
            "</strong><span>완료</span></div>"
          );
        }
        return (
          '<button type="button" class="kiosk-member-card" data-member-id="' +
          encodeURIComponent(member.id) +
          '"' +
          (pending ? " disabled" : "") +
          "><strong>" +
          escapeHtml(member.nickname) +
          "</strong><span>" +
          (pending ? "처리 중" : "출석") +
          "</span></button>"
        );
      }).join("");
      elKioskMemberGrid.querySelectorAll("button.kiosk-member-card").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (btn.disabled) return;
          const id = decodeURIComponent(btn.getAttribute("data-member-id") || "");
          const member = kioskState.members.find((item) => item.id === id);
          if (member) handleKioskMemberCheckin(member).catch(() => {});
        });
      });
    }
    setKioskMessage("");
  }

  function handleKioskMemberBack() {
    if (kioskState.previousPicker === "initial") {
      renderKioskInitialScreen({ history: "replace" });
      return;
    }
    if (kioskState.previousPicker === "team") {
      renderKioskTeamScreen({ history: "replace" });
      return;
    }
    renderKioskHomeScreen({ history: "replace" });
  }

  function renderKioskCurrentMemberScreen(options = {}) {
    if (kioskState.selectedInitial) {
      renderKioskMemberScreen("initial", kioskState.selectedInitial, options);
      return;
    }
    if (kioskState.selectedTeam) {
      renderKioskMemberScreen("team", kioskState.selectedTeam, options);
    }
  }

  function resetKioskDoneStats(member) {
    kioskState.doneStatsReqId += 1;
    if (!member || !member.id) {
      elKioskDoneStats.classList.add("hidden");
      elKioskDoneMonthCount.textContent = "-";
      elKioskDoneStreakCount.textContent = "-";
      return null;
    }
    elKioskDoneStats.classList.remove("hidden");
    elKioskDoneMonthCount.textContent = "...";
    elKioskDoneStreakCount.textContent = "...";
    return kioskState.doneStatsReqId;
  }

  async function loadKioskMemberStats(member, reqId) {
    try {
      const monthKey = monthKeyFromMeetingDateKeySlash(kioskState.meetingDateKey);
      const statsUrl =
        BASE_URL +
        "?action=stats&memberId=" +
        encodeURIComponent(member.id) +
        "&nickname=" +
        encodeURIComponent(member.nickname) +
        "&month=" +
        encodeURIComponent(monthKey);
      const statsJson = await fetch(statsUrl).then((r) => r.json());
      if (reqId !== kioskState.doneStatsReqId) return;
      if (!statsJson.ok) throw new Error(statsJson.error || "stats failed");
      elKioskDoneMonthCount.textContent = String(Number(statsJson.thisMonthCount) || 0) + "회";
      elKioskDoneStreakCount.textContent = String(Number(statsJson.consecutiveClubSessions) || 0) + "회";
    } catch (e) {
      if (reqId !== kioskState.doneStatsReqId) return;
      elKioskDoneMonthCount.textContent = "-";
      elKioskDoneStreakCount.textContent = "-";
    }
  }

  function showKioskDone(member, statusText) {
    clearKioskIdleTimer();
    setKioskPanels("done");
    elKioskDoneName.textContent = (member && member.nickname ? member.nickname : "출석자") + "님";
    elKioskDoneStatus.textContent = statusText || "출석 완료";
    setKioskMessage("");
    const reqId = resetKioskDoneStats(member);
    if (reqId) loadKioskMemberStats(member, reqId).catch(() => {});
    clearKioskReturnTimer();
    kioskState.returnTimer = setTimeout(() => {
      renderKioskIdleScreen({ history: "replace" });
    }, 3000);
  }

  async function reloadKioskRoster(reason) {
    const status = await fetchKioskRoster(kioskState.meetingDateKey);
    kioskState.rosterItems = Array.isArray(status.items) ? status.items : [];
    logAttendanceEvent("attendance_roster_reload", {
      mode: "kiosk",
      reason: reason || "manual",
      meetingDate: kioskState.meetingDateKey,
      meetingType: kioskState.meetingType,
      reloadTriggered: true,
      rosterCountAfter: kioskState.rosterItems.length,
      entrySource: "kiosk",
    });
    return kioskState.rosterItems;
  }

  async function handleKioskMemberCheckin(member) {
    if (isKioskProcessing || isKioskMemberDone(member)) {
      if (isKioskMemberDone(member)) showKioskDone(member, "이미 출석 완료");
      return;
    }
    if (!member.team) {
      renderKioskAssignTeamScreen(member);
      return;
    }
    isKioskProcessing = true;
    kioskState.pendingMemberId = member.id;
    renderKioskCurrentMemberScreen();
    let postSucceeded = false;
    try {
      await postCheckin({
        nickname: member.nickname,
        memberId: member.id,
        team: member.team,
        meetingType: kioskState.meetingType,
        meetingDate: kioskState.meetingDateKey,
        isGuest: false,
      });
      postSucceeded = true;
    } catch (e) {
      logAttendanceEvent("attendance_checkin_error", {
        mode: "kiosk",
        error: e.code || "unknown",
        memberId: member.id,
        nickname: member.nickname,
        meetingDate: kioskState.meetingDateKey,
        meetingType: kioskState.meetingType,
        entrySource: "kiosk",
      });
      if (shouldReloadRosterOnError(e.code)) {
        try {
          await reloadKioskRoster(e.code);
          if (e.code === "MEMBER_NOT_FOUND") {
            const refreshed = await fetchKioskMembers();
            kioskState.members = refreshed.filter((m) => m && m.id && m.nickname);
          }
        } catch (_) {
          /* reload 실패는 아래 UX로 */
        }
      }
      if (isKioskMemberDone(member)) {
        showKioskDone(member, "이미 출석 완료");
        kioskState.pendingMemberId = "";
        isKioskProcessing = false;
        return;
      }
      renderKioskCurrentMemberScreen();
      setKioskMessage("출석 처리에 실패했습니다. IT 운영총무에게 알려주세요.", "error");
      kioskState.pendingMemberId = "";
      isKioskProcessing = false;
      return;
    }
    if (postSucceeded) {
      if (member && member.id && member.team) {
        const local = kioskState.members.find((item) => item && item.id === member.id);
        if (local && !local.team) local.team = member.team;
      }
      try {
        await reloadKioskRoster("checkin_success");
      } catch (reloadErr) {
        logAttendanceEvent("attendance_roster_reload", {
          mode: "kiosk",
          reason: "checkin_success_reload_failed",
          error: String(reloadErr.message || reloadErr),
          meetingDate: kioskState.meetingDateKey,
          meetingType: kioskState.meetingType,
          entrySource: "kiosk",
          reloadTriggered: false,
        });
      }
      showKioskDone(member, "출석 완료");
    }
    kioskState.pendingMemberId = "";
    isKioskProcessing = false;
  }

  async function handleKioskNotOnRosterCheckin(nickname) {
    if (isKioskProcessing) return;
    isKioskProcessing = true;
    let postSucceeded = false;
    try {
      await postCheckin({
        nickname,
        team: "GUEST",
        meetingType: kioskState.meetingType,
        meetingDate: kioskState.meetingDateKey,
        isGuest: true,
      });
      postSucceeded = true;
    } catch (e) {
      logAttendanceEvent("attendance_checkin_error", {
        mode: "not_on_roster",
        error: e.code || "unknown",
        nickname,
        meetingDate: kioskState.meetingDateKey,
        meetingType: kioskState.meetingType,
        entrySource: "kiosk",
      });
      if (shouldReloadRosterOnError(e.code)) {
        try {
          await reloadKioskRoster(e.code);
          if (e.code === "ALREADY_CHECKED_IN" && isKioskNicknameOnRoster(nickname)) {
            showKioskDone({ nickname }, "이미 출석 완료");
            isKioskProcessing = false;
            return;
          }
        } catch (_) {
          /* ignore */
        }
      }
      setKioskMessage(
        e.code === "ALREADY_CHECKED_IN" ? "이미 출석된 기록이 있습니다." : e.message || "출석 처리에 실패했습니다.",
        "error"
      );
      isKioskProcessing = false;
      return;
    }
    if (postSucceeded) {
      try {
        await reloadKioskRoster("not_on_roster_checkin");
      } catch (reloadErr) {
        logAttendanceEvent("attendance_roster_reload", {
          mode: "not_on_roster",
          reason: "not_on_roster_checkin_reload_failed",
          error: String(reloadErr.message || reloadErr),
          nickname,
          meetingDate: kioskState.meetingDateKey,
          meetingType: kioskState.meetingType,
          entrySource: "kiosk",
          reloadTriggered: false,
        });
      }
      showKioskDone({ nickname }, "출석 완료");
    }
    isKioskProcessing = false;
  }

  async function fetchKioskJsonFromReadUrls(query) {
    let lastError = null;
    for (const baseUrl of KIOSK_READ_URLS) {
      try {
        const res = await fetch(baseUrl + query);
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "kiosk read failed");
        return json;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error("kiosk read failed");
  }

  async function fetchKioskMembers() {
    const json = await fetchKioskJsonFromReadUrls("?action=members");
    membersCache = json.members || [];
    return membersCache;
  }

  async function fetchKioskRoster(meetingDateKey) {
    return fetchKioskJsonFromReadUrls(
      "?action=status&date=" + encodeURIComponent(meetingDateKey)
    );
  }

  function renderKioskRouteFromHistory(route) {
    if (!route || route.view !== "kiosk") return false;
    kioskState.applyingHistory = true;
    try {
      if (route.screen === "idle") renderKioskIdleScreen();
      else if (route.screen === "initial") renderKioskInitialScreen();
      else if (route.screen === "team") renderKioskTeamScreen();
      else if (route.screen === "member") renderKioskMemberScreen(route.source || "initial", route.value || "");
      else if (route.screen === "not_on_roster") renderKioskNotOnRosterScreen();
      else if (route.screen === "roster") renderKioskRosterScreen();
      else renderKioskHomeScreen();
    } finally {
      kioskState.applyingHistory = false;
    }
    return true;
  }

  async function openKioskView() {
    clearKioskReturnTimer();
    clearKioskIdleTimer();
    const defaults = getDefaultDateAndMeetingType();
    kioskState.meetingDateKey = defaults.dateKey;
    kioskState.meetingType = defaults.meetingType;
    kioskState.previousPicker = "home";
    kioskState.selectedInitial = "";
    kioskState.selectedTeam = "";
    kioskState.members = [];
    kioskState.rosterItems = [];
    kioskState.pendingMemberId = "";
    kioskState.loading = true;
    kioskState.error = "";
    kioskState.training = null;
    kioskState.trainingLoading = true;
    updateKioskMeetingTitle(defaults.dateKey, defaults.meetingType);
    showView("kiosk");
    renderKioskIdleScreen({ history: "replace" });
    await requestKioskWakeLock();

    // 출석 명부와 훈련 정보를 병렬로 로딩
    const membersAndRoster = Promise.all([
      fetchKioskMembers(),
      fetchKioskRoster(defaults.dateKey),
    ]);
    const trainingFetch = fetchKioskTraining()
      .catch(() => null)
      .finally(() => {
        kioskState.trainingLoading = false;
        updateKioskIdleContent();
      });

    try {
      const [members, status] = await membersAndRoster;
      kioskState.members = members.filter((member) => member && member.id && member.nickname);
      kioskState.rosterItems = Array.isArray(status.items) ? status.items : [];
      kioskState.loading = false;
      kioskState.error = "";
    } catch (e) {
      kioskState.loading = false;
      kioskState.error = "출석 명부를 불러오지 못했습니다. 네트워크를 확인해 주세요.";
    }

    // 훈련 로딩도 기다려서 아이들 화면이 완성된 상태로 표시
    await trainingFetch;
  }

  function registerTabletInstallShell() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }


  elMeetingDate.addEventListener("change", () => {
    syncMeetingTypeFromDate();
    refreshDashPrimaryLines();
    loadTodayTrainingNotice().catch(() => {});
  });
  if (elMeetingType) {
    elMeetingType.addEventListener("change", () => {
      refreshDashPrimaryLines();
      loadTodayTrainingNotice().catch(() => {});
    });
  }

  elSearchInput.addEventListener("input", () => {
    elSearchMsg.textContent = "";
    renderMemberList(elSearchInput.value);
  });

  document.getElementById("openGuestBtn").addEventListener("click", () => {
    openPersonalNotOnRosterModal();
  });

  document.getElementById("guestCancelBtn").addEventListener("click", () => elGuestModal.classList.add("hidden"));
  elGuestModal.addEventListener("click", (e) => {
    if (e.target === elGuestModal) elGuestModal.classList.add("hidden");
  });

  document.getElementById("guestSubmitBtn").addEventListener("click", async () => {
    const nickname = document.getElementById("guestNickname").value.trim();
    const meetingType = document.getElementById("guestMeetingType").value;
    const dateKey = inputValueToDateKey(document.getElementById("guestMeetingDate").value);
    if (!nickname) {
      alert("닉네임을 입력해 주세요.");
      return;
    }
    if (!dateKey) {
      alert("날짜를 선택해 주세요.");
      return;
    }
    const btn = document.getElementById("guestSubmitBtn");
    btn.disabled = true;
    try {
      const result = await postCheckin({
        nickname,
        team: "GUEST",
        meetingType,
        meetingDate: dateKey,
        isGuest: true,
        memberId: null
      });
      elGuestModal.classList.add("hidden");
      await showSuccessAfterCheckin(nickname, null, true, dateKey, result.sessionCount);
    } catch (e) {
      logAttendanceEvent("attendance_checkin_error", {
        mode: "not_on_roster",
        error: e.code || "unknown",
        nickname,
        meetingDate: dateKey,
        meetingType,
        entrySource: "v2",
      });
      const gDate = inputValueToDateKey(document.getElementById("guestMeetingDate").value);
      const gType = document.getElementById("guestMeetingType").value;
      if (e.code === "ALREADY_CHECKED_IN" && gDate) {
        if (
          confirm(
            "이미 출석된 기록이 있습니다.\n선택한 모임일의 출석 명단을 여기서 확인할까요?"
          )
        ) {
          await openSessionRosterModal(gDate, gType);
        }
      } else {
        alert(e.code === "ALREADY_CHECKED_IN" ? "이미 출석된 기록이 있습니다." : e.message || "오류");
      }
    } finally {
      btn.disabled = false;
    }
  });

  elCheckinBtn.addEventListener("click", async () => {
    if (!myProfile) return;
    if (checkinAlreadyDone) return;
    const dateKey = inputValueToDateKey(elMeetingDate.value);
    const meetingType = elMeetingType.value;
    if (!dateKey) {
      elDashMsg.textContent = "날짜를 선택해 주세요.";
      elDashMsg.className = "msg error";
      return;
    }
    elCheckinBtn.disabled = true;
    elCheckinBtn.textContent = "처리 중…";
    elDashMsg.textContent = "";
    try {
      const result = await postCheckin({
        nickname: myProfile.nickname,
        memberId: myProfile.memberId,
        team: myProfile.team,
        meetingType,
        meetingDate: dateKey,
        isGuest: false
      });
      setCheckinButtonDone(true);
      await showSuccessAfterCheckin(myProfile.nickname, myProfile.memberId, false, dateKey, result.sessionCount);
    } catch (e) {
      if (e.code === "ALREADY_CHECKED_IN") {
        setCheckinButtonDone(true);
        logAttendanceEvent("attendance_checkin_error", {
          mode: "dashboard",
          error: "ALREADY_CHECKED_IN",
          memberId: myProfile.memberId,
          nickname: myProfile.nickname,
          meetingDate: dateKey,
          meetingType,
          entrySource: "v2",
        });
        refreshSessionCountLine().catch(() => {});
        const rawMsg =
          (e.payload && e.payload.message) || "이미 해당 모임일에 출석 기록이 있습니다.";
        elDashMsg.innerHTML =
          escapeHtml(rawMsg) +
          ' <button type="button" class="inline-text-button" id="openDuplicateRosterBtn">출석 명단에서 확인</button>';
        const dupBtn = document.getElementById("openDuplicateRosterBtn");
        if (dupBtn) {
          dupBtn.addEventListener("click", () => {
            scrollToTodayRoster();
            refreshTodayRosterList().catch(() => {});
          });
        }
      } else if (e.code === "MEMBER_NOT_FOUND") {
        elDashMsg.textContent = "회원 정보가 유효하지 않습니다. 프로필을 다시 설정해 주세요.";
        elDashMsg.className = "msg error";
        setCheckinButtonDone(false);
      } else {
        elDashMsg.textContent = e.message || "출석 처리에 실패했습니다.";
        elDashMsg.className = "msg error";
        setCheckinButtonDone(false);
      }
      if (e.code === "ALREADY_CHECKED_IN") {
        elDashMsg.className = "msg error";
      }
    } finally {
      if (!checkinAlreadyDone) {
        elCheckinBtn.disabled = false;
        elCheckinBtn.textContent = CHECKIN_BTN_LABEL;
        elCheckinBtn.classList.remove("dash-checkin-done");
      }
    }
  });

  document.getElementById("resetProfileBtn").addEventListener("click", async () => {
    if (!confirm("이 기기에 저장된 출석 프로필을 지울까요?")) return;
    clearProfile();
    refreshMoreProfileCard();
    showShellTab("today");
    showView("search");
    elSearchInput.value = "";
    await ensureSearchMembersLoaded();
  });

  const elChangeTeamBtn = document.getElementById("changeTeamBtn");
  if (elChangeTeamBtn) {
    elChangeTeamBtn.addEventListener("click", () => {
      openTeamChangeModal();
    });
  }
  function openTeamChangeModal() {
    const sel = document.getElementById("teamSelect");
    if (pendingProfilePick) {
      sel.innerHTML =
        '<option value="">팀 선택</option>' +
        TEAM_OPTIONS.map((t) => '<option value="' + t.value + '">' + t.label + "</option>").join("");
      sel.value = "";
    } else {
      sel.innerHTML = TEAM_OPTIONS.map((t) => '<option value="' + t.value + '">' + t.label + "</option>").join("");
      sel.value = myProfile && myProfile.team ? myProfile.team : "S";
    }
    elTeamModal.classList.remove("hidden");
  }

  function openEditProfileFlow() {
    if (myProfile) {
      openTeamChangeModal();
      return;
    }
    showShellTab("today");
    showView("search");
    elSearchInput.value = "";
    ensureSearchMembersLoaded().catch(() => {});
  }

  function openGuideSheet() {
    const sheet = document.getElementById("guideSheet");
    if (sheet) sheet.hidden = false;
  }

  function closeGuideSheet() {
    const sheet = document.getElementById("guideSheet");
    if (sheet) sheet.hidden = true;
  }

  function enterKioskModeFromGuide() {
    if (!confirm("공용 기기에서 사용합니다. 개인 프로필이 숨겨집니다.")) return;
    const u = new URL(location.href);
    const defaults = getDefaultDateAndMeetingType();
    u.searchParams.set("mode", "kiosk");
    const dateValue =
      elMeetingDate && elMeetingDate.value
        ? elMeetingDate.value
        : dateKeyToInputValue(defaults.dateKey);
    const typeValue =
      elMeetingType && elMeetingType.value ? elMeetingType.value : defaults.meetingType;
    if (dateValue) u.searchParams.set("meetingDate", dateValue);
    if (typeValue) u.searchParams.set("meetingType", typeValue);
    u.hash = "";
    location.href = u.pathname + u.search;
  }

  const elTabBar = document.getElementById("tab-bar");
  if (elTabBar) {
    elTabBar.addEventListener("click", (e) => {
      const btn = e.target.closest(".tab-btn");
      if (!btn) return;
      showShellTab(btn.getAttribute("data-tab"));
    });
  }

  const elBrandBarHome = document.getElementById("brandBarHome");
  if (elBrandBarHome) {
    elBrandBarHome.addEventListener("click", () => showShellTab("today"));
  }

  window.addEventListener("hashchange", () => {
    if (!isKioskMode()) showShellTab(parseShellHash());
  });

  const elBtnEditProfile = document.getElementById("btn-edit-profile");
  if (elBtnEditProfile) {
    elBtnEditProfile.addEventListener("click", openEditProfileFlow);
  }

  const elBtnGuide = document.getElementById("btn-guide");
  if (elBtnGuide) {
    elBtnGuide.addEventListener("click", openGuideSheet);
  }

  const elGuideClose = document.getElementById("guideSheetClose");
  if (elGuideClose) {
    elGuideClose.addEventListener("click", closeGuideSheet);
  }

  const elGuideSheet = document.getElementById("guideSheet");
  if (elGuideSheet) {
    elGuideSheet.addEventListener("click", (e) => {
      if (e.target === elGuideSheet) closeGuideSheet();
    });
  }

  const elBtnKioskMode = document.getElementById("btn-kiosk-mode");
  if (elBtnKioskMode) {
    elBtnKioskMode.addEventListener("click", enterKioskModeFromGuide);
  }


  const elMyAttendPrev = document.getElementById("myAttendPrev");
  const elMyAttendNext = document.getElementById("myAttendNext");
  if (elMyAttendPrev) {
    elMyAttendPrev.addEventListener("click", () => {
      myAttendMonthKey = shiftMonthKey(myAttendMonthKey || currentMonthKeyKst(), -1);
      loadMyAttendancePanel().catch(() => {});
    });
  }
  if (elMyAttendNext) {
    elMyAttendNext.addEventListener("click", () => {
      myAttendMonthKey = shiftMonthKey(myAttendMonthKey || currentMonthKeyKst(), 1);
      loadMyAttendancePanel().catch(() => {});
    });
  }

  const elMyViewList = document.getElementById("myViewList");
  const elMyViewCal = document.getElementById("myViewCal");
  if (elMyViewList) {
    elMyViewList.addEventListener("click", () => {
      myAttendViewMode = "list";
      applyMyAttendViewMode();
    });
  }
  if (elMyViewCal) {
    elMyViewCal.addEventListener("click", () => {
      myAttendViewMode = "cal";
      applyMyAttendViewMode();
    });
  }

  const elMyAttendList = document.getElementById("myAttendList");
  if (elMyAttendList) {
    elMyAttendList.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-cancel-attend");
      if (!btn) return;
      cancelMyActiveAttendance(
        btn.getAttribute("data-cancel-date"),
        btn.getAttribute("data-cancel-type")
      ).catch(() => {});
    });
  }

  const elTeamAttendPrev = document.getElementById("teamAttendPrev");
  const elTeamAttendNext = document.getElementById("teamAttendNext");
  if (elTeamAttendPrev) {
    elTeamAttendPrev.addEventListener("click", () => {
      teamAttendMonthKey = shiftMonthKey(teamAttendMonthKey || currentMonthKeyKst(), -1);
      loadTeamAttendancePanel().catch(() => {});
    });
  }
  if (elTeamAttendNext) {
    elTeamAttendNext.addEventListener("click", () => {
      teamAttendMonthKey = shiftMonthKey(teamAttendMonthKey || currentMonthKeyKst(), 1);
      loadTeamAttendancePanel().catch(() => {});
    });
  }
  const elTeamAttendChips = document.getElementById("teamAttendChips");
  if (elTeamAttendChips) {
    elTeamAttendChips.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-team-filter]");
      if (!chip) return;
      teamAttendFilter = chip.getAttribute("data-team-filter") || "ALL";
      loadTeamAttendancePanel().catch(() => {});
    });
  }

  const elTeamAttendList = document.getElementById("teamAttendList");
  if (elTeamAttendList) {
    elTeamAttendList.addEventListener("click", function (e) {
      const row = e.target.closest(".member-row[data-nickname]");
      if (row) openTeamMemberSheetFromRow(row);
    });
    elTeamAttendList.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      const row = e.target.closest(".member-row[data-nickname]");
      if (!row) return;
      e.preventDefault();
      openTeamMemberSheetFromRow(row);
    });
  }
  const elTeamMemberSheet = document.getElementById("teamMemberSheet");
  const elTeamMemberSheetClose = document.getElementById("teamMemberSheetCloseBtn");
  if (elTeamMemberSheetClose) {
    elTeamMemberSheetClose.addEventListener("click", closeTeamMemberSheet);
  }
  if (elTeamMemberSheet) {
    elTeamMemberSheet.addEventListener("click", function (e) {
      if (e.target === elTeamMemberSheet) closeTeamMemberSheet();
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    const sheet = document.getElementById("teamMemberSheet");
    if (sheet && !sheet.classList.contains("hidden")) closeTeamMemberSheet();
  });

  document.getElementById("teamCancelBtn").addEventListener("click", () => {
    pendingProfilePick = null;
    elTeamModal.classList.add("hidden");
  });
  elTeamModal.addEventListener("click", (e) => {
    if (e.target === elTeamModal) {
      pendingProfilePick = null;
      elTeamModal.classList.add("hidden");
    }
  });

  elDashSessionRow.addEventListener("click", () => {
    scrollToTodayRoster();
    refreshTodayRosterList().catch(() => {});
  });
  elSessionRosterCloseBtn.addEventListener("click", closeSessionRosterModal);
  elSessionRosterModal.addEventListener("click", (e) => {
    if (e.target === elSessionRosterModal) closeSessionRosterModal();
  });

  document.getElementById("teamSaveBtn").addEventListener("click", () => {
    const v = document.getElementById("teamSelect").value;
    if (pendingProfilePick) {
      if (!normalizeRosterTeam(v)) {
        alert("팀을 선택해 주세요.");
        return;
      }
      const profile = {
        nickname: pendingProfilePick.nickname,
        memberId: pendingProfilePick.memberId,
        team: v,
      };
      pendingProfilePick = null;
      saveProfile(profile);
      persistMemberTeam(profile.memberId, v).catch(() => {});
      elTeamModal.classList.add("hidden");
      showView("dashboard");
      renderDashboard();
      return;
    }
    if (!myProfile) return;
    saveProfile({ ...myProfile, team: v });
    persistMemberTeam(myProfile.memberId, v).catch(() => {});
    elTeamModal.classList.add("hidden");
    renderDashboard();
  });

  document.getElementById("successDoneBtn").addEventListener("click", () => {
    showView("dashboard");
    renderDashboard();
  });

  const elKioskIdleCheckinBtn = document.getElementById("kioskIdleCheckinBtn");
  if (elKioskIdleCheckinBtn) {
    elKioskIdleCheckinBtn.addEventListener("click", () => {
      renderKioskHomeScreen({ history: "push" });
    });
  }

  document.getElementById("kioskChooseNicknameBtn").addEventListener("click", () => {
    renderKioskInitialScreen({ history: "push" });
  });

  document.getElementById("kioskChooseTeamBtn").addEventListener("click", () => {
    renderKioskTeamScreen({ history: "push" });
  });

  document.getElementById("kioskInitialHomeBtn").addEventListener("click", () => {
    renderKioskHomeScreen({ history: "replace" });
  });

  document.getElementById("kioskTeamHomeBtn").addEventListener("click", () => {
    renderKioskHomeScreen({ history: "replace" });
  });

  if (elKioskMemberNotOnRosterBtn) {
    elKioskMemberNotOnRosterBtn.addEventListener("click", () => {
      openKioskNotOnRosterScreen(true);
    });
  }

  if (elKioskNotOnRosterSubmitBtn) {
    elKioskNotOnRosterSubmitBtn.addEventListener("click", async () => {
      const nickname = (elKioskGuestNickname && elKioskGuestNickname.value.trim()) || "";
      if (!nickname) {
        setKioskMessage("닉네임을 입력해 주세요.", "error");
        if (elKioskGuestNickname) elKioskGuestNickname.focus();
        return;
      }
      elKioskNotOnRosterSubmitBtn.disabled = true;
      try {
        await handleKioskNotOnRosterCheckin(nickname);
      } finally {
        elKioskNotOnRosterSubmitBtn.disabled = false;
      }
    });
  }

  const elKioskAssignTeamBackBtn = document.getElementById("kioskAssignTeamBackBtn");
  if (elKioskAssignTeamBackBtn) {
    elKioskAssignTeamBackBtn.addEventListener("click", () => {
      kioskState.assignTeamMember = null;
      renderKioskCurrentMemberScreen({ history: "replace" });
    });
  }

  const elKioskNotOnRosterBackBtn = document.getElementById("kioskNotOnRosterBackBtn");
  if (elKioskNotOnRosterBackBtn) {
    elKioskNotOnRosterBackBtn.addEventListener("click", handleKioskNotOnRosterBack);
  }

  const elKioskRosterBackBtn = document.getElementById("kioskRosterBackBtn");
  if (elKioskRosterBackBtn) {
    elKioskRosterBackBtn.addEventListener("click", () => {
      renderKioskHomeScreen({ history: "replace" });
    });
  }

  document.getElementById("kioskRosterBtn").addEventListener("click", () => {
    renderKioskRosterScreen({ history: "push" }).catch(() => {});
  });

  elKioskMemberBackBtn.addEventListener("click", handleKioskMemberBack);

  window.addEventListener("popstate", (event) => {
    const route = event.state && event.state.dmcAttendanceKiosk;
    if (route) renderKioskRouteFromHistory(route);
  });

  // 키오스크: 터치·클릭 시 유휴 타이머 리셋
  if (elKiosk) {
    elKiosk.addEventListener("touchstart", resetKioskIdleTimer, { passive: true });
    elKiosk.addEventListener("click", resetKioskIdleTimer);
  }

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible") {
      if (!kioskState.wakeLockEnabled) await requestKioskWakeLock();
      return;
    }
    await releaseKioskWakeLock();
  });

  async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    registerTabletInstallShell();
    setKioskEntryLinks();
    if (urlParams.get("mode") === "kiosk") {
      setKioskShellVisible(true);
      await openKioskView();
      return;
    }
    setKioskShellVisible(false);
    showShellTab(parseShellHash());
    myProfile = loadProfile();
    if (myProfile) {
      showView("dashboard");
      renderDashboard();
    } else {
      showView("search");
      await ensureSearchMembersLoaded();
    }
    refreshMoreProfileCard();
  }

  init();
})();
