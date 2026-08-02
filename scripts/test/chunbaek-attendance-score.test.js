"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  computeWeekStats,
  computeWeekStatsFull,
  formatWeekScoreSummary,
  weekBar,
} = require(path.join(__dirname, "../../functions/lib/chunbaek-stats.js"));

/** 주 1, 월~일 7일 훈련 (2026-07-20=월 … 2026-07-26=일) */
function week7Slots() {
  const dates = [
    "2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23",
    "2026-07-24", "2026-07-25", "2026-07-26",
  ];
  return dates.map((date, i) => ({
    id: String(i + 1),
    dayIndex: i + 1,
    date,
    week: 1,
    isProgramOff: false,
  }));
}

function attMap(entries) {
  // getAttendance는 Map이 아니라 plain object bracket lookup 사용
  // (attendanceMap[key] || attendanceMap[slot.id])
  const map = {};
  for (const [k, v] of Object.entries(entries)) {
    map[String(k)] = v;
  }
  return map;
}

describe("computeWeekStats — 출석 점수", () => {
  const slots = week7Slots();
  const today = "2026-07-26"; // 주 전체

  it("예외 0 + 출석 3 → score 3.0 달성", () => {
    const map = attMap({ 1: { attended: true }, 2: { attended: true }, 3: { attended: true } });
    const r = computeWeekStats(slots, map, 1, today, 3);
    assert.equal(r.weekAttendCount, 3);
    assert.equal(r.weekExceptionCount, 0);
    assert.equal(r.weekScore, 3);
    assert.equal(r.weekTarget, 3);
    assert.equal(r.weekTargetMet, true);
  });

  it("예외 2 + 출석 2 → score 3.0 달성 (억울 케이스 해소)", () => {
    const map = attMap({
      1: { attended: true },
      2: { attended: true },
      3: { exception: true },
      4: { exception: true },
    });
    const r = computeWeekStats(slots, map, 1, today, 3);
    assert.equal(r.weekAttendCount, 2);
    assert.equal(r.weekExceptionCount, 2);
    assert.equal(r.weekScore, 3);
    assert.equal(r.weekTargetMet, true);
  });

  it("예외 1 + 출석 2 → score 2.5 미달", () => {
    const map = attMap({
      1: { attended: true },
      2: { attended: true },
      3: { exception: true },
    });
    const r = computeWeekStats(slots, map, 1, today, 3);
    assert.equal(r.weekScore, 2.5);
    assert.equal(r.weekTargetMet, false);
  });

  it("exception+attended 동시 true → 0.5점만 (예외 우선)", () => {
    const map = attMap({
      1: { attended: true, exception: true },
      2: { attended: true },
      3: { attended: true },
    });
    const r = computeWeekStats(slots, map, 1, today, 3);
    assert.equal(r.weekAttendCount, 2);
    assert.equal(r.weekExceptionCount, 1);
    assert.equal(r.weekScore, 2.5);
  });

  it("미래 예외는 점수 미포함, 힌트는 달성 예정", () => {
    const map = attMap({
      1: { attended: true },
      2: { attended: true },
      6: { exception: true },
      7: { exception: true },
    });
    // 화~금까지 경과(슬롯1~5) → target 3, score 2.0, 미래 예외 2 → 달성 예정
    const r = computeWeekStats(slots, map, 1, "2026-07-24", 3);
    assert.equal(r.weekScore, 2);
    assert.equal(r.futureExceptionCount, 2);
    assert.equal(r.weekTargetMet, false);
    assert.equal(r.weekHint, "예외 반영 시 달성 예정");
  });

  it("미달이면 출석 N회 더 필요 힌트", () => {
    const map = attMap({
      1: { attended: true },
      7: { exception: true },
    });
    const r = computeWeekStats(slots, map, 1, "2026-07-24", 3);
    assert.equal(r.weekScore, 1);
    assert.equal(r.futureExceptionCount, 1);
    assert.equal(r.weekHint, "출석 2회 더 필요");
  });

  it("주 첫날(월요일) 출석 0 → 출석 3회 더 필요 (weekTarget이 1로 cap되면 안 됨)", () => {
    // 오늘 = 월요일 (주의 첫 번째 날, 아직 출석 없음)
    const r = computeWeekStats(slots, {}, 1, "2026-07-20", 3);
    assert.equal(r.weekScore, 0);
    assert.equal(r.weekAttendCount, 0);
    assert.equal(r.weekTarget, 3);
    assert.equal(r.weekHint, "출석 3회 더 필요");
  });

  it("훈련일 적은 주 — maxScore cap (훈련 2일·예외 0 → target 2)", () => {
    const short = [
      { id: "1", dayIndex: 1, date: "2026-07-20", week: 1, isProgramOff: false },
      { id: "2", dayIndex: 2, date: "2026-07-21", week: 1, isProgramOff: false },
      { id: "3", dayIndex: 3, date: "2026-07-22", week: 1, isProgramOff: true },
    ];
    const map = attMap({ 1: { attended: true }, 2: { attended: true } });
    const r = computeWeekStats(short, map, 1, today, 3);
    assert.equal(r.weekTarget, 2);
    assert.equal(r.weekScore, 2);
    assert.equal(r.weekTargetMet, true);
  });
});

describe("computeWeekStatsFull + formatWeekScoreSummary", () => {
  it("attendSummary는 점수만 표시", () => {
    const slots = week7Slots();
    const map = attMap({
      1: { attended: true },
      2: { attended: true },
      3: { exception: true },
      4: { exception: true },
    });
    const r = computeWeekStatsFull(slots, map, 1, 3, "2026-07-26");
    assert.equal(r.weekScore, 3);
    assert.equal(r.exceptionCount, 2);
    assert.equal(r.attendCount, 2);
    assert.equal(formatWeekScoreSummary(r), "3.0 / 3점");
  });
});

describe("weekBar", () => {
  it("소수 score는 floor 후 3칸 유지", () => {
    assert.equal(weekBar(Math.floor(2.5), 3), "██░");
    assert.equal(weekBar(3, 3), "███");
  });
});
