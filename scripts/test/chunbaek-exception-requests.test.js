"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  validateExceptionRequestInput,
  trainingSlotsInDateRange,
  previewExceptionApplication,
  slotsEligibleForSelfClear,
  formatRequestExceptionNote,
  EXCEPTION_REASON_MAX,
  EXCEPTION_MAX_SPAN_DAYS,
  EXCEPTION_LOOKBACK_DAYS,
} = require(path.join(__dirname, "../../functions/lib/chunbaek-exception-requests.js"));

const slots = [
  { id: "901", dayIndex: 901, date: "2026-07-13", week: 0, isProgramOff: false },
  { id: "902", dayIndex: 902, date: "2026-07-14", week: 0, isProgramOff: false },
  { id: "1", dayIndex: 1, date: "2026-07-20", week: 1, isProgramOff: false },
  { id: "2", dayIndex: 2, date: "2026-07-21", week: 1, isProgramOff: true },
  { id: "3", dayIndex: 3, date: "2026-07-22", week: 1, isProgramOff: false },
];

describe("validateExceptionRequestInput", () => {
  const today = "2026-07-20";
  const seasonEnd = "2026-10-27";

  it("accepts valid 7-day lookback request", () => {
    const r = validateExceptionRequestInput({
      reason: "발목 부상",
      startDate: "2026-07-14",
      endDate: "2026-07-18",
      todayKst: today,
      seasonEndDate: seasonEnd,
    });
    assert.equal(r.ok, true);
  });

  it("rejects start before rolling 7-day window", () => {
    const r = validateExceptionRequestInput({
      reason: "휴가",
      startDate: "2026-07-12",
      endDate: "2026-07-15",
      todayKst: today,
      seasonEndDate: seasonEnd,
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /lookback/i);
  });

  it("rejects span over 14 calendar days", () => {
    const r = validateExceptionRequestInput({
      reason: "휴가",
      startDate: "2026-07-20",
      endDate: "2026-08-04", // diff 15
      todayKst: today,
      seasonEndDate: seasonEnd,
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /14/);
  });

  it("allows exactly 14 calendar day span", () => {
    const r = validateExceptionRequestInput({
      reason: "휴가",
      startDate: "2026-07-20",
      endDate: "2026-08-03", // diff 14
      todayKst: today,
      seasonEndDate: seasonEnd,
    });
    assert.equal(r.ok, true);
  });

  it("rejects empty reason", () => {
    const r = validateExceptionRequestInput({
      reason: "  ",
      startDate: "2026-07-20",
      endDate: "2026-07-22",
      todayKst: today,
      seasonEndDate: seasonEnd,
    });
    assert.equal(r.ok, false);
  });
});

describe("trainingSlotsInDateRange", () => {
  it("includes beta and season training days, skips program off", () => {
    const list = trainingSlotsInDateRange({
      slots,
      config: {},
      startDate: "2026-07-13",
      endDate: "2026-07-22",
    });
    assert.deepEqual(
      list.map((s) => s.dayIndex),
      [901, 902, 1, 3],
    );
  });
});

describe("previewExceptionApplication", () => {
  it("skips attended slots, lists applicable", () => {
    const attendanceMap = {
      901: { slotId: 901, attended: true, exception: false },
      902: { slotId: 902, attended: false, exception: false },
    };
    const preview = previewExceptionApplication({
      slots,
      attendanceMap,
      config: {},
      startDate: "2026-07-13",
      endDate: "2026-07-14",
    });
    assert.deepEqual(preview.skippedSlotIds, [901]);
    assert.deepEqual(preview.applicableSlotIds, [902]);
  });

  it("no-op for already exception slots", () => {
    const attendanceMap = {
      902: { slotId: 902, attended: false, exception: true },
    };
    const preview = previewExceptionApplication({
      slots,
      attendanceMap,
      config: {},
      startDate: "2026-07-14",
      endDate: "2026-07-14",
    });
    assert.deepEqual(preview.applicableSlotIds, []);
    assert.deepEqual(preview.skippedSlotIds, []);
  });
});

describe("slotsEligibleForSelfClear", () => {
  it("returns today+ future exception training slots only", () => {
    const attendanceMap = {
      901: { slotId: 901, attended: false, exception: true },
      1: { slotId: 1, attended: false, exception: true },
      3: { slotId: 3, attended: false, exception: true },
    };
    const list = slotsEligibleForSelfClear({
      slots,
      attendanceMap,
      config: {},
      todayKst: "2026-07-20",
    });
    assert.deepEqual(list.map((s) => s.dayIndex), [1, 3]);
  });
});

describe("formatRequestExceptionNote", () => {
  it("prefixes reason for audit", () => {
    assert.equal(formatRequestExceptionNote("발목"), "[상신] 발목");
  });
});
