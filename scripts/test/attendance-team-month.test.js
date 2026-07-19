const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  listRegularMeetingDateKeys,
  isRegularMeetingType,
  aggregateTeamMonth,
} = require(path.join(__dirname, "../../assets/attendance-team-month.js"));

describe("attendance-team-month", () => {
  it("listRegularMeetingDateKeys returns Tue/Thu/Sat only", () => {
    const keys = listRegularMeetingDateKeys("2026-07");
    assert.ok(keys.length > 0);
    keys.forEach((dk) => {
      const [y, m, d] = dk.split("/").map(Number);
      const wd = new Date(y, m - 1, d).getDay();
      assert.ok([2, 4, 6].includes(wd), dk + " weekday " + wd);
    });
    assert.equal(keys[0], "2026/07/02"); // Thu
  });

  it("isRegularMeetingType excludes ETC", () => {
    assert.equal(isRegularMeetingType("TUE"), true);
    assert.equal(isRegularMeetingType("etc"), false);
  });

  it("aggregateTeamMonth computes attended/roster rate", () => {
    const members = [
      { id: "a", nickname: "알파", team: "1" },
      { id: "b", nickname: "베타", team: "1" },
      { id: "c", nickname: "감마", team: "2" },
    ];
    const statusByDate = {
      "2026/07/02": [
        { nickname: "알파", memberId: "a", meetingType: "THU" },
        { nickname: "게스트", isGuest: true, meetingType: "THU" },
      ],
      "2026/07/04": [{ nickname: "알파", memberId: "a", meetingType: "SAT" }],
      "2026/07/07": [{ nickname: "감마", memberId: "c", meetingType: "TUE" }],
    };
    const team1 = aggregateTeamMonth({
      monthKey: "2026-07",
      members,
      statusByDate,
      teamFilter: "1",
    });
    assert.equal(team1.roster, 2);
    assert.equal(team1.attended, 1);
    assert.equal(team1.rate, 50);
    assert.equal(team1.rows[0].nickname, "알파");
    assert.equal(team1.rows[0].count, 2);

    const all = aggregateTeamMonth({
      monthKey: "2026-07",
      members,
      statusByDate,
      teamFilter: "ALL",
    });
    assert.equal(all.roster, 3);
    assert.equal(all.attended, 2);
    assert.equal(all.rate, 67);
  });
});
