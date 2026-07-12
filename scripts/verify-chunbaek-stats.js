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
} = require("../functions/lib/chunbaek-stats");

const config = { weeklyTarget: 3, photoRequired: false };

const slots = [
  { id: "1", dayIndex: 1, date: "2026-04-01", week: 1, trainingTitle: "이지런", trainingContent: "", isProgramOff: false },
  { id: "2", dayIndex: 2, date: "2026-04-02", week: 1, trainingTitle: "인터벌", trainingContent: "", isProgramOff: false },
  { id: "3", dayIndex: 3, date: "2026-04-03", week: 1, trainingTitle: "휴무", trainingContent: "", isProgramOff: true },
  { id: "4", dayIndex: 4, date: "2026-04-04", week: 1, trainingTitle: "장거리", trainingContent: "", isProgramOff: false },
  { id: "5", dayIndex: 5, date: "2026-04-05", week: 1, trainingTitle: "이지런", trainingContent: "", isProgramOff: false },
  { id: "6", dayIndex: 6, date: "2026-04-06", week: 1, trainingTitle: "토요", trainingContent: "", isProgramOff: false },
  { id: "7", dayIndex: 7, date: "2026-04-07", week: 2, trainingTitle: "인터벌", trainingContent: "", isProgramOff: false },
];

const attendanceMap = {
  1: { slotId: 1, attended: true, exception: false },
  2: { slotId: 2, attended: true, exception: false },
  4: { slotId: 4, attended: false, exception: false },
};

// 2026-04-05 = day 5, week 1 — 2 attends (1,2), week target min(3,5 training days)=3
const stats = computeMemberStats({
  slots,
  attendanceMap,
  config,
  today: "2026-04-05",
});

assert.equal(stats.seasonDayIndex, 5);
assert.equal(stats.seasonAttendCount, 2);
assert.equal(stats.weekAttendCount, 2);
assert.equal(stats.weekTarget, 3);
assert.equal(stats.weekTargetMet, false);
assert.equal(stats.seasonAttendRate, 50);

const exceptionMap = {
  ...attendanceMap,
  4: { slotId: 4, attended: false, exception: true },
};
const statsEx = computeMemberStats({
  slots,
  attendanceMap: exceptionMap,
  config,
  today: "2026-04-05",
});
assert.equal(statsEx.seasonAttendRate, 67);
assert.equal(statsEx.seasonAttendCount, 2);

const timeline = buildTimelineWeeks(slots, attendanceMap, config, "2026-04-05");
assert.equal(timeline.length, 2);
assert.equal(timeline[0].week, 2);
assert.ok(timeline[1].slots.some((s) => s.status === "miss"));

const todayPayload = todaySlotPayload(slots, attendanceMap, "2026-04-05");
assert.equal(todayPayload.slot.dayIndex, 5);
assert.equal(todayPayload.slot.attended, false);

const before = todaySlotPayload(slots, attendanceMap, "2026-03-31");
assert.equal(before.beforeSeason, true);

const deadline = weekSundayDeadlineKst("2026-04-02");
assert.ok(deadline instanceof Date);
assert.equal(isMemberEditLocked("2026-04-01", deadline.getTime() + 1), true);

console.log("verify-chunbaek-stats: OK");
