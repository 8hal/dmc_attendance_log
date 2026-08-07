const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  normalizeTargetTime,
  applyBibParticipantPatch,
} = require(path.join(__dirname, "../../functions/lib/target-time.js"));

describe("normalizeTargetTime", () => {
  it("empty → null", () => {
    assert.deepEqual(normalizeTargetTime(""), { ok: true, value: null });
    assert.deepEqual(normalizeTargetTime(null), { ok: true, value: null });
  });

  it("accepts H:MM:SS and MM:SS", () => {
    assert.deepEqual(normalizeTargetTime("1:45:00"), { ok: true, value: "1:45:00" });
    assert.deepEqual(normalizeTargetTime("55:30"), { ok: true, value: "55:30" });
  });

  it("rejects garbage", () => {
    assert.equal(normalizeTargetTime("fast").ok, false);
    assert.equal(normalizeTargetTime("1:99:00").ok, false);
  });
});

describe("applyBibParticipantPatch", () => {
  const deps = {
    normalizeRaceDistance(d) {
      return String(d) === "하프" ? "half" : String(d);
    },
  };

  it("sets bib, distance, targetTime", () => {
    const r = applyBibParticipantPatch(
      { nickname: "게살볶음밥", realName: "홍길동", distance: "full" },
      { bib: "1234", distance: "하프", targetTime: "1:50:00" },
      deps
    );
    assert.equal(r.ok, true);
    assert.equal(r.participant.bib, "1234");
    assert.equal(r.participant.distance, "half");
    assert.equal(r.participant.targetTime, "1:50:00");
    assert.equal(r.participant.realName, "홍길동");
  });

  it("clears targetTime when empty string provided", () => {
    const r = applyBibParticipantPatch(
      { nickname: "a", bib: "1", targetTime: "1:00:00" },
      { bib: "1", targetTime: "" },
      deps
    );
    assert.equal(r.ok, true);
    assert.equal(r.participant.targetTime, undefined);
  });

  it("leaves distance unchanged when omitted", () => {
    const r = applyBibParticipantPatch(
      { nickname: "a", distance: "10K" },
      { bib: "9" },
      deps
    );
    assert.equal(r.participant.distance, "10K");
  });
});
