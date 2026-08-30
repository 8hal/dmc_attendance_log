const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "../..", rel), "utf8");
}

function extractFn(html, name) {
  const start = html.indexOf("function " + name + "(");
  assert.ok(start >= 0, "missing function " + name);
  const next = html.indexOf("\n    function ", start + 1);
  return html.slice(start, next > 0 ? next : html.length);
}

describe("event-home confirmed profile shows race summary", () => {
  const html = read("event-home.html");

  it("confirmed branch paints time + sub from confirmDoneSummary", () => {
    const fn = extractFn(html, "renderProfileCard");
    const doneIdx = fn.indexOf('if (card.state === "confirmed")');
    assert.ok(doneIdx >= 0, "confirmed block missing");
    const bibIdx = fn.indexOf('if (card.state === "bib")', doneIdx);
    const block = fn.slice(doneIdx, bibIdx > doneIdx ? bibIdx : doneIdx + 800);

    assert.match(block, /is-done/);
    assert.match(block, /confirmDoneSummary/);
    assert.match(block, /profileDisplay/);
    assert.match(block, /profileTimeDisplay/);
    assert.match(block, /profileSub/);
    assert.match(block, /memberDistanceLabel/);
    assert.doesNotMatch(block, /profileBibFace\.classList\.remove\("hidden"\)/);
  });
});
