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
  const css = read("assets/event-member-shell.css");

  it("markup has result-cert panel with pills, hero, footer", () => {
    assert.match(html, /id="profileResultCert"/);
    assert.match(html, /class="[^"]*\bresult-cert\b/);
    assert.match(html, /id="profileCertPills"/);
    assert.match(html, /id="profileCertDist"/);
    assert.match(html, /id="profileCertPb"/);
    assert.match(html, /id="profileCertBib"/);
    assert.match(html, /id="profileCertName"/);
    assert.match(html, /id="profileCertTime"/);
    assert.match(html, /id="profileCertDn"/);
    assert.match(html, /id="profileCertPrompt"/);
    assert.match(html, /id="profileCertDate"/);
    assert.match(html, /id="profileCertFoot"/);
    assert.match(html, /동마클 저장 기록 · 공식 기록이 아닐 수 있어요/);
  });

  it("CSS: result-cert white panel, danger hero time, soft footer", () => {
    assert.match(css, /\.result-cert\s*\{/);
    assert.match(css, /\.result-cert-time\s*\{/);
    assert.match(css, /--dmc-color-danger/);
    assert.match(css, /\.result-cert-dn\s*\{/);
    assert.match(css, /\.result-cert-foot\s*\{/);
    assert.match(css, /\.result-cert-pill\s*\{/);
  });

  it("confirmed branch paints certificate from confirmCertificateView", () => {
    const fn = extractFn(html, "renderProfileCard");
    const doneIdx = fn.indexOf('if (card.state === "confirmed")');
    assert.ok(doneIdx >= 0, "confirmed block missing");
    const bibIdx = fn.indexOf('if (card.state === "bib")', doneIdx);
    const block = fn.slice(doneIdx, bibIdx > doneIdx ? bibIdx : doneIdx + 1200);

    assert.match(block, /is-done/);
    assert.match(block, /confirmCertificateView/);
    assert.match(block, /profileResultCert/);
    assert.match(block, /profileCertTime/);
    assert.match(block, /profileCertDn/);
    assert.match(block, /profileCertPb/);
    assert.match(block, /memberDistanceLabel/);
    assert.match(block, /profilePrompt\.classList\.add\("hidden"\)|profilePrompt\.classList\.toggle\("hidden"/);
    assert.doesNotMatch(block, /profileBibFace\.classList\.remove\("hidden"\)/);
    assert.doesNotMatch(block, /confirmDoneSummary/);
  });
});
