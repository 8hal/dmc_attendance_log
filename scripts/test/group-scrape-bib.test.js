"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  pickBibScrapeTargets,
  matchResultByBib,
  buildBibScrapeMembers,
  isBibModeGroupScrapeSource,
  BIB_MODE_GROUP_SCRAPE_SOURCES,
} = require("../../functions/lib/group-scrape-bib.js");

describe("isBibModeGroupScrapeSource", () => {
  it("smartchip·ohmyrace만 배번 단체 스크랩 허용 (API에 bib 전달)", () => {
    assert.equal(isBibModeGroupScrapeSource("smartchip"), true);
    assert.equal(isBibModeGroupScrapeSource("ohmyrace"), true);
    assert.deepEqual([...BIB_MODE_GROUP_SCRAPE_SOURCES].sort(), ["ohmyrace", "smartchip"]);
  });

  it("marazone은 bibNum 빈 문자열 고정 → 불허", () => {
    assert.equal(isBibModeGroupScrapeSource("marazone"), false);
  });

  it("myresult·spct·manual·빈값·대소문자 변형 불허", () => {
    assert.equal(isBibModeGroupScrapeSource("myresult"), false);
    assert.equal(isBibModeGroupScrapeSource("spct"), false);
    assert.equal(isBibModeGroupScrapeSource("manual"), false);
    assert.equal(isBibModeGroupScrapeSource(""), false);
    assert.equal(isBibModeGroupScrapeSource(null), false);
    assert.equal(isBibModeGroupScrapeSource(undefined), false);
    assert.equal(isBibModeGroupScrapeSource("SmartChip"), false);
  });
});

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

describe("buildBibScrapeMembers", () => {
  it("scrapeTargets의 bib·distance를 members에 전달하고 gender는 맵에서", () => {
    const byName = new Map([["김A", { gender: "M", nickname: "ignored" }]]);
    const members = buildBibScrapeMembers(
      [{ realName: "김A", nickname: "게살", bib: "4821", distance: "half" }],
      byName
    );
    assert.deepEqual(members, [
      {
        realName: "김A",
        nickname: "게살",
        gender: "M",
        distance: "half",
        bib: "4821",
      },
    ]);
  });

  it("members 맵에 없어도 실명 필수 없이 gender 빈 문자열", () => {
    const members = buildBibScrapeMembers(
      [{ realName: "비회원", nickname: "손님", bib: "  10  ", distance: "full" }],
      new Map()
    );
    assert.equal(members[0].gender, "");
    assert.equal(members[0].bib, "10");
  });
});
