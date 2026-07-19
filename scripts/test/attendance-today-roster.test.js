const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  filterStatusByMeetingType,
  sortSessionRosterNewestFirst,
  avatarCharFromNickname,
} = require(path.join(__dirname, "../../assets/attendance-today-roster.js"));

describe("attendance-today-roster helpers", () => {
  it("filters status items by meetingType (case-insensitive)", () => {
    const items = [
      { nickname: "A", meetingType: "SAT", ts: 1 },
      { nickname: "B", meetingType: "TUE", ts: 2 },
      { nickname: "C", meetingType: "sat", ts: 3 },
    ];
    const filtered = filterStatusByMeetingType(items, "SAT");
    assert.deepEqual(
      filtered.map((x) => x.nickname),
      ["A", "C"]
    );
    assert.deepEqual(filterStatusByMeetingType(items, ""), []);
    assert.deepEqual(filterStatusByMeetingType(null, "SAT"), []);
  });

  it("sorts newest first by ts", () => {
    const items = [
      { nickname: "old", ts: 10 },
      { nickname: "new", ts: 30 },
      { nickname: "mid", ts: 20 },
    ];
    assert.deepEqual(
      sortSessionRosterNewestFirst(items).map((x) => x.nickname),
      ["new", "mid", "old"]
    );
  });

  it("avatarCharFromNickname uses first character", () => {
    assert.equal(avatarCharFromNickname("게살볶음밥"), "게");
    assert.equal(avatarCharFromNickname(""), "?");
    assert.equal(avatarCharFromNickname(null), "?");
  });
});
