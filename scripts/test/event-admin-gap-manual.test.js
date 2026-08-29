"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "../..", rel), "utf8");
}

function extractFn(html, name) {
  const re = new RegExp("(?:async )?function " + name + "\\(");
  const start = html.search(re);
  assert.ok(start >= 0, "missing function " + name);
  const rest = html.slice(start + 1);
  const next = rest.search(/\n    (async )?function /);
  return html.slice(start, next >= 0 ? start + 1 + next : html.length);
}

function sectionHtml(html, id) {
  const start = html.indexOf(`id="${id}"`);
  assert.ok(start >= 0, "missing #" + id);
  const end = html.indexOf("</section>", start);
  return html.slice(start, end > start ? end : html.length);
}

describe("event-admin gap manual confirm", () => {
  const html = read("event-admin.html");

  it("puts unconfirmed list in scrape panel, not bib", () => {
    const scrape = sectionHtml(html, "sec-scrape");
    assert.match(scrape, /id="gap-manual-list"/);
    const bib = sectionHtml(html, "sec-bib");
    assert.match(bib, /id="bib-missing-list"/);
    assert.doesNotMatch(bib, /id="gap-manual-list"/);
    assert.doesNotMatch(scrape, /id="bib-missing-list"/);
  });

  it("draws DNS/DNF buttons with data-dnStatus", () => {
    assert.match(html, /data-dnStatus="DNS"/);
    assert.match(html, /data-dnStatus="DNF"/);
  });

  it("renders only unconfirmed gap rows in the scrape list", () => {
    const fn = extractFn(html, "renderGapManualList");
    assert.match(fn, /gap-manual-list/);
    assert.match(fn, /gapStatus\s*!==\s*"confirmed"/);
    assert.doesNotMatch(fn, /gapStatus\s*!==\s*"ok"/);
    const scrapeFn = extractFn(html, "renderScrapeSection");
    assert.match(scrapeFn, /renderGapManualList/);
  });

  it("posts existing confirm-one with operator source and netTime", () => {
    const fn = extractFn(html, "confirmGapManual");
    assert.match(fn, /subAction:\s*"confirm-one"/);
    assert.match(fn, /canonicalEventId:\s*eventId/);
    assert.match(fn, /confirmSource:\s*"operator"/);
    assert.match(fn, /netTime/);
    assert.match(fn, /dnStatus/);
    assert.doesNotMatch(fn, /ownerPw/);
    assert.match(fn, /loadEventDetail/);
    assert.match(fn, /showToast/);
    assert.match(fn, /isProcessing/);
  });

  it("does not POST a new group-events subAction name", () => {
    const posted = [...html.matchAll(/subAction:\s*"([^"]+)"/g)].map((m) => m[1]);
    const allowed = new Set([
      "status",
      "settings",
      "admin-board",
      "roster-remove",
      "roster-upsert",
      "import",
      "source",
      "scrape",
      "confirm-one",
    ]);
    for (const sub of posted) {
      assert.ok(allowed.has(sub), "unexpected subAction " + sub);
    }
    assert.ok(posted.includes("confirm-one"), "confirm-one must be posted");
    assert.ok(!posted.includes("bulk-confirm"));
  });

  it("marks checklist missing done when no unconfirmed gap rows", () => {
    const fn = extractFn(html, "updateChecklist");
    assert.match(fn, /gapStatus\s*===\s*"confirmed"/);
    assert.match(fn, /missing:/);
    assert.doesNotMatch(fn, /missing:\s*false/);
  });
});
