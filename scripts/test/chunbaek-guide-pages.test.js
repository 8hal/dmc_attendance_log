const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "../../chunbaek/guide");

const V3_SECTION_IDS = [
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

const STORY_FIRST_SECTIONS = [
  "intro-diary",
  "ch-7",
  "ch-8",
  "ch-9",
  "ch-10",
  "ch-15",
];

const FORBIDDEN_LEVEL_HEADER =
  /<th[^>]*>\s*완주형[\s\S]*?<th[^>]*>\s*향상형[\s\S]*?<th[^>]*>\s*기록형[\s\S]*?<th[^>]*>\s*상급형/;

function sectionHtml(html, id) {
  const re = new RegExp(
    `<section[^>]*id="${id}"[\\s\\S]*?(?=\\n\\s*<section |\\n\\s*</main>)`,
  );
  const m = html.match(re);
  assert.ok(m, `missing section #${id}`);
  return m[0];
}

describe("chunbaek guide pages v3", () => {
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

  it("has all v3 section anchors including toc", () => {
    const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
    for (const id of V3_SECTION_IDS) {
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

  it("does not stack four-level distance prescriptions in prose", () => {
    const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
    assert.doesNotMatch(
      html,
      /완주형:\s*[\s\S]{0,160}?향상형:\s*[\s\S]{0,160}?기록형:\s*[\s\S]{0,160}?상급형:/,
    );
  });

  it("has no band-notes or data-band grouping", () => {
    const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
    assert.doesNotMatch(html, /band-notes|data-band=/);
  });

  it("has no per-chapter prev/next/toc chrome", () => {
    const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
    assert.doesNotMatch(html, /guide-topnav|guide-bottomnav|data-guide-prev/);
  });

  it("places all raw stories before first table or callout in story chapters", () => {
    const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
    for (const id of STORY_FIRST_SECTIONS) {
      const sec = sectionHtml(html, id);
      const rawMatches = [...sec.matchAll(/guide-story--raw/g)];
      assert.ok(rawMatches.length >= 1, `#${id} needs a raw story`);
      const lastRaw = rawMatches[rawMatches.length - 1].index;
      const tableIdx = sec.indexOf("guide-table");
      const calloutIdx = sec.indexOf("guide-callout");
      const blockers = [tableIdx, calloutIdx].filter((i) => i >= 0);
      if (blockers.length === 0) continue;
      const firstBlocker = Math.min(...blockers);
      assert.ok(
        lastRaw < firstBlocker,
        `#${id}: last raw at ${lastRaw} should be before first table/callout at ${firstBlocker}`,
      );
    }
  });

  it("mentions DOCX rewrite skip at most once", () => {
    const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
    const hits = (html.match(/DOCX 윤문 사례는 웹에서 생략/g) || []).length;
    assert.ok(hits <= 1, `expected <=1 DOCX skip notices, got ${hits}`);
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
