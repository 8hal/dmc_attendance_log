const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  resolveDefaultMeeting,
  isActiveSessionMatch,
  assertSelfDeleteAllowed,
  normalizeMeetingDateKey,
  meetingTypeForDateKey,
} = require(path.join(__dirname, "../../functions/lib/attendance-active-session.js"));

describe("resolveDefaultMeeting", () => {
  it("Monday → SAT two days earlier", () => {
    const r = resolveDefaultMeeting(new Date("2026-07-13T12:00:00+09:00"));
    assert.equal(r.meetingType, "SAT");
    assert.equal(r.dateKey, "2026/07/11");
  });

  it("Friday → THU one day earlier", () => {
    const r = resolveDefaultMeeting(new Date("2026-07-17T12:00:00+09:00"));
    assert.equal(r.meetingType, "THU");
    assert.equal(r.dateKey, "2026/07/16");
  });
});

describe("meetingTypeForDateKey", () => {
  it("maps Tue/Thu/Sat to meeting types; other days to ETC", () => {
    assert.equal(meetingTypeForDateKey("2026/07/14"), "TUE");
    assert.equal(meetingTypeForDateKey("2026/07/16"), "THU");
    assert.equal(meetingTypeForDateKey("2026/07/18"), "SAT");
    assert.equal(meetingTypeForDateKey("2026-07-15"), "ETC"); // Wed
    assert.equal(meetingTypeForDateKey("2026/07/19"), "ETC"); // Sun
    assert.equal(meetingTypeForDateKey(""), "ETC");
  });
});

describe("isActiveSessionMatch", () => {
  it("matches dateKey and meetingType case-insensitively", () => {
    assert.equal(
      isActiveSessionMatch(
        { dateKey: "2026/07/11", meetingType: "sat" },
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
  });
});

describe("assertSelfDeleteAllowed", () => {
  const active = { dateKey: "2026/07/11", meetingType: "SAT" };

  it("rejects missing memberId", () => {
    const err = assertSelfDeleteAllowed(
      { memberId: "", meetingDate: "2026/07/11", meetingType: "SAT" },
      active
    );
    assert.equal(err, "MEMBER_ID_REQUIRED");
  });

  it("rejects non-active session", () => {
    const err = assertSelfDeleteAllowed(
      { memberId: "m1", meetingDate: "2026/07/03", meetingType: "TUE" },
      active
    );
    assert.equal(err, "NOT_ACTIVE_SESSION");
  });

  it("allows active session with memberId", () => {
    const err = assertSelfDeleteAllowed(
      { memberId: "m1", meetingDate: "2026/07/11", meetingType: "SAT" },
      active
    );
    assert.equal(err, null);
  });
});

describe("normalizeMeetingDateKey", () => {
  it("accepts slash and dash forms", () => {
    assert.equal(normalizeMeetingDateKey("2026/07/16"), "2026/07/16");
    assert.equal(normalizeMeetingDateKey("2026-07-16"), "2026/07/16");
    assert.equal(normalizeMeetingDateKey("bad"), "");
  });
});
