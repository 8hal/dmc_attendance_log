const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { buildBibBody, goalFieldsFromSec } = require("../../assets/event-bib-form");

const base = { eventId: "e1", nickname: "닉", bib: "1001" };

describe("event-bib request body", () => {
  it("saves bib only for a full runner who leaves the goal empty", () => {
    const body = buildBibBody({
      ...base,
      distance: "full",
      waveId: "w1",
      goalMode: "finish",
      goalH: "",
      goalM: "",
      goalS: "",
    });
    assert.deepEqual(body, {
      subAction: "update-bib",
      eventId: "e1",
      nickname: "닉",
      bib: "1001",
      distance: "full",
    });
  });

  it("saves bib only when no wave exists yet even if a goal is typed", () => {
    const body = buildBibBody({
      ...base,
      distance: "full",
      waveId: "",
      goalMode: "finish",
      goalH: "4",
      goalM: "0",
      goalS: "0",
    });
    assert.equal(body.waveId, undefined);
    assert.equal(body.goalFinishSec, undefined);
  });

  it("sends wave and finish seconds when a goal is typed", () => {
    const body = buildBibBody({
      ...base,
      distance: "full",
      waveId: "w1",
      goalMode: "finish",
      goalH: "3",
      goalM: "30",
      goalS: "",
    });
    assert.equal(body.waveId, "w1");
    assert.equal(body.goalFinishSec, 12600);
  });

  it("sends pace seconds in pace mode", () => {
    const body = buildBibBody({
      ...base,
      distance: "full",
      waveId: "w1",
      goalMode: "pace",
      paceM: "5",
      paceS: "41",
    });
    assert.equal(body.goalPaceSecPerKm, 341);
    assert.equal(body.goalFinishSec, undefined);
  });

  it("never sends wave or goal for 10K", () => {
    const body = buildBibBody({
      ...base,
      distance: "10K",
      waveId: "w1",
      goalMode: "finish",
      goalH: "1",
    });
    assert.equal(body.distance, "10K");
    assert.equal(body.waveId, undefined);
    assert.equal(body.goalFinishSec, undefined);
  });

  it("splits a saved goal back into h/m/s", () => {
    assert.deepEqual(goalFieldsFromSec(12600), { h: "3", m: "30", s: "0" });
    assert.equal(goalFieldsFromSec(null), null);
  });
});

describe("event-bib page wiring", () => {
  const html = fs.readFileSync(path.join(__dirname, "../../lab/cheer/bib.html"), "utf8");
  it("loads the form helper and uses it to build the request", () => {
    assert.match(html, /\.\.\/\.\.\/assets\/event-bib-form\.js/);
    assert.match(html, /EventBibForm\.buildBibBody\(/);
  });
});
