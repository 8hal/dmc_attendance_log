const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "../..", rel), "utf8");
}

describe("event-home manual form PB beside finish time", () => {
  const html = read("event-home.html");
  const css = read("assets/event-member-shell.css");

  it("puts profileManualPbWrap in the same row as finish-time parts", () => {
    const formStart = html.indexOf('id="profileManualForm"');
    assert.ok(formStart >= 0);
    const form = html.slice(formStart, html.indexOf('id="profileManualSave"', formStart));
    assert.match(form, /class="profile-time-row"/);
    const rowStart = form.indexOf('class="profile-time-row"');
    const rowEnd = form.indexOf('class="profile-choice-row"', rowStart);
    const row = form.slice(rowStart, rowEnd);
    assert.match(row, /id="profileTimeH"/);
    assert.match(row, /id="profileManualPbWrap"/);
    const afterDns = form.slice(form.indexOf("profileDnsBtn"));
    assert.doesNotMatch(afterDns, /id="profileManualPbWrap"/);
  });

  it("styles profile-time-row as a horizontal flex row", () => {
    assert.match(css, /\.profile-time-row\s*\{/);
    const block = css.slice(css.indexOf(".profile-time-row"));
    const rule = block.slice(0, block.indexOf("}") + 1);
    assert.match(rule, /display:\s*flex/);
    assert.match(rule, /flex-direction:\s*row|align-items:\s*center/);
  });
});
