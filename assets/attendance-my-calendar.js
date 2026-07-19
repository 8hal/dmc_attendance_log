/**
 * My-attendance calendar helpers (Shell-2 calendar view).
 * Pure functions — node --test friendly.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DmcAttendanceMyCalendar = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function daysInMonthCivil(y, month1to12) {
    return new Date(y, month1to12, 0).getDate();
  }

  function firstOfMonthSundayPad(y, month1to12) {
    const noonKst = new Date(
      String(y) +
        "-" +
        String(month1to12).padStart(2, "0") +
        "-01T12:00:00+09:00"
    );
    if (isNaN(noonKst.getTime())) return 0;
    const wEn = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: "Asia/Seoul",
    }).format(noonKst);
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[wEn] !== undefined ? map[wEn] : 0;
  }

  /**
   * @param {{ monthKey: string, attendedDateKeys?: string[], todayKey?: string }} opts
   * @returns {Array<{kind:'pad'|'day', day?:number, dateKey?:string, attend?:boolean, today?:boolean}>}
   */
  function buildMyAttendCalendarCells(opts) {
    const monthKey = String((opts && opts.monthKey) || "");
    const m = monthKey.match(/^(\d{4})-(\d{2})$/);
    if (!m) return [];
    const y = Number(m[1]);
    const month = Number(m[2]);
    const attended = new Set(
      Array.isArray(opts.attendedDateKeys) ? opts.attendedDateKeys : []
    );
    const todayKey = String((opts && opts.todayKey) || "");
    const pad = firstOfMonthSundayPad(y, month);
    const dim = daysInMonthCivil(y, month);
    const cells = [];
    for (let i = 0; i < pad; i++) cells.push({ kind: "pad" });
    for (let d = 1; d <= dim; d++) {
      const dateKey =
        y +
        "/" +
        String(month).padStart(2, "0") +
        "/" +
        String(d).padStart(2, "0");
      cells.push({
        kind: "day",
        day: d,
        dateKey,
        attend: attended.has(dateKey),
        today: dateKey === todayKey,
      });
    }
    return cells;
  }

  function attendedDateKeySet(items) {
    const set = new Set();
    (Array.isArray(items) ? items : []).forEach(function (it) {
      const dk = String((it && it.meetingDate) || "").trim();
      if (dk) set.add(dk);
    });
    return set;
  }

  function isProfileCheckedInSession(items, meetingType, profile) {
    if (!profile || typeof profile !== "object") return false;
    const mt = String(meetingType || "")
      .trim()
      .toUpperCase();
    if (!mt || !Array.isArray(items)) return false;
    const memberId = String(profile.memberId || "").trim();
    const nick = String(profile.nickname || "")
      .trim()
      .toLowerCase();
    return items.some(function (it) {
      if (
        String((it && it.meetingType) || "")
          .trim()
          .toUpperCase() !== mt
      ) {
        return false;
      }
      if (memberId && String((it && it.memberId) || "").trim() === memberId) {
        return true;
      }
      if (
        nick &&
        String((it && it.nickname) || "")
          .trim()
          .toLowerCase() === nick
      ) {
        return true;
      }
      return false;
    });
  }

  return {
    buildMyAttendCalendarCells,
    attendedDateKeySet,
    isProfileCheckedInSession,
    daysInMonthCivil,
    firstOfMonthSundayPad,
  };
});
