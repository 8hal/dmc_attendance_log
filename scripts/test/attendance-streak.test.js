const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  computeClubStreakFromDateSet,
  isRegularClubMeetingDateKey,
  prevRegularClubMeetingDateKey,
} = require(path.join(__dirname, "../../functions/lib/attendance-streak.js"));

// 테스트용 날짜 고정 헬퍼: dateKey "YYYY/MM/DD" → Date (KST 정오)
function dateOf(dateKey) {
  const [y, m, d] = dateKey.split("/").map(Number);
  // KST 정오 = UTC 03:00
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
}

describe("isRegularClubMeetingDateKey", () => {
  it("화(TUE) 날짜를 정모일로 인식", () => {
    assert.equal(isRegularClubMeetingDateKey("2026/08/04"), true); // 화
  });
  it("목(THU) 날짜를 정모일로 인식", () => {
    assert.equal(isRegularClubMeetingDateKey("2026/07/30"), true); // 목
  });
  it("토(SAT) 날짜를 정모일로 인식", () => {
    assert.equal(isRegularClubMeetingDateKey("2026/08/01"), true); // 토
  });
  it("수(WED) 날짜를 정모일로 인식하지 않음", () => {
    assert.equal(isRegularClubMeetingDateKey("2026/08/05"), false); // 수
  });
});

describe("prevRegularClubMeetingDateKey", () => {
  it("화요일 → 직전 토요일", () => {
    assert.equal(prevRegularClubMeetingDateKey("2026/08/04"), "2026/08/01"); // 화 → 토
  });
  it("토요일 → 직전 목요일", () => {
    assert.equal(prevRegularClubMeetingDateKey("2026/08/01"), "2026/07/30"); // 토 → 목
  });
  it("목요일 → 직전 화요일", () => {
    assert.equal(prevRegularClubMeetingDateKey("2026/07/30"), "2026/07/28"); // 목 → 화
  });
});

describe("computeClubStreakFromDateSet - 정상 동작", () => {
  it("출석 기록 없으면 0", () => {
    const result = computeClubStreakFromDateSet(new Set(), dateOf("2026/08/04"));
    assert.equal(result, 0);
  });

  it("오늘(정모일)에 출석하면 streak 1", () => {
    // 오늘 2026/08/04(화) 출석
    const result = computeClubStreakFromDateSet(new Set(["2026/08/04"]), dateOf("2026/08/04"));
    assert.equal(result, 1);
  });

  it("연속 3회 출석하면 streak 3", () => {
    // 화/목/토 연속 출석 후 다음 화요일이 오늘
    const attended = new Set(["2026/07/28", "2026/07/30", "2026/08/01"]);
    const result = computeClubStreakFromDateSet(attended, dateOf("2026/08/04"));
    assert.equal(result, 3);
  });

  it("오늘이 정모일이 아닐 때 직전 정모일부터 계산", () => {
    // 오늘 2026/08/02(일), 8/1(토) 출석 → 직전 정모일=8/1, 출석 → streak 1
    const attended = new Set(["2026/08/01"]);
    const result = computeClubStreakFromDateSet(attended, dateOf("2026/08/02"));
    assert.equal(result, 1);
  });
});

describe("computeClubStreakFromDateSet - 버그 케이스: 중간 정모 미출석", () => {
  it("마지막 출석 이후 정모를 빠지면 streak 0", () => {
    // 7/28(화), 7/30(목) 출석 → 8/1(토) 미출석 → 오늘 8/4(화)
    // 8/1에 빠졌으므로 연속이 끊겨야 함 → streak 0 이어야 한다
    const attended = new Set(["2026/07/28", "2026/07/30"]);
    const result = computeClubStreakFromDateSet(attended, dateOf("2026/08/04"));
    assert.equal(result, 0, "8/1(토) 미출석이므로 연속은 0이어야 함");
  });

  it("2회 연속 후 1회 빠지고 다시 1회 참여해도 streak 1", () => {
    // 7/28(화), 7/30(목) 연속 후 8/1(토) 미출석, 8/4(화) 출석
    // 8/4부터 역방향: 8/4 ✅ → 8/1 ❌ → streak 1
    const attended = new Set(["2026/07/28", "2026/07/30", "2026/08/04"]);
    const result = computeClubStreakFromDateSet(attended, dateOf("2026/08/04"));
    assert.equal(result, 1, "8/1을 빠졌으므로 8/4 출석 1회만 연속");
  });

  it("오늘이 정모일이고 미출석이면 이전 정모일부터 계산 (오늘 정모 기회 유지)", () => {
    // 오늘 8/4(화) 미출석, 8/1(토) 출석, 7/30(목) 출석
    // 오늘 아직 출석 안 했으므로 → 직전 정모 8/1부터 계산 → 8/1, 7/30 연속 → streak 2
    const attended = new Set(["2026/07/30", "2026/08/01"]);
    const result = computeClubStreakFromDateSet(attended, dateOf("2026/08/04"));
    assert.equal(result, 2, "오늘 미출석이면 직전 정모(8/1)부터 역방향 계산 → streak 2");
  });
});
