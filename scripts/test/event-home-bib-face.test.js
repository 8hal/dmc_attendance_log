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

describe("event-home wait-state bib face", () => {
  const html = read("event-home.html");
  const css = read("assets/event-member-shell.css");

  it("markup has bib-face with dist, number, event, and pin holes", () => {
    assert.match(html, /id="profileBibFace"/);
    assert.match(html, /class="[^"]*\bbib-face\b/);
    assert.match(html, /id="profileBibDist"/);
    assert.match(html, /id="profileBibLarge"/);
    assert.match(html, /id="profileBibEvent"/);
    assert.match(html, /class="[^"]*bib-face-pin/);
    assert.match(html, /id="profileBibPlain"/);
  });

  it("CSS defines physical bib face (white face, blue band, pins)", () => {
    assert.match(css, /\.bib-face\s*\{/);
    assert.match(css, /\.bib-face-band\s*\{/);
    assert.match(css, /\.bib-face-pin/);
    assert.match(css, /#(?:1d4ed8|2563eb)|var\(--dmc-color-primary/i);
  });

  it("wait render fills bib-face and hides plain bib; pending uses plain", () => {
    const fn = extractFn(html, "renderProfileCard");
    const waitIdx = fn.indexOf('if (card.state === "wait")');
    const pendingIdx = fn.indexOf('if (card.state === "pending")');
    assert.ok(waitIdx >= 0 && pendingIdx > waitIdx, "wait block must precede pending block");
    const waitBlock = fn.slice(waitIdx, pendingIdx);
    const pendingBlock = fn.slice(pendingIdx);

    assert.match(waitBlock, /profileBibFace/);
    assert.match(waitBlock, /profileBibDist/);
    assert.match(waitBlock, /profileBibEvent/);
    assert.match(waitBlock, /memberEventTitle|eventTitle/);
    assert.match(waitBlock, /profileBibPlain/);

    assert.match(pendingBlock, /profileBibPlain/);
    assert.match(pendingBlock, /profileBibFace/);
    assert.doesNotMatch(pendingBlock, /profileBibFace\.classList\.remove\("hidden"\)/);
  });
});
