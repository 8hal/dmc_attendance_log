const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  readSavedIdentity,
  matchInList,
  syncNicknames,
  LS_ATT,
  LS_BOARDING,
  LS_BIB,
} = require(path.join(__dirname, "../../assets/event-member-profile.js"));

function storage(map) {
  const store = { ...map };
  return {
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    setItem(k, v) {
      store[k] = v;
    },
    _store: store,
  };
}

describe("event-member-profile", () => {
  it("prefers dmc_attendance_v2_profile nickname and memberId", () => {
    const id = readSavedIdentity(
      storage({
        dmc_attendance_v2_profile: JSON.stringify({
          nickname: "알파",
          memberId: "m1",
          team: "T1",
        }),
        marathon_att_nickname: "베타",
      })
    );
    assert.deepEqual(id, { nickname: "알파", memberId: "m1" });
  });

  it("falls back to marathon_att_nickname", () => {
    const id = readSavedIdentity(storage({ marathon_att_nickname: "베타" }));
    assert.equal(id.nickname, "베타");
    assert.equal(id.memberId, null);
  });

  it("falls back to boarding then bib keys", () => {
    const id = readSavedIdentity(
      storage({ dmc_boarding_nickname: "감마", dmc_bib_nickname: "델타" })
    );
    assert.equal(id.nickname, "감마");
  });

  it("matchInList matches memberId then nickname (case-insensitive)", () => {
    const list = [
      { nickname: "알파", memberId: "m1" },
      { nickname: "게스트", memberId: null },
    ];
    assert.equal(matchInList(list, { nickname: "x", memberId: "m1" }).nickname, "알파");
    assert.equal(matchInList(list, { nickname: "게스트", memberId: null }).nickname, "게스트");
    assert.equal(matchInList(list, { nickname: "없음", memberId: null }), null);
  });

  it("matchInList coerces memberId to string", () => {
    const list = [{ nickname: "알파", memberId: "42" }];
    assert.equal(matchInList(list, { nickname: "x", memberId: 42 }).nickname, "알파");
  });

  it("syncNicknames writes ATT, BOARDING, BIB, and profile nickname", () => {
    const ls = storage({
      dmc_attendance_v2_profile: JSON.stringify({
        nickname: "옛닉",
        memberId: "m1",
      }),
    });
    syncNicknames(ls, "알파");
    assert.equal(ls._store[LS_ATT], "알파");
    assert.equal(ls._store[LS_BOARDING], "알파");
    assert.equal(ls._store[LS_BIB], "알파");
    assert.equal(JSON.parse(ls._store.dmc_attendance_v2_profile).nickname, "알파");
    assert.equal(JSON.parse(ls._store.dmc_attendance_v2_profile).memberId, "m1");
  });
});
