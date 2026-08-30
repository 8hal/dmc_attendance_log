const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  resolveBusCard,
} = require(path.join(__dirname, "../../assets/event-home-action.js"));

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "../..", rel), "utf8");
}

function extractFn(html, name) {
  const start = html.indexOf("function " + name + "(");
  assert.ok(start >= 0, "missing function " + name);
  const next = html.indexOf("\n    function ", start + 1);
  return html.slice(start, next > 0 ? next : html.length);
}

describe("event-home bus card boarding CTA (outbound vs return)", () => {
  it("openLeg outbound + required unboarded → ready CTA", () => {
    const b = resolveBusCard({
      openLeg: "outbound",
      busRow: {
        legs: {
          outbound: { required: true, boarded: false },
          return: { required: true, boarded: false },
        },
      },
    });
    assert.equal(b.state, "ready");
    assert.equal(b.leg, "outbound");
    assert.equal(b.ctaLabel, "탑승하기");
  });

  it("openLeg return + required unboarded → ready CTA even if outbound unboarded", () => {
    const b = resolveBusCard({
      openLeg: "return",
      busRow: {
        legs: {
          outbound: { required: true, boarded: false },
          return: { required: true, boarded: false },
        },
      },
    });
    assert.equal(b.state, "ready");
    assert.equal(b.leg, "return");
    assert.equal(b.ctaLabel, "탑승하기");
  });

  it("openLeg return after outbound boarded → ready CTA (not stuck outbound_done)", () => {
    const b = resolveBusCard({
      openLeg: "return",
      busRow: {
        legs: {
          outbound: { required: true, boarded: true },
          return: { required: true, boarded: false },
        },
      },
    });
    assert.equal(b.state, "ready");
    assert.equal(b.leg, "return");
    assert.equal(b.ctaLabel, "탑승하기");
  });
});

describe("event-home refresh keeps bus openLeg fresh", () => {
  const html = read("event-home.html");

  it("refreshHomeState reloads event before loadBusRow so openLeg can become return", () => {
    const fn = extractFn(html, "refreshHomeState");
    const reloadAt = fn.indexOf("reloadEvent");
    const loadBusAt = fn.indexOf("loadBusRow");
    assert.ok(reloadAt >= 0, "refreshHomeState must reloadEvent for openLeg");
    assert.ok(loadBusAt >= 0, "refreshHomeState must loadBusRow");
    assert.ok(
      reloadAt < loadBusAt,
      "reloadEvent must run before loadBusRow so return openLeg is visible"
    );
  });

  it("refreshHomeState paints bus card before waiting on confirm API", () => {
    const fn = extractFn(html, "refreshHomeState");
    const renderBusAt = fn.search(/renderBusCard\s*\(/);
    const confirmAt = fn.indexOf("loadConfirmState");
    assert.ok(renderBusAt >= 0, "must renderBusCard early");
    assert.ok(confirmAt >= 0, "must still loadConfirmState");
    assert.ok(
      renderBusAt < confirmAt,
      "bus card must not stay on placeholder 버스/버스 while confirm fetches"
    );
  });

  it("visibilitychange refreshes home bus even when confirm poll is off", () => {
    const start = html.indexOf('document.addEventListener("visibilitychange"');
    assert.ok(start >= 0);
    const handler = html.slice(start, start + 450);
    assert.match(handler, /refreshHomeState/);
    assert.doesNotMatch(
      handler,
      /if\s*\(\s*!shouldPollConfirm\(\)\s*\)\s*return/,
      "must not gate bus openLeg refresh on confirm wait mode"
    );
  });

  it("renderBusCard shows boarding button when resolveBusCard is ready", () => {
    const fn = extractFn(html, "renderBusCard");
    assert.match(fn, /card\.state\s*===\s*"ready"/);
    assert.match(fn, /busBoardBtn\.classList\.remove\(\s*"hidden"\s*\)/);
    assert.match(fn, /EventHomeAction\.resolveBusCard/);
    assert.match(fn, /readOpenLeg/);
  });
});
