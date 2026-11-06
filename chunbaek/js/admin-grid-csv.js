/**
 * 춘백 운영 출석 그리드 CSV.
 * 브라우저와 Node 테스트에서 같이 쓴다.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ChunbaekAdminCsv = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function csvField(value) {
    const text = value == null ? "" : String(value);
    if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function csvLine(fields) {
    return fields.map(csvField).join(",");
  }

  function gridWeekScored(slots) {
    const dates = (slots || [])
      .map((slot) => String(slot && slot.date || "").slice(0, 10))
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
      .sort();
    if (!dates.length) return true;
    const start = dates[0];
    const end = dates[dates.length - 1];
    return !(start >= "2026-07-20" && end < "2026-07-27");
  }

  function sheetWeekLabel(week, options = {}) {
    const n = Number(week);
    if (!Number.isFinite(n)) return "";
    if (n === 0) return "0주차 (베타)";
    if (options.preview) return `${n}주차`;
    if (n === 1) return "0주차";
    if (n >= 2) return `${n - 1}주차`;
    return `${n}주차`;
  }

  function trainingSavedMessage(week, options = {}) {
    const label = sheetWeekLabel(week, options);
    if (options.mock) return `${label} 훈련 저장됨 (목업)`;
    return `${label} 훈련 ${options.saved}건 저장됨`;
  }

  function weekLabel(week) {
    if (week == null || week === "") return "";
    return `${week}주차`;
  }

  function displayWeekLabel(week, slots) {
    const dates = (slots || [])
      .map((slot) => String(slot && slot.date || "").slice(0, 10))
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
      .sort();
    if (dates.length) {
      const start = dates[0];
      const end = dates[dates.length - 1];
      if (start >= "2026-07-20" && end < "2026-07-27") return "0주차";
      if (start >= "2026-07-27") {
        const [y, m, d] = start.split("-").map(Number);
        const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 6, 27)) / 86400000);
        if (diff >= 0) return `${Math.floor(diff / 7) + 1}주차`;
      }
    }
    return weekLabel(week);
  }

  function attendanceCsvFilename(week) {
    const n = week == null || week === "" ? "current" : String(week);
    return `chunbaek-s3-week${n}-attendance.csv`;
  }

  function scoreText(member) {
    const raw = member.weekScore != null ? member.weekScore : member.weekCount;
    const n = Number(raw);
    if (!Number.isFinite(n)) return "";
    return String(n);
  }

  function targetText(member, slots) {
    if (!gridWeekScored(slots)) return "제외";
    if (typeof member.weekTargetMet === "boolean") {
      return member.weekTargetMet ? "달성" : "미달";
    }
    const score = Number(scoreText(member));
    const target = Number(member.weekTarget ?? 0);
    if (!Number.isFinite(score) || !target) return "";
    return score < target ? "미달" : "달성";
  }

  function profileText(value) {
    if (value === true) return "예";
    if (value === false) return "아니오";
    return "";
  }

  function slotHeading(slot) {
    const day = slot.dayIndex != null && slot.dayIndex !== "" ? `${slot.dayIndex}일 ` : "";
    return `${day}${slot.date || ""}`.trim();
  }

  function cellText(status, isProgramOff) {
    if (isProgramOff || status === "off") return "휴무";
    if (status === "attend" || status === "attend-photo") return "출석";
    if (status === "exception") return "예외";
    if (status === "future") return "예정";
    if (status === "preseason") return "제외";
    return "미출석";
  }

  function buildAttendanceCsv({ week, range, slots, members } = {}) {
    const columns = slots || [];
    const headers = [
      "주차",
      "기간",
      "닉네임",
      "회원ID",
      "프로필완료",
      "출석",
      "예외",
      "점수",
      "목표",
      "목표달성",
      ...columns.map(slotHeading),
    ];
    const rows = (members || []).map((member) => [
      displayWeekLabel(week, columns),
      range || "",
      member.nickname || "",
      member.id || member.memberId || "",
      profileText(member.profileComplete),
      member.weekCount != null ? String(member.weekCount) : "",
      member.weekExceptionCount != null ? String(member.weekExceptionCount) : "0",
      scoreText(member),
      member.weekTarget != null ? String(member.weekTarget) : "",
      targetText(member, columns),
      ...columns.map((slot) => cellText(
        member.cells ? member.cells[slot.slotId] : "",
        !!slot.isProgramOff,
      )),
    ]);
    const text = [headers, ...rows].map(csvLine).join("\r\n");
    return `\uFEFF${text}\r\n`;
  }

  return {
    buildAttendanceCsv,
    attendanceCsvFilename,
    cellText,
    gridWeekScored,
    sheetWeekLabel,
    trainingSavedMessage,
  };
});
