(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.EventBoardingFlow = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function parseBoardingLeg(search) {
    const raw = String(search || "");
    const q = raw.charAt(0) === "?" ? raw.slice(1) : raw;
    const params = new URLSearchParams(q);
    return params.get("leg") === "return" ? "return" : "outbound";
  }

  function resolveBoardingEntry(ctx) {
    const roster = ctx && Array.isArray(ctx.roster) ? ctx.roster : [];
    const leg = ctx && ctx.leg === "return" ? "return" : "outbound";
    let row = ctx && ctx.row ? ctx.row : null;
    if (!row) {
      const nickname = ctx && ctx.savedNickname ? String(ctx.savedNickname).trim() : "";
      if (!nickname) return { screen: "list", row: null, leg: leg };
      row = roster.find(function (p) {
        return p && String(p.nickname || "").trim() === nickname;
      });
    }
    if (!row) return { screen: "list", row: null, leg: leg };
    const st = row.legs && row.legs[leg];
    if (st && st.required === true) {
      if (st.boarded === true) {
        return { screen: "done", row: row, leg: leg };
      }
      return { screen: "confirm", row: row, leg: leg };
    }
    return { screen: "list", row: null, leg: leg };
  }

  function resolveBoardingDoneLinks(ctx) {
    const completedLeg = ctx && ctx.completedLeg;
    const hasBib = !!(ctx && ctx.hasBib);
    if (completedLeg === "outbound" && !hasBib) {
      return {
        secondaryLabel: "이어서 배번 입력",
        secondaryHref: "bib",
      };
    }
    return { secondaryLabel: null, secondaryHref: null };
  }

  function resolveReturnConfirmBanner(ctx) {
    const leg = ctx && ctx.leg;
    const confirmMode = ctx && ctx.confirmMode;
    if (leg === "return" && confirmMode === "pending") {
      return { show: true, label: "기록 확정하기", hrefKey: "home" };
    }
    return { show: false, label: null, hrefKey: null };
  }

  return {
    parseBoardingLeg,
    resolveBoardingEntry,
    resolveBoardingDoneLinks,
    resolveReturnConfirmBanner,
  };
});
