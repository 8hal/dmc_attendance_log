const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  SHELL_TABS,
  parseShellHash,
  isActiveSessionMatch,
} = require(path.join(__dirname, "../../assets/attendance-shell-router.js"));

describe("attendance-shell-router", () => {
  it("SHELL_TABS lists the four shell tabs", () => {
    assert.deepEqual(SHELL_TABS, ["today", "my-attendance", "team-attendance", "more"]);
  });

  it("parseShellHash accepts known tabs", () => {
    assert.equal(parseShellHash("#today"), "today");
    assert.equal(parseShellHash("#my-attendance"), "my-attendance");
    assert.equal(parseShellHash("#team-attendance"), "team-attendance");
    assert.equal(parseShellHash("#more"), "more");
  });

  it("parseShellHash falls back to today for empty or unknown", () => {
    assert.equal(parseShellHash(""), "today");
    assert.equal(parseShellHash("#"), "today");
    assert.equal(parseShellHash("#nope"), "today");
    assert.equal(parseShellHash(null), "today");
  });

  it("isActiveSessionMatch compares dateKey and meetingType", () => {
    assert.equal(
      isActiveSessionMatch(
        { dateKey: "2026/07/11", meetingType: "SAT" },
        { dateKey: "2026/07/11", meetingType: "SAT" }
      ),
      true
    );
    assert.equal(
      isActiveSessionMatch(
        { dateKey: "2026/07/11", meetingType: "SAT" },
        { dateKey: "2026/07/14", meetingType: "TUE" }
      ),
      false
    );
    assert.equal(
      isActiveSessionMatch(
        { meetingDate: "2026-07-11", meetingType: "sat" },
        { dateKey: "2026/07/11", meetingType: "SAT" }
      ),
      true
    );
  });
});
