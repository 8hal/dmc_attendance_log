"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  computeMemberStats,
} = require(path.join(__dirname, "../../functions/lib/chunbaek-stats.js"));

function buildTwoWeeksSlots() {
  const slots = [];
  const startMs = Date.UTC(2026, 6, 20); // 2026-07-20 (Mon)
  for (let i = 0; i < 14; i += 1) {
    const dt = new Date(startMs + i * 86400000).toISOString().slice(0, 10);
    const dayIndex = i + 1;
    const week = Math.ceil(dayIndex / 7);
    slots.push({
      id: String(dayIndex),
      dayIndex,
      date: dt,
      week,
      trainingTitle: i === 4 ? "휴무" : `훈련 ${dayIndex}`,
      isProgramOff: i === 4, // 5일차(금) 휴무
    });
  }
  return slots;
}

describe("Task 1: computeMemberStats — 시즌 마감 출석 성과 (A안)", () => {
  it("시즌 훈련일(seasonTrainingDays), 예외일(seasonExceptionCount), 주간 3점 달성 주차 수(seasonWeeksMetCount/seasonWeeksCount)를 정확히 계산한다", () => {
    const slots = buildTwoWeeksSlots();
    // 1주차(1~7일차, 5일차 휴무 → 훈련일 6일): 1,2,3일차 출석 (3.0점 → 달성!)
    // 2주차(8~14일차, 훈련일 7일): 8일차 출석, 9일차 예외 (1.5점 → 미달)
    const attendanceMap = {
      "1": { slotId: 1, attended: true },
      "2": { slotId: 2, attended: true },
      "3": { slotId: 3, attended: true },
      "8": { slotId: 8, attended: true },
      "9": { slotId: 9, attended: false, exception: true },
    };
    const config = { startDate: "2026-07-20", weeklyTarget: 3 };
    const stats = computeMemberStats({
      slots,
      attendanceMap,
      config,
      today: "2026-08-02", // 14일차 종료일
    });

    assert.equal(stats.seasonDayIndex, 14);
    assert.equal(stats.seasonTrainingDays, 13); // 14일 중 휴무 1일 제외
    assert.equal(stats.seasonExceptionCount, 1); // 9일차 예외 1일
    assert.equal(stats.seasonDenom, 12); // 13 - 1
    assert.equal(stats.seasonAttendCount, 4); // 1,2,3,8일차
    assert.equal(stats.seasonAttendRate, Math.round((4 / 12) * 100)); // 33%
    assert.equal(stats.seasonWeeksCount, 2);
    assert.equal(stats.seasonWeeksMetCount, 1);
    assert.equal(Array.isArray(stats.seasonWeekSummaries), true);
    assert.equal(stats.seasonWeekSummaries.length, 2);
    assert.deepEqual(stats.seasonWeekSummaries[0], {
      week: 1,
      attendCount: 3,
      exceptionCount: 0,
      weekScore: 3,
      target: 3,
      met: true,
    });
    assert.deepEqual(stats.seasonWeekSummaries[1], {
      week: 2,
      attendCount: 1,
      exceptionCount: 1,
      weekScore: 1.5,
      target: 3,
      met: false,
    });
  });
});
