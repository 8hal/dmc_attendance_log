const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildPublicRosterRows,
  filterPublicRosterRows,
  sortPublicRosterRows,
  timeToSortSeconds,
} = require("../../functions/lib/public-roster.js");

describe("buildPublicRosterRows", () => {
  it("실명·배번 없이 닉·종목·기록만", () => {
    const confirmed = new Map([
      [
        "김A_half",
        { status: "confirmed", netTime: "1:42:18", pbConfirmed: true },
      ],
    ]);
    const rows = buildPublicRosterRows(
      [
        { nickname: "게살볶음밥", realName: "김A", bib: "4821", distance: "half" },
        { nickname: "동탄치타", realName: "김B", distance: "full" },
      ],
      confirmed,
      (d) => String(d || "").trim().toLowerCase(),
    );
    assert.equal(rows.length, 2);
    assert.deepEqual(Object.keys(rows[0]).sort(), [
      "distance",
      "hasResult",
      "netTime",
      "nickname",
      "pbConfirmed",
    ]);
    assert.equal(rows[0].nickname, "게살볶음밥");
    assert.equal(rows[0].netTime, "1:42:18");
    assert.equal(rows[0].pbConfirmed, true);
    assert.equal(rows[0].hasResult, true);
    assert.equal(rows[1].hasResult, false);
    assert.equal(rows[1].netTime, null);
    assert.ok(!("realName" in rows[0]));
    assert.ok(!("bib" in rows[0]));
  });
});

describe("filterPublicRosterRows", () => {
  const base = [
    { nickname: "게살볶음밥", distance: "half", netTime: "1:42:00", hasResult: true, pbConfirmed: false },
    { nickname: "동탄치타", distance: "full", netTime: null, hasResult: false, pbConfirmed: false },
    { nickname: "러너킴", distance: "half", netTime: "1:40:00", hasResult: true, pbConfirmed: false },
  ];

  it("종목 필터", () => {
    const out = filterPublicRosterRows(base, { distance: "half" });
    assert.equal(out.length, 2);
  });

  it("닉 검색", () => {
    const out = filterPublicRosterRows(base, { query: "치타" });
    assert.equal(out.length, 1);
    assert.equal(out[0].nickname, "동탄치타");
  });
});

describe("sortPublicRosterRows", () => {
  it("기록 순: 결과 있는 사람 먼저, 시간 오름차순", () => {
    const out = sortPublicRosterRows(
      [
        { nickname: "B", distance: "half", netTime: "1:50:00", hasResult: true, pbConfirmed: false },
        { nickname: "C", distance: "half", netTime: null, hasResult: false, pbConfirmed: false },
        { nickname: "A", distance: "half", netTime: "1:40:00", hasResult: true, pbConfirmed: false },
      ],
      "result",
    );
    assert.deepEqual(
      out.map((r) => r.nickname),
      ["A", "B", "C"],
    );
  });
});

describe("timeToSortSeconds", () => {
  it("파싱", () => {
    assert.equal(timeToSortSeconds("1:42:18"), 1 * 3600 + 42 * 60 + 18);
    assert.equal(timeToSortSeconds(""), null);
  });
});
