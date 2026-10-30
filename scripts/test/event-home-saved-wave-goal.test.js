const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const EventBibForm = require("../../assets/event-bib-form.js");

const html = fs.readFileSync(path.join(__dirname, "../..", "event-home.html"), "utf8");

describe("event-home saved bib card shows wave and goal", () => {
  it("markup has wave and goal lines", () => {
    assert.match(html, /id="profileWaveLine"/);
    assert.match(html, /id="profileGoalLine"/);
    assert.match(html, /"출발 그룹 "/);
    assert.match(html, /"완주 목표 "/);
  });

  it("summary gives wave name only, no start clock", () => {
    const s = EventBibForm.savedBibSummary(
      { bib: "1619", distance: "full", waveId: "w1", goalFinishSec: 12600 },
      [{ id: "w1", name: "A", startTime: "08:00" }]
    );
    assert.equal(s.waveName, "A");
    assert.ok(!JSON.stringify(s).includes("08:00"));
    assert.match(s.goalLine, /^3:30:00/);
  });
});
