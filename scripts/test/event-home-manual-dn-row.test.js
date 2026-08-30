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

describe("event-home manual DNS/DNF row", () => {
  const html = read("event-home.html");
  const css = read("assets/event-member-shell.css");

  it("manual form puts DNS and DNF in an inline row, save spaced below", () => {
    const formStart = html.indexOf('id="profileManualForm"');
    const form = html.slice(formStart, html.indexOf("profileManualSave", formStart) + 80);
    assert.match(form, /class="[^"]*profile-dn-row/);
    const rowStart = form.indexOf("profile-dn-row");
    const row = form.slice(rowStart, form.indexOf("profileManualSave"));
    assert.match(row, /profileDnsBtn/);
    assert.match(row, /profileDnfBtn/);
    assert.match(form, /id="profileManualSave"/);
  });

  it("styles DNS/DNF row horizontal and save with top margin", () => {
    assert.match(css, /\.profile-dn-row\s*\{/);
    const dn = css.slice(css.indexOf(".profile-dn-row"));
    const dnRule = dn.slice(0, dn.indexOf("}") + 1);
    assert.match(dnRule, /display:\s*flex/);
    assert.match(dnRule, /flex-direction:\s*row/);
    assert.match(css, /#profileManualSave\s*\{[^}]*margin-top/s);
  });

  it("manual form has 돌아가기 that clears manual intent", () => {
    assert.match(html, /id="profileManualBack"/);
    assert.match(html, />돌아가기</);
    const back = extractFn(html, "onManualBack");
    assert.match(back, /profileIntent\s*=\s*""/);
    assert.match(back, /renderHomeCards/);
  });
});
