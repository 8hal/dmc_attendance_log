/**
 * Active session (= resolveDefaultMeeting) helpers for attendance self-delete.
 * Pure functions — node --test friendly.
 */

function normalizeMeetingDateKey(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.replace(/-/g, "/");
  return "";
}

/**
 * @param {Date} [now]
 * @returns {{ dateKey: string, meetingType: string }}
 */
function resolveDefaultMeeting(now) {
  now = now || new Date();
  const dow = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
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
    default:
      break;
  }
  const kstDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  kstDate.setDate(kstDate.getDate() + dayOffset);
  const y = kstDate.getFullYear();
  const mo = String(kstDate.getMonth() + 1).padStart(2, "0");
  const d = String(kstDate.getDate()).padStart(2, "0");
  return { dateKey: `${y}/${mo}/${d}`, meetingType };
}

function isActiveSessionMatch(row, active) {
  if (!row || !active) return false;
  const rowDate = normalizeMeetingDateKey(row.dateKey || row.meetingDate || "");
  const activeDate = normalizeMeetingDateKey(active.dateKey || active.meetingDate || "");
  return (
    rowDate === activeDate &&
    String(row.meetingType || "").toUpperCase() ===
      String(active.meetingType || "").toUpperCase()
  );
}

/**
 * @returns {string|null} error code or null if allowed
 */
function assertSelfDeleteAllowed(body, active) {
  const memberId = String((body && body.memberId) || "").trim();
  if (!memberId) return "MEMBER_ID_REQUIRED";
  const meetingDate = normalizeMeetingDateKey(
    (body && (body.meetingDate || body.meetingDateKey)) || ""
  );
  const meetingType = String((body && body.meetingType) || "")
    .trim()
    .toUpperCase();
  if (!meetingDate || !meetingType) return "MEETING_REQUIRED";
  if (!isActiveSessionMatch({ dateKey: meetingDate, meetingType }, active)) {
    return "NOT_ACTIVE_SESSION";
  }
  return null;
}

module.exports = {
  normalizeMeetingDateKey,
  resolveDefaultMeeting,
  isActiveSessionMatch,
  assertSelfDeleteAllowed,
};
