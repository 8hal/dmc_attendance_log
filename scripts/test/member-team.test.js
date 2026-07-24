const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  MEMBER_TEAM_CODES,
  normalizeMemberTeam,
  parseMemberTeamUpdate,
  shouldBackfillMemberTeam,
  teamForNewProfile,
} = require(path.join(__dirname, "../../functions/lib/member-team"));

describe("member-team", () => {
  it("MEMBER_TEAM_CODES lists S and T1–T5 only (no GUEST)", () => {
    assert.deepEqual([...MEMBER_TEAM_CODES].sort(), ["S", "T1", "T2", "T3", "T4", "T5"].sort());
    assert.equal(MEMBER_TEAM_CODES.has("GUEST"), false);
  });

  it("normalizeMemberTeam uppercases and trims valid codes", () => {
    assert.equal(normalizeMemberTeam(" t1 "), "T1");
    assert.equal(normalizeMemberTeam("S"), "S");
  });

  it("normalizeMemberTeam returns empty for blank/invalid/GUEST", () => {
    assert.equal(normalizeMemberTeam(""), "");
    assert.equal(normalizeMemberTeam(null), "");
    assert.equal(normalizeMemberTeam("GUEST"), "");
    assert.equal(normalizeMemberTeam("X9"), "");
  });

  it("parseMemberTeamUpdate accepts valid team and empty clear", () => {
    assert.deepEqual(parseMemberTeamUpdate("T3"), { ok: true, team: "T3" });
    assert.deepEqual(parseMemberTeamUpdate(""), { ok: true, team: "" });
    assert.deepEqual(parseMemberTeamUpdate("  "), { ok: true, team: "" });
  });

  it("parseMemberTeamUpdate rejects invalid and GUEST", () => {
    assert.equal(parseMemberTeamUpdate("GUEST").ok, false);
    assert.equal(parseMemberTeamUpdate("ZZ").ok, false);
  });

  it("shouldBackfillMemberTeam only when stored empty and checkin is member team", () => {
    assert.equal(shouldBackfillMemberTeam("", "T2"), true);
    assert.equal(shouldBackfillMemberTeam(null, "S"), true);
    assert.equal(shouldBackfillMemberTeam("T1", "T2"), false);
    assert.equal(shouldBackfillMemberTeam("", "GUEST"), false);
    assert.equal(shouldBackfillMemberTeam("", ""), false);
  });

  it("teamForNewProfile returns null when roster team missing (no silent S)", () => {
    assert.equal(teamForNewProfile(""), null);
    assert.equal(teamForNewProfile(null), null);
    assert.equal(teamForNewProfile("T4"), "T4");
    assert.equal(teamForNewProfile("s"), "S");
  });
});
