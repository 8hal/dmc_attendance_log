"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");
const {
  computeMemberStats,
  S3_PROGRAM_START_DATE,
  S3_ATTENDANCE_END_DATE,
} = require("../../functions/lib/chunbaek-stats");
const {
  GOAL_TIME_MIN_SEC,
  GOAL_TIME_MAX_SEC,
  isValidGoalTime,
  isGoalMissing,
  weekDetailText,
  sortGoalRows,
  sortAttendanceRows,
  attendanceTableHtml,
  goalTableHtml,
} = require("../../chunbaek/js/admin-awards-review");

test("공식 시즌 밖과 베타 주는 유효 주차에 들어가지 않고, 짧은 주는 목표를 3으로 올리지 않는다", () => {
  assert.equal(S3_PROGRAM_START_DATE, "2026-07-26");
  assert.equal(S3_ATTENDANCE_END_DATE, "2026-10-24");
  const stats = computeMemberStats({
    config: { startDate: "2026-07-26", endDate: "2026-10-24", weeklyTarget: 3 },
    today: "2026-10-24",
    slots: [
      { dayIndex: 901, week: 0, date: "2026-07-20", isProgramOff: false },
      { week: 1, date: "2026-07-20", isProgramOff: false },
      { dayIndex: 1, week: 1, date: "2026-07-26", isProgramOff: false },
      { dayIndex: 2, week: 1, date: "2026-07-27", isProgramOff: false },
      { dayIndex: 3, week: 1, date: "2026-07-28", isProgramOff: false },
      { dayIndex: 4, week: 1, date: "2026-07-29", isProgramOff: true },
      { dayIndex: 8, week: 2, date: "2026-08-02", isProgramOff: false },
      { dayIndex: 9, week: 2, date: "2026-08-03", isProgramOff: false },
      { week: 20, date: "2026-10-25", isProgramOff: false },
    ],
    attendanceMap: {
      1: { attended: true },
      8: { attended: true },
      9: { attended: true },
    },
  });
  assert.equal(stats.programStartDate, "2026-07-26");
  assert.equal(stats.attendanceEndDate, "2026-10-24");
  const weeks = stats.seasonWeekSummaries.map((week) => week.week);
  assert.equal(weeks.includes(0), false);
  assert.equal(weeks.includes(20), false);
  const week1 = stats.seasonWeekSummaries.find((week) => week.week === 1);
  const week2 = stats.seasonWeekSummaries.find((week) => week.week === 2);
  assert.equal(week1.met, false);
  assert.equal(week1.target, 3);
  assert.equal(week1.attendCount, 1);
  assert.match(weekDetailText(week1), /1\.0\/3점 미달/);
  assert.match(weekDetailText(week1), /출석 1일/);
  assert.equal(week2.met, true);
  assert.equal(week2.target, 2);
  assert.match(weekDetailText(week2), /2\.0\/2점 달성/);
  assert.equal(weekDetailText(week2).includes("미달"), false);
});

test("목표 시간은 2:00:00~7:00:00만 유효하고, PB가 없어도 입력 완료다", () => {
  const handlers = fs.readFileSync(
    path.join(__dirname, "../../functions/lib/chunbaek-handlers.js"),
    "utf8",
  );
  assert.match(handlers, /const GOAL_MIN_SEC = 7200/);
  assert.match(handlers, /const GOAL_MAX_SEC = 25200/);
  assert.equal(GOAL_TIME_MIN_SEC, 7200);
  assert.equal(GOAL_TIME_MAX_SEC, 25200);
  assert.equal(isValidGoalTime(7199), false);
  assert.equal(isValidGoalTime(7200), true);
  assert.equal(isValidGoalTime(25200), true);
  assert.equal(isValidGoalTime(25201), false);
  const completeWithoutPb = {
    nickname: "예시완료",
    profileComplete: true,
    goalMarathonNetTime: 10800,
    goalRace: "chuncheon",
    existingPbNetTime: null,
  };
  assert.equal(isGoalMissing(completeWithoutPb), false);
  const html = goalTableHtml([completeWithoutPb, {
    nickname: "예시미입력",
    profileComplete: false,
    goalMarathonNetTime: null,
    goalRace: null,
    existingPbNetTime: null,
  }]);
  assert.match(html, /예시완료[\s\S]*없음/);
  assert.match(html, /미입력/);
  assert.equal(html.includes("목표 거리"), false);
});

test("목표 미입력은 명단 앞에 오고, 프로필이 없어도 행이 남는다", () => {
  const rows = sortGoalRows([
    {
      nickname: "가완료",
      profileComplete: true,
      goalMarathonNetTime: 10800,
      goalRace: "jtbc",
    },
    {
      nickname: "하미입력",
      profileComplete: false,
      goalMarathonNetTime: null,
      goalRace: null,
    },
  ]);
  assert.deepEqual(rows.map((row) => row.nickname), ["하미입력", "가완료"]);
  const table = goalTableHtml(rows);
  assert.ok(table.indexOf("하미입력") < table.indexOf("가완료"));
});

test("출석 검수 표는 미달 주차를 먼저 보여 주고 이유를 펼친다", () => {
  const rows = sortAttendanceRows([
    {
      memberId: "clear",
      nickname: "예시달성",
      seasonAttendCount: 30,
      seasonExceptionCount: 0,
      seasonAttendRate: 100,
      seasonWeeksCount: 2,
      seasonWeeksMetCount: 2,
      weeks: [
        { week: 1, attendCount: 3, exceptionCount: 0, weekScore: 3, target: 3, met: true },
      ],
    },
    {
      memberId: "miss",
      nickname: "예시미달",
      seasonAttendCount: 10,
      seasonExceptionCount: 1,
      seasonAttendRate: 40,
      seasonWeeksCount: 2,
      seasonWeeksMetCount: 1,
      weeks: [
        { week: 3, attendCount: 1, exceptionCount: 1, weekScore: 1.5, target: 3, met: false },
      ],
    },
  ]);
  assert.equal(rows[0].nickname, "예시미달");
  const html = attendanceTableHtml(rows);
  assert.match(html, /data-open-week="3"/);
  assert.match(html, /1\.5\/3점 미달 · 출석 1일 · 예외 1일/);
  assert.match(html, /data-review-detail="miss"/);
});
