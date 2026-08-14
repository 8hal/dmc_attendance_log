"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  pickBibScrapeTargets,
  matchResultByBib,
} = require("../../functions/lib/group-scrape-bib.js");

describe("pickBibScrapeTargets", () => {
  it("배번 있는 participant만 반환", () => {
    const out = pickBibScrapeTargets([
      { nickname: "A", realName: "김A", bib: "4821", distance: "half" },
      { nickname: "B", realName: "김B", bib: "", distance: "half" },
      { nickname: "C", realName: "김C", distance: "full" },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].bib, "4821");
  });

  it("공백만 있는 bib는 제외하고 trim된 bib 반환", () => {
    const out = pickBibScrapeTargets([
      { nickname: "A", realName: "김A", bib: "  4821  ", distance: "half" },
      { nickname: "B", realName: "김B", bib: "   ", distance: "half" },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].bib, "4821");
  });

  it("null/undefined bib는 제외", () => {
    const out = pickBibScrapeTargets([
      { nickname: "A", realName: "김A", bib: null, distance: "half" },
      { nickname: "B", realName: "김B", bib: undefined, distance: "half" },
      { nickname: "C", realName: "김C", bib: "99", distance: "full" },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].nickname, "C");
  });
});

describe("matchResultByBib", () => {
  it("bib 문자열로 매칭", () => {
    const r = matchResultByBib([{ bib: "4821", netTime: "1:42:00" }], "4821");
    assert.equal(r.netTime, "1:42:00");
  });

  it("매칭 없으면 null", () => {
    assert.equal(matchResultByBib([{ bib: "4821", netTime: "1:42:00" }], "9999"), null);
  });

  it("양쪽 distance가 있으면 distance도 일치해야 함", () => {
    const results = [
      { bib: "4821", distance: "full", netTime: "3:10:00" },
      { bib: "4821", distance: "half", netTime: "1:42:00" },
    ];
    const r = matchResultByBib(results, "4821", "half");
    assert.equal(r.netTime, "1:42:00");
  });

  it("distance 한쪽만 있으면 bib만으로 매칭", () => {
    const r = matchResultByBib(
      [{ bib: "4821", netTime: "1:42:00" }],
      "4821",
      "half"
    );
    assert.equal(r.netTime, "1:42:00");
  });
});
