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

  /** Active session cancel gate: row matches resolveDefaultMeeting result. */
  function isActiveSessionMatch(row, active) {
    if (!row || !active) return false;
    return (
      String(row.dateKey || "") === String(active.dateKey || "") &&
      String(row.meetingType || "").toUpperCase() === String(active.meetingType || "").toUpperCase()
    );
  }

  return {
    SHELL_TABS: SHELL_TABS,
    parseShellHash: parseShellHash,
    isActiveSessionMatch: isActiveSessionMatch
  };
});
