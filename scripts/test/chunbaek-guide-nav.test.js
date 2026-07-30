const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { GUIDE_SECTIONS } = require(path.join(
  __dirname,
  "../../chunbaek/guide/guide-nav.js",
));

describe("chunbaek guide-nav v3", () => {
  it("lists 2 intro + 21 body sections in fixed order", () => {
    assert.equal(GUIDE_SECTIONS.length, 23);
    assert.equal(GUIDE_SECTIONS[0].id, "intro-usage");
    assert.equal(GUIDE_SECTIONS[1].id, "intro-diary");
    assert.equal(GUIDE_SECTIONS.filter((s) => !s.isIntro).length, 21);
    assert.equal(GUIDE_SECTIONS[2].id, "ch-1");
    assert.equal(GUIDE_SECTIONS[GUIDE_SECTIONS.length - 1].id, "refs");
  });
});
