const test = require("node:test");
const assert = require("node:assert/strict");
const {
  deriveSeasonDate,
  deriveSeasonWeek,
  deriveSlotDate,
  effectiveSeasonStart,
  effectiveSeasonEnd,
} = require("../../functions/lib/chunbaek-stats");

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
  assert.equal(effectiveSeasonEnd(config, []), "2026-10-27");
});

// todaySlotPayload pollution fix is Task 2 — skipped here
test.skip("todaySlotPayload ignores polluted dayIndex1 date for beforeSeason", () => {});
