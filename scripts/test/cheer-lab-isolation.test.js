const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "../..");
const labDir = path.join(root, "lab/cheer");
const labPages = ["index.html", "bib.html", "waves.html"];

function rootHtmlFiles() {
  return fs.readdirSync(root).filter((name) => name.endsWith(".html"));
}

describe("cheer lab pages stay off member paths", () => {
  it("has the three lab pages with noindex and repo-root asset paths", () => {
    for (const page of labPages) {
      const html = fs.readFileSync(path.join(labDir, page), "utf8");
      assert.match(html, /<meta name="robots" content="noindex, nofollow"/, page);
      assert.doesNotMatch(html, /src="assets\//, page);
      assert.doesNotMatch(html, /href="assets\//, page);
      assert.doesNotMatch(html, /EventMemberTabs/, page);
    }
  });

  it("is not linked from any existing page or shared asset", () => {
    const sources = rootHtmlFiles().map((name) => path.join(root, name));
    for (const name of fs.readdirSync(path.join(root, "assets"))) {
      if (name.endsWith(".js")) sources.push(path.join(root, "assets", name));
    }
    for (const file of sources) {
      const text = fs.readFileSync(file, "utf8");
      assert.doesNotMatch(text, /lab\/cheer/, path.relative(root, file));
      assert.doesNotMatch(text, /event-cheer\.html|event-bib\.html/, path.relative(root, file));
    }
  });

  it("keeps the old member bib page and tabs without a cheer entry", () => {
    const tabs = fs.readFileSync(path.join(root, "assets/event-member-tabs.js"), "utf8");
    const home = fs.readFileSync(path.join(root, "event-home.html"), "utf8");
    const action = fs.readFileSync(path.join(root, "assets/event-home-action.js"), "utf8");
    assert.doesNotMatch(tabs, /cheer/);
    assert.doesNotMatch(home, /data-tab="cheer"/);
    assert.match(action, /"my-bib\.html" \+ q/);
  });
});
