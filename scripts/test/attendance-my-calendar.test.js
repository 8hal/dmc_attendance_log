const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  buildMyAttendCalendarCells,
  attendedDateKeySet,
  isProfileCheckedInSession,
} = require(path.join(__dirname, "../../assets/attendance-my-calendar.js"));

describe("attendance-my-calendar helpers", () => {
  it("builds Sunday-start cells with attend and today flags", () => {
    // 2026-07: July 1 is Wednesday → pad 3
    const cells = buildMyAttendCalendarCells({
      monthKey: "2026-07",
      attendedDateKeys: ["2026/07/07", "2026/07/18"],
      todayKey: "2026/07/19",
    });
    assert.equal(cells.filter((c) => c.kind === "pad").length, 3);
    const d7 = cells.find((c) => c.day === 7);
    assert.equal(d7.attend, true);
    assert.equal(d7.dateKey, "2026/07/07");
    const d19 = cells.find((c) => c.day === 19);
    assert.equal(d19.today, true);
    assert.equal(d19.attend, false);
    const d18 = cells.find((c) => c.day === 18);
    assert.equal(d18.attend, true);
  });

  it("attendedDateKeySet collects unique meetingDate keys", () => {
    const set = attendedDateKeySet([
      { meetingDate: "2026/07/18" },
      { meetingDate: "2026/07/18" },
      { meetingDate: "2026/07/14" },
      { meetingDate: "" },
    ]);
    assert.equal(set.size, 2);
    assert.equal(set.has("2026/07/18"), true);
    assert.equal(set.has("2026/07/14"), true);
  });

  it("isProfileCheckedInSession matches memberId or nickname in filtered rows", () => {
    const items = [
      { nickname: "게살볶음밥", memberId: "mem_001", meetingType: "SAT" },
      { nickname: "다른사람", memberId: "mem_002", meetingType: "SAT" },
    ];
    assert.equal(
      isProfileCheckedInSession(items, "SAT", { memberId: "mem_001", nickname: "x" }),
      true
    );
    assert.equal(
      isProfileCheckedInSession(items, "SAT", { memberId: "", nickname: "게살볶음밥" }),
      true
    );
    assert.equal(
      isProfileCheckedInSession(items, "TUE", { memberId: "mem_001", nickname: "게살볶음밥" }),
      false
    );
    assert.equal(isProfileCheckedInSession(items, "SAT", null), false);
  });
});
