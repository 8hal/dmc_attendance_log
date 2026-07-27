const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "../../chunbaek/guide");
const { GUIDE_PAGES } = require(path.join(DIR, "guide-nav.js"));

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
  }
});
