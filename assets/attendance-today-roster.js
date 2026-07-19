/**
 * Today-tab session roster helpers (Shell polish).
 * Pure functions — node --test friendly. Uses existing status API + client filter.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DmcAttendanceTodayRoster = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function filterStatusByMeetingType(items, meetingType) {
    const mt = String(meetingType || "")
      .trim()
      .toUpperCase();
    if (!mt || !Array.isArray(items)) return [];
    return items.filter(function (it) {
      return String((it && it.meetingType) || "")
        .trim()
        .toUpperCase() === mt;
    });
  }

  function sortSessionRosterNewestFirst(items) {
    return (Array.isArray(items) ? items.slice() : []).sort(function (a, b) {
      return (Number(b && b.ts) || 0) - (Number(a && a.ts) || 0);
    });
  }

  function avatarCharFromNickname(nickname) {
    const s = String(nickname == null ? "" : nickname).trim();
    return s ? s.charAt(0) : "?";
  }

  return {
    filterStatusByMeetingType,
    sortSessionRosterNewestFirst,
    avatarCharFromNickname,
  };
});
