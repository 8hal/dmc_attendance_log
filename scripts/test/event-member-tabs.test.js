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

  it("event-home.html roster tab is labeled 대회 기록 without bus tab", () => {
    const html = read("event-home.html");
    assert.match(html, />대회 기록</);
    assert.doesNotMatch(html, /data-tab="bus"/);
  });

  it("event-roster.html roster tab is labeled 대회 기록 without bus tab", () => {
    const html = read("event-roster.html");
    assert.match(html, />대회 기록</);
    assert.doesNotMatch(html, /data-tab="bus"/);
  });
});
