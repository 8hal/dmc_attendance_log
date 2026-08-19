(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.EventAdminPanels = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PANELS = ["prep", "bus", "bib", "scrape"];

  function panelFromHash(hash) {
    const raw = String(hash || "").replace(/^#/, "").trim();
    return PANELS.includes(raw) ? raw : null;
  }

  /**
   * 총무 지금 단계: 준비(버스 off) → 가는 버스 → 배번 미입력 → 스크랩.
   */
  function resolveDefaultPanel(ctx) {
    const busEnabled = !!(ctx && ctx.busEnabled);
    const outboundRequired = Number(ctx && ctx.outboundRequired) || 0;
    const outboundBoarded = Number(ctx && ctx.outboundBoarded) || 0;
    const bibMissing = Number(ctx && ctx.bibMissing) || 0;

    if (!busEnabled) return "prep";
    if (outboundRequired > 0 && outboundBoarded < outboundRequired) return "bus";
    if (bibMissing > 0) return "bib";
    return "scrape";
  }

  function applyPanel(root, panelId) {
    const id = PANELS.includes(panelId) ? panelId : "prep";
    if (!root || !root.querySelectorAll) return id;
    root.querySelectorAll("[data-ops-panel]").forEach((btn) => {
      const on = btn.getAttribute("data-ops-panel") === id;
      btn.classList.toggle("active", on);
      if (on) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
    root.querySelectorAll("[data-ops-section]").forEach((sec) => {
      sec.classList.toggle("active", sec.getAttribute("data-ops-section") === id);
    });
    return id;
  }

  return {
    PANELS,
    panelFromHash,
    resolveDefaultPanel,
    applyPanel,
  };
});
