const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { mount } = require(path.join(__dirname, "../../assets/event-member-tabs.js"));

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
  it("browse bus tab omits leg", () => {
    const tabs = { home: fakeTab(), bus: fakeTab(), roster: fakeTab() };
    const bar = fakeBar(tabs);
    mount({ eventId: "evt_x", active: "home", busEnabled: true, barEl: bar });
    assert.equal(tabs.bus.href, "boarding.html?eventId=evt_x");
  });

  it("QR-locked bus tab keeps the current leg", () => {
    const tabs = { home: fakeTab(), bus: fakeTab(), roster: fakeTab() };
    const bar = fakeBar(tabs);
    mount({
      eventId: "evt_x",
      active: "bus",
      busEnabled: true,
      busLeg: "return",
      barEl: bar,
    });
    assert.equal(tabs.bus.href, "boarding.html?eventId=evt_x&leg=return");
  });
});
