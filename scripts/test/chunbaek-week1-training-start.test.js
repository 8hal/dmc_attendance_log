"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");
const {
  computeMemberStats,
  S3_PROGRAM_START_DATE,
  S3_ATTENDANCE_END_DATE,
  S3_TRAINING_WEEK_START_DATE,
} = require("../../functions/lib/chunbaek-stats");
const { SEASON_START } = require("../../functions/lib/chunbaek-coffee-review");

function week1Slots() {
  const slots = [];
  for (let day = 1; day <= 7; day += 1) {
    const date = new Date(Date.UTC(2026, 6, 19 + day));
    const iso = date.toISOString().slice(0, 10);
    slots.push({ dayIndex: day, date: iso, week: 1, isProgramOff: false });
  }
  slots.push({ dayIndex: 8, date: "2026-07-27", week: 2, isProgramOff: false });
  slots.push({ dayIndex: 9, date: "2026-07-28", week: 2, isProgramOff: false });
  slots.push({ dayIndex: 10, date: "2026-07-29", week: 2, isProgramOff: false });
  return slots;
}

test("시즌 마감 주간 점수만 7월 20일부터 1주차를 포함하고 출석 일수는 7월 26일을 유지한다", () => {
  assert.equal(S3_PROGRAM_START_DATE, "2026-07-26");
  assert.equal(S3_ATTENDANCE_END_DATE, "2026-10-24");
  assert.equal(S3_TRAINING_WEEK_START_DATE, "2026-07-20");
  assert.equal(SEASON_START, "2026-07-26");
  const slots = week1Slots();
  assert.equal(slots[0].date, "2026-07-20");
  assert.equal(slots[6].date, "2026-07-26");
  const attendanceMap = {
    1: { attended: true },
    2: { attended: true },
    3: { exception: true },
    8: { attended: true },
  };
  const base = {
    slots,
    attendanceMap,
    config: { startDate: "2026-07-20", endDate: "2026-10-24", weeklyTarget: 3 },
    today: "2026-10-24",
  };
  const official = computeMemberStats(base);
  const week1Official = official.seasonWeekSummaries.find((week) => week.week === 1);
  assert.equal(week1Official.target, 1);
  assert.equal(week1Official.weekScore, 0);
  assert.equal(week1Official.met, false);
  assert.equal(official.seasonAttendCount, 1);

  const trained = computeMemberStats({
    ...base,
    weekScoreProgramStart: S3_TRAINING_WEEK_START_DATE,
  });
  const week1 = trained.seasonWeekSummaries.find((week) => week.week === 1);
  assert.equal(week1.attendCount, 2);
  assert.equal(week1.exceptionCount, 1);
  assert.equal(week1.weekScore, 2.5);
  assert.equal(week1.target, 3);
  assert.equal(week1.met, false);
  assert.equal(trained.seasonAttendCount, official.seasonAttendCount);
  const week2 = trained.seasonWeekSummaries.find((week) => week.week === 2);
  const week2Official = official.seasonWeekSummaries.find((week) => week.week === 2);
  assert.equal(week2.target, 3);
  assert.equal(week2.weekScore, 1);
  assert.deepEqual(
    { met: week2.met, attendCount: week2.attendCount, target: week2.target },
    { met: week2Official.met, attendCount: week2Official.attendCount, target: week2Official.target },
  );

  const full = computeMemberStats({
    ...base,
    weekScoreProgramStart: S3_TRAINING_WEEK_START_DATE,
    attendanceMap: {
      1: { attended: true },
      2: { attended: true },
      3: { attended: true },
    },
  });
  const fullWeek1 = full.seasonWeekSummaries.find((week) => week.week === 1);
  assert.equal(fullWeek1.attendCount, 3);
  assert.equal(fullWeek1.target, 3);
  assert.equal(fullWeek1.met, true);
  assert.equal(full.seasonAttendCount, 0);

  const admin = fs.readFileSync(path.join(__dirname, "../../functions/lib/chunbaek-admin.js"), "utf8");
  const handlers = fs.readFileSync(path.join(__dirname, "../../functions/lib/chunbaek-handlers.js"), "utf8");
  assert.match(admin, /weekScoreProgramStart: S3_TRAINING_WEEK_START_DATE/);
  assert.match(handlers, /weekScoreProgramStart/);
  assert.equal(handlers.includes("handleTeamSummary"), true);
});
