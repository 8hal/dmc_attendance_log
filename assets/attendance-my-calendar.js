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

  /**
   * 내 출석·출석 완료 화면이 공유하는 cal-grid 마크업.
   * @param {{
   *   monthKey: string,
   *   attendedDateKeys?: string[],
   *   todayKey?: string,
   *   justCheckedInKey?: string,
   *   showTitle?: boolean,
   *   ariaLabel?: string,
   *   cellsOnly?: boolean,
   * }} opts
   */
  function buildAttendCalendarHtml(opts) {
    const o = opts || {};
    const cells = buildMyAttendCalendarCells(o);
    const justKey = String(o.justCheckedInKey || "").trim();
    const dows = ["일", "월", "화", "수", "목", "금", "토"];
    let body = dows
      .map(function (d) {
        return '<div class="cal-dow">' + d + "</div>";
      })
      .join("");
    cells.forEach(function (c) {
      if (c.kind === "pad") {
        body += '<div class="cal-day muted" aria-hidden="true"></div>';
        return;
      }
      const isJust = justKey && c.dateKey === justKey;
      let cls = "cal-day";
      if (c.attend || isJust) cls += " attend";
      if (c.today) cls += " today-ring";
      if (isJust) cls += " just-checkin";
      const title = isJust ? "방금 출석" : c.attend ? "출석" : c.today ? "오늘" : "";
      const sub = isJust ? '<span class="cal-day-sub">방금</span>' : "";
      body +=
        '<div class="' +
        cls +
        '"' +
        (title ? ' title="' + title + '"' : "") +
        ">" +
        c.day +
        sub +
        "</div>";
    });
    if (o.cellsOnly) return body;
    let html = "";
    if (o.showTitle) {
      const m = String(o.monthKey || "").match(/^(\d{4})-(\d{2})$/);
      if (m) {
        html +=
          '<p class="attend-cal-title">' +
          Number(m[1]) +
          "년 " +
          Number(m[2]) +
          "월</p>";
      }
    }
    const aria = o.ariaLabel
      ? ' aria-label="' + String(o.ariaLabel).replace(/"/g, "&quot;") + '"'
      : "";
    html += '<div class="cal-grid"' + aria + ">" + body + "</div>";
    return html;
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
    buildAttendCalendarHtml,
    attendedDateKeySet,
    isProfileCheckedInSession,
    daysInMonthCivil,
    firstOfMonthSundayPad,
  };
});
