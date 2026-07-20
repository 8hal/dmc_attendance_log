const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  sortTeamMemberAttendanceEntries,
  formatTeamFeedDayLabel,
} = require(path.join(__dirname, "../../functions/lib/chunbaek-stats.js"));

describe("sortTeamMemberAttendanceEntries", () => {
  it("orders by date desc so season day1 is above beta day1", () => {
    const sorted = sortTeamMemberAttendanceEntries([
      {
        slotId: 901,
        displayDayIndex: 1,
        date: "2026-07-13",
        week: 0,
        title: "베타",
      },
      {
        slotId: 1,
        displayDayIndex: 1,
        date: "2026-07-20",
        week: 1,
        title: "본시즌",
      },
      {
        slotId: 902,
        displayDayIndex: 2,
        date: "2026-07-14",
        week: 0,
        title: "베타2",
      },
    ]);
    assert.deepEqual(
      sorted.map((e) => e.date),
      ["2026-07-20", "2026-07-14", "2026-07-13"]
    );
  });

  it("does not interleave by displayDayIndex alone", () => {
    const sorted = sortTeamMemberAttendanceEntries([
      { slotId: 1, displayDayIndex: 1, date: "2026-07-20", week: 1 },
      { slotId: 901, displayDayIndex: 1, date: "2026-07-13", week: 0 },
    ]);
    assert.equal(sorted[0].slotId, 1);
    assert.equal(sorted[1].slotId, 901);
  });
});

describe("formatTeamFeedDayLabel", () => {
  it("prefixes beta week entries", () => {
    assert.equal(
      formatTeamFeedDayLabel({
        displayDayIndex: 1,
        slotId: 901,
        week: 0,
      }),
      "베타 1일차"
    );
  });

  it("uses plain day label for season entries", () => {
    assert.equal(
      formatTeamFeedDayLabel({
        displayDayIndex: 1,
        slotId: 1,
        week: 1,
      }),
      "1일차"
    );
  });
});
