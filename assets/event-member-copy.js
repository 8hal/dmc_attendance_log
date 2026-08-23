/**
 * Member-facing copy for group-event screens (home / bus / roster).
 * Does not change formatDistance globally — my.html and admin keep "?".
 */
(function (root, factory) {
  const formatDistanceFn =
    typeof module === "object" && module.exports
      ? require("./distance-utils.js").formatDistance
      : root.formatDistance;

  const api = factory(formatDistanceFn);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.EventMemberCopy = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (formatDistanceFn) {
  function memberEventTitle(name) {
    const raw = String(name == null ? "" : name).trim();
    if (!raw) return "대회";
    const stripped = raw.replace(/\s*\(([^)]*)\)\s*$/, function (_m, inner) {
      if (/[=/]/.test(inner)) return "";
      return _m;
    }).trim();
    return stripped || raw;
  }

  function memberDistanceLabel(distance) {
    if (distance === "unknown" || distance === "?") return "종목 미정";
    const label = typeof formatDistanceFn === "function"
      ? formatDistanceFn(distance)
      : (distance ? String(distance) : "-");
    if (!label || label === "-" || label === "?") return "종목 미정";
    return label;
  }

  function memberHomeHref(eventId) {
    const id = String(eventId == null ? "" : eventId);
    return "event-home.html?eventId=" + encodeURIComponent(id);
  }

  function matchesMemberQuery(row, query) {
    const q = String(query == null ? "" : query).trim().toLowerCase();
    if (!q) return true;
    const nick = String((row && row.nickname) || "").toLowerCase();
    const real = String((row && row.realName) || "").toLowerCase();
    return nick.includes(q) || real.includes(q);
  }

  return { memberEventTitle, memberDistanceLabel, memberHomeHref, matchesMemberQuery };
});
