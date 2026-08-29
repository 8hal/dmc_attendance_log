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
   * @param {{ eventId: string, active: 'home'|'roster', barEl: HTMLElement }} opts
   */
  function mount(opts) {
    const eventId = opts && opts.eventId ? opts.eventId : "";
    const active = opts && opts.active ? opts.active : "home";
    const barEl = opts && opts.barEl ? opts.barEl : null;
    if (!barEl || !eventId) return;

    const q = query(eventId);
    const tabs = {
      home: barEl.querySelector('[data-tab="home"]'),
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

    barEl.classList.remove("hidden");
  }

  return { mount, query };
});
