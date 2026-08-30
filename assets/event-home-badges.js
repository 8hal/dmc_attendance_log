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

  /** DNS/DNF from dnStatus or status (same as public-roster publicDnStatus). */
  function confirmDnLabel(result) {
    if (!result) return "";
    const candidates = [result.dnStatus, result.status];
    for (let i = 0; i < candidates.length; i++) {
      const v = String(candidates[i] || "")
        .trim()
        .toUpperCase();
      if (v === "DNS" || v === "DNF") return v;
    }
    return "";
  }

  /** Done-card lines from confirmed my-pending-result payload (no new API). */
  function confirmDoneSummary(result, opts) {
    const timeText = confirmDisplayTime(result);
    const distanceLabel =
      opts && opts.distanceLabel != null ? String(opts.distanceLabel).trim() : "";
    const dn = confirmDnLabel(result);
    const parts = [];
    if (distanceLabel) parts.push(distanceLabel);
    if (dn) {
      parts.push(dn);
    } else if (result && result.pbConfirmed === true) {
      parts.push("PB");
    }
    return { timeText: timeText, subText: parts.join(" · ") };
  }

  const CERT_SAVED_PROMPT = "끝. 동마클 대회 기록에 저장됐어요.";
  const CERT_FOOTER_TEXT = "동마클 저장 기록 · 공식 기록이 아닐 수 있어요";

  /** Design D certificate panel model for confirmed/done profile card. */
  function confirmCertificateView(result, opts) {
    opts = opts || {};
    const dnLabel = confirmDnLabel(result);
    let distanceLabel =
      opts.distanceLabel != null ? String(opts.distanceLabel).trim() : "";
    if (!distanceLabel || distanceLabel === "종목 미정") distanceLabel = "";
    const bibFromOpts = opts.bib != null ? String(opts.bib).trim() : "";
    const bibFromResult =
      result && result.bib != null ? String(result.bib).trim() : "";
    const bib = bibFromOpts || bibFromResult;
    const name = opts.name != null ? String(opts.name).trim() : "";
    const dateLabel = opts.dateLabel != null ? String(opts.dateLabel).trim() : "";
    const pb = !dnLabel && !!(result && result.pbConfirmed === true);
    const timeText = dnLabel ? "" : confirmDisplayTime(result);
    return {
      timeText: timeText,
      distanceLabel: distanceLabel,
      pb: pb,
      dnLabel: dnLabel,
      bib: bib,
      name: name,
      dateLabel: dateLabel,
      showHeroTime: !!timeText,
      showDnHero: !!dnLabel,
      savedPrompt: CERT_SAVED_PROMPT,
      footerText: CERT_FOOTER_TEXT,
    };
  }

  return {
    busLauncherVisible,
    busBadgeLabel,
    bibBadgeLabel,
    resultsLauncherState,
    confirmPanelFromApi,
    confirmDisplayTime,
    confirmDnLabel,
    confirmDoneSummary,
    confirmCertificateView,
  };
});
