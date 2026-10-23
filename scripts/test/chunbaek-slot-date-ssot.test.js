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
  assert.equal(stats.seasonDayIndex, 97);
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
