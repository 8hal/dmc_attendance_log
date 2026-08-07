const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  kstTodayYmd,
  filterUpcomingGroupEvents,
} = require(path.join(__dirname, "../../assets/event-upcoming.js"));

describe("event-upcoming", () => {
  it("kstTodayYmd returns YYYY-MM-DD for a fixed Instant", () => {
    // 2026-08-05 15:00 UTC = 2026-08-06 00:00 KST
    assert.equal(kstTodayYmd(new Date("2026-08-05T15:00:00.000Z")), "2026-08-06");
  });

  it("filterUpcomingGroupEvents keeps eventDate >= today and sorts ascending", () => {
    const rows = [
      { id: "past", isGroupEvent: true, eventDate: "2026-08-01", eventName: "P" },
      { id: "b", isGroupEvent: true, eventDate: "2026-08-10", primaryName: "B" },
      { id: "a", isGroupEvent: true, eventDate: "2026-08-05", eventName: "A" },
      { id: "ng", isGroupEvent: false, eventDate: "2026-08-20", eventName: "X" },
    ];
    const out = filterUpcomingGroupEvents(rows, "2026-08-05");
    assert.deepEqual(
      out.map((e) => e.id),
      ["a", "b"]
    );
  });

  it("filterUpcomingGroupEvents defaults today via kstTodayYmd when omitted", () => {
    const today = kstTodayYmd();
    const out = filterUpcomingGroupEvents([
      { id: "t", isGroupEvent: true, eventDate: today, eventName: "T" },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, "t");
  });

  it("filterUpcomingGroupEvents maps displayName from eventName || primaryName", () => {
    const out = filterUpcomingGroupEvents(
      [{ id: "1", isGroupEvent: true, eventDate: "2026-08-05", primaryName: "OnlyPrimary" }],
      "2026-08-05"
    );
    assert.equal(out[0].displayName, "OnlyPrimary");
  });
});
