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

function subActionBlock(src, sub) {
  const needle = `if (sub === "${sub}"`;
  const start = src.indexOf(needle);
  assert.ok(start >= 0, "missing subAction " + sub);
  const next = src.indexOf("\n      if (sub ===", start + 1);
  const endUnknown = src.indexOf(
    'error: "unknown subAction"',
    start
  );
  let end = src.length;
  if (next > start) end = next;
  if (endUnknown > start && endUnknown < end) end = endUnknown;
  return src.slice(start, end);
}

describe("event-admin prep roster write", () => {
  const html = read("event-admin.html");

  it("CSV file input is not locked to boarding-on", () => {
    assert.match(html, /id="csv-input"/);
    assert.doesNotMatch(html, /id="csv-input"[^>]*ops-writable/);
  });

  it("guest add fields are not locked to boarding-on", () => {
    assert.doesNotMatch(html, /id="guest-add-btn"[^>]*ops-writable/);
    assert.doesNotMatch(html, /id="guest-nickname"[^>]*ops-writable/);
  });

  it("add-person menu is 탑승 인원 추가", () => {
    assert.match(html, /id="guest-add-btn">탑승 인원 추가</);
    assert.match(html, />탑승 인원 추가<\/div>/);
    assert.doesNotMatch(html, />지인 추가</);
  });

  it("remove and note save work while boarding is off", () => {
    const removeFn = extractFn(html, "removeRoster");
    assert.doesNotMatch(removeFn, /enabled !== true/);
    const saveFn = extractFn(html, "saveNote");
    assert.doesNotMatch(saveFn, /enabled !== true/);
  });

  it("boarded toggle still requires boarding on", () => {
    const toggleFn = extractFn(html, "toggleBoard");
    assert.match(toggleFn, /enabled !== true/);
  });

  it("disabled banner says roster is still editable", () => {
    assert.match(html, /명단은 수정할 수 있습니다/);
  });
});

describe("bus-boarding API gates", () => {
  const src = read("functions/index.js");

  it("import / roster-upsert / roster-remove use ensureBusBoarding, not enabled", () => {
    for (const sub of ["import", "roster-upsert", "roster-remove"]) {
      const block = subActionBlock(src, sub);
      assert.match(block, /ensureBusBoarding/, sub + " should ensure boarding doc");
      assert.doesNotMatch(block, /assertEnabled/, sub + " should not require enabled");
    }
  });

  it("self-board and admin-board still require enabled", () => {
    assert.match(subActionBlock(src, "self-board"), /assertEnabled/);
    assert.match(subActionBlock(src, "admin-board"), /assertEnabled/);
  });
});
