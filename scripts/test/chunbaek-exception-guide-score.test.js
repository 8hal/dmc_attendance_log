"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

describe("exception-guide attendance score section", () => {
  it("documents score policy", () => {
    const html = fs.readFileSync(
      path.join(__dirname, "../../chunbaek/exception-guide.html"),
      "utf8",
    );
    assert.match(html, /출석 점수 안내/);
    assert.match(html, /0\.5점/);
    assert.match(html, /3점 이상/);
  });
});
