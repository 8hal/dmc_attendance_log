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
  goalOutcomeLabel,
  raceResultLabel,
  seasonNoteText,
  exampleAwardsReview,
} = require("../../chunbaek/js/admin-awards-review");
const { serializeSeasonResult } = require("../../functions/lib/chunbaek-handlers");
const { goalAward } = require("../../chunbaek/js/finale");

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
  assert.match(html, /예시완료[\s\S]*PB 없음/);
  assert.match(html, /미입력/);
  assert.match(html, /<th class="col-time">목표 시간<\/th>/);
  assert.match(html, /<th class="col-time">기존 PB<\/th>/);
  assert.match(html, /<th class="col-time">대회 결과<\/th>/);
  assert.equal(html.includes("목표 거리"), false);
});

test("목표 시간, 기존 PB, 대회 결과는 서로 다른 칸에 있다", () => {
  const rows = [
    {
      nickname: "예시없음",
      profileComplete: false,
      goalMarathonNetTime: null,
      existingPbNetTime: null,
      seasonResult: null,
    },
    {
      nickname: "예시달성",
      profileComplete: true,
      goalMarathonNetTime: 10800,
      goalRace: "chuncheon",
      existingPbNetTime: 12000,
      seasonResult: { status: "finisher", netTimeSec: 10700, goalMet: true },
    },
    {
      nickname: "예시미달",
      profileComplete: true,
      goalMarathonNetTime: 10800,
      goalRace: "jtbc",
      existingPbNetTime: null,
      seasonResult: { status: "finisher", netTimeSec: 11000, goalMet: false },
    },
    {
      nickname: "예시포기",
      profileComplete: true,
      goalMarathonNetTime: 10800,
      goalRace: "chuncheon",
      existingPbNetTime: 13000,
      seasonResult: serializeSeasonResult({ status: "dnf", race: "chuncheon" }, { goalMarathonNetTime: 10800 }),
    },
    {
      nickname: "예시미출전",
      profileComplete: true,
      goalMarathonNetTime: 10800,
      goalRace: "chuncheon",
      existingPbNetTime: 13000,
      seasonResult: serializeSeasonResult({ status: "dns", race: "chuncheon" }, { goalMarathonNetTime: 10800 }),
    },
    {
      nickname: "예시취소",
      profileComplete: true,
      goalMarathonNetTime: 10800,
      goalRace: "other",
      existingPbNetTime: 13000,
      seasonResult: serializeSeasonResult({ status: "other", race: "chuncheon" }, { goalMarathonNetTime: 10800 }),
    },
    {
      nickname: "예시대기",
      profileComplete: true,
      goalMarathonNetTime: 10800,
      goalRace: "jtbc",
      existingPbNetTime: 12000,
      seasonResult: serializeSeasonResult({ status: "finisher", race: "jtbc", netTimeSec: 7200 }, { goalMarathonNetTime: 10800 }),
    },
  ];
  assert.equal(raceResultLabel(rows[0]), "아직 없음");
  assert.equal(raceResultLabel(rows[1]), "완주 2:58:20");
  assert.equal(goalOutcomeLabel(rows[1]), "달성");
  assert.equal(goalOutcomeLabel(rows[2]), "미달");
  assert.equal(raceResultLabel(rows[3]), "DNF");
  assert.equal(raceResultLabel(rows[4]), "DNS");
  assert.equal(raceResultLabel(rows[5]), "대회 취소 등");
  assert.equal(raceResultLabel(rows[6]), "집계 대기");
  assert.equal(goalOutcomeLabel(rows[6]), "집계 대기");
  const html = goalTableHtml(rows);
  const achieved = html.split("<tr").find((row) => row.includes("예시달성"));
  assert.match(achieved, /<td class="col-time">3:00:00<\/td>/);
  assert.match(achieved, /<td class="col-time">3:20:00<\/td>/);
  assert.match(achieved, /<td class="col-time">완주 2:58:20<\/td>/);
  assert.equal(achieved.includes("3:00:00 3:20:00"), false);
  const missing = html.split("<tr").find((row) => row.includes("예시없음"));
  assert.match(missing, /목표 없음/);
  assert.match(missing, /PB 없음/);
  assert.match(missing, /아직 없음/);
});

test("대회 소감은 seasonResult.note만 다짐 옆에 보여 준다", () => {
  const sample = exampleAwardsReview();
  const indexed = sample.members.find((member) => member.memberId === "example-7");
  assert.equal(indexed.resolutionText, "예시 다짐");
  assert.equal(indexed.seasonResult.note, "예시 소감");
  assert.equal(seasonNoteText({ seasonResult: null }), "없음");
  assert.equal(seasonNoteText({ seasonResult: { note: "   " } }), "없음");
  const html = goalTableHtml([
    {
      nickname: "예시소감",
      profileComplete: true,
      goalMarathonNetTime: 10800,
      goalRace: "chuncheon",
      resolutionText: "예시 다짐",
      existingPbNetTime: 12000,
      seasonResult: { status: "finisher", netTimeSec: 10000, goalMet: true, note: "<script>alert(1)</script>" },
    },
    {
      nickname: "예시빈소감",
      profileComplete: true,
      goalMarathonNetTime: 10800,
      goalRace: "chuncheon",
      resolutionText: "다짐만",
      existingPbNetTime: null,
      seasonResult: { status: "dns", note: "" },
    },
  ]);
  assert.match(html, /<th>다짐<\/th>\s*<th class="col-note">대회 소감<\/th>/);
  const noted = html.split("<tr").find((row) => row.includes("예시소감"));
  assert.ok(noted.indexOf("예시 다짐") < noted.indexOf("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.equal(noted.includes("<script>"), false);
  assert.match(noted, /<td class="col-time">3:20:00<\/td>/);
  const empty = html.split("<tr").find((row) => row.includes("예시빈소감"));
  assert.match(empty, /다짐만/);
  assert.match(empty, /<td class="col-note">없음<\/td>/);
  assert.match(empty, /PB 없음/);
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

test("목표 달성 여부는 저장된 goalMet와 기존 상태 문구만 보여 준다", () => {
  const withGoal = (seasonResult) => ({
    profileComplete: true,
    goalMarathonNetTime: 10800,
    goalRace: "chuncheon",
    seasonResult,
  });
  const missed = serializeSeasonResult(
    { status: "finisher", race: "chuncheon", netTimeSec: 11000 },
    { goalMarathonNetTime: 10800 },
  );
  assert.equal(missed.goalMet, false);
  assert.equal(goalOutcomeLabel(withGoal(missed)), "미달");
  assert.equal(goalOutcomeLabel(withGoal({ ...missed, goalMet: true })), "달성");

  const placeholder = serializeSeasonResult(
    { status: "finisher", race: "jtbc", netTimeSec: 7200 },
    { goalMarathonNetTime: 10800 },
  );
  assert.equal(placeholder.goalMet, true);
  assert.equal(goalOutcomeLabel(withGoal(placeholder)), "집계 대기");

  assert.equal(goalOutcomeLabel(withGoal(serializeSeasonResult(
    { status: "dnf", race: "chuncheon" },
    { goalMarathonNetTime: 10800 },
  ))), "DNF");
  assert.equal(goalOutcomeLabel(withGoal(serializeSeasonResult(
    { status: "dns", race: "chuncheon" },
    { goalMarathonNetTime: 10800 },
  ))), "DNS");
  assert.equal(goalOutcomeLabel(withGoal(serializeSeasonResult(
    { status: "other", race: "chuncheon" },
    { goalMarathonNetTime: 10800 },
  ))), "대회 취소 등");
  assert.equal(goalOutcomeLabel(withGoal(null)), "아직 없음");
  assert.equal(goalOutcomeLabel({
    profileComplete: false,
    goalMarathonNetTime: null,
    seasonResult: missed,
  }), "목표 없음");

  const table = goalTableHtml([withGoal(missed)]);
  assert.match(table, /달성 여부/);
  assert.match(table, /미달/);
  const admin = fs.readFileSync(path.join(__dirname, "../../functions/lib/chunbaek-admin.js"), "utf8");
  assert.match(admin, /seasonResult: serializeSeasonResult\(s3\.seasonResult, s3\)/);
});

function reviewMember(nickname, goal, result, profileComplete = true) {
  return {
    nickname,
    memberId: nickname,
    profileComplete,
    goalMarathonNetTime: goal,
    goalRace: goal == null ? null : "chuncheon",
    seasonResult: result
      ? serializeSeasonResult(result, { goalMarathonNetTime: goal })
      : null,
  };
}

test("검수 표의 달성은 목표 달성상 계산과 같고, 프로필이 없어도 행이 남는다", () => {
  const rows = [
    reviewMember("달성", 10800, { status: "finisher", race: "chuncheon", netTimeSec: 10700 }),
    reviewMember("동시간", 10800, { status: "finisher", race: "chuncheon", netTimeSec: 10800 }),
    reviewMember("미달자", 10800, { status: "finisher", race: "chuncheon", netTimeSec: 11000 }),
    reviewMember("중도", 10800, { status: "dnf", race: "chuncheon" }),
    reviewMember("미출전", 10800, { status: "dns", race: "chuncheon" }),
    reviewMember("취소", 10800, { status: "other", race: "chuncheon" }),
    reviewMember("미기록", 10800, null),
    reviewMember("미완성", null, null, false),
    reviewMember("미완성이지만기록", 10800, { status: "finisher", race: "chuncheon", netTimeSec: 10000 }, false),
    reviewMember("자리표시", 10800, { status: "finisher", race: "jtbc", netTimeSec: 7200 }),
  ];
  const winners = goalAward(rows).winners.map((winner) => winner.nickname).sort();
  const achieved = rows.filter((row) => goalOutcomeLabel(row) === "달성").map((row) => row.nickname).sort();
  assert.deepEqual(achieved, ["달성", "동시간", "미완성이지만기록"]);
  assert.deepEqual(winners, achieved);
  assert.equal(goalOutcomeLabel(rows.find((row) => row.nickname === "미달자")), "미달");
  assert.equal(goalOutcomeLabel(rows.find((row) => row.nickname === "중도")), "DNF");
  assert.equal(goalOutcomeLabel(rows.find((row) => row.nickname === "미출전")), "DNS");
  assert.equal(goalOutcomeLabel(rows.find((row) => row.nickname === "취소")), "대회 취소 등");
  assert.equal(goalOutcomeLabel(rows.find((row) => row.nickname === "미기록")), "아직 없음");
  assert.equal(goalOutcomeLabel(rows.find((row) => row.nickname === "미완성")), "목표 없음");
  assert.equal(goalOutcomeLabel(rows.find((row) => row.nickname === "자리표시")), "집계 대기");
  const table = goalTableHtml(rows);
  assert.match(table, /미완성/);
  assert.match(table, /미완성이지만기록/);
  const handlers = fs.readFileSync(path.join(__dirname, "../../functions/lib/chunbaek-handlers.js"), "utf8");
  assert.match(handlers, /if \(!p\.s3\.profileComplete\) continue;/);
});

test("출석 검수 목록은 computeMemberStats 주차 집계를 다시 계산하지 않는다", () => {
  const stats = computeMemberStats({
    config: { startDate: "2026-07-26", endDate: "2026-10-24", weeklyTarget: 3 },
    today: "2026-10-24",
    slots: [
      { dayIndex: 901, week: 0, date: "2026-07-20", isProgramOff: false },
      { dayIndex: 1, week: 1, date: "2026-07-26", isProgramOff: false },
      { dayIndex: 2, week: 1, date: "2026-07-27", isProgramOff: false },
      { dayIndex: 3, week: 1, date: "2026-07-28", isProgramOff: false },
      { dayIndex: 4, week: 1, date: "2026-07-29", isProgramOff: true },
      { dayIndex: 8, week: 2, date: "2026-08-02", isProgramOff: false },
      { dayIndex: 9, week: 2, date: "2026-08-03", isProgramOff: false },
      { dayIndex: 99, week: 20, date: "2026-10-25", isProgramOff: false },
    ],
    attendanceMap: {
      1: { attended: true },
      8: { attended: true },
      9: { attended: true },
    },
  });
  const member = {
    memberId: "sample",
    nickname: "샘플",
    seasonAttendCount: stats.seasonAttendCount,
    seasonExceptionCount: stats.seasonExceptionCount,
    seasonAttendRate: stats.seasonAttendRate,
    seasonWeeksCount: stats.seasonWeeksCount,
    seasonWeeksMetCount: stats.seasonWeeksMetCount,
    weeks: stats.seasonWeekSummaries,
  };
  const html = attendanceTableHtml([member]);
  for (const week of stats.seasonWeekSummaries) {
    assert.match(html, new RegExp(weekDetailText(week).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(html, /0주/);
  assert.equal(html.includes("20주"), false);
  assert.match(html, /data-open-week="1"/);
});
