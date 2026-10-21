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

  // Bib must save on the bus even before the treasurer adds waves or the runner knows a goal.
  // Wave and goal go together only when both are present; otherwise the runner is just off the board.
  function buildBibBody(input) {
    const body = {
      subAction: "update-bib",
      eventId: input.eventId,
      nickname: input.nickname,
      bib: input.bib,
      distance: input.distance,
    };
    if (input.distance !== "full" || !filled(input.waveId)) return body;
    if (input.goalMode === "pace") {
      if (!filled(input.paceM) && !filled(input.paceS)) return body;
      body.waveId = input.waveId;
      body.goalPaceSecPerKm = num(input.paceM) * 60 + num(input.paceS);
      return body;
    }
    if (!filled(input.goalH) && !filled(input.goalM) && !filled(input.goalS)) return body;
    body.waveId = input.waveId;
    body.goalFinishSec = num(input.goalH) * 3600 + num(input.goalM) * 60 + num(input.goalS);
    return body;
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

  return { buildBibBody, goalFieldsFromSec };
});
