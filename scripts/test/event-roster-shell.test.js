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

describe("event-roster member shell", () => {
  const html = read("event-roster.html");

  it("member roster page is labeled 대회 기록", () => {
    assert.match(html, />대회 기록</);
    assert.doesNotMatch(html, /명단·결과/);
    assert.match(html, /아직 확정된 기록이 없어요/);
    assert.match(html, /해당하는 기록이 없어요/);
  });

  it("uses 기록 N명 summary without leading 참가 N명", () => {
    assert.match(html, /기록 \$\{/);
    assert.doesNotMatch(html, /참가 \$\{/);
    assert.doesNotMatch(html, /참가 .*기록 확정/);
  });

  it("renders DNS and DNF from dnStatus, not 기록 없음", () => {
    const renderRows = extractFn(html, "renderRows");
    assert.match(renderRows, /dnStatus/);
    assert.match(renderRows, /DNS/);
    assert.match(renderRows, /DNF/);
    assert.doesNotMatch(renderRows, /기록 없음/);
  });

  it("orders distance chips full half 10K before others and hides unknown", () => {
    assert.match(html, /ROSTER_DIST_ORDER|full.*half.*10K.*5K.*3K.*30K.*32K.*ultra/);
    const sortDist = extractFn(html, "sortRosterDistances");
    assert.match(sortDist, /unknown/);
    assert.doesNotMatch(extractFn(html, "renderChips"), /종목 미정/);
  });

  it("shows privacy hint without exposing real names or bibs", () => {
    assert.match(html, /실명·배번은 공개되지 않습니다/);
    assert.match(html, /홈에서 확정한 기록만 모입니다/);
  });
});
