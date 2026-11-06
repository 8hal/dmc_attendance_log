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

  function weekLabel(week) {
    if (week == null || week === "") return "";
    return `${week}주차`;
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

  function targetText(member) {
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
      weekLabel(week),
      range || "",
      member.nickname || "",
      member.id || member.memberId || "",
      profileText(member.profileComplete),
      member.weekCount != null ? String(member.weekCount) : "",
      member.weekExceptionCount != null ? String(member.weekExceptionCount) : "0",
      scoreText(member),
      member.weekTarget != null ? String(member.weekTarget) : "",
      targetText(member),
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
  };
});
