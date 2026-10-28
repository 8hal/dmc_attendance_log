const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { mount } = require(path.join(__dirname, "../../assets/event-member-tabs.js"));

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "../..", rel), "utf8");
}

function fakeTab() {
  return {
    href: "#",
    className: "event-tab-btn",
    attrs: {},
    title: "",
    classList: {
      toggle(_name, on) {
        this._active = !!on;
      },
      add(name) {
        this[name] = true;
      },
      remove(name) {
        this[name] = false;
      },
    },
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    removeAttribute(k) {
      delete this.attrs[k];
    },
  };
}

function fakeBar(tabs) {
  return {
    hidden: true,
    classList: {
      remove(name) {
        if (name === "hidden") this.hidden = false;
      },
    },
    querySelector(sel) {
      const m = sel.match(/data-tab="(\w+)"/);
      return m ? tabs[m[1]] : null;
    },
  };
}

describe("event-member-tabs", () => {
  it("mounts home and roster only, roster label is 대회 기록", () => {
    const tabs = { home: fakeTab(), roster: fakeTab() };
    const bar = fakeBar(tabs);
    mount({ eventId: "evt_x", active: "home", barEl: bar });
    assert.equal(tabs.home.href, "event-home.html?eventId=evt_x");
    assert.equal(tabs.roster.href, "event-roster.html?eventId=evt_x");
  });

  it("does not require a bus tab", () => {
    const tabs = { home: fakeTab(), roster: fakeTab() };
    const bar = fakeBar(tabs);
    assert.doesNotThrow(() => mount({ eventId: "evt_x", active: "roster", barEl: bar }));
  });

  it("points an optional cheer tab at the board and never marks it active", () => {
    const tabs = { home: fakeTab(), roster: fakeTab(), cheer: fakeTab() };
    tabs.cheer.classList._active = true;
    tabs.cheer.attrs["aria-current"] = "page";
    const bar = fakeBar(tabs);
    mount({ eventId: "evt_a b", active: "home", barEl: bar });
    assert.equal(
      tabs.cheer.href,
      "cheer/index.html?eventId=" + encodeURIComponent("evt_a b")
    );
    assert.equal(tabs.cheer.classList._active, false);
    assert.equal(tabs.cheer.attrs["aria-current"], undefined);
    assert.equal(tabs.home.classList._active, true);
  });

  it("event-home.html roster tab is labeled 대회 기록 without bus tab", () => {
    const html = read("event-home.html");
    assert.match(html, />대회 기록</);
    assert.doesNotMatch(html, /data-tab="bus"/);
    assert.match(html, /data-tab="cheer"[^>]*>[\s\S]*📣[\s\S]*응원</);
  });

  it("event-roster.html roster tab is labeled 대회 기록 without bus tab", () => {
    const html = read("event-roster.html");
    assert.match(html, />대회 기록</);
    assert.doesNotMatch(html, /data-tab="bus"/);
    assert.match(html, /data-tab="cheer"[^>]*>[\s\S]*📣[\s\S]*응원</);
  });

  it("event-roster.html does not probe bus-boarding for tabs", () => {
    const html = read("event-roster.html");
    assert.doesNotMatch(html, /probeBus/);
    assert.doesNotMatch(html, /bus-boarding/);
    const mount = html.match(/EventMemberTabs\.mount\(\{[^}]+\}/);
    assert.ok(mount, "EventMemberTabs.mount call expected");
    assert.doesNotMatch(mount[0], /busEnabled/);
  });
});
