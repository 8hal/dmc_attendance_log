#!/usr/bin/env node
/**
 * chunbaek-stats 단위 검증 — Firestore 불필요
 */
const assert = require("node:assert/strict");
const {
  todayKstDate,
  weekSundayDeadlineKst,
  isMemberEditLocked,
  computeMemberStats,
  buildTimelineWeeks,
  todaySlotPayload,
  isBetaSlot,
  isDateInBetaWeek,
  betaDayIndexForDate,
  defaultWeekForAdmin,
  BETA_DAY_INDEX_BASE,
} = require("../functions/lib/chunbaek-stats");

const config = {
  weeklyTarget: 3,
  photoRequired: false,
  startDate: "2026-07-20",
  betaWeekStartDate: "2026-07-13",
  betaWeekEndDate: "2026-07-19",
};

const seasonSlots = [
  { id: "1", dayIndex: 1, date: "2026-07-20", week: 1, trainingTitle: "이지런", trainingContent: "", isProgramOff: false },
  { id: "2", dayIndex: 2, date: "2026-07-21", week: 1, trainingTitle: "인터벌", trainingContent: "", isProgramOff: false },
];

const betaSlots = Array.from({ length: 7 }, (_, i) => ({
  id: String(901 + i),
  dayIndex: 901 + i,
  date: `2026-07-${13 + i}`,
  week: 0,
  trainingTitle: `베타 D${i + 1}`,
  trainingContent: "",
  isProgramOff: false,
}));

const slots = [...betaSlots, ...seasonSlots];

const attendanceMap = {
  901: { slotId: 901, attended: true, exception: false },
  1: { slotId: 1, attended: true, exception: false },
};

assert.equal(isBetaSlot(betaSlots[0]), true);
assert.equal(isDateInBetaWeek(config, slots, "2026-07-15"), true);
assert.equal(isDateInBetaWeek(config, slots, "2026-07-20"), false);
assert.equal(betaDayIndexForDate(config, slots, "2026-07-15"), BETA_DAY_INDEX_BASE + 2);
assert.equal(defaultWeekForAdmin(config, slots, "2026-07-15"), 0);

const betaStats = computeMemberStats({
  slots,
  attendanceMap,
  config,
  today: "2026-07-15",
});
assert.equal(betaStats.seasonAttendCount, 1);
assert.equal(betaStats.seasonDayIndex, 3);
assert.equal(betaStats.weekAttendCount, 1);
assert.equal(betaStats.inBetaWeek, true);
assert.equal(betaStats.weekTargetMet, false);
assert.equal(betaStats.seasonAttendRate, 33);

const betaStatsMet = computeMemberStats({
  slots,
  attendanceMap: {
    901: { slotId: 901, attended: true },
    902: { slotId: 902, attended: true },
    903: { slotId: 903, attended: true },
  },
  config,
  today: "2026-07-15",
});
assert.equal(betaStatsMet.weekTargetMet, true);

const seasonStats = computeMemberStats({
  slots,
  attendanceMap: { 1: attendanceMap[1] },
  config,
  today: "2026-07-21",
});
assert.equal(seasonStats.seasonAttendCount, 1);
assert.equal(seasonStats.inBetaWeek, false);

const timelineBeta = buildTimelineWeeks(slots, attendanceMap, config, "2026-07-15");
assert.equal(timelineBeta.length, 1);
assert.equal(timelineBeta[0].week, 0);
assert.equal(timelineBeta[0].weekLabel, "0주차");
assert.equal(timelineBeta[0].attendSummary, "1/3회");

const timelineSeason = buildTimelineWeeks(slots, attendanceMap, config, "2026-07-21");
assert.ok(timelineSeason.every((w) => w.week > 0));

const betaToday = todaySlotPayload(slots, attendanceMap, "2026-07-15", config);
assert.equal(betaToday.betaWeek, true);
assert.equal(betaToday.beforeSeason, false);
assert.equal(betaToday.slot.trainingTitle, "베타 D3");

const beforeSeason = todaySlotPayload(slots, {}, "2026-07-12", config);
assert.equal(beforeSeason.beforeSeason, true);
assert.equal(beforeSeason.betaWeek, false);

// --- legacy April fixtures (시즌 슬롯만) ---
const aprilSlots = [
  { id: "1", dayIndex: 1, date: "2026-04-01", week: 1, trainingTitle: "이지런", trainingContent: "", isProgramOff: false },
  { id: "2", dayIndex: 2, date: "2026-04-02", week: 1, trainingTitle: "인터벌", trainingContent: "", isProgramOff: false },
  { id: "3", dayIndex: 3, date: "2026-04-03", week: 1, trainingTitle: "휴무", trainingContent: "", isProgramOff: true },
  { id: "4", dayIndex: 4, date: "2026-04-04", week: 1, trainingTitle: "장거리", trainingContent: "", isProgramOff: false },
  { id: "5", dayIndex: 5, date: "2026-04-05", week: 1, trainingTitle: "이지런", trainingContent: "", isProgramOff: false },
  { id: "6", dayIndex: 6, date: "2026-04-06", week: 1, trainingTitle: "토요", trainingContent: "", isProgramOff: false },
  { id: "7", dayIndex: 7, date: "2026-04-07", week: 2, trainingTitle: "인터벌", trainingContent: "", isProgramOff: false },
];
const aprilAtt = {
  1: { slotId: 1, attended: true, exception: false },
  2: { slotId: 2, attended: true, exception: false },
  4: { slotId: 4, attended: false, exception: false },
};
const aprilConfig = { weeklyTarget: 3, photoRequired: false, startDate: "2026-04-01" };

const stats = computeMemberStats({
  slots: aprilSlots,
  attendanceMap: aprilAtt,
  config: aprilConfig,
  today: "2026-04-05",
});
assert.equal(stats.seasonDayIndex, 5);
assert.equal(stats.seasonAttendCount, 2);

const timeline = buildTimelineWeeks(aprilSlots, aprilAtt, aprilConfig, "2026-04-05");
assert.equal(timeline.length, 1);
assert.equal(timeline[0].week, 1);

const deadline = weekSundayDeadlineKst("2026-04-02");
assert.ok(deadline instanceof Date);
assert.equal(isMemberEditLocked("2026-04-01", deadline.getTime() + 1), true);

console.log("verify-chunbaek-stats: OK");
