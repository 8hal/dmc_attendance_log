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
  const html = fs.readFileSync(path.join(__dirname, "../../cheer/bib.html"), "utf8");
  it("loads the form helper and uses it to build the request", () => {
    assert.match(html, /\.\.\/assets\/event-bib-form\.js/);
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

  it("states the page purpose and drops the old start and optional-goal hints", () => {
    assert.match(html, /배번과 완주 목표 시간을 입력해 주세요\. 실시간 응원과 기록 수집에 쓰입니다\./);
    assert.doesNotMatch(html, /아직 출발 시각이 등록되지 않았습니다/);
    assert.doesNotMatch(html, /조와 목표를 비워도 배번은 저장됩니다/);
    assert.doesNotMatch(html, /id="waveEmpty"|getElementById\("waveEmpty"\)/);
    assert.match(html, /EventBibForm\.buildBibBody\(/);
  });
});

describe("cheer board page", () => {
  const html = fs.readFileSync(path.join(__dirname, "../../cheer/index.html"), "utf8");
  it("refreshes an open runner detail on each poll", () => {
    assert.match(html, /view === "detail" && selected/);
  });

  it("shows load errors in Korean, including offline fetch failures", () => {
    assert.match(html, /"event not found": "대회를 찾지 못했습니다/);
    assert.match(html, /"Failed to fetch": "인터넷 연결/);
    assert.match(html, /"Load failed": "인터넷 연결/);
  });
});

describe("cheer waves page", () => {
  const html = fs.readFileSync(path.join(__dirname, "../../cheer/waves.html"), "utf8");
  it("says a deleted wave falls back to the first start", () => {
    assert.match(html, /첫 출발 시각으로 계산합니다/);
    assert.doesNotMatch(html, /보드에서 빠집니다/);
  });
});
