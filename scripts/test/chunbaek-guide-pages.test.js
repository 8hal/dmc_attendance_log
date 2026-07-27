const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "../../chunbaek/guide");
const { GUIDE_SECTIONS } = require(path.join(DIR, "guide-nav.js"));

const GUIDE_STORY_REQUIRED = new Set(["long-run", "quality", "taper-race"]);

describe("chunbaek guide pages", () => {
  it("single-page index exists with shell hooks", () => {
    const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
    assert.match(html, /data-guide-page="index.html"/);
    assert.match(html, /guide-nav\.js/);
    assert.match(html, /tokens\.css/);
    assert.match(html, /guide\.css/);
    assert.match(html, /kakao-banner/);
    assert.match(html, /\/chunbaek\/#\/today/);
    assert.doesNotMatch(html, /초안 작성 중/);
    assert.match(html, /세 구간|서브3/);
    const tocCount = (html.match(/toc-card/g) || []).length;
    assert.ok(tocCount >= 7, `expected >= 7 toc-card, got ${tocCount}`);
  });

  for (const section of GUIDE_SECTIONS.filter((s) => !s.isIntro)) {
    it(`section #${section.id} has body markers`, () => {
      const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
      assert.match(html, new RegExp(`id="${section.id}"`));
      assert.match(html, new RegExp(`data-guide-section="${section.id}"`));
      // band notes somewhere in file; also section-local check via slice
      const start = html.indexOf(`data-guide-section="${section.id}"`);
      assert.ok(start >= 0);
      const end = html.indexOf("data-guide-section=", start + 10);
      const slice = end > start ? html.slice(start, end) : html.slice(start);
      assert.match(slice, /band-notes|band-note/);
      assert.match(slice, /data-guide-prev/);
      assert.match(slice, /data-guide-next/);
      assert.match(slice, /data-guide-toc/);
      assert.match(slice, /data-guide-position/);
      if (GUIDE_STORY_REQUIRED.has(section.id)) {
        assert.match(slice, /guide-story/);
      }
    });
  }

  it("old multi-page topic files are removed", () => {
    for (const name of [
      "week.html",
      "long-run.html",
      "quality.html",
      "summer.html",
      "pain.html",
      "missed.html",
      "taper-race.html",
    ]) {
      assert.equal(
        fs.existsSync(path.join(DIR, name)),
        false,
        `${name} should be removed (single-page guide)`,
      );
    }
  });

  it("me tab links to static guide hub not onboarding hash", () => {
    const html = fs.readFileSync(
      path.join(__dirname, "../../chunbaek/index.html"),
      "utf8",
    );
    assert.match(html, /href="\/chunbaek\/guide\/"/);
    assert.doesNotMatch(
      html,
      /me-guide-link[^>]*href="\/chunbaek\/#\/guide"/,
    );
  });
});
