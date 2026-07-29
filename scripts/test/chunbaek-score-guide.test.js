"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

describe("score-guide page", () => {
  it("documents attendance score policy only", () => {
    const html = fs.readFileSync(
      path.join(__dirname, "../../chunbaek/score-guide.html"),
      "utf8",
    );
    assert.match(html, /출석 점수/);
    assert.match(html, /0\.5점|0\.5/);
    assert.match(html, /3점/);
    assert.match(html, /예외 반영 시 달성 예정/);
    assert.match(html, /출석 N회 더 필요/);
    assert.doesNotMatch(html, /상신하기/);
  });
});

describe("score-notice banner link", () => {
  it("points to score-guide.html", () => {
    const html = fs.readFileSync(
      path.join(__dirname, "../../chunbaek/index.html"),
      "utf8",
    );
    assert.match(html, /score-guide\.html/);
    assert.match(html, /id="score-notice-link"/);
    const linkIdx = html.indexOf('id="score-notice-link"');
    const hrefWindow = html.slice(Math.max(0, linkIdx - 80), linkIdx + 80);
    assert.match(hrefWindow, /score-guide\.html/);
  });
});

describe("exception-guide links to score-guide", () => {
  it("does not embed full score policy section", () => {
    const html = fs.readFileSync(
      path.join(__dirname, "../../chunbaek/exception-guide.html"),
      "utf8",
    );
    assert.match(html, /score-guide\.html/);
    assert.doesNotMatch(html, /<h2>출석 점수 안내<\/h2>/);
  });
});
