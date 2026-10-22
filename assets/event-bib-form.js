(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.EventBibForm = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function filled(value) {
    return String(value == null ? "" : value).trim() !== "";
  }

  function num(value) {
    return filled(value) ? Number(value) : 0;
  }

  // Wave and goal are each optional; an empty field is left out so the saved value stays.
  function buildBibBody(input) {
    const body = {
      subAction: "update-bib",
      eventId: input.eventId,
      nickname: input.nickname,
      bib: input.bib,
      distance: input.distance,
    };
    if (input.distance !== "full") return body;
    if (filled(input.waveId)) body.waveId = input.waveId;
    if (filled(input.goalH) || filled(input.goalM) || filled(input.goalS)) {
      body.goalFinishSec = num(input.goalH) * 3600 + num(input.goalM) * 60 + num(input.goalS);
    }
    return body;
  }

  function goalFieldsError(input) {
    const parts = [input.goalH, input.goalM, input.goalS];
    for (const part of parts) {
      if (filled(part) && !/^\d{1,2}$/.test(String(part).trim())) return "시·분·초는 숫자로 넣어 주세요.";
    }
    if (num(input.goalM) > 59 || num(input.goalS) > 59) return "분·초는 0–59로 넣어 주세요.";
    return "";
  }

  function goalFieldsFromSec(sec) {
    const total = Number(sec);
    if (!Number.isFinite(total) || total <= 0) return null;
    return {
      h: String(Math.floor(total / 3600)),
      m: String(Math.floor((total % 3600) / 60)),
      s: String(Math.round(total % 60)),
    };
  }

  return { buildBibBody, goalFieldsError, goalFieldsFromSec };
});
