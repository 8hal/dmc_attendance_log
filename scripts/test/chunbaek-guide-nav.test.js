const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  GUIDE_SECTIONS,
  resolveGuideNav,
} = require(path.join(__dirname, "../../chunbaek/guide/guide-nav.js"));

describe("chunbaek guide-nav v2", () => {
  it("lists 2 intro + 21 body sections in fixed order", () => {
    assert.equal(GUIDE_SECTIONS.length, 23); // 2 intro + 21 body
    assert.equal(GUIDE_SECTIONS[0].id, "intro-usage");
    assert.equal(GUIDE_SECTIONS[1].id, "intro-diary");
    assert.equal(GUIDE_SECTIONS.filter((s) => !s.isIntro).length, 21);
  });

  it("resolves intro chain without position labels", () => {
    assert.equal(resolveGuideNav("intro-usage").next.href, "#intro-diary");
    assert.equal(resolveGuideNav("intro-diary").next.href, "#ch-1");
    assert.equal(resolveGuideNav("intro-diary").positionLabel, null);
  });

  it("resolves first body chapter prev to toc and next to ch-2", () => {
    const ch1 = resolveGuideNav("ch-1");
    assert.equal(ch1.prev.href, "#toc");
    assert.equal(ch1.prev.label, "목차");
    assert.equal(ch1.positionLabel, "1 / 21");
    assert.equal(ch1.next.href, "#ch-2");
  });

  it("resolves mid and last body positions", () => {
    assert.equal(resolveGuideNav("ch-9").positionLabel, "9 / 21");
    assert.equal(resolveGuideNav("refs").positionLabel, "21 / 21");
    assert.equal(resolveGuideNav("refs").next, null);
  });

  it("throws on unknown section", () => {
    assert.throws(() => resolveGuideNav("nope"), /unknown guide page/);
  });
});
