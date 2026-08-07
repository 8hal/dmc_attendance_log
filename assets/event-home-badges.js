(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.EventHomeBadges = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function busLauncherVisible(busBoarding) {
    return busBoarding != null && busBoarding.enabled === true;
  }

  function busBadgeLabel(row) {
    if (!row || !row.legs) return null;
    const legs = [row.legs.outbound, row.legs.return];
    const required = legs.filter((leg) => leg && leg.required === true);
    if (required.length === 0) return null;
    const unboarded = required.find((leg) => !leg.boarded);
    if (unboarded) return "미탑승";
    return "완료";
  }

  function bibBadgeLabel(participant) {
    if (participant == null) return null;
    const bib = typeof participant.bib === "string" ? participant.bib.trim() : "";
    return bib ? "입력됨" : "미입력";
  }

  function resultsLauncherState(boardReady) {
    if (boardReady === true) {
      return { enabled: true, label: null };
    }
    return { enabled: false, label: "준비 중" };
  }

  return {
    busLauncherVisible,
    busBadgeLabel,
    bibBadgeLabel,
    resultsLauncherState,
  };
});
