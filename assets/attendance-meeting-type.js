/**
 * 모임 날짜 → 정모 유형 (브라우저).
 * functions/lib/attendance-active-session.js 의 meetingTypeForDateKey 와 동일 규칙.
 */
(function (root) {
  "use strict";

  function normalizeMeetingDateKey(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.replace(/-/g, "/");
    return "";
  }

  function meetingTypeForDateKey(dateKey) {
    const key = normalizeMeetingDateKey(dateKey);
    const m = key.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    if (!m) return "ETC";
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
    if (Number.isNaN(d.getTime())) return "ETC";
    const dow = d.getUTCDay();
    if (dow === 2) return "TUE";
    if (dow === 4) return "THU";
    if (dow === 6) return "SAT";
    return "ETC";
  }

  root.DmcAttendanceMeetingType = { meetingTypeForDateKey, normalizeMeetingDateKey };
})(typeof window !== "undefined" ? window : globalThis);
