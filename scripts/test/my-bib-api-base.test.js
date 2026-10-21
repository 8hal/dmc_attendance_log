const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "../../my-bib.html"), "utf8");

function apiSnippet() {
  const m = html.match(/const IS_LOCAL[\s\S]*?const API_BASE[\s\S]*?;/);
  assert.ok(m, "missing IS_LOCAL/API_BASE block");
  return m[0];
}

describe("my-bib API_BASE local detection", () => {
  it("treats 127.0.0.1 as emulator host like event-home", () => {
    assert.match(
      apiSnippet(),
      /hostname === ['"]localhost['"]\s*\|\|\s*(?:window\.)?location\.hostname === ['"]127\.0\.0\.1['"]/
    );
  });

  it("points local API at 127.0.0.1:5001 race emulator", () => {
    assert.match(apiSnippet(), /http:\/\/127\.0\.0\.1:5001\//);
    assert.match(apiSnippet(), /asia-northeast3\/race/);
  });

  it("uses EventMemberProfile for saved identity and writes via syncNicknames", () => {
    assert.match(html, /event-member-profile\.js/);
    assert.match(html, /readSavedIdentity/);
    assert.match(html, /syncNicknames/);
  });
});
