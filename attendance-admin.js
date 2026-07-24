(function () {
  const IS_LOCAL =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname.startsWith("192.168.") ||
    location.hostname.startsWith("172.");

  /** Race API — verify-admin + members CRUD (admin.html과 동일) */
  const RACE_API = IS_LOCAL
    ? "http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race"
    : "https://race-nszximpvtq-du.a.run.app";

  /** Attendance API — status / sessionCount */
  const ATTENDANCE_API = IS_LOCAL
    ? "http://" + location.hostname + ":5001/dmc-attendance/asia-northeast3/attendance"
    : "https://asia-northeast3-dmc-attendance.cloudfunctions.net/attendance";

  const AUTH_KEY = "dmc_attendance_admin_auth";
  const LEGACY_AUTH_KEY = "dmc_admin_auth";
  const TABS = ["attendance", "members", "training"];
  const TEAM_OPTIONS = [
    { value: "", label: "미정" },
    { value: "S", label: "S팀" },
    { value: "T1", label: "1팀" },
    { value: "T2", label: "2팀" },
    { value: "T3", label: "3팀" },
    { value: "T4", label: "4팀" },
    { value: "T5", label: "5팀" }
  ];
  const MEETING_LABEL = {
    TUE: "화요일 정모",
    THU: "목요일 정모",
    SAT: "토요일 정모",
    ETC: "기타"
  };

  let allMembers = [];
  let showHidden = false;
  let editingId = null;
  let adminRole = "";
  let adminPwCache = "";

  function migrateLegacyAuth() {
    if (sessionStorage.getItem(AUTH_KEY) === "ok") return;
    if (sessionStorage.getItem(LEGACY_AUTH_KEY) === "ok") {
      sessionStorage.setItem(AUTH_KEY, "ok");
    }
  }

  function isAuthed() {
    migrateLegacyAuth();
    return sessionStorage.getItem(AUTH_KEY) === "ok";
  }

  function showToast(msg, isError) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.toggle("error", !!isError);
    t.classList.add("show");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () {
      t.classList.remove("show");
    }, isError ? 4000 : 2200);
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function teamLabel(code) {
    const c = String(code || "").trim().toUpperCase();
    const found = TEAM_OPTIONS.find(function (t) {
      return t.value === c;
    });
    return found ? found.label : c || "미정";
  }

  function teamSelectHtml(selected, id) {
    const cur = String(selected || "").trim().toUpperCase();
    return (
      '<select id="' +
      id +
      '">' +
      TEAM_OPTIONS.map(function (t) {
        const sel = t.value === cur || (!cur && t.value === "") ? " selected" : "";
        return '<option value="' + t.value + '"' + sel + ">" + t.label + "</option>";
      }).join("") +
      "</select>"
    );
  }

  function parseHash() {
    const h = (location.hash || "#attendance").replace(/^#/, "");
    return TABS.indexOf(h) >= 0 ? h : "attendance";
  }

  function showTab(tabId) {
    TABS.forEach(function (id) {
      const panel = document.getElementById("panel-" + id);
      const btn = document.querySelector('.tab-btn[data-tab="' + id + '"]');
      const on = id === tabId;
      if (panel) {
        panel.classList.toggle("active", on);
        panel.hidden = !on;
      }
      if (btn) btn.classList.toggle("active", on);
    });
    if (location.hash !== "#" + tabId) {
      history.replaceState(null, "", "#" + tabId);
    }
    if (tabId === "members") loadMembers();
    if (tabId === "attendance") {
      /* keep current day roster; user can reload */
    }
    if (tabId === "training") loadTrainingWeek().catch(function () {});
  }

  function inputToSlashDate(v) {
    const m = String(v || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    return m[1] + "/" + m[2] + "/" + m[3];
  }

  function slashToInputDate(dateKey) {
    if (!/^\d{4}\/\d{2}\/\d{2}$/.test(dateKey || "")) return "";
    return dateKey.replace(/\//g, "-");
  }

  /** docs/MEETING_INFO.md · attendance-v2 resolveDefaultMeeting */
  function resolveDefaultMeeting(now) {
    now = now || new Date();
    const dow = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      weekday: "short"
    }).format(now);
    let dayOffset = 0;
    let meetingType = "SAT";
    switch (dow) {
      case "Mon":
        dayOffset = -2;
        meetingType = "SAT";
        break;
      case "Tue":
        dayOffset = 0;
        meetingType = "TUE";
        break;
      case "Wed":
        dayOffset = -1;
        meetingType = "TUE";
        break;
      case "Thu":
        dayOffset = 0;
        meetingType = "THU";
        break;
      case "Fri":
        dayOffset = -1;
        meetingType = "THU";
        break;
      case "Sat":
        dayOffset = 0;
        meetingType = "SAT";
        break;
      case "Sun":
        dayOffset = -1;
        meetingType = "SAT";
        break;
    }
    const kstDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    kstDate.setDate(kstDate.getDate() + dayOffset);
    const y = kstDate.getFullYear();
    const mo = String(kstDate.getMonth() + 1).padStart(2, "0");
    const d = String(kstDate.getDate()).padStart(2, "0");
    return { dateKey: y + "/" + mo + "/" + d, meetingType: meetingType };
  }

  function applyDefaultAttendanceFilters() {
    const def = resolveDefaultMeeting();
    const dateEl = document.getElementById("attDate");
    const typeEl = document.getElementById("attType");
    if (dateEl) dateEl.value = slashToInputDate(def.dateKey);
    if (typeEl) typeEl.value = def.meetingType;
    const monthEl = document.getElementById("attMonth");
    if (monthEl) {
      const parts = def.dateKey.split("/");
      monthEl.value = parts[0] + "-" + parts[1];
    }
    const fromEl = document.getElementById("csvFrom");
    const toEl = document.getElementById("csvTo");
    if (fromEl && toEl) {
      const parts = def.dateKey.split("/");
      fromEl.value = parts[0] + "-" + parts[1] + "-01";
      toEl.value = slashToInputDate(def.dateKey);
    }
  }

  function revealShell() {
    document.getElementById("authOverlay").style.display = "none";
    document.getElementById("shell").classList.add("show");
    const meta = document.getElementById("topbarMeta");
    if (meta && adminRole) meta.textContent = adminRole;
    applyDefaultAttendanceFilters();
    showTab(parseHash());
    loadAttendanceDay().catch(function () {});
  }

  async function tryAuth() {
    const pw = document.getElementById("authPw").value;
    const errEl = document.getElementById("authError");
    try {
      const res = await fetch(RACE_API + "?action=verify-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pw: pw })
      });
      const data = await res.json();
      if (data.ok) {
        sessionStorage.setItem(AUTH_KEY, "ok");
        adminRole = data.role || "operator";
        adminPwCache = pw;
        revealShell();
      } else {
        errEl.style.display = "block";
        document.getElementById("authPw").value = "";
        document.getElementById("authPw").focus();
      }
    } catch (_) {
      errEl.style.display = "block";
    }
  }

  function checkAuth() {
    if (!isAuthed()) return;
    revealShell();
  }

  function setAttendanceMode(mode) {
    document.querySelectorAll("#attModeChips .chip").forEach(function (c) {
      c.classList.toggle("active", c.getAttribute("data-mode") === mode);
    });
    document.getElementById("attModeDay").hidden = mode !== "day";
    document.getElementById("attModeMonth").hidden = mode !== "month";
    document.getElementById("attModeCsv").hidden = mode !== "csv";
  }

  async function loadAttendanceDay() {
    const dateInput = document.getElementById("attDate").value;
    const meetingType = document.getElementById("attType").value;
    const dateKey = inputToSlashDate(dateInput);
    const body = document.getElementById("attRosterBody");
    if (!dateKey || !meetingType) {
      showToast("날짜와 정모를 선택하세요", true);
      return;
    }
    body.innerHTML =
      '<tr><td colspan="5" style="text-align:center;color:var(--dmc-color-text-muted);padding:24px">불러오는 중…</td></tr>';
    try {
      const statusUrl =
        ATTENDANCE_API +
        "?action=status&date=" +
        encodeURIComponent(dateKey);
      const countUrl =
        ATTENDANCE_API +
        "?action=sessionCount&meetingDate=" +
        encodeURIComponent(dateKey) +
        "&meetingType=" +
        encodeURIComponent(meetingType);

      const [statusRes, countRes] = await Promise.all([fetch(statusUrl), fetch(countUrl)]);
      const statusData = await statusRes.json();
      const countData = await countRes.json();

      if (!statusData.ok) throw new Error(statusData.error || "status 실패");
      if (!countData.ok) throw new Error(countData.error || "sessionCount 실패");

      document.getElementById("attTotal").textContent = String(
        countData.totalCount != null ? countData.totalCount : "—"
      );
      document.getElementById("attMembers").textContent = String(
        countData.memberCount != null ? countData.memberCount : "—"
      );
      document.getElementById("attGuests").textContent = String(
        countData.guestCount != null ? countData.guestCount : "—"
      );

      const items = Array.isArray(statusData.items) ? statusData.items : [];
      const filtered = items.filter(function (it) {
        return String(it.meetingType || "").toUpperCase() === meetingType;
      });

      if (!filtered.length) {
        body.innerHTML =
          '<tr><td colspan="5" style="text-align:center;color:var(--dmc-color-text-muted);padding:24px">해당 정모 출석이 없습니다</td></tr>';
        return;
      }

      body.innerHTML = filtered
        .map(function (it) {
          const team = it.teamLabel || it.team || "—";
          const typeLabel = it.meetingTypeLabel || MEETING_LABEL[it.meetingType] || it.meetingType || "";
          const id = it.id || "";
          const delBtn = id
            ? '<button type="button" class="btn btn-danger att-del-btn" data-doc-id="' +
              esc(id) +
              '" data-nick="' +
              esc(it.nickname) +
              '">삭제</button>'
            : '<button type="button" class="btn btn-danger" disabled title="문서 id 없음">삭제</button>';
          return (
            "<tr>" +
            "<td>" +
            esc(it.nickname) +
            "</td>" +
            "<td>" +
            esc(team) +
            "</td>" +
            "<td>" +
            esc(typeLabel) +
            "</td>" +
            "<td>" +
            esc(it.timeText || "") +
            "</td>" +
            "<td>" +
            delBtn +
            "</td>" +
            "</tr>"
          );
        })
        .join("");
    } catch (e) {
      body.innerHTML =
        '<tr><td colspan="5" style="text-align:center;color:var(--dmc-color-danger);padding:24px">로드 실패</td></tr>';
      showToast(e.message || "출석 명단 로드 실패", true);
    }
  }

  /* —— Members (ported from admin.html) —— */

  async function loadMembers() {
    try {
      const res = await fetch(RACE_API + "?action=all-members");
      const data = await res.json();
      if (data.ok) {
        allMembers = data.members || [];
        renderMembers();
      } else {
        throw new Error(data.error || "목록 실패");
      }
    } catch (e) {
      showToast("회원 목록 로드 실패", true);
    }
  }

  function renderMembers() {
    const query = (document.getElementById("searchInput").value || "").toLowerCase().trim();
    const filtered = allMembers.filter(function (m) {
      if (!showHidden && m.hidden) return false;
      if (query) {
        return (
          String(m.nickname || "")
            .toLowerCase()
            .includes(query) ||
          String(m.realName || "")
            .toLowerCase()
            .includes(query)
        );
      }
      return true;
    });

    const activeCount = allMembers.filter(function (m) {
      return !m.hidden;
    }).length;
    const hiddenCount = allMembers.filter(function (m) {
      return m.hidden;
    }).length;
    document.getElementById("statBar").innerHTML =
      "활동 회원 <strong>" +
      activeCount +
      "</strong>명" +
      (hiddenCount ? " / 숨김 <strong>" + hiddenCount + "</strong>명" : "");

    const tbody = document.getElementById("memberBody");
    if (!filtered.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" style="text-align:center;color:var(--dmc-color-text-muted);padding:24px">검색 결과가 없습니다</td></tr>';
      return;
    }

    tbody.innerHTML = filtered
      .map(function (m) {
        if (editingId === m.id) {
          return (
            '<tr class="editing">' +
            '<td><input id="editNick" value="' +
            esc(m.nickname) +
            '" /></td>' +
            '<td><input id="editReal" value="' +
            esc(m.realName) +
            '" /></td>' +
            "<td>" +
            teamSelectHtml(m.team, "editTeam") +
            "</td>" +
            '<td><select id="editGender">' +
            '<option value=""' +
            (!m.gender ? " selected" : "") +
            ">-</option>" +
            '<option value="M"' +
            (m.gender === "M" ? " selected" : "") +
            ">남</option>" +
            '<option value="F"' +
            (m.gender === "F" ? " selected" : "") +
            ">여</option>" +
            "</select></td>" +
            '<td><div class="edit-actions">' +
            '<button type="button" class="btn btn-primary btn-sm" data-save-edit="' +
            esc(m.id) +
            '">저장</button>' +
            '<button type="button" class="btn btn-outline btn-sm" data-cancel-edit>취소</button>' +
            "</div></td></tr>"
          );
        }
        const genderBadge =
          m.gender === "M"
            ? '<span class="gender-badge gender-m">남</span>'
            : m.gender === "F"
              ? '<span class="gender-badge gender-f">여</span>'
              : "";
        const hiddenBadge = m.hidden ? ' <span class="hidden-badge">숨김</span>' : "";
        const archivedHint =
          m.hidden && (m._archivedNickname || m._archivedRealName)
            ? '<div style="font-size:11px;color:var(--dmc-color-text-muted);margin-top:2px">원본: ' +
              esc(m._archivedNickname || "?") +
              " (" +
              esc(m._archivedRealName || "?") +
              ")" +
              (m.leaveReason === "expelled" ? " · 제명" : "") +
              "</div>"
            : "";
        const actionCell = m.hidden
          ? m._archivedRealName
            ? '<span style="font-size:12px;color:var(--dmc-color-text-muted)">익명화됨</span>'
            : '<button type="button" class="btn btn-outline btn-sm" data-restore="' +
              esc(m.id) +
              '">복원</button>'
          : '<button type="button" class="btn btn-danger btn-sm" data-hide="' +
            esc(m.id) +
            '" data-nick="' +
            esc(m.nickname) +
            '">퇴회</button>';
        return (
          '<tr class="' +
          (m.hidden ? "hidden-row" : "") +
          '" data-start-edit="' +
          esc(m.id) +
          '">' +
          "<td>" +
          esc(m.nickname) +
          hiddenBadge +
          archivedHint +
          "</td>" +
          "<td>" +
          esc(m.realName) +
          "</td>" +
          "<td>" +
          esc(teamLabel(m.team)) +
          "</td>" +
          "<td>" +
          genderBadge +
          "</td>" +
          "<td>" +
          actionCell +
          "</td></tr>"
        );
      })
      .join("");
  }

  async function saveEdit(id) {
    const nickname = document.getElementById("editNick").value.trim();
    const realName = document.getElementById("editReal").value.trim();
    const gender = document.getElementById("editGender").value;
    const teamEl = document.getElementById("editTeam");
    const team = teamEl ? teamEl.value : "";
    if (!nickname || !realName) {
      showToast("닉네임과 실명은 필수입니다", true);
      return;
    }
    try {
      const res = await fetch(RACE_API + "?action=update-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: id,
          nickname: nickname,
          realName: realName,
          gender: gender,
          team: team,
        })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      editingId = null;
      showToast("수정 완료");
      await loadMembers();
    } catch (e) {
      showToast("수정 실패: " + e.message, true);
    }
  }

  async function addMember() {
    const nickname = document.getElementById("addNickname").value.trim();
    const realName = document.getElementById("addRealName").value.trim();
    const gender = document.getElementById("addGender").value;
    const teamEl = document.getElementById("addTeam");
    const team = teamEl ? teamEl.value : "";
    if (!nickname || !realName) {
      showToast("닉네임과 실명은 필수입니다", true);
      return;
    }
    const btn = document.getElementById("addBtn");
    btn.disabled = true;
    try {
      const body = { nickname: nickname, realName: realName, gender: gender };
      if (team) body.team = team;
      const res = await fetch(RACE_API + "?action=add-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      document.getElementById("addNickname").value = "";
      document.getElementById("addRealName").value = "";
      document.getElementById("addGender").value = "";
      if (teamEl) teamEl.value = "";
      showToast(nickname + " 추가 완료");
      await loadMembers();
    } catch (e) {
      showToast("추가 실패: " + e.message, true);
    } finally {
      btn.disabled = false;
    }
  }

  async function hideMember(id, nickname) {
    if (
      !confirm(
        "'" +
          nickname +
          "'을(를) 퇴회 처리할까요?\n(숨김 + 닉·실명 익명화, 출석·기록 연동 갱신)"
      )
    ) {
      return;
    }
    try {
      const res = await fetch(RACE_API + "?action=hide-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || data.message);
      showToast(data.skipped ? nickname + " 이미 익명화됨" : nickname + " 퇴회·익명화 완료");
      await loadMembers();
    } catch (e) {
      showToast("숨김 실패: " + e.message, true);
    }
  }

  async function restoreMember(id) {
    try {
      const res = await fetch(RACE_API + "?action=update-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id, hidden: false })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      showToast("복원 완료");
      await loadMembers();
    } catch (e) {
      showToast("복원 실패: " + e.message, true);
    }
  }

  /* —— Bindings —— */

  document.getElementById("authBtn").addEventListener("click", tryAuth);
  document.getElementById("authPw").addEventListener("keydown", function (e) {
    if (e.key === "Enter") tryAuth();
  });

  document.getElementById("tabs").addEventListener("click", function (e) {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    showTab(btn.getAttribute("data-tab"));
  });

  window.addEventListener("hashchange", function () {
    if (isAuthed()) showTab(parseHash());
  });

  document.getElementById("attModeChips").addEventListener("click", function (e) {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    setAttendanceMode(chip.getAttribute("data-mode"));
  });

  document.getElementById("attReload").addEventListener("click", function () {
    loadAttendanceDay().catch(function () {});
  });

  async function adminDeleteAttendance(docId, nickname) {
    let pw = adminPwCache;
    if (!pw) {
      pw = window.prompt("운영진 비밀번호를 다시 입력하세요");
      if (!pw) return;
      adminPwCache = pw;
    }
    if (!confirm("'" + (nickname || "이 기록") + "' 출석을 삭제할까요?")) return;
    try {
      const res = await fetch(ATTENDANCE_API + "?action=admin-delete-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pw: pw, docId: docId })
      });
      const data = await res.json();
      if (!data.ok) {
        if (res.status === 401) adminPwCache = "";
        throw new Error(data.error || data.message || "삭제 실패");
      }
      showToast("삭제 완료");
      await loadAttendanceDay();
    } catch (e) {
      showToast(e.message || "삭제 실패", true);
    }
  }

  document.getElementById("attRosterBody").addEventListener("click", function (e) {
    const btn = e.target.closest(".att-del-btn");
    if (!btn) return;
    adminDeleteAttendance(btn.getAttribute("data-doc-id"), btn.getAttribute("data-nick") || "");
  });

  document.getElementById("attMonthLoad").addEventListener("click", function () {
    showToast("월 집계 API는 이후 단계에서 연결됩니다");
  });

  document.getElementById("csvDownload").addEventListener("click", function () {
    showToast("CSV export API는 이후 단계에서 연결됩니다");
  });

  document.getElementById("addBtn").addEventListener("click", addMember);
  document.getElementById("searchInput").addEventListener("input", renderMembers);
  document.getElementById("toggleHidden").addEventListener("click", function () {
    showHidden = !showHidden;
    document.getElementById("toggleHidden").textContent = showHidden
      ? "숨긴 회원 숨기기"
      : "숨긴 회원 보기";
    renderMembers();
  });

  document.getElementById("memberBody").addEventListener("click", function (e) {
    const save = e.target.closest("[data-save-edit]");
    if (save) {
      e.stopPropagation();
      saveEdit(save.getAttribute("data-save-edit"));
      return;
    }
    if (e.target.closest("[data-cancel-edit]")) {
      e.stopPropagation();
      editingId = null;
      renderMembers();
      return;
    }
    const hide = e.target.closest("[data-hide]");
    if (hide) {
      e.stopPropagation();
      hideMember(hide.getAttribute("data-hide"), hide.getAttribute("data-nick") || "");
      return;
    }
    const restore = e.target.closest("[data-restore]");
    if (restore) {
      e.stopPropagation();
      restoreMember(restore.getAttribute("data-restore"));
      return;
    }
    const row = e.target.closest("[data-start-edit]");
    if (row) {
      editingId = row.getAttribute("data-start-edit");
      renderMembers();
      setTimeout(function () {
        document.getElementById("editNick") && document.getElementById("editNick").focus();
      }, 50);
    }
  });

  /* —— Training (Admin-1b) —— */

  const trainHelper =
    typeof window !== "undefined" && window.DmcMeetingTraining
      ? window.DmcMeetingTraining
      : null;

  let trainWeekAnchor = ""; // YYYY-MM-DD (Monday-week containing)

  function kstTodayDash() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  }

  function shiftDashDate(dash, days) {
    const m = String(dash || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return dash;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + mo + "-" + day;
  }

  function shortTrainDateLabel(dateKey) {
    const m = String(dateKey || "").match(/^\d{4}\/(\d{2})\/(\d{2})$/);
    if (!m) return dateKey || "";
    return Number(m[1]) + "/" + Number(m[2]);
  }

  function typeKo(t) {
    return { TUE: "화", THU: "목", SAT: "토" }[t] || t;
  }

  function defaultTimeForType(t) {
    if (t === "SAT") return "06:00";
    return "18:30";
  }

  function renderTrainingBoard(rows) {
    const board = document.getElementById("trainWeekBoard");
    if (!board) return;
    const list = Array.isArray(rows) ? rows : [];
    board.innerHTML = list
      .map(function (row) {
        const t = row.meetingType || "";
        const dateKey = row.meetingDateKey || "";
        return (
          '<div class="card week-card" data-train-type="' +
          esc(t) +
          '">' +
          "<h3>" +
          typeKo(t) +
          " " +
          shortTrainDateLabel(dateKey) +
          "</h3>" +
          '<input type="hidden" data-f="meetingDateKey" value="' +
          esc(dateKey) +
          '" />' +
          '<input type="hidden" data-f="meetingType" value="' +
          esc(t) +
          '" />' +
          '<div class="field"><label>시간</label><input data-f="time" value="' +
          esc(row.time || defaultTimeForType(t)) +
          '" /></div>' +
          '<div class="field"><label>장소</label><input data-f="place" value="' +
          esc(row.place || "여울공원 운동장(트랙)") +
          '" /></div>' +
          '<div class="field"><label><span class="phase-label">전</span></label><textarea data-f="trainBefore">' +
          esc(row.trainBefore) +
          "</textarea></div>" +
          '<div class="field"><label><span class="phase-label">본</span></label><textarea data-f="trainMain">' +
          esc(row.trainMain) +
          "</textarea></div>" +
          '<div class="field"><label><span class="phase-label">후</span></label><textarea data-f="trainAfter">' +
          esc(row.trainAfter) +
          "</textarea></div>" +
          '<div class="field"><label>서포터즈</label><input data-f="supporters" value="' +
          esc(row.supporters) +
          '" /></div>' +
          '<div class="field"><label>메모</label><textarea data-f="note">' +
          esc(row.note) +
          "</textarea></div>" +
          "</div>"
        );
      })
      .join("");
  }

  function readTrainingBoardRows() {
    const board = document.getElementById("trainWeekBoard");
    if (!board) return [];
    return Array.prototype.map.call(board.querySelectorAll(".week-card"), function (card) {
      const row = {};
      card.querySelectorAll("[data-f]").forEach(function (el) {
        row[el.getAttribute("data-f")] = el.value;
      });
      return row;
    });
  }

  function updateTrainWeekLabel(weekDates) {
    const el = document.getElementById("trainWeekLabel");
    if (!el) return;
    const tue = weekDates && weekDates.TUE ? shortTrainDateLabel(weekDates.TUE) : "—";
    el.textContent = tue + " 주 (화·목·토)";
  }

  async function loadTrainingWeek(opts) {
    opts = opts || {};
    if (!trainWeekAnchor) trainWeekAnchor = kstTodayDash();
    if (!trainHelper) {
      showToast("meeting-training 헬퍼 로드 실패", true);
      return;
    }
    const weekDates = trainHelper.resolveWeekMeetingDates(trainWeekAnchor);
    updateTrainWeekLabel(weekDates);

    if (opts.fromParse) {
      const emptyRows = ["TUE", "THU", "SAT"].map(function (t) {
        const p = opts.fromParse[t] || {};
        return {
          meetingDateKey: weekDates[t],
          meetingType: t,
          time: p.time || "",
          place: p.place || "",
          trainBefore: p.trainBefore || "",
          trainMain: p.trainMain || "",
          trainAfter: p.trainAfter || "",
          supporters: p.supporters || "",
          note: p.note || ""
        };
      });
      renderTrainingBoard(emptyRows);
      return;
    }

    try {
      const url =
        ATTENDANCE_API +
        "?action=meeting-training&week=" +
        encodeURIComponent(trainWeekAnchor);
      const res = await fetch(url);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "불러오기 실패");
      updateTrainWeekLabel(data.week || weekDates);
      renderTrainingBoard(data.rows || []);
    } catch (e) {
      const fallback = ["TUE", "THU", "SAT"].map(function (t) {
        return trainHelper.emptyTrainingRow(weekDates[t], t);
      });
      renderTrainingBoard(fallback);
      if (!opts.silentEmpty) showToast(e.message || "훈련 로드 실패", true);
    }
  }

  async function saveTrainingWeek() {
    let pw = adminPwCache;
    if (!pw) {
      pw = window.prompt("운영진 비밀번호를 입력하세요");
      if (!pw) return;
      adminPwCache = pw;
    }
    const rows = readTrainingBoardRows();
    if (!rows.length) {
      showToast("저장할 행이 없습니다", true);
      return;
    }
    try {
      const res = await fetch(ATTENDANCE_API + "?action=meeting-training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pw: pw, rows: rows })
      });
      const data = await res.json();
      if (!data.ok) {
        if (res.status === 401) adminPwCache = "";
        throw new Error(data.error || "저장 실패");
      }
      showToast("주간 훈련 " + (data.savedCount || rows.length) + "건 저장");
      await loadTrainingWeek({ silentEmpty: true });
    } catch (e) {
      showToast(e.message || "저장 실패", true);
    }
  }

  async function copyPrevWeekFromDb() {
    if (!trainHelper) return;
    const prevAnchor = shiftDashDate(trainWeekAnchor || kstTodayDash(), -7);
    try {
      const url =
        ATTENDANCE_API +
        "?action=meeting-training&week=" +
        encodeURIComponent(prevAnchor);
      const res = await fetch(url);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "지난주 로드 실패");
      const weekDates = trainHelper.resolveWeekMeetingDates(trainWeekAnchor || kstTodayDash());
      const byType = {};
      (data.rows || []).forEach(function (r) {
        byType[r.meetingType] = r;
      });
      const merged = ["TUE", "THU", "SAT"].map(function (t) {
        const prev = byType[t] || {};
        return {
          meetingDateKey: weekDates[t],
          meetingType: t,
          time: prev.time || "",
          place: prev.place || "",
          trainBefore: prev.trainBefore || "",
          trainMain: prev.trainMain || "",
          trainAfter: prev.trainAfter || "",
          supporters: prev.supporters || "",
          note: prev.note || ""
        };
      });
      renderTrainingBoard(merged);
      showToast("지난주 DB를 현재 주에 복사했습니다 (미저장)");
    } catch (e) {
      showToast(e.message || "지난주 복사 실패", true);
    }
  }

  const elCafeParse = document.getElementById("cafeParsePaste");
  if (elCafeParse) {
    elCafeParse.addEventListener("click", function () {
      if (!trainHelper) {
        showToast("파서 헬퍼 없음", true);
        return;
      }
      const pasteEl = document.getElementById("cafePaste");
      let paste = (pasteEl || {}).value || "";
      if (typeof trainHelper.minifyCafeArticleForPaste === "function") {
        const mini = trainHelper.minifyCafeArticleForPaste(paste);
        if (mini && pasteEl) {
          pasteEl.value = mini;
          paste = mini;
        }
      }
      const parsed = trainHelper.parseCafeTrainingPaste(paste);
      loadTrainingWeek({ fromParse: parsed }).then(function () {
        showToast("붙여넣기 파싱 완료 — 검토 후 저장");
      });
    });
  }

  async function copySnippetText(elId) {
    const el = document.getElementById(elId);
    const text = el ? String(el.textContent || "").trim() : "";
    if (!text) {
      showToast("복사할 명령어 없음", true);
      return;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      showToast("콘솔 명령어를 클립보드에 복사했습니다");
    } catch (e) {
      showToast("복사 실패 — 코드를 직접 선택하세요", true);
    }
  }

  const elCopyDom = document.getElementById("cafeCopyDomSnippet");
  if (elCopyDom) {
    elCopyDom.addEventListener("click", function () {
      copySnippetText("cafeConsoleDomSnippet");
    });
  }
  const elCopyTemp = document.getElementById("cafeCopyTempSnippet");
  if (elCopyTemp) {
    elCopyTemp.addEventListener("click", function () {
      copySnippetText("cafeConsoleTempSnippet");
    });
  }

  const elTrainPrev = document.getElementById("trainPrevWeek");
  const elTrainNext = document.getElementById("trainNextWeek");
  const elTrainLoad = document.getElementById("trainLoadWeek");
  const elTrainCopy = document.getElementById("trainCopyPrevWeek");
  const elTrainSave = document.getElementById("trainSave");
  if (elTrainPrev) {
    elTrainPrev.addEventListener("click", function () {
      trainWeekAnchor = shiftDashDate(trainWeekAnchor || kstTodayDash(), -7);
      loadTrainingWeek().catch(function () {});
    });
  }
  if (elTrainNext) {
    elTrainNext.addEventListener("click", function () {
      trainWeekAnchor = shiftDashDate(trainWeekAnchor || kstTodayDash(), 7);
      loadTrainingWeek().catch(function () {});
    });
  }
  if (elTrainLoad) {
    elTrainLoad.addEventListener("click", function () {
      loadTrainingWeek().catch(function () {});
    });
  }
  if (elTrainCopy) {
    elTrainCopy.addEventListener("click", function () {
      copyPrevWeekFromDb().catch(function () {});
    });
  }
  if (elTrainSave) {
    elTrainSave.addEventListener("click", function () {
      saveTrainingWeek().catch(function () {});
    });
  }

  checkAuth();
})();
