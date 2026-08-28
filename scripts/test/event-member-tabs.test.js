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
  it("wires home and roster only", () => {
    const tabs = { home: fakeTab(), roster: fakeTab() };
    const bar = fakeBar(tabs);
    mount({ eventId: "evt_x", active: "home", barEl: bar });
    assert.equal(tabs.home.href, "event-home.html?eventId=evt_x");
    assert.equal(tabs.roster.href, "event-roster.html?eventId=evt_x");
    assert.equal(tabs.home.attrs["aria-current"], "page");
  });

  it("marks roster tab current on the records page", () => {
    const tabs = { home: fakeTab(), roster: fakeTab() };
    const bar = fakeBar(tabs);
    mount({ eventId: "evt_x", active: "roster", barEl: bar });
    assert.equal(tabs.roster.attrs["aria-current"], "page");
    assert.equal(tabs.home.attrs["aria-current"], undefined);
  });

  it("member pages keep only 홈 and 대회 기록 tabs", () => {
    ["event-home.html", "event-roster.html", "boarding.html"].forEach(function (file) {
      const html = read(file);
      assert.match(html, />대회 기록</, file);
      assert.doesNotMatch(html, /data-tab="bus"/, file);
    });
  });
});
