const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "../..", rel), "utf8");
}

describe("event-home manual finish time HMS fields", () => {
  const html = read("event-home.html");
  const css = read("assets/event-member-shell.css");

  it("manual form uses hour/min/sec inputs instead of a single profileTime", () => {
    const formStart = html.indexOf('id="profileManualForm"');
    const form = html.slice(formStart, html.indexOf('id="profileManualSave"', formStart));
    assert.match(form, /id="profileTimeH"/);
    assert.match(form, /id="profileTimeM"/);
    assert.match(form, /id="profileTimeS"/);
    assert.doesNotMatch(form, /id="profileTime"/);
    assert.match(html, /event-finish-time\.js/);
  });

  it("PB stays in profile-time-row with the HMS group", () => {
    const formStart = html.indexOf('id="profileManualForm"');
    const form = html.slice(formStart, html.indexOf('id="profileManualSave"', formStart));
    assert.match(form, /class="profile-time-row"/);
    const rowStart = form.indexOf('class="profile-time-row"');
    const row = form.slice(rowStart, form.indexOf("</div>", form.indexOf("profileManualPbWrap", rowStart)) + 6);
    assert.match(row, /profileTimeH/);
    assert.match(row, /profileManualPbWrap/);
  });

  it("save composes netTime via EventFinishTime.composeNetTime", () => {
    const html = read("event-home.html");
    assert.match(html, /function readManualNetTime/);
    assert.match(html, /EventFinishTime\.composeNetTime/);
    const save = html.match(/function onManualSave\([\s\S]{0,1200}/);
    assert.ok(save, "onManualSave");
    assert.match(save[0], /readManualNetTime/);
    assert.match(save[0], /netTime/);
    assert.match(save[0], /showToast/);
  });

  it("styles HMS parts in a compact row", () => {
    assert.match(css, /\.profile-time-parts\s*\{/);
    assert.match(css, /\.profile-time-part\s*\{/);
  });
});
