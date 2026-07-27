const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "../../chunbaek/guide");

const V2_SECTION_IDS = [
  "intro-usage",
  "intro-diary",
  "ch-1",
  "ch-2",
  "ch-3",
  "ch-4",
  "ch-5",
  "ch-6",
  "ch-7",
  "ch-8",
  "ch-9",
  "ch-10",
  "ch-11",
  "ch-12",
  "ch-13",
  "ch-14",
  "ch-15",
  "ch-16",
  "app-a",
  "app-b",
  "app-c",
  "checklist",
  "refs",
  "toc",
];

const SVG_IDS = [
  "diagram-100day-timeline",
  "diagram-week-framework",
  "diagram-decision-flow",
  "diagram-race-abc",
];

const FORBIDDEN_LEVEL_HEADER =
  /<th[^>]*>\s*완주형[\s\S]*?<th[^>]*>\s*향상형[\s\S]*?<th[^>]*>\s*기록형[\s\S]*?<th[^>]*>\s*상급형/;

describe("chunbaek guide pages v2", () => {
  it("single-page index exists with shell hooks", () => {
    const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
    assert.match(html, /data-guide-page="index.html"/);
    assert.match(html, /guide-nav\.js/);
    assert.match(html, /tokens\.css/);
    assert.match(html, /guide\.css/);
    assert.match(html, /kakao-banner/);
    assert.match(html, /\/chunbaek\/#\/today/);
    assert.doesNotMatch(html, /초안 작성 중/);
  });

  it("has all v2 section anchors including toc", () => {
    const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
    for (const id of V2_SECTION_IDS) {
      assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
    }
  });

  it("has four required SVG diagram ids", () => {
    const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
    for (const id of SVG_IDS) {
      assert.match(html, new RegExp(`id="${id}"`), `missing SVG #${id}`);
    }
  });

  it("includes at least one raw diary story with kakao markers", () => {
    const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
    const rawCount = (html.match(/guide-story--raw/g) || []).length;
    assert.ok(rawCount >= 1, `expected >= 1 .guide-story--raw, got ${rawCount}`);
    assert.match(html, /ㅡ|ㅋㅋ|ㅠ/, "expected kakao raw marker (ㅡ or ㅋㅋ/ㅠ)");
  });

  it("does not use forbidden four-level table headers", () => {
    const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
    assert.doesNotMatch(html, FORBIDDEN_LEVEL_HEADER);
  });

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
