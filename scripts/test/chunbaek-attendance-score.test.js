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

  it("미래 예외는 weekScore에 미포함 (date > today)", () => {
    const map = attMap({
      1: { attended: true },
      2: { attended: true },
      7: { exception: true }, // 2026-07-26, today=07-25면 미래
    });
    const r = computeWeekStats(slots, map, 1, "2026-07-25", 3);
    assert.equal(r.weekExceptionCount, 0);
    assert.equal(r.weekScore, 2);
    assert.equal(r.weekTargetMet, false);
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
  it("attendSummary에 예외 포함", () => {
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
    assert.match(formatWeekScoreSummary(r), /출석 2회 · 예외 2회/);
    assert.match(formatWeekScoreSummary(r), /3\.0/);
  });
});

describe("weekBar", () => {
  it("소수 score는 floor 후 3칸 유지", () => {
    assert.equal(weekBar(Math.floor(2.5), 3), "██░");
    assert.equal(weekBar(3, 3), "███");
  });
});
