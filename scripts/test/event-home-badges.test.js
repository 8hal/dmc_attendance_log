const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  busLauncherVisible,
  busBadgeLabel,
  bibBadgeLabel,
  resultsLauncherState,
} = require(path.join(__dirname, "../../assets/event-home-badges.js"));

describe("event-home-badges", () => {
  it("hides bus when missing or disabled", () => {
    assert.equal(busLauncherVisible(null), false);
    assert.equal(busLauncherVisible({ enabled: false }), false);
    assert.equal(busLauncherVisible({ enabled: true }), true);
  });

  it("bus badge: next required unboarded → 미탑승; all done → 완료", () => {
    const row = {
      legs: {
        outbound: { required: true, boarded: true },
        return: { required: true, boarded: false },
      },
    };
    assert.equal(busBadgeLabel(row), "미탑승");
    row.legs.return.boarded = true;
    assert.equal(busBadgeLabel(row), "완료");
  });

  it("bib badge from participant.bib", () => {
    assert.equal(bibBadgeLabel({ bib: "123" }), "입력됨");
    assert.equal(bibBadgeLabel({ bib: "" }), "미입력");
    assert.equal(bibBadgeLabel(null), null);
  });

  it("results launcher disabled until board exists flag true", () => {
    assert.deepEqual(resultsLauncherState(false), { enabled: false, label: "준비 중" });
    assert.deepEqual(resultsLauncherState(true), { enabled: true, label: null });
  });
});
