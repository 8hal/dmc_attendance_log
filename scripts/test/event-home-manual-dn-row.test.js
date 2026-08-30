const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "../..", rel), "utf8");
}

describe("event-home manual DNS/DNF row", () => {
  const html = read("event-home.html");
  const css = read("assets/event-member-shell.css");

  it("manual form puts DNS and DNF in an inline row, save spaced below", () => {
    const formStart = html.indexOf('id="profileManualForm"');
    const form = html.slice(formStart, html.indexOf("</div>", html.indexOf("profileManualSave", formStart)) + 6);
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
});
