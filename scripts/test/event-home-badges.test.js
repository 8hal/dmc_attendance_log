const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  busLauncherVisible,
  busBadgeLabel,
  bibBadgeLabel,
  resultsLauncherState,
  confirmPanelFromApi,
  confirmDisplayTime,
  confirmDoneSummary,
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

  it("confirmPanelFromApi: pending / confirmed / none (no gap)", () => {
    assert.deepEqual(confirmPanelFromApi(null), { mode: "none", result: null });
    assert.deepEqual(confirmPanelFromApi({ ok: true, state: "none", result: null }), {
      mode: "none",
      result: null,
    });
    const pending = { bib: "4821", netTime: "1:42:18", distance: "하프" };
    assert.deepEqual(
      confirmPanelFromApi({ ok: true, state: "pending", result: pending }),
      { mode: "pending", result: pending }
    );
    const confirmed = { bib: "4821", netTime: "1:42:18", distance: "하프" };
    assert.deepEqual(
      confirmPanelFromApi({ ok: true, state: "confirmed", result: confirmed }),
      { mode: "confirmed", result: confirmed }
    );
  });

  it("confirmDisplayTime prefers netTime then gunTime", () => {
    assert.equal(confirmDisplayTime({ netTime: "1:42:18", gunTime: "1:45:00" }), "1:42:18");
    assert.equal(confirmDisplayTime({ netTime: "", gunTime: "1:45:00" }), "1:45:00");
    assert.equal(confirmDisplayTime({ netTime: "--:--:--", gunTime: "1:45:00" }), "1:45:00");
    assert.equal(confirmDisplayTime(null), "");
  });

  it("confirmDoneSummary: time + distance · PB", () => {
    assert.deepEqual(
      confirmDoneSummary(
        { netTime: "1:42:18", pbConfirmed: true },
        { distanceLabel: "하프" }
      ),
      { timeText: "1:42:18", subText: "하프 · PB" }
    );
  });

  it("confirmDoneSummary: DNS/DNF prefer status over PB; empty when no data", () => {
    assert.deepEqual(
      confirmDoneSummary(
        { netTime: "", dnStatus: "DNS", pbConfirmed: true },
        { distanceLabel: "풀" }
      ),
      { timeText: "", subText: "풀 · DNS" }
    );
    assert.deepEqual(
      confirmDoneSummary({ finishTime: "3:10:01" }, { distanceLabel: "풀" }),
      { timeText: "3:10:01", subText: "풀" }
    );
    assert.deepEqual(confirmDoneSummary(null, {}), { timeText: "", subText: "" });
  });
});
