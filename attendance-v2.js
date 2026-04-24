(function () {
  const IS_LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname.startsWith("192.168.") || location.hostname.startsWith("172.");
  const IS_STAGING = location.hostname.includes("dmc-attendance-staging");
  const PROD_URL = "https://asia-northeast3-dmc-attendance.cloudfunctions.net/attendance";
  const STAGING_URL = "https://asia-northeast3-dmc-attendance-staging.cloudfunctions.net/attendance";
  const LOCAL_URL = "http://" + location.hostname + ":5001/dmc-attendance/asia-northeast3/attendance";
  const BASE_URL = IS_LOCAL ? LOCAL_URL : (IS_STAGING ? STAGING_URL : PROD_URL);

  const LS_PROFILE = "dmc_attendance_v2_profile";
  const CHECKIN_BTN_LABEL = "출석 체크";
  const SUCCESS_CHEERS_MEMBER = [
    "정모 출석이 기록에 반영되었어요.",
    "출석 등록이 완료되었습니다.",
    "클럽 출석에 참여해 주셔서 감사합니다."
  ];
  const SUCCESS_CHEERS_GUEST = ["게스트로 함께해 주셔서 감사해요!"];

  const TEAM_OPTIONS = [
    { value: "S", label: "S팀" },
    { value: "T1", label: "1팀" },
    { value: "T2", label: "2팀" },
    { value: "T3", label: "3팀" },
    { value: "T4", label: "4팀" },
    { value: "T5", label: "5팀" }
  ];

  const elSearch = document.getElementById("viewSearch");
  const elDash = document.getElementById("viewDashboard");
  const elSuccess = document.getElementById("viewSuccess");
  const elSearchInput = document.getElementById("searchInput");
  const elMemberList = document.getElementById("memberList");
  const elSearchMsg = document.getElementById("searchMsg");
  const elDashDateTypeLine = document.getElementById("dashDateTypeLine");
  const elDashNicknameLine = document.getElementById("dashNicknameLine");
  const elDashTeamRole = document.getElementById("dashTeamRole");
  const elMeetingDate = document.getElementById("meetingDate");
  const elMeetingType = document.getElementById("meetingType");
  const elCheckinBtn = document.getElementById("checkinBtn");
  const elDashMsg = document.getElementById("dashMsg");
  const elSuccessLine = document.getElementById("successLine");
  const elSuccessCheer = document.getElementById("successCheer");
  const elSuccessPanelCal = document.getElementById("successPanelCal");
  const elSuccessStatsLine = document.getElementById("successStatsLine");
  const elSuccessSessionLine = document.getElementById("successSessionLine");
  const elDashSessionRow = document.getElementById("dashSessionRow");
  const elDashSessionFigures = document.getElementById("dashSessionFigures");
  const elDashSessionListLink = document.getElementById("dashSessionListLink");
  const elGuestModal = document.getElementById("guestModal");
  const elTeamModal = document.getElementById("teamModal");

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
      elSuccessStatsLine.textContent = "게스트 출석은 정회원 월 통계와 별도로 관리됩니다.";
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

  /** 메인 출석 페이지(index.html)에서 해당 모임일 전체 명단(status)을 보도록 연결 */
  function buildMainAttendanceListUrl(dateKeySlash) {
    const dk = String(dateKeySlash || "").trim();
    if (!/^\d{4}\/\d{2}\/\d{2}$/.test(dk)) return "index.html";
    return "index.html?date=" + encodeURIComponent(dateKeyToInputValue(dk));
  }

  function inputValueToDateKey(v) {
    const s = String(v || "").trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    return m[1] + "/" + m[2] + "/" + m[3];
  }

  function getDefaultDateAndMeetingType() {
    const urlParams = new URLSearchParams(window.location.search);
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

  function meetingTypeLabel(code) {
    const map = { TUE: "화요일 정모", THU: "목요일 정모", SAT: "토요일 정모", ETC: "기타" };
    return map[code] || String(code || "");
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
    if (g > 0) h += '<span class="dash-session-g">·게 ' + g + "</span>";
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
  }

  function setSuccessSessionLineFromPayload(sessionCount, isGuest) {
    if (!elSuccessSessionLine) return;
    elSuccessSessionLine.classList.add("hidden");
    elSuccessSessionLine.innerHTML = "";
    if (!sessionCount || typeof sessionCount.memberCount !== "number") return;
    elSuccessSessionLine.classList.remove("hidden");
    const m = Number(sessionCount.memberCount) || 0;
    const g = Number(sessionCount.guestCount) || 0;
    const tail = isGuest ? "게스트 반영" : "방금 반영";
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
    if (elDashSessionListLink) {
      const dk = inputValueToDateKey(elMeetingDate.value);
      if (dk) {
        elDashSessionListLink.href = buildMainAttendanceListUrl(dk);
        elDashSessionListLink.classList.remove("hidden");
      } else {
        elDashSessionListLink.href = "index.html";
        elDashSessionListLink.classList.add("hidden");
      }
    }
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

  function applyDefaultMeetingFields() {
    const { dateKey, meetingType } = getDefaultDateAndMeetingType();
    elMeetingDate.value = dateKeyToInputValue(dateKey);
    elMeetingType.value = meetingType;
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
          "’에 맞는 닉네임이 없어요. 철자를 줄이거나 바꿔 검색해 보세요.</div>";
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
        const team = row.getAttribute("data-team") || "S";
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
    elSuccessLine.textContent = (isGuest ? "게스트 " : "") + nickname + "님, 출석이 등록되었습니다.";
    const cheers = isGuest ? SUCCESS_CHEERS_GUEST : SUCCESS_CHEERS_MEMBER;
    elSuccessCheer.textContent = cheers[Math.floor(Math.random() * cheers.length)];
    setSuccessSessionLineFromPayload(sessionCountFromPost, isGuest);
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


  elMeetingDate.addEventListener("change", refreshDashPrimaryLines);
  elMeetingType.addEventListener("change", refreshDashPrimaryLines);

  elSearchInput.addEventListener("input", () => {
    elSearchMsg.textContent = "";
    renderMemberList(elSearchInput.value);
  });

  document.getElementById("openGuestBtn").addEventListener("click", () => {
    const g = getDefaultDateAndMeetingType();
    document.getElementById("guestNickname").value = "";
    document.getElementById("guestMeetingType").value = g.meetingType;
    document.getElementById("guestMeetingDate").value = dateKeyToInputValue(g.dateKey);
    elGuestModal.classList.remove("hidden");
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
      const gDate = inputValueToDateKey(document.getElementById("guestMeetingDate").value);
      if (e.code === "ALREADY_CHECKED_IN" && gDate) {
        const u = buildMainAttendanceListUrl(gDate);
        if (
          confirm(
            "이미 출석된 기록이 있습니다.\n선택한 모임일의 전체 명단을 메인 출석 페이지에서 확인할까요?"
          )
        ) {
          window.open(u, "_blank", "noopener,noreferrer");
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
      await showSuccessAfterCheckin(myProfile.nickname, myProfile.memberId, false, dateKey, result.sessionCount);
    } catch (e) {
      if (e.code === "ALREADY_CHECKED_IN") {
        const rawMsg =
          (e.payload && e.payload.message) || "이미 해당 모임일에 출석 기록이 있습니다.";
        const dupDate =
          (e.payload && e.payload.existingRecord && e.payload.existingRecord.meetingDate) || dateKey;
        const listUrl = buildMainAttendanceListUrl(dupDate);
        elDashMsg.innerHTML =
          escapeHtml(rawMsg) +
          ' <a href="' +
          listUrl +
          '" target="_blank" rel="noopener noreferrer">출석 명단에서 확인</a>';
      } else if (e.code === "MEMBER_NOT_FOUND") {
        elDashMsg.textContent = "회원 정보가 유효하지 않습니다. 프로필을 다시 설정해 주세요.";
      } else {
        elDashMsg.textContent = e.message || "출석 처리에 실패했습니다.";
      }
      elDashMsg.className = "msg error";
    } finally {
      elCheckinBtn.disabled = false;
      elCheckinBtn.textContent = CHECKIN_BTN_LABEL;
    }
  });

  document.getElementById("resetProfileBtn").addEventListener("click", async () => {
    if (!confirm("이 기기에 저장된 출석 프로필을 지울까요?")) return;
    clearProfile();
    showView("search");
    elSearchInput.value = "";
    await ensureSearchMembersLoaded();
  });

  document.getElementById("changeTeamBtn").addEventListener("click", () => {
    const sel = document.getElementById("teamSelect");
    sel.innerHTML = TEAM_OPTIONS.map((t) => '<option value="' + t.value + '">' + t.label + "</option>").join("");
    sel.value = myProfile && myProfile.team ? myProfile.team : "S";
    elTeamModal.classList.remove("hidden");
  });

  document.getElementById("teamCancelBtn").addEventListener("click", () => elTeamModal.classList.add("hidden"));
  elTeamModal.addEventListener("click", (e) => {
    if (e.target === elTeamModal) elTeamModal.classList.add("hidden");
  });

  document.getElementById("teamSaveBtn").addEventListener("click", () => {
    if (!myProfile) return;
    const v = document.getElementById("teamSelect").value;
    saveProfile({ ...myProfile, team: v });
    elTeamModal.classList.add("hidden");
    renderDashboard();
  });

  document.getElementById("successDoneBtn").addEventListener("click", () => {
    showView("dashboard");
    renderDashboard();
  });

  async function init() {
    myProfile = loadProfile();
    if (myProfile) {
      showView("dashboard");
      renderDashboard();
    } else {
      showView("search");
      await ensureSearchMembersLoaded();
    }
  }

  init();
})();
