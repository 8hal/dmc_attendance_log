const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { buildBibBody, goalFieldsFromSec, goalFieldsError } = require("../../assets/event-bib-form");

const base = { eventId: "e1", nickname: "닉", bib: "1001" };

describe("event-bib request body", () => {
  it("saves bib only for a full runner who leaves wave and goal empty", () => {
    const body = buildBibBody({
      ...base,
      distance: "full",
      waveId: "",
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

  it("sends the goal without a wave when no wave is picked", () => {
    const body = buildBibBody({
      ...base,
      distance: "full",
      waveId: "",
      goalH: "4",
      goalM: "0",
      goalS: "0",
    });
    assert.equal(body.waveId, undefined);
    assert.equal(body.goalFinishSec, 14400);
  });

  it("sends the wave without a goal when only a wave is picked", () => {
    const body = buildBibBody({
      ...base,
      distance: "full",
      waveId: "w1",
      goalH: "",
      goalM: "",
      goalS: "",
    });
    assert.equal(body.waveId, "w1");
    assert.equal(body.goalFinishSec, undefined);
  });

  it("sends wave and finish seconds when a goal is typed", () => {
    const body = buildBibBody({
      ...base,
      distance: "full",
      waveId: "w1",
      goalH: "3",
      goalM: "30",
      goalS: "",
    });
    assert.equal(body.waveId, "w1");
    assert.equal(body.goalFinishSec, 12600);
  });

  it("only ever sends a finish time, never a pace", () => {
    const body = buildBibBody({
      ...base,
      distance: "full",
      waveId: "w1",
      goalMode: "pace",
      paceM: "5",
      paceS: "41",
      goalH: "4",
    });
    assert.equal(body.goalPaceSecPerKm, undefined);
    assert.equal(body.goalFinishSec, 14400);
  });

  it("never sends wave or goal for 10K", () => {
    const body = buildBibBody({
      ...base,
      distance: "10K",
      waveId: "w1",
      goalH: "1",
    });
    assert.equal(body.distance, "10K");
    assert.equal(body.waveId, undefined);
    assert.equal(body.goalFinishSec, undefined);
  });

  it("flags goal fields that are not whole numbers or out of clock range", () => {
    assert.equal(goalFieldsError({ goalH: "3", goalM: "30", goalS: "" }), "");
    assert.equal(goalFieldsError({ goalH: "", goalM: "", goalS: "" }), "");
    assert.ok(goalFieldsError({ goalH: "3h", goalM: "", goalS: "" }));
    assert.ok(goalFieldsError({ goalH: "3", goalM: "75", goalS: "" }));
    assert.ok(goalFieldsError({ goalH: "3", goalM: "0", goalS: "60" }));
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

  it("escapes nicknames and wave names before putting them in HTML", () => {
    assert.match(html, /function esc\(/);
    assert.doesNotMatch(html, /\+ row\.nickname \+/);
    assert.doesNotMatch(html, /\+ wave\.(id|name) \+/);
  });

  it("checks goal fields before saving", () => {
    assert.match(html, /EventBibForm\.goalFieldsError\(/);
  });

  it("offers one goal input labelled 완주 목표 시간", () => {
    assert.match(html, /완주 목표 시간/);
    assert.doesNotMatch(html, /id="goalMode"|id="paceM"|페이스 \(분:초/);
  });
});

describe("cheer board page", () => {
  const html = fs.readFileSync(path.join(__dirname, "../../lab/cheer/index.html"), "utf8");
  it("refreshes an open runner detail on each poll", () => {
    assert.match(html, /view === "detail" && selected/);
  });
});
