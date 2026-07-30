/**
 * Attendance shell hash router helpers (Shell-1).
 * CommonJS for node --test; also attachable in browser via window if needed.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DmcAttendanceShellRouter = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SHELL_TABS = ["today", "my-attendance", "team-attendance", "more"];

  function parseShellHash(hash) {
    const h = String(hash == null ? "" : hash).replace(/^#/, "");
    return SHELL_TABS.indexOf(h) >= 0 ? h : "today";
  }

  function normalizeDateKey(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.replace(/-/g, "/");
    return s;
  }

  /** Active session cancel gate: row matches resolveDefaultMeeting result. */
  function isActiveSessionMatch(row, active) {
    if (!row || !active) return false;
    const rowDate = normalizeDateKey(row.dateKey || row.meetingDate || "");
    const activeDate = normalizeDateKey(active.dateKey || active.meetingDate || "");
    return (
      rowDate === activeDate &&
      String(row.meetingType || "").toUpperCase() === String(active.meetingType || "").toUpperCase()
    );
  }

  return {
    SHELL_TABS: SHELL_TABS,
    parseShellHash: parseShellHash,
    isActiveSessionMatch: isActiveSessionMatch
  };
});
