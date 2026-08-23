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
  return html.slice(start, next > 0 ? next : start + 500);
}

describe("event-home nick pick chrome", () => {
  it("showPickView hides the tab bar and does not mount tabs", () => {
    const fn = extractFn(read("event-home.html"), "showPickView");
    assert.match(fn, /eventTabBar\.classList\.add\(["']hidden["']\)/);
    assert.doesNotMatch(fn, /mountTabs\s*\(/);
  });

  it("disabled today-cta is muted gray, done state stays green", () => {
    const css = read("assets/event-member-shell.css");
    const disabledBlock = css.match(/\.today-cta:disabled\s*\{[^}]+\}/);
    assert.ok(disabledBlock, "today-cta:disabled should have its own block");
    assert.match(disabledBlock[0], /#94a3b8|#cbd5e1|#64748b|slate/i);
    assert.doesNotMatch(disabledBlock[0], /#059669|green-9/);

    const doneBlock = css.match(/\.today-cta\.is-done\s*\{[^}]+\}/);
    assert.ok(doneBlock, "today-cta.is-done should keep a green block");
    assert.match(doneBlock[0], /#059669|green-9/);
  });

  it("does not open the day timeline as the primary path", () => {
    const html = read("event-home.html");
    assert.match(html, /id="timeline"/);
    assert.doesNotMatch(html, /<details class="timeline-details" open>/);
    const render = extractFn(html, "renderTimeline");
    assert.match(render, /classList\.add\(["']hidden["']\)/);
    assert.doesNotMatch(render, /classList\.remove\(["']hidden["']\)/);
  });

  it("member home uses 다른 사람 선택, not 닉네임 변경", () => {
    const html = read("event-home.html");
    assert.match(html, />다른 사람 선택</);
    assert.doesNotMatch(html, />닉네임 변경</);
  });

  it("nick change can be cancelled and unknown saved nicks go to pick", () => {
    const html = read("event-home.html");
    assert.match(html, /id="pickCancelBtn"/);
    const shell = extractFn(html, "renderEventShell");
    assert.match(shell, /matchInList/);
    assert.match(shell, /showPickView/);
    const pick = extractFn(html, "showPickView");
    assert.match(pick, /cancelable/);
  });

  it("shows return-bus secondary while confirm is pending", () => {
    const render = extractFn(read("event-home.html"), "renderTodayCard");
    assert.match(render, /secondaryLabel/);
    assert.match(render, /boardingReturn|secondaryHref/);
  });
});
