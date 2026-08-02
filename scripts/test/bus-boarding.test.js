"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  rideTypeToLegRequired,
  parseRideTypeLabel,
  mergeRosterImport,
  toPublicRoster,
  findRosterIndexByNickname,
  applySelfBoard,
  applyAdminBoard,
  emptyBusBoarding,
} = require(path.join(__dirname, "../../functions/lib/bus-boarding.js"));

describe("rideTypeToLegRequired", () => {
  it("roundtrip → both required", () => {
    assert.deepEqual(rideTypeToLegRequired("roundtrip"), {
      outbound: true,
      return: true,
    });
  });
  it("outbound_only", () => {
    assert.deepEqual(rideTypeToLegRequired("outbound_only"), {
      outbound: true,
      return: false,
    });
  });
  it("return_only", () => {
    assert.deepEqual(rideTypeToLegRequired("return_only"), {
      outbound: false,
      return: true,
    });
  });
});

describe("parseRideTypeLabel", () => {
  it("왕복", () => assert.equal(parseRideTypeLabel("왕복"), "roundtrip"));
  it("동탄->철원(편도)", () =>
    assert.equal(parseRideTypeLabel("동탄->철원(편도)"), "outbound_only"));
  it("철원->동탄(편도)", () =>
    assert.equal(parseRideTypeLabel("철원->동탄(편도)"), "return_only"));
  it("개별 이동", () => assert.equal(parseRideTypeLabel("개별 이동"), "excluded"));
});

describe("mergeRosterImport", () => {
  it("keeps boarded when nickname matches", () => {
    const existing = [
      {
        rosterId: "r1",
        nickname: "라우펜더만",
        realName: "이원기",
        rideType: "roundtrip",
        isGuest: false,
        memberId: "m1",
        note: "old",
        legs: {
          outbound: { required: true, boarded: true, boardedAt: "t", boardedBy: "self" },
          return: { required: true, boarded: false, boardedAt: null, boardedBy: null },
        },
      },
    ];
    const { roster, report } = mergeRosterImport(existing, [
      { nickname: "라우펜더만", realName: "이원기", rideTypeLabel: "왕복", note: "new note" },
    ], { memberIdByNickname: new Map([["라우펜더만", "m1"]]) });
    assert.equal(roster.length, 1);
    assert.equal(roster[0].legs.outbound.boarded, true);
    assert.equal(roster[0].note, "new note");
    assert.equal(report.merged, 1);
  });

  it("does not delete rows missing from CSV", () => {
    const existing = [
      {
        rosterId: "keep",
        nickname: "기존",
        realName: "김기존",
        rideType: "roundtrip",
        isGuest: true,
        memberId: null,
        note: null,
        legs: {
          outbound: { required: true, boarded: false, boardedAt: null, boardedBy: null },
          return: { required: true, boarded: false, boardedAt: null, boardedBy: null },
        },
      },
    ];
    const { roster } = mergeRosterImport(existing, [
      { nickname: "신규", realName: "박신규", rideTypeLabel: "왕복", note: null },
    ], { memberIdByNickname: new Map() });
    assert.equal(roster.length, 2);
    assert.ok(roster.some((r) => r.nickname === "기존"));
  });

  it("skips 개별 이동", () => {
    const { roster, report } = mergeRosterImport([], [
      { nickname: "혼자", realName: "김혼자", rideTypeLabel: "개별 이동", note: null },
    ], { memberIdByNickname: new Map() });
    assert.equal(roster.length, 0);
    assert.equal(report.excluded, 1);
  });

  it("duplicate nicknames in one CSV → errors, no silent last-wins", () => {
    const { roster, report } = mergeRosterImport([], [
      { nickname: "동일", realName: "김일", rideTypeLabel: "왕복", note: null },
      { nickname: "동일", realName: "김이", rideTypeLabel: "왕복", note: null },
    ], { memberIdByNickname: new Map() });
    assert.equal(roster.length, 0);
    assert.ok(report.errors.length >= 1);
    assert.equal(report.added || 0, 0);
  });

  it("unmapped rideTypeLabel → errors", () => {
    const { roster, report } = mergeRosterImport([], [
      { nickname: "괴상", realName: "이괴상", rideTypeLabel: "헬기이동", note: null },
    ], { memberIdByNickname: new Map() });
    assert.equal(roster.length, 0);
    assert.ok(report.errors.some((e) => /헬기|rideType|매핑/i.test(String(e.reason || e))));
  });
});

describe("toPublicRoster", () => {
  it("strips note", () => {
    const pub = toPublicRoster([
      { nickname: "a", note: "secret", legs: {} },
    ]);
    assert.equal(pub[0].note, undefined);
    assert.ok(!("note" in pub[0]) || pub[0].note == null);
  });
});

describe("applySelfBoard", () => {
  it("idempotent when already boarded", () => {
    const row = {
      nickname: "a",
      legs: {
        outbound: { required: true, boarded: true, boardedAt: "t", boardedBy: "self" },
        return: { required: true, boarded: false, boardedAt: null, boardedBy: null },
      },
    };
    const r = applySelfBoard(row, "outbound", "2026-08-02T00:00:00.000Z");
    assert.equal(r.ok, true);
    assert.equal(r.already, true);
  });
  it("rejects when not required", () => {
    const row = {
      nickname: "a",
      legs: {
        outbound: { required: false, boarded: false, boardedAt: null, boardedBy: null },
        return: { required: true, boarded: false, boardedAt: null, boardedBy: null },
      },
    };
    const r = applySelfBoard(row, "outbound", "2026-08-02T00:00:00.000Z");
    assert.equal(r.ok, false);
  });
});
