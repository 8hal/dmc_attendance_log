"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  WEEKLY_TARGET_POINTS,
  goalAward,
  attendanceAward,
  improvementAward,
  activitySummary,
  formatImprovement,
  coffeeAward,
  pendingResults,
  PLACEHOLDER_NET_SEC,
} = require("../../chunbaek/js/finale.js");

test("목표 달성상은 완주 넷타임이 목표 이하인 사람 전부이고 100일 출석 수가 아니다", () => {
  const members = [
    {
      memberId: "a",
      nickname: "가",
      goalMarathonNetTime: 10800,
      seasonAttendCount: 1,
      seasonResult: { status: "finisher", netTimeSec: 10700 },
    },
    {
      memberId: "b",
      nickname: "나",
      goalMarathonNetTime: 10800,
      seasonAttendCount: 90,
      seasonResult: { status: "finisher", netTimeSec: 11000 },
    },
    {
      memberId: "c",
      nickname: "다",
      goalMarathonNetTime: 12000,
      seasonAttendCount: 97,
      seasonResult: { status: "dns" },
    },
    {
      memberId: "d",
      nickname: "라",
      goalMarathonNetTime: 14000,
      seasonResult: { status: "finisher", netTimeSec: 14000 },
    },
  ];
  const award = goalAward(members);
  assert.equal(award.kind, "goal");
  assert.deepEqual(award.winners.map((w) => w.nickname), ["가", "라"]);
  assert.match(award.criterion, /완주/);
  assert.match(award.criterion, /100일 출석과 별개/);
});

test("2:00:00 자리표시는 수상에서 빠지고, 실제 기록이 오면 다시 계산된다", () => {
  assert.equal(PLACEHOLDER_NET_SEC, 7200);
  const dimo = {
    memberId: "dimo",
    nickname: "디모",
    goalMarathonNetTime: 9359,
    existingPbNetTime: 10800,
    seasonResult: { status: "finisher", netTimeSec: 7200 },
  };
  assert.deepEqual(goalAward([dimo]).winners, []);
  assert.deepEqual(improvementAward([dimo]).winners, []);
  assert.deepEqual(pendingResults([dimo]).map((row) => row.label), [
    "디모: 인천 마라톤 후 집계 예정",
  ]);

  const recorded = {
    ...dimo,
    seasonResult: { status: "finisher", netTimeSec: 9000 },
  };
  assert.deepEqual(goalAward([recorded]).winners.map((w) => w.nickname), ["디모"]);
  assert.equal(improvementAward([recorded]).winners[0].nickname, "디모");
  assert.deepEqual(pendingResults([recorded]), []);
});

test("최다 참여상은 출석 일수가 가장 많은 사람을 모두 보여 준다", () => {
  const award = attendanceAward([
    { memberId: "a", nickname: "가", seasonAttendCount: 40 },
    { memberId: "b", nickname: "나", seasonAttendCount: 50 },
    { memberId: "c", nickname: "다", seasonAttendCount: 50 },
  ]);
  assert.equal(award.value, 50);
  assert.deepEqual(award.winners.map((w) => w.nickname), ["나", "다"]);
  assert.equal(award.tied, true);
});

test("최우수상은 기존 PB보다 앞당긴 시간이 가장 큰 완주다", () => {
  const award = improvementAward([
    {
      memberId: "a",
      nickname: "가",
      existingPbNetTime: 11000,
      seasonResult: { status: "finisher", netTimeSec: 10800 },
    },
    {
      memberId: "b",
      nickname: "나",
      existingPbNetTime: 12000,
      seasonResult: { status: "finisher", netTimeSec: 11000 },
    },
    {
      memberId: "c",
      nickname: "다",
      seasonResult: { status: "finisher", netTimeSec: 10000 },
    },
    {
      memberId: "d",
      nickname: "라",
      existingPbNetTime: 10000,
      seasonResult: { status: "finisher", netTimeSec: 10100 },
    },
  ]);
  assert.deepEqual(award.winners.map((w) => w.nickname), ["나"]);
  assert.equal(award.seconds, 1000);
  assert.equal(award.excludedNoPb, 1);
  assert.equal(formatImprovement(1000), "16분 40초");
});

test("활동 결산은 주 3점 미달 주와 출석 4일 미만을 구분한다", () => {
  assert.equal(WEEKLY_TARGET_POINTS, 3);
  const summary = activitySummary([
    {
      nickname: "가",
      seasonAttendCount: 2,
      seasonAttendRate: 10,
      seasonWeeksCount: 14,
      seasonWeeksMetCount: 0,
    },
    {
      nickname: "나",
      seasonAttendCount: 30,
      seasonAttendRate: 80,
      seasonWeeksCount: 14,
      seasonWeeksMetCount: 10,
    },
    {
      nickname: "다",
      seasonAttendCount: 40,
      seasonAttendRate: 90,
      seasonWeeksCount: 14,
      seasonWeeksMetCount: 14,
    },
  ], 3);
  assert.equal(summary.weeklyTargetPoints, 3);
  assert.equal(summary.participantCount, 3);
  assert.equal(summary.averageAttendRate, 60);
  assert.deepEqual(summary.belowFourDays.map((m) => m.nickname), ["가"]);
  assert.equal(summary.penaltyWeekCount, 18);
  assert.deepEqual(summary.noPenalty.map((m) => m.nickname), ["다"]);
  assert.deepEqual(summary.withPenalty.map((m) => m.nickname), ["가", "나"]);
});

test("카페인상은 단톡 분석으로 확정한 진달 김진규, 9일이다", () => {
  const award = coffeeAward();
  assert.equal(award.winners[0].nickname, "진달 김진규");
  assert.equal(award.days, 9);
  assert.match(award.criterion, /단톡/);
  assert.match(award.criterion, /앱/);
});

test("결산 페이지는 앱과 운영 화면에서 열리고 시상 기준을 적는다", () => {
  const root = path.join(__dirname, "../..");
  const finale = fs.readFileSync(path.join(root, "chunbaek/finale.html"), "utf8");
  const finaleJs = fs.readFileSync(path.join(root, "chunbaek/js/finale.js"), "utf8");
  const index = fs.readFileSync(path.join(root, "chunbaek/index.html"), "utf8");
  const admin = fs.readFileSync(path.join(root, "chunbaek/admin.html"), "utf8");
  assert.match(finale, /시즌3 활동 결산/);
  assert.match(finale, /2026-11-27/);
  assert.match(finale, /2026-07-26/);
  assert.match(finaleJs, /최다 참여상/);
  assert.match(finaleJs, /당신때문에 고마웠다상/);
  assert.match(finaleJs, /목표 달성상/);
  assert.match(finaleJs, /카페인상/);
  assert.match(finaleJs, /최우수상/);
  assert.match(finaleJs, /익명 투표/);
  assert.match(finaleJs, /진달 김진규/);
  assert.match(index, /finale\.html/);
  assert.match(admin, /finale\.html/);
});
