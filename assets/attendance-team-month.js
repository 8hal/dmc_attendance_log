/**
 * Team-month attendance helpers (Shell-3 MVP).
 * Pure functions — node --test friendly. No new API; client joins members + status.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DmcAttendanceTeamMonth = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const REGULAR_TYPES = { TUE: true, THU: true, SAT: true };

  function isValidMonthKey(monthKey) {
    return /^\d{4}-\d{2}$/.test(String(monthKey || ""));
  }

  /**
   * @param {string} monthKey YYYY-MM
   * @returns {string[]} dateKeys YYYY/MM/DD for Tue/Thu/Sat in that month
   */
  function listRegularMeetingDateKeys(monthKey) {
    if (!isValidMonthKey(monthKey)) return [];
    const [yStr, mStr] = monthKey.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    const daysInMonth = new Date(y, m, 0).getDate();
    const out = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const weekday = new Date(y, m - 1, d).getDay();
      if (weekday === 2 || weekday === 4 || weekday === 6) {
        const mo = String(m).padStart(2, "0");
        const day = String(d).padStart(2, "0");
        out.push(y + "/" + mo + "/" + day);
      }
    }
    return out;
  }

  function isRegularMeetingType(meetingType) {
    return !!REGULAR_TYPES[String(meetingType || "").toUpperCase()];
  }

  /**
   * Aggregate roster + per-member regular-meeting attendance for a month.
   * @param {object} opts
   * @param {Array<{id?:string,nickname:string,team?:string}>} opts.members
   * @param {Record<string, Array<{nickname?:string,memberId?:string,meetingType?:string,isGuest?:boolean}>>} opts.statusByDate
   * @param {string} [opts.teamFilter] team code, or "" / "ALL" for whole club
   */
  function aggregateTeamMonth(opts) {
    const members = Array.isArray(opts && opts.members) ? opts.members : [];
    const statusByDate = (opts && opts.statusByDate) || {};
    const rawFilter = String((opts && opts.teamFilter) || "").trim().toUpperCase();
    const teamFilter = !rawFilter || rawFilter === "ALL" ? "" : rawFilter;

    const roster = members.filter(function (m) {
      if (!m || !m.nickname) return false;
      if (!teamFilter) return true;
      return String(m.team || "").toUpperCase() === teamFilter;
    });

    const byKey = {};
    roster.forEach(function (m) {
      const key = m.id ? "id:" + m.id : "nick:" + String(m.nickname).toLowerCase();
      byKey[key] = {
        memberId: m.id || null,
        nickname: m.nickname,
        team: m.team || "",
        count: 0,
        dates: [],
      };
    });

    const nickToKey = {};
    roster.forEach(function (m) {
      const key = m.id ? "id:" + m.id : "nick:" + String(m.nickname).toLowerCase();
      nickToKey[String(m.nickname).toLowerCase()] = key;
      if (m.id) nickToKey["id:" + m.id] = key;
    });

    Object.keys(statusByDate).forEach(function (dateKey) {
      const items = statusByDate[dateKey] || [];
      items.forEach(function (it) {
        if (!it || it.isGuest === true) return;
        if (!isRegularMeetingType(it.meetingType)) return;
        let key = null;
        if (it.memberId && byKey["id:" + it.memberId]) {
          key = "id:" + it.memberId;
        } else if (it.nickname) {
          key = nickToKey[String(it.nickname).toLowerCase()] || null;
        }
        if (!key || !byKey[key]) return;
        const row = byKey[key];
        if (row.dates.indexOf(dateKey) >= 0) return;
        row.dates.push(dateKey);
        row.count += 1;
      });
    });

    const rows = Object.keys(byKey)
      .map(function (k) {
        return byKey[k];
      })
      .sort(function (a, b) {
        if (b.count !== a.count) return b.count - a.count;
        return String(a.nickname).localeCompare(String(b.nickname), "ko");
      });

    const attended = rows.filter(function (r) {
      return r.count > 0;
    }).length;
    const rosterCount = rows.length;
    const rate =
      rosterCount > 0 ? Math.round((attended / rosterCount) * 100) : 0;

    return {
      roster: rosterCount,
      attended: attended,
      rate: rate,
      meetingDates: listRegularMeetingDateKeys(
        (opts && opts.monthKey) || ""
      ),
      rows: rows,
    };
  }

  function normalizeDateKey(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.replace(/-/g, "/");
    return "";
  }

  /**
   * @returns {{ dateKey: string, state: "attended"|"missed"|"upcoming" }[]}
   */
  function buildMeetingDots(opts) {
    const meetingDateKeys = Array.isArray(opts && opts.meetingDateKeys)
      ? opts.meetingDateKeys
      : [];
    const attendedSet = {};
    (Array.isArray(opts && opts.attendedDateKeys) ? opts.attendedDateKeys : []).forEach(
      function (k) {
        const n = normalizeDateKey(k);
        if (n) attendedSet[n] = true;
      }
    );
    const todayKey = normalizeDateKey(opts && opts.todayKey) || "9999/99/99";
    return meetingDateKeys.map(function (raw) {
      const dateKey = normalizeDateKey(raw) || String(raw || "");
      if (attendedSet[dateKey]) return { dateKey: dateKey, state: "attended" };
      if (dateKey < todayKey) return { dateKey: dateKey, state: "missed" };
      return { dateKey: dateKey, state: "upcoming" };
    });
  }

  function memberMonthAttendRate(count, meetingDateCount) {
    const c = Number(count) || 0;
    const d = Number(meetingDateCount) || 0;
    if (d <= 0) return 0;
    return Math.round((c / d) * 100);
  }

  return {
    REGULAR_TYPES: REGULAR_TYPES,
    isValidMonthKey: isValidMonthKey,
    listRegularMeetingDateKeys: listRegularMeetingDateKeys,
    isRegularMeetingType: isRegularMeetingType,
    aggregateTeamMonth: aggregateTeamMonth,
    buildMeetingDots: buildMeetingDots,
    memberMonthAttendRate: memberMonthAttendRate,
  };
});
