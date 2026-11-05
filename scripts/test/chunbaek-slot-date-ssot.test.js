const test = require("node:test");
const assert = require("node:assert/strict");
const {
  deriveSeasonDate,
  deriveSeasonWeek,
  deriveSlotDate,
  computeMemberStats,
  effectiveSeasonStart,
  effectiveSeasonEnd,
  S3_ATTENDANCE_END_DATE,
  todaySlotPayload,
  findTodaySlot,
  defaultWeekForAdmin,
  formatIsoRange,
  buildTimelineWeeks,
  slotStatus,
  canonicalChunbaekPhotoUrl,
} = require("../../functions/lib/chunbaek-stats");
const {
  slotWriteFieldsFromRow,
  correctImportRow,
} = require("../../functions/lib/chunbaek-admin");

const config = {
  startDate: "2026-07-20",
  endDate: "2026-10-27",
  betaWeekStartDate: "2026-07-13",
  betaWeekEndDate: "2026-07-19",
};

test("deriveSeasonDate: dayIndex 1 and 100", () => {
  assert.equal(deriveSeasonDate(config, 1), "2026-07-20");
  assert.equal(deriveSeasonDate(config, 100), "2026-10-27");
});

test("deriveSeasonWeek: ceil(dayIndex/7)", () => {
  assert.equal(deriveSeasonWeek(1), 1);
  assert.equal(deriveSeasonWeek(7), 1);
  assert.equal(deriveSeasonWeek(8), 2);
});

test("deriveSlotDate prefers derived over polluted stored date", () => {
  const slot = { dayIndex: 1, week: 1, date: "2026-07-27" };
  assert.equal(deriveSlotDate(slot, config, [slot]), "2026-07-20");
});

test("deriveSlotDate coerces string dayIndex", () => {
  const slot = { dayIndex: "1", week: 1, date: "2026-07-27" };
  assert.equal(deriveSlotDate(slot, config, [slot]), "2026-07-20");
});

test("effectiveSeasonStart/End use config when present", () => {
  assert.equal(effectiveSeasonStart(config, []), "2026-07-20");
  assert.equal(S3_ATTENDANCE_END_DATE, "2026-10-24");
  assert.equal(effectiveSeasonEnd(config, []), "2026-10-24");
  assert.equal(effectiveSeasonEnd({ startDate: "2026-07-20", endDate: "2026-08-02" }, []), "2026-08-02");
});

test("todaySlotPayload is afterSeason from day 98 after attendance close", () => {
  const slots = [
    { id: "97", dayIndex: 97, week: 14, date: "2026-10-24", isProgramOff: false },
    { id: "98", dayIndex: 98, week: 14, date: "2026-10-25", isProgramOff: false },
    { id: "100", dayIndex: 100, week: 15, date: "2026-10-27", isProgramOff: false },
  ];
  const onClose = todaySlotPayload(slots, {}, "2026-10-24", config);
  assert.equal(onClose.afterSeason, false);
  assert.equal(onClose.endDate, "2026-10-24");
  assert.equal(onClose.slot.dayIndex, 97);

  const afterClose = todaySlotPayload(slots, {}, "2026-10-25", config);
  assert.equal(afterClose.afterSeason, true);
  assert.equal(afterClose.slot, null);
  assert.equal(afterClose.endDate, "2026-10-24");
});

test("computeMemberStats ignores slots after attendance close", () => {
  const slots = [
    { id: "96", dayIndex: 96, week: 14, date: "2026-10-23", isProgramOff: false },
    { id: "97", dayIndex: 97, week: 14, date: "2026-10-24", isProgramOff: false },
    { id: "98", dayIndex: 98, week: 14, date: "2026-10-25", isProgramOff: false },
    { id: "100", dayIndex: 100, week: 15, date: "2026-10-27", isProgramOff: false },
  ];
  const stats = computeMemberStats({
    slots,
    attendanceMap: {
      "96": { slotId: 96, attended: true },
      "97": { slotId: 97, attended: true },
    },
    config,
    today: "2026-10-27",
  });
  assert.equal(stats.seasonDayIndex, 91);
  assert.equal(stats.seasonAttendCount, 2);
  assert.equal(stats.seasonTrainingDays, 2);
  assert.equal(stats.seasonDenom, 2);
});

test("todaySlotPayload ignores polluted dayIndex1 date for beforeSeason", () => {
  const slots = [
    { id: "1", dayIndex: 1, week: 1, date: "2026-07-27", isProgramOff: false },
    { id: "4", dayIndex: 4, week: 1, date: "2026-07-23", isProgramOff: false },
  ];
  const payload = todaySlotPayload(slots, {}, "2026-07-23", config);
  assert.equal(payload.beforeSeason, false);
  assert.equal(payload.startDate, "2026-07-20");
});

test("findTodaySlot uses dayIndex derivation when stored dates wrong", () => {
  const slots = [
    { id: "4", dayIndex: 4, week: 1, date: "2099-01-01", isProgramOff: false },
  ];
  const hit = findTodaySlot(slots, "2026-07-23", config);
  assert.ok(hit);
  assert.equal(hit.dayIndex, 4);
});

test("findTodaySlot coerces string dayIndex when stored dates wrong", () => {
  const slots = [
    { id: "4", dayIndex: "4", week: 1, date: "2099-01-01", isProgramOff: false },
  ];
  const hit = findTodaySlot(slots, "2026-07-23", config);
  assert.ok(hit);
  assert.equal(hit.dayIndex, "4");
});

test("defaultWeekForAdmin uses config when slot dates polluted", () => {
  const slots = [
    { id: "8", dayIndex: 8, week: 2, date: "2099-01-01", isProgramOff: false },
  ];
  assert.equal(defaultWeekForAdmin(config, slots, "2026-07-27"), 2);
});

test("slotWriteFieldsFromRow keeps date off existing docs", () => {
  const patch = slotWriteFieldsFromRow({
    existing: { dayIndex: 1, date: "2026-07-20", week: 1 },
    dayIndex: 1,
    week: 1,
    row: { trainingTitle: "X", trainingContent: "Y", isProgramOff: false, date: "2026-07-27" },
    config: { startDate: "2026-07-20" },
    slots: [],
  });
  assert.equal(patch.date, undefined);
  assert.equal(patch.trainingTitle, "X");
});

test("slotWriteFieldsFromRow derives date for new slots", () => {
  const patch = slotWriteFieldsFromRow({
    existing: null,
    dayIndex: 1,
    week: 1,
    row: { trainingTitle: "X", trainingContent: "", isProgramOff: false, date: "2099-01-01" },
    config: { startDate: "2026-07-20" },
    slots: [],
  });
  assert.equal(patch.date, "2026-07-20");
  assert.equal(patch.week, 1);
});

test("correctImportRow fixes polluted season date", () => {
  const { row, warnings } = correctImportRow(
    {
      dayIndex: 1,
      date: "2026-07-27",
      week: 1,
      trainingTitle: "x",
      trainingContent: "",
      isProgramOff: false,
    },
    { startDate: "2026-07-20" },
  );
  assert.equal(row.date, "2026-07-20");
  assert.equal(row.week, 1);
  assert.equal(warnings.length, 1);
  assert.deepEqual(warnings[0], {
    dayIndex: 1,
    field: "date",
    from: "2026-07-27",
    to: "2026-07-20",
  });
});

test("correctImportRow fixes polluted season week", () => {
  const { row, warnings } = correctImportRow(
    {
      dayIndex: 8,
      date: "2026-07-27",
      week: 1,
      trainingTitle: "x",
      trainingContent: "",
      isProgramOff: false,
    },
    { startDate: "2026-07-20" },
  );
  assert.equal(row.date, "2026-07-27");
  assert.equal(row.week, 2);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].field, "week");
  assert.equal(warnings[0].to, 2);
});

test("polluted stored dates still count attendance inside the derived window", () => {
  const slots = [
    { id: "90", dayIndex: 90, week: 1, date: "2099-01-01", isProgramOff: false },
  ];
  const stats = computeMemberStats({
    slots,
    attendanceMap: { "90": { slotId: 90, attended: true } },
    config,
    today: "2026-11-03",
  });
  assert.equal(deriveSeasonDate(config, 90), "2026-10-17");
  assert.equal(stats.seasonAttendCount, 1);
  assert.equal(stats.seasonTrainingDays, 1);
  assert.equal(stats.seasonDayIndex, 91);
  assert.equal(stats.programStartDate, "2026-07-26");
  assert.equal(stats.attendanceClosed, true);
  assert.equal(stats.attendanceEndDate, "2026-10-24");
});

test("days after attendance close are 마감, not 미출석, and do not fail the week", () => {
  const slots = [96, 97, 98, 99, 100].map((dayIndex) => ({
    id: String(dayIndex),
    dayIndex,
    week: dayIndex === 100 ? 1 : 14,
    date: "2099-01-01",
    isProgramOff: false,
  }));
  const stats = computeMemberStats({
    slots,
    attendanceMap: {
      "96": { slotId: 96, attended: true },
      "97": { slotId: 97, attended: true },
    },
    config,
    today: "2026-11-03",
  });
  assert.equal(stats.seasonAttendCount, 2);
  assert.equal(stats.seasonTrainingDays, 2);
  const week14 = stats.seasonWeekSummaries.find((w) => w.week === 14);
  assert.ok(week14);
  assert.equal(week14.attendCount, 2);
  assert.equal(week14.target, 2);
  assert.equal(week14.met, true);
  assert.equal(stats.seasonWeekSummaries.some((w) => w.week === 15), false);

  assert.equal(slotStatus(
    { dayIndex: 98, date: "2026-10-25", isProgramOff: false },
    {},
    "2026-11-03",
    S3_ATTENDANCE_END_DATE,
  ), "closed");

  const weeks = buildTimelineWeeks(slots, {
    "98": { slotId: 98, attended: true, photoUrls: ["https://example.com/race.jpg"] },
  }, config, "2026-11-03");
  const flat = weeks.flatMap((w) => w.slots);
  const day97 = flat.find((s) => s.dayIndex === 97);
  const day98 = flat.find((s) => s.dayIndex === 98);
  const day100 = flat.find((s) => s.dayIndex === 100);
  assert.equal(day97.status, "miss");
  assert.equal(day98.status, "closed");
  assert.equal(day98.photoUrls[0], "https://example.com/race.jpg");
  assert.equal(day100.status, "closed");
  assert.equal(weeks.find((w) => w.week === 15).attendSummary, "집계 제외");
});

test("2026-11-05에도 베타 주차 뒤에 있어도 시즌 전체 주차가 보인다", () => {
  const slots = [];
  for (let dayIndex = 1; dayIndex <= 100; dayIndex += 1) {
    slots.push({
      id: String(dayIndex),
      dayIndex,
      week: Math.ceil(dayIndex / 7),
      date: "2099-01-01",
      isProgramOff: false,
    });
  }
  for (let offset = 0; offset < 7; offset += 1) {
    const dayIndex = 901 + offset;
    slots.push({
      id: String(dayIndex),
      dayIndex,
      week: 0,
      date: "2026-07-13",
      isProgramOff: false,
    });
  }
  const today = "2026-11-05";
  const weeks = buildTimelineWeeks(slots, {
    "20": { slotId: 20, attended: true },
  }, config, today);
  const weekNums = weeks.map((w) => w.week).sort((a, b) => a - b);
  assert.deepEqual(weekNums, Array.from({ length: 15 }, (_, i) => i + 1));
  const day20 = weeks.flatMap((w) => w.slots).find((s) => s.dayIndex === 20);
  assert.equal(day20.status, "attend");
  assert.equal(day20.date >= "2026-07-26" && day20.date <= "2026-10-24", true);
});

test("formatIsoRange accepts Firestore Timestamp dates", () => {
  const ts = { toDate() { return new Date("2026-07-20T00:00:00.000Z"); } };
  assert.equal(formatIsoRange(ts, "2026-07-26"), "7/20 ~ 7/26");
});

test("buildTimelineWeeks keeps photos when slot.date is a Timestamp", () => {
  const slots = [{
    id: "1",
    dayIndex: 1,
    week: 9,
    date: { toDate() { return new Date("2099-01-01T00:00:00.000Z"); } },
    isProgramOff: false,
  }];
  const weeks = buildTimelineWeeks(slots, {
    "1": { slotId: 1, attended: true, photoUrl: "https://dmc-attendance.appspot.com/photo.jpg" },
  }, config, "2026-07-20");
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].week, 1);
  assert.equal(weeks[0].slots[0].status, "preseason");
  assert.equal(weeks[0].attendSummary, "집계 제외");
  assert.equal(
    weeks[0].slots[0].photoUrls[0],
    "https://dmc-attendance.firebasestorage.app/photo.jpg",
  );
});

test("canonicalChunbaekPhotoUrl rewrites the legacy appspot bucket", () => {
  assert.equal(
    canonicalChunbaekPhotoUrl("https://firebasestorage.googleapis.com/v0/b/dmc-attendance.appspot.com/o/a.jpg?alt=media&token=t"),
    "https://firebasestorage.googleapis.com/v0/b/dmc-attendance.firebasestorage.app/o/a.jpg?alt=media&token=t",
  );
  assert.equal(canonicalChunbaekPhotoUrl(""), "");
});

test("correctImportRow fixes beta date and forces week 0", () => {
  const { row, warnings } = correctImportRow(
    {
      dayIndex: 901,
      date: "2099-01-01",
      week: 3,
      trainingTitle: "beta",
      trainingContent: "",
      isProgramOff: false,
    },
    config,
  );
  assert.equal(row.date, "2026-07-13");
  assert.equal(row.week, 0);
  assert.ok(warnings.some((w) => w.field === "date"));
  assert.ok(warnings.some((w) => w.field === "week" && w.to === 0));
});
