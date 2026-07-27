// scripts/test/chunbaek-guide-nav.test.js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  GUIDE_PAGES,
  resolveGuideNav,
} = require(path.join(__dirname, "../../chunbaek/guide/guide-nav.js"));

describe("chunbaek guide-nav", () => {
  it("lists hub + 7 topics in fixed order", () => {
    assert.equal(GUIDE_PAGES.length, 8);
    assert.deepEqual(
      GUIDE_PAGES.map((p) => p.file),
      [
        "index.html",
        "week.html",
        "long-run.html",
        "quality.html",
        "summer.html",
        "pain.html",
        "missed.html",
        "taper-race.html",
      ],
    );
  });

  it("resolves first topic prev to hub and next to long-run", () => {
    const nav = resolveGuideNav("week.html");
    assert.equal(nav.positionLabel, "1 / 7");
    assert.equal(nav.prev.href, "index.html");
    assert.equal(nav.prev.label, "목차");
    assert.equal(nav.next.href, "long-run.html");
    assert.equal(nav.tocHref, "index.html");
  });

  it("resolves last topic with next null", () => {
    const nav = resolveGuideNav("taper-race.html");
    assert.equal(nav.positionLabel, "7 / 7");
    assert.equal(nav.prev.href, "missed.html");
    assert.equal(nav.next, null);
  });

  it("resolves hub without position and next to week", () => {
    const nav = resolveGuideNav("index.html");
    assert.equal(nav.isHub, true);
    assert.equal(nav.positionLabel, null);
    assert.equal(nav.prev, null);
    assert.equal(nav.next.href, "week.html");
  });

  it("throws on unknown file", () => {
    assert.throws(() => resolveGuideNav("nope.html"), /unknown guide page/);
  });
});
