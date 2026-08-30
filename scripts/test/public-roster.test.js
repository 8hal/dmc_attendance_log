const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildPublicRosterRows,
  filterPublicRosterRows,
  sortPublicRosterRows,
  timeToSortSeconds,
} = require("../../functions/lib/public-roster.js");
const { normalizeRaceDistance } = require("../../functions/lib/raceDistance.js");

describe("buildPublicRosterRows", () => {
  it("닉 있는 참가 전원 + bib, 실명 없음", () => {
    const confirmed = new Map([
      ["김A_half", { status: "confirmed", netTime: "1:42:18", pbConfirmed: true, distance: "half" }],
    ]);
    const rows = buildPublicRosterRows(
      [
        { nickname: "게살볶음밥", realName: "김A", bib: "4821", distance: "half" },
        { nickname: "동탄치타", realName: "김B", distance: "full" },
      ],
      confirmed,
      (d) => String(d || "").trim().toLowerCase(),
      []
    );
    assert.equal(rows.length, 2);
    assert.deepEqual(Object.keys(rows[0]).sort(), [
      "bib",
      "distance",
      "dnStatus",
      "hasResult",
      "netTime",
      "nickname",
      "pbConfirmed",
      "recordStatus",
    ]);
    const a = rows.find((r) => r.nickname === "게살볶음밥");
    const b = rows.find((r) => r.nickname === "동탄치타");
    assert.equal(a.bib, "4821");
    assert.equal(a.recordStatus, "confirmed");
    assert.equal(a.hasResult, true);
    assert.equal(a.pbConfirmed, true);
    assert.equal(b.bib, "");
    assert.equal(b.recordStatus, "none");
    assert.equal(b.hasResult, false);
    assert.equal(b.netTime, null);
    assert.ok(!("realName" in a));
    assert.ok(!rows.some((r) => "realName" in r));
  });

  it("배번 없으면 이름만 같은 잡 행을 붙이지 않는다", () => {
    const rows = buildPublicRosterRows(
      [{ nickname: "동탄치타", realName: "김B", distance: "full" }],
      new Map(),
      normalizeRaceDistance,
      [{ bib: "999", realName: "김B", netTime: "3:10:00", distance: "full" }]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].recordStatus, "none");
    assert.equal(rows[0].netTime, null);
  });

  it("배번 매칭이면 scraped, 시각 없어도 scraped", () => {
    const rows = buildPublicRosterRows(
      [{ nickname: "써니형", realName: "이의선", bib: "40066", distance: "half" }],
      new Map(),
      normalizeRaceDistance,
      [{ bib: "40066", netTime: "", gunTime: "", finishTime: "", distance: "half" }]
    );
    assert.equal(rows[0].recordStatus, "scraped");
    assert.equal(rows[0].hasResult, false);
    assert.equal(rows[0].pbConfirmed, false);
    assert.equal(rows[0].netTime, null);
    assert.equal(rows[0].bib, "40066");
  });

  it("배번 매칭에 시각 있으면 scraped netTime", () => {
    const rows = buildPublicRosterRows(
      [{ nickname: "써니형", realName: "이의선", bib: "40066", distance: "half" }],
      new Map(),
      normalizeRaceDistance,
      [{ bib: "40066", netTime: "1:38:40", distance: "half" }]
    );
    assert.equal(rows[0].recordStatus, "scraped");
    assert.equal(rows[0].netTime, "1:38:40");
  });

  it("확정이 있으면 scraped보다 confirmed가 이긴다", () => {
    const confirmed = new Map([
      ["이의선_half", { status: "confirmed", netTime: "1:42:18", pbConfirmed: true, distance: "half" }],
    ]);
    const rows = buildPublicRosterRows(
      [{ nickname: "써니형", realName: "이의선", bib: "40066", distance: "half" }],
      confirmed,
      normalizeRaceDistance,
      [{ bib: "40066", netTime: "1:38:40", distance: "half" }]
    );
    assert.equal(rows[0].recordStatus, "confirmed");
    assert.equal(rows[0].netTime, "1:42:18");
    assert.equal(rows[0].pbConfirmed, true);
  });

  it("참가자 distance가 비어 있으면 확정 기록의 종목·시간으로 붙인다", () => {
    const confirmed = new Map([
      [
        "이의선_full",
        {
          status: "confirmed",
          netTime: "02:54:34",
          memberRealName: "이의선",
          bib: "40066",
          distance: "full",
        },
      ],
    ]);
    const rows = buildPublicRosterRows(
      [{ nickname: "써니형", realName: "이의선", bib: "40066", distance: "" }],
      confirmed,
      normalizeRaceDistance
    );
    assert.equal(rows[0].recordStatus, "confirmed");
    assert.equal(rows[0].distance, "full");
    assert.equal(rows[0].bib, "40066");
  });

  it("참가자 distance가 있으면 다른 종목 확정 기록에 붙이지 않는다", () => {
    const confirmed = new Map([
      [
        "이의선_full",
        {
          status: "confirmed",
          netTime: "02:54:34",
          memberRealName: "이의선",
          bib: "40066",
          distance: "full",
        },
      ],
    ]);
    const rows = buildPublicRosterRows(
      [{ nickname: "써니형", realName: "이의선", bib: "40066", distance: "half" }],
      confirmed,
      normalizeRaceDistance
    );
    assert.equal(rows[0].recordStatus, "none");
  });

  it("includes DNS case-insensitive", () => {
    const confirmed = new Map([["김C_10K", { status: "dns", distance: "10K" }]]);
    const rows = buildPublicRosterRows(
      [{ nickname: "DNS러", realName: "김C", distance: "10K" }],
      confirmed,
      normalizeRaceDistance
    );
    assert.equal(rows[0].recordStatus, "confirmed");
    assert.equal(rows[0].dnStatus, "DNS");
    assert.equal(rows[0].netTime, null);
    assert.equal(rows[0].hasResult, true);
    assert.equal(rows[0].pbConfirmed, false);
  });

  it("includes DNF from dnStatus case-insensitive", () => {
    const confirmed = new Map([["김D_half", { dnStatus: "DnF", distance: "half" }]]);
    const rows = buildPublicRosterRows(
      [{ nickname: "DNF러", realName: "김D", distance: "half" }],
      confirmed,
      normalizeRaceDistance
    );
    assert.equal(rows[0].dnStatus, "DNF");
    assert.equal(rows[0].recordStatus, "confirmed");
  });
});

describe("filterPublicRosterRows", () => {
  const base = [
    { nickname: "게살볶음밥", distance: "half", netTime: "1:42:00", hasResult: true, pbConfirmed: false, dnStatus: null },
    { nickname: "동탄치타", distance: "full", netTime: null, hasResult: true, pbConfirmed: false, dnStatus: "DNS" },
    { nickname: "러너킴", distance: "half", netTime: "1:40:00", hasResult: true, pbConfirmed: false, dnStatus: null },
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
  it("확정 시각 → 미확정 시각 → 미확정 무시각 → DNS/DNF → none → 닉", () => {
    const out = sortPublicRosterRows(
      [
        { nickname: "없음가", recordStatus: "none", netTime: null, dnStatus: null },
        { nickname: "가가DNS", recordStatus: "confirmed", netTime: null, dnStatus: "DNS" },
        { nickname: "느린확정", recordStatus: "confirmed", netTime: "1:50:00", dnStatus: null },
        { nickname: "빠른미확정", recordStatus: "scraped", netTime: "1:20:00", dnStatus: null },
        { nickname: "빠른확정", recordStatus: "confirmed", netTime: "1:40:00", dnStatus: null },
        { nickname: "무시각미확정", recordStatus: "scraped", netTime: null, dnStatus: null },
        { nickname: "없음나", recordStatus: "none", netTime: null, dnStatus: null },
      ],
      "result"
    );
    assert.deepEqual(
      out.map((r) => r.nickname),
      ["빠른확정", "느린확정", "빠른미확정", "무시각미확정", "가가DNS", "없음가", "없음나"]
    );
  });
});

describe("timeToSortSeconds", () => {
  it("파싱", () => {
    assert.equal(timeToSortSeconds("1:42:18"), 1 * 3600 + 42 * 60 + 18);
    assert.equal(timeToSortSeconds(""), null);
  });
});
