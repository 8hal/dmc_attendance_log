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

  const recorded = {
    ...dimo,
    seasonResult: { status: "finisher", netTimeSec: 9000 },
  };
  assert.deepEqual(goalAward([recorded]).winners.map((w) => w.nickname), ["디모"]);
  assert.equal(improvementAward([recorded]).winners[0].nickname, "디모");
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

test("카페인상은 시즌3 coffee 집계의 Josh조상현, 8일이다", () => {
  const award = coffeeAward();
  assert.equal(award.winners[0].nickname, "Josh조상현");
  assert.equal(award.winners[0].nickname.includes("*"), false);
  assert.equal(award.days, 8);
  assert.match(award.criterion, /8일/);
  assert.match(award.criterion, /2026-07-26/);
  assert.match(award.criterion, /2026-10-24/);
  assert.equal(award.criterion.includes("진달"), false);
  assert.equal(award.criterion.includes("9일"), false);
});

test("시상 계산은 운영 화면용이고 회원 앱은 쫑파티 안내로 연결한다", () => {
  const root = path.join(__dirname, "../..");
  const finaleJs = fs.readFileSync(path.join(root, "chunbaek/js/finale.js"), "utf8");
  const index = fs.readFileSync(path.join(root, "chunbaek/index.html"), "utf8");
  const admin = fs.readFileSync(path.join(root, "chunbaek/admin.html"), "utf8");
  const party = fs.readFileSync(path.join(root, "chunbaek/party.html"), "utf8");
  const finalePage = fs.readFileSync(path.join(root, "chunbaek/finale.html"), "utf8");
  assert.match(finaleJs, /시즌3 활동 결산/);
  assert.match(finaleJs, /2026-07-26/);
  assert.match(finaleJs, /최다 참여상/);
  assert.match(finaleJs, /당신때문에 고마웠다상/);
  assert.match(finaleJs, /목표 달성상/);
  assert.match(finaleJs, /카페인상/);
  assert.match(finaleJs, /최우수상/);
  assert.match(finaleJs, /운영진만/);
  assert.match(finaleJs, /Josh조상현/);
  assert.equal(finaleJs.includes("진달 김진규"), false);
  assert.equal(index.includes("finale.html"), false);
  assert.match(admin, /id="panel-awards"/);
  assert.match(admin, /⑤ 시즌 마감/);
  assert.match(admin, /data-panel="awards">시즌 마감/);
  assert.equal(admin.includes("⑤ 시상"), false);
  assert.equal(admin.includes("thanks-results"), false);
  assert.equal(admin.includes("당신 때문에 고마웠다"), false);
  const adminJs = fs.readFileSync(path.join(root, "chunbaek/js/admin.js"), "utf8");
  assert.equal(adminJs.includes("admin-thanks-votes"), false);
  const awards = require("../../chunbaek/js/finale.js").awardsHtml(require("../../chunbaek/js/finale.js").previewModel());
  assert.match(awards, /최다 참여상/);
  assert.match(awards, /카페인상/);
  assert.match(awards, /목표 달성상/);
  assert.equal(awards.includes("투표 결과는 아래"), false);
  assert.equal(awards.includes("당신때문에 고마웠다상"), false);
  assert.equal(awards.includes("출석 4일 미만"), false);
  assert.equal(awards.includes("시즌 출석 4일 미만"), false);
  assert.match(awards, /class="finale-info"/);
  assert.match(awards, /class="finale-info-source" hidden/);
  assert.equal(awards.includes("class=\"finale-criterion\""), false);
  assert.match(awards, /3점 미달/);
  assert.match(awards, /매주 3점을 채운 사람/);
  const hiddenLow = activitySummary([{
    nickname: "가",
    seasonAttendCount: 2,
    seasonAttendRate: 10,
    seasonWeeksCount: 2,
    seasonWeeksMetCount: 0,
  }], 3);
  assert.equal(hiddenLow.belowFourDays[0].nickname, "가");
  assert.equal(awards.includes("집계 대기"), false);
  assert.equal((awards.match(/class="finale-stat"/g) || []).length, 3);
  assert.match(awards, /프로필을 만든/);
  assert.match(awards, /참가자/);
  assert.match(awards, /평균 출석률/);
  assert.match(awards, /매주 3점 달성/);
  const finale = require("../../chunbaek/js/finale.js");
  assert.equal(finale.pendingResults, undefined);
  const adminCss = fs.readFileSync(path.join(root, "chunbaek/css/admin.css"), "utf8");
  assert.match(adminCss, /\.finale-stats\s*\{[^}]*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.equal(adminCss.includes("finale-stats { grid-template-columns: repeat(4, 1fr); }"), false);
  assert.equal(awards.includes("인천 마라톤 후 집계 예정"), false);
  assert.equal(awards.includes("디모"), false);
  assert.equal(awards.includes("기존 PB가 없거나 완주가 2:00:00이면 비교하지 않습니다"), false);
  assert.equal(awards.includes("저장값 자체는 지우지 않습니다"), false);
  const placeholder = {
    nickname: "자리",
    goalMarathonNetTime: 10800,
    existingPbNetTime: 12000,
    seasonResult: { status: "finisher", netTimeSec: 7200 },
  };
  assert.equal(goalAward([placeholder]).winners.length, 0);
  assert.equal(improvementAward([placeholder]).winners.length, 0);
  assert.equal(admin.includes("finale.html"), false);
  assert.match(party, /당신 때문에 고마웠다/);
  assert.match(party, /thanks-vote-host/);
  assert.equal(index.includes("party.html"), false);
  assert.equal(index.includes("고마웠다 투표"), false);
  assert.equal(index.includes("당신 때문에 고마웠다"), false);
  assert.equal(finalePage.includes("party.html"), false);
  assert.equal(finalePage.includes("http-equiv=\"refresh\""), false);
  assert.equal(party.includes("2026-11-27"), false);
  assert.equal(party.includes("목표 달성상"), false);
});
