const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "../../chunbaek/guide");
const { GUIDE_PAGES } = require(path.join(DIR, "guide-nav.js"));

/** Pages that must include the guide-story block (확정). */
const GUIDE_STORY_REQUIRED = new Set([
  "long-run.html",
  "quality.html",
  "taper-race.html",
]);

describe("chunbaek guide pages", () => {
  for (const page of GUIDE_PAGES) {
    it(`${page.file} exists with guide hooks`, () => {
      const html = fs.readFileSync(path.join(DIR, page.file), "utf8");
      assert.match(html, new RegExp(`data-guide-page="${page.file}"`));
      assert.match(html, /guide-nav\.js/);
      assert.match(html, /tokens\.css/);
      assert.match(html, /guide\.css/);
      assert.match(html, /kakao-banner/);
      assert.match(html, /\/chunbaek\/#\/today/);
      if (!page.isHub) {
        assert.match(html, /data-guide-prev/);
        assert.match(html, /data-guide-next/);
        assert.match(html, /data-guide-toc/);
        assert.match(html, /data-guide-position/);
      }
    });

    it(`${page.file} has expected body markers`, () => {
      const html = fs.readFileSync(path.join(DIR, page.file), "utf8");

      if (page.isHub) {
        const tocCount = (html.match(/toc-card/g) || []).length;
        assert.ok(tocCount >= 7, `hub should have >= 7 toc-card, got ${tocCount}`);
        assert.match(html, /세 구간|서브3/);
        return;
      }

      assert.match(html, /band-notes|band-note/);
      assert.doesNotMatch(html, /초안 작성 중/);
      assert.match(html, /guide-prose/);

      if (GUIDE_STORY_REQUIRED.has(page.file)) {
        assert.match(html, /guide-story/);
      }
    });
  }
});
