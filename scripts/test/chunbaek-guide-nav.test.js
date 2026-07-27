const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  GUIDE_SECTIONS,
  resolveGuideNav,
} = require(path.join(__dirname, "../../chunbaek/guide/guide-nav.js"));

describe("chunbaek guide-nav", () => {
  it("lists intro + 7 topics in fixed order", () => {
    assert.equal(GUIDE_SECTIONS.length, 8);
    assert.deepEqual(
      GUIDE_SECTIONS.map((s) => s.id),
      [
        "intro",
        "week",
        "long-run",
        "quality",
        "summer",
        "pain",
        "missed",
        "taper-race",
      ],
    );
  });

  it("resolves first topic prev to toc and next to long-run", () => {
    const nav = resolveGuideNav("week");
    assert.equal(nav.positionLabel, "1 / 7");
    assert.equal(nav.prev.href, "#toc");
    assert.equal(nav.prev.label, "목차");
    assert.equal(nav.next.href, "#long-run");
    assert.equal(nav.tocHref, "#toc");
  });

  it("resolves last topic with next null", () => {
    const nav = resolveGuideNav("taper-race");
    assert.equal(nav.positionLabel, "7 / 7");
    assert.equal(nav.prev.href, "#missed");
    assert.equal(nav.next, null);
  });

  it("resolves intro without position and next to week", () => {
    const nav = resolveGuideNav("intro");
    assert.equal(nav.isHub, true);
    assert.equal(nav.positionLabel, null);
    assert.equal(nav.prev, null);
    assert.equal(nav.next.href, "#week");
  });

  it("throws on unknown section", () => {
    assert.throws(() => resolveGuideNav("nope"), /unknown guide page/);
  });
});
