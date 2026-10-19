const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const redirectHtml = fs.readFileSync(path.join(__dirname, "../../my-bib.html"), "utf8");
const bibHtml = fs.readFileSync(path.join(__dirname, "../../event-bib.html"), "utf8");
const cheerHtml = fs.readFileSync(path.join(__dirname, "../../event-cheer.html"), "utf8");

describe("my-bib redirects to event-bib", () => {
  it("keeps the query string and does not call the API itself", () => {
    assert.match(redirectHtml, /event-bib\.html/);
    assert.match(redirectHtml, /location\.search/);
    assert.doesNotMatch(redirectHtml, /action=group-events/);
  });
});

describe("event-bib and cheer API_BASE", () => {
  it("treats 127.0.0.1 as the emulator", () => {
    assert.match(bibHtml, /127\.0\.0\.1/);
    assert.match(bibHtml, /asia-northeast3\/race/);
    assert.match(cheerHtml, /subAction=cheer-board&eventId=/);
    assert.doesNotMatch(cheerHtml, /cheer-board&eventId=[^"]*nickname/);
  });
});
