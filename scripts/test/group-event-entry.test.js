const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function readHtml(name) {
  return fs.readFileSync(path.join(__dirname, "../..", name), "utf8");
}

describe("group event primary entry", () => {
  it("group.html card click opens event-admin", () => {
    const html = readHtml("group.html");
    assert.match(
      html,
      /\[data-event-card\][\s\S]*window\.location\.href = `event-admin\.html\?eventId=\$\{encodeURIComponent\(eventId\)\}`/
    );
  });

  it("group.html kebab keeps group-detail as legacy participant/record path", () => {
    const html = readHtml("group.html");
    assert.match(html, /data-legacy-detail=/);
    assert.match(html, /group-detail\.html\?eventId=/);
  });

  it("group-detail day hub points at event-admin and event-home", () => {
    const html = readHtml("group-detail.html");
    assert.match(html, /id="hubAdmin"/);
    assert.match(html, /event-admin\.html\?eventId=/);
    assert.match(html, /id="hubMemberHome"/);
    assert.match(html, /event-home\.html\?eventId=/);
  });

  it("event-admin sidebar links back to group list", () => {
    const html = readHtml("event-admin.html");
    assert.match(html, /id="link-group-list"/);
    assert.match(html, /href="group\.html"/);
  });
});
