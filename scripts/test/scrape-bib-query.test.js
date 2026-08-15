"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveMemberSearchQuery,
  resultBibFromSearch,
} = require("../../functions/lib/scrape-bib-query.js");

describe("resolveMemberSearchQuery", () => {
  it("bib가 있으면 bib로 조회 (이름 fallback 없음)", () => {
    assert.equal(
      resolveMemberSearchQuery({ realName: "김테스트", bib: "4821" }),
      "4821"
    );
  });

  it("bib trim 후 사용", () => {
    assert.equal(
      resolveMemberSearchQuery({ realName: "김테스트", bib: "  99  " }),
      "99"
    );
  });

  it("bib 없으면 realName 조회 (개인/ops 경로)", () => {
    assert.equal(
      resolveMemberSearchQuery({ realName: "김테스트" }),
      "김테스트"
    );
  });

  it("빈 bib는 realName으로", () => {
    assert.equal(
      resolveMemberSearchQuery({ realName: "김테스트", bib: "   " }),
      "김테스트"
    );
  });
});

describe("resultBibFromSearch", () => {
  it("요청 bib가 있으면 결과 bib로 보존", () => {
    assert.equal(resultBibFromSearch("9999", "4821"), "4821");
  });

  it("요청 bib 없으면 스크랩 bib 유지", () => {
    assert.equal(resultBibFromSearch("4821", ""), "4821");
    assert.equal(resultBibFromSearch("4821", null), "4821");
  });
});
