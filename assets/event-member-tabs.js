(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.EventMemberTabs = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function query(eventId) {
    return eventId ? "?eventId=" + encodeURIComponent(eventId) : "";
  }

  /**
   * Wire bottom tab bar links and active state.
   * @param {{ eventId: string, active: 'home'|'bus'|'roster', busEnabled: boolean, barEl: HTMLElement }} opts
   */
  function mount(opts) {
    const eventId = opts && opts.eventId ? opts.eventId : "";
    const active = opts && opts.active ? opts.active : "home";
    const busEnabled = !!(opts && opts.busEnabled);
    const barEl = opts && opts.barEl ? opts.barEl : null;
    if (!barEl || !eventId) return;

    const q = query(eventId);
    const tabs = {
      home: barEl.querySelector('[data-tab="home"]'),
      bus: barEl.querySelector('[data-tab="bus"]'),
      roster: barEl.querySelector('[data-tab="roster"]'),
    };

    if (tabs.home) {
      tabs.home.href = "event-home.html" + q;
      tabs.home.classList.toggle("active", active === "home");
      if (active === "home") {
        tabs.home.setAttribute("aria-current", "page");
      } else {
        tabs.home.removeAttribute("aria-current");
      }
    }

    if (tabs.roster) {
      tabs.roster.href = "event-roster.html" + q;
      tabs.roster.classList.toggle("active", active === "roster");
      if (active === "roster") {
        tabs.roster.setAttribute("aria-current", "page");
      } else {
        tabs.roster.removeAttribute("aria-current");
      }
    }

    if (tabs.bus) {
      if (busEnabled) {
        const busLeg = opts && (opts.busLeg === "return" || opts.busLeg === "outbound")
          ? opts.busLeg
          : "";
        tabs.bus.href = "boarding.html" + q + (busLeg ? "&leg=" + busLeg : "");
        tabs.bus.classList.remove("is-muted");
        tabs.bus.removeAttribute("aria-disabled");
        tabs.bus.title = "";
      } else {
        tabs.bus.removeAttribute("href");
        tabs.bus.classList.add("is-muted");
        tabs.bus.setAttribute("aria-disabled", "true");
        tabs.bus.title = "버스가 없거나 아직 열리지 않았습니다";
      }
      tabs.bus.classList.toggle("active", active === "bus");
      if (active === "bus") {
        tabs.bus.setAttribute("aria-current", "page");
      } else {
        tabs.bus.removeAttribute("aria-current");
      }
    }

    barEl.classList.remove("hidden");
  }

  return { mount, query };
});
