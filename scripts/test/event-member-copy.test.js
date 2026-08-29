const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  memberEventTitle,
  memberDistanceLabel,
  memberHomeHref,
  matchesMemberQuery,
} = require(path.join(__dirname, "../../assets/event-member-copy.js"));

const MEMBER_COPY_FILES = [
  "event-home.html",
  "event-roster.html",
  "boarding.html",
  "assets/event-home-action.js",
  "assets/event-member-copy.js",
  "assets/event-member-tabs.js",
];

describe("member-facing copy lock", () => {
  it("does not contain 명단·결과 in member HTML or event-member assets", () => {
    for (const rel of MEMBER_COPY_FILES) {
      const src = fs.readFileSync(path.join(__dirname, "../..", rel), "utf8");
      assert.doesNotMatch(src, /명단·결과/, rel + " must not contain 명단·결과");
    }
  });
});

describe("memberEventTitle", () => {
  it("strips a trailing ops-note parenthesis from the seed title", () => {
    assert.equal(
      memberEventTitle("철원 기술검증 (버스=2026명단 / 기록=2025 SPCT)"),
      "철원 기술검증"
    );
  });

  it("keeps a clean event name unchanged", () => {
    assert.equal(memberEventTitle("2026 철원 DMZ 마라톤"), "2026 철원 DMZ 마라톤");
  });

  it("keeps a trailing parenthesis that is not an ops note", () => {
    assert.equal(memberEventTitle("서울마라톤 (하프)"), "서울마라톤 (하프)");
  });

  it("falls back to 대회 when empty", () => {
    assert.equal(memberEventTitle(""), "대회");
    assert.equal(memberEventTitle(null), "대회");
  });
});

describe("memberDistanceLabel", () => {
  it("uses the shared labels for known distances", () => {
    assert.equal(memberDistanceLabel("full"), "풀");
    assert.equal(memberDistanceLabel("half"), "하프");
    assert.equal(memberDistanceLabel("10K"), "10K");
  });

  it("maps empty, unknown, and placeholder labels to 종목 미정", () => {
    assert.equal(memberDistanceLabel(""), "종목 미정");
    assert.equal(memberDistanceLabel(null), "종목 미정");
    assert.equal(memberDistanceLabel("unknown"), "종목 미정");
    assert.equal(memberDistanceLabel("?"), "종목 미정");
  });
});

describe("memberHomeHref", () => {
  it("points at event-home with the eventId query", () => {
    assert.equal(
      memberHomeHref("evt_cheorwon_tech"),
      "event-home.html?eventId=evt_cheorwon_tech"
    );
  });
});

describe("matchesMemberQuery", () => {
  it("matches nickname or real name, without requiring the UI to show the real name", () => {
    const row = { nickname: "써니형", realName: "김태양" };
    assert.equal(matchesMemberQuery(row, "써니"), true);
    assert.equal(matchesMemberQuery(row, "태양"), true);
    assert.equal(matchesMemberQuery(row, "하우스"), false);
    assert.equal(matchesMemberQuery(row, ""), true);
  });
});
