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

  const FULL_KM = 42.195;
  const GOAL_MIN_SEC = 3600;
  const GOAL_MAX_SEC = 36000;

  function waveChoiceVisible(waveCount) {
    return Number(waveCount) >= 1;
  }

  function sortWaves(waves) {
    return (Array.isArray(waves) ? waves.slice() : []).sort(function (a, b) {
      return String((a && a.startAt) || "").localeCompare(String((b && b.startAt) || ""));
    });
  }

  function waveClockLabel(startAt) {
    const hhmm = String(startAt || "").slice(11, 16);
    if (!/^\d{2}:\d{2}$/.test(hhmm)) return "";
    return String(Number(hhmm.slice(0, 2))) + hhmm.slice(2);
  }

  function goalPaceLabel(fields) {
    if (goalFieldsError(fields || {})) return "";
    const input = fields || {};
    if (!filled(input.goalH) && !filled(input.goalM) && !filled(input.goalS)) return "";
    const sec = num(input.goalH) * 3600 + num(input.goalM) * 60 + num(input.goalS);
    if (sec < GOAL_MIN_SEC || sec > GOAL_MAX_SEC) return "";
    const total = Math.round(sec / FULL_KM);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return minutes + ":" + (seconds < 10 ? "0" : "") + seconds + "/km";
  }

  // Hours 2–9 are complete. 1 waits so 10 can be typed. Minutes and seconds wait for two digits.
  function goalFocusNext(id, value) {
    const text = String(value == null ? "" : value);
    if (id === "goalH") {
      if (text.length >= 2) return "goalM";
      if (text.length === 1 && Number(text) >= 2) return "goalM";
      return "";
    }
    if (id === "goalM" && text.length >= 2) return "goalS";
    return "";
  }

  return {
    buildBibBody,
    goalFieldsError,
    goalFieldsFromSec,
    waveChoiceVisible,
    sortWaves,
    waveClockLabel,
    goalPaceLabel,
    goalFocusNext,
  };
});
