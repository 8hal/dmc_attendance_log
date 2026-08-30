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

describe("boarding.html redirect", () => {
  const html = read("boarding.html");

  it("redirects old QR to home board=1", () => {
    assert.match(html, /event-home\.html/);
    assert.match(html, /board=1/);
    assert.doesNotMatch(html, /id="confirmRecordBanner"/);
    assert.doesNotMatch(html, /이어서 배번 입력/);
  });

  it("uses location.replace", () => {
    assert.match(html, /location\.replace/);
  });

  it("preserves eventId query via URLSearchParams or encodeURIComponent", () => {
    assert.match(html, /eventId/);
    const usesParams = /URLSearchParams/.test(html);
    const usesEncode = /encodeURIComponent/.test(html);
    assert.ok(
      usesParams || usesEncode,
      "must preserve eventId via URLSearchParams or encodeURIComponent"
    );
    assert.match(
      html,
      /location\.replace\([\s\S]*event-home\.html[\s\S]*(?:encodeURIComponent|URLSearchParams)/
    );
  });

  it("has no participant list or confirm screens", () => {
    assert.doesNotMatch(html, /id="confirmScreen"/);
    assert.doesNotMatch(html, /id="doneScreen"/);
    assert.doesNotMatch(html, /renderParticipantList/);
    assert.doesNotMatch(html, /participant-list/);
    assert.doesNotMatch(html, /event-boarding-flow\.js/);
    assert.doesNotMatch(html, /id="confirmRecordBanner"/);
  });
});

describe("member pages use EventMemberCopy", () => {
  it("event-home titles go through memberEventTitle", () => {
    const html = read("event-home.html");
    assert.match(html, /event-member-copy\.js/);
    const pick = extractFn(html, "showPickView");
    const home = extractFn(html, "showMemberHome");
    assert.match(pick, /memberEventTitle\(/);
    assert.match(home, /memberEventTitle\(/);
  });

  it("event-roster title and distances use member copy", () => {
    const html = read("event-roster.html");
    assert.match(html, /event-member-copy\.js/);
    assert.match(html, /memberEventTitle\(/);
    assert.match(html, /memberDistanceLabel\(/);
    assert.doesNotMatch(html, /formatDistance\(/);
    assert.match(html, /실명은 공개되지 않습니다. 수집된 기록은 홈에서 확인하기 전까지 미확정입니다./);
    assert.doesNotMatch(html, /컨펌된 기록만/);
  });
});
