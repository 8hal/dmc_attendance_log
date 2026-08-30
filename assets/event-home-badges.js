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

  /** my-pending-result → home confirm banner mode (no gap UI). */
  function confirmPanelFromApi(data) {
    if (!data || data.ok !== true) return { mode: "none", result: null };
    if (data.state === "pending" && data.result) {
      return { mode: "pending", result: data.result };
    }
    if (data.state === "confirmed" && data.result) {
      return { mode: "confirmed", result: data.result };
    }
    return { mode: "none", result: null };
  }

  function confirmDisplayTime(result) {
    if (!result) return "";
    const net = String(result.netTime || "").trim();
    if (net && net !== "--:--:--" && net !== "-") return net;
    const gun = String(result.gunTime || "").trim();
    if (gun && gun !== "-") return gun;
    const fin = String(result.finishTime || "").trim();
    if (fin && fin !== "-") return fin;
    return "";
  }

  /** Done-card lines from confirmed my-pending-result payload (no new API). */
  function confirmDoneSummary(result, opts) {
    const timeText = confirmDisplayTime(result);
    const distanceLabel =
      opts && opts.distanceLabel != null ? String(opts.distanceLabel).trim() : "";
    const dn = String((result && result.dnStatus) || "")
      .trim()
      .toUpperCase();
    const parts = [];
    if (distanceLabel) parts.push(distanceLabel);
    if (dn === "DNS" || dn === "DNF") {
      parts.push(dn);
    } else if (result && result.pbConfirmed === true) {
      parts.push("PB");
    }
    return { timeText: timeText, subText: parts.join(" · ") };
  }

  return {
    busLauncherVisible,
    busBadgeLabel,
    bibBadgeLabel,
    resultsLauncherState,
    confirmPanelFromApi,
    confirmDisplayTime,
    confirmDoneSummary,
  };
});
