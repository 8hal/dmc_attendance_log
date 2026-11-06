"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");
const {
  computeMemberStats,
  S3_PROGRAM_START_DATE,
  S3_ATTENDANCE_END_DATE,
  S3_SEASON_CLOSE_WEEK_START_DATE,
} = require("../../functions/lib/chunbaek-stats");
const { SEASON_START } = require("../../functions/lib/chunbaek-coffee-review");
const { attendanceTableHtml, reviewSectionHtml } = require("../../chunbaek/js/admin-awards-review");

function seasonSlots() {
  const slots = [];
  for (let day = 1; day <= 14; day += 1) {
    const date = new Date(Date.UTC(2026, 6, 19 + day)).toISOString().slice(0, 10);
    slots.push({ dayIndex: day, date, week: Math.ceil(day / 7), isProgramOff: false });
  }
  return slots;
}

test("시즌 마감 주간 미달은 7/20~7/26 0주차를 빼고 7/27부터 세며 출석 일수는 유지한다", () => {
  assert.equal(S3_PROGRAM_START_DATE, "2026-07-26");
  assert.equal(S3_ATTENDANCE_END_DATE, "2026-10-24");
  assert.equal(S3_SEASON_CLOSE_WEEK_START_DATE, "2026-07-27");
  assert.equal(SEASON_START, "2026-07-26");
  const slots = seasonSlots();
  assert.equal(slots[0].date, "2026-07-20");
  assert.equal(slots[6].date, "2026-07-26");
  assert.equal(slots[7].date, "2026-07-27");
  const attendanceMap = {
    1: { attended: true },
    3: { exception: true },
    7: { attended: true },
    8: { attended: true },
    9: { attended: true },
    10: { exception: true },
  };
  const base = {
    slots,
    attendanceMap,
    config: { startDate: "2026-07-20", endDate: "2026-10-24", weeklyTarget: 3 },
    today: "2026-10-24",
  };
  const official = computeMemberStats(base);
  const storedWeek1 = official.seasonWeekSummaries.find((week) => week.week === 1);
  assert.equal(storedWeek1.startDate, "2026-07-20");
  assert.equal(storedWeek1.endDate, "2026-07-26");
  assert.equal(storedWeek1.attendCount, 1);
  assert.equal(storedWeek1.exceptionCount, 0);
  assert.equal(storedWeek1.target, 1);
  assert.equal(storedWeek1.weekScore, 1);
  assert.equal(official.seasonAttendCount, 3);

  const closed = computeMemberStats({
    ...base,
    omitWeeksEndingBefore: S3_SEASON_CLOSE_WEEK_START_DATE,
  });
  assert.equal(closed.seasonWeekSummaries.some((week) => week.week === 1), false);
  assert.equal(closed.seasonAttendCount, official.seasonAttendCount);
  const weekOfJuly27 = closed.seasonWeekSummaries.find((week) => week.week === 2);
  const officialJuly27 = official.seasonWeekSummaries.find((week) => week.week === 2);
  assert.equal(weekOfJuly27.startDate, "2026-07-27");
  assert.equal(weekOfJuly27.endDate, "2026-08-02");
  assert.equal(weekOfJuly27.attendCount, 2);
  assert.equal(weekOfJuly27.exceptionCount, 1);
  assert.equal(weekOfJuly27.weekScore, 2.5);
  assert.equal(weekOfJuly27.target, 3);
  assert.equal(weekOfJuly27.met, false);
  assert.deepEqual(
    {
      attendCount: weekOfJuly27.attendCount,
      exceptionCount: weekOfJuly27.exceptionCount,
      weekScore: weekOfJuly27.weekScore,
      target: weekOfJuly27.target,
      met: weekOfJuly27.met,
    },
    {
      attendCount: officialJuly27.attendCount,
      exceptionCount: officialJuly27.exceptionCount,
      weekScore: officialJuly27.weekScore,
      target: officialJuly27.target,
      met: officialJuly27.met,
    },
  );
  assert.equal(closed.seasonWeeksCount, official.seasonWeeksCount - 1);

  const root = path.join(__dirname, "../..");
  const admin = fs.readFileSync(path.join(root, "functions/lib/chunbaek-admin.js"), "utf8");
  const handlers = fs.readFileSync(path.join(root, "functions/lib/chunbaek-handlers.js"), "utf8");
  const stats = fs.readFileSync(path.join(root, "functions/lib/chunbaek-stats.js"), "utf8");
  const review = fs.readFileSync(path.join(root, "chunbaek/js/admin-awards-review.js"), "utf8");
  const finale = fs.readFileSync(path.join(root, "chunbaek/js/finale.js"), "utf8");
  assert.equal(stats.includes("weekScoreProgramStart"), false);
  assert.equal(stats.includes("S3_TRAINING_WEEK_START_DATE"), false);
  assert.match(admin, /omitWeeksEndingBefore: S3_SEASON_CLOSE_WEEK_START_DATE/);
  assert.match(handlers, /omitWeeksEndingBefore/);
  assert.equal(handlers.includes("weekScoreProgramStart"), false);
  const teamSummary = handlers.slice(handlers.indexOf("async function handleTeamSummary"));
  assert.equal(teamSummary.includes("omitWeeksEndingBefore"), false);
  assert.match(review, /7\/20~7\/26\(0주차\)/);
  assert.match(review, /7\/27 월요일부터/);
  assert.equal(review.includes("2026-07-20부터"), false);
  assert.match(finale, /7\/20~7\/26은 0주차/);
  assert.match(finale, /7\/27 월요일부터/);
  assert.match(finale, /2026-07-26/);

  const html = attendanceTableHtml([{
    memberId: "m1",
    nickname: "예시",
    seasonAttendCount: 3,
    seasonExceptionCount: 1,
    seasonAttendRate: 50,
    seasonWeeksMetCount: 0,
    seasonWeeksCount: 1,
    weeks: [weekOfJuly27],
  }]);
  assert.match(html, /data-open-week="2"/);
  assert.match(html, /2주 7\/27~8\/2/);
  assert.equal(html.includes(">1주"), false);
  const section = reviewSectionHtml({
    programStartDate: "2026-07-26",
    attendanceEndDate: "2026-10-24",
    members: [],
  }, "all", "all", "");
  assert.match(section, /0주차/);
  assert.match(section, /7\/27 월요일부터/);
});
