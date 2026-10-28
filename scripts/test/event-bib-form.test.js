const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  buildBibBody,
  goalFieldsFromSec,
  goalFieldsError,
  boardGoalError,
  cheerBibSaveDistance,
  nonFullCourseNote,
  waveChoiceVisible,
  sortWaves,
  goalPaceLabel,
  goalFocusNext,
  savedBibSummary,
  bibIdentityLine,
} = require("../../assets/event-bib-form");

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
    assert.match(html, /<meta name="robots" content="noindex, nofollow" \/>/);
    assert.match(html, /content="0\.21\.7"/);
  });

  it("treats the page as full course and explains a non-full participant", () => {
    assert.doesNotMatch(html, /id="distChips"|data-dist|PROFILE_DISTANCES/);
    assert.match(html, /EventBibForm\.cheerBibSaveDistance\(/);
    assert.match(html, /id="notFullNote"/);
    assert.match(html, /EventBibForm\.nonFullCourseNote\(/);
    assert.doesNotMatch(html, /<select[^>]*id="wave"/);
  });

  it("shows a wave chip for every registered group, including a single group", () => {
    assert.match(html, /EventBibForm\.waveChoiceVisible\(/);
    assert.match(html, /EventBibForm\.sortWaves\(/);
    assert.match(html, /id="waveChips"/);
    assert.match(html, /data-wave-id/);
    assert.match(html, /class="wave-name"/);
    assert.match(html, /배번에 적힌 출발 그룹을 고르세요\./);
    assert.match(html, /고르지 않으면 앞쪽 그룹으로 봅니다\./);
    assert.doesNotMatch(html, /class="wave-time"|waveClockLabel|출발 시각|시각은|가장 이른|7:30/);
    assert.doesNotMatch(html, /waves\.length < 2/);
    assert.doesNotMatch(html, /<select id="wave"/);
    assert.match(html, /id="waveNone"/);
    assert.match(html, /출발 그룹이 아직 없습니다/);
  });

  it("keeps the bib editable and puts the goal clock on one row", () => {
    assert.match(html, /id="bib"[^>]*inputmode="numeric"/);
    assert.doesNotMatch(html, /id="bib"[^>]*(?:readonly|disabled)/);
    assert.doesNotMatch(html, /getElementById\("bib"\)\.disabled/);
    assert.match(html, /class="goal-row"/);
    assert.match(html, /id="goalH"[^>]*maxlength="2"/);
    assert.match(html, /id="goalM"[^>]*inputmode="numeric"/);
    assert.match(html, /id="goalS"[^>]*inputmode="numeric"/);
    assert.match(html, /id="goalPace"/);
    assert.match(html, /EventBibForm\.goalPaceLabel\(/);
    assert.match(html, /EventBibForm\.goalFocusNext\(/);
  });
});

describe("bib page identity line", () => {
  it("shows nickname and real name together", () => {
    assert.equal(bibIdentityLine({ nickname: "게살볶음밥", realName: "문광명" }), "게살볶음밥 · 문광명");
  });

  it("shows only the nickname when the real name is missing", () => {
    assert.equal(bibIdentityLine({ nickname: "게살볶음밥", realName: "" }), "게살볶음밥");
    assert.equal(bibIdentityLine({ nickname: "게살볶음밥", realName: "   " }), "게살볶음밥");
    assert.equal(bibIdentityLine({ nickname: "게살볶음밥" }), "게살볶음밥");
    assert.equal(bibIdentityLine(null), "");
  });

  it("shows only the real name when the nickname is missing", () => {
    assert.equal(bibIdentityLine({ nickname: "", realName: "문광명" }), "문광명");
    assert.equal(bibIdentityLine({ realName: "문광명" }), "문광명");
  });

  it("trims both names before joining", () => {
    assert.equal(bibIdentityLine({ nickname: " 게살볶음밥 ", realName: " 문광명 " }), "게살볶음밥 · 문광명");
  });
});

describe("saved bib summary", () => {
  const waves = [
    { id: "c", name: "C", startAt: "2026-11-01T07:30:00+09:00" },
    { id: "a", name: "A", startAt: "2026-11-01T07:00:00+09:00" },
  ];

  it("returns null until a bib is saved", () => {
    assert.equal(savedBibSummary({ distance: "full", goalFinishSec: 12600 }, waves), null);
    assert.equal(savedBibSummary({ bib: "  ", distance: "full" }, waves), null);
    assert.equal(savedBibSummary(null, waves), null);
  });

  it("puts the group name and goal pace on the summary without a start clock", () => {
    const summary = savedBibSummary({
      bib: "10947",
      distance: "full",
      waveId: "c",
      goalFinishSec: 12600,
    }, waves);
    assert.equal(summary.bib, "10947");
    assert.equal(summary.full, true);
    assert.equal(summary.waveName, "C");
    assert.equal(summary.goalLine, "3:30:00 · 4:59/km");
    assert.equal(JSON.stringify(summary).includes("07:30"), false);
    assert.equal(JSON.stringify(summary).includes("startAt"), false);
  });

  it("omits group and goal when a non-full runner only has a bib", () => {
    const summary = savedBibSummary({
      bib: "1204",
      distance: "half",
      waveId: "c",
      goalFinishSec: 12600,
    }, waves);
    assert.equal(summary.full, false);
    assert.equal(summary.distance, "half");
    assert.equal(summary.waveName, "");
    assert.equal(summary.goalLine, "");
  });

  it("keeps a full runner's bib summary when the goal or group is still empty", () => {
    const summary = savedBibSummary({ bib: "10", distance: "full" }, waves);
    assert.equal(summary.full, true);
    assert.equal(summary.waveName, "");
    assert.equal(summary.goalLine, "");
  });
});

describe("cheer bib saved card", () => {
  const html = fs.readFileSync(path.join(__dirname, "../../cheer/bib.html"), "utf8");

  it("shows a bib face, board button, and edit button instead of leaving the form up", () => {
    assert.match(html, /id="saved"/);
    assert.match(html, /class="bib-face"/);
    assert.match(html, /class="bib-face-number"/);
    assert.match(html, /id="savedBib"/);
    assert.match(html, /id="savedBoard"[^>]*>응원 보드 보기</);
    assert.match(html, /id="savedEdit"[^>]*>배번·목표 수정</);
    assert.match(html, /getElementById\("savedBoard"\)\.href = "index\.html\?eventId="/);
    assert.match(html, /EventBibForm\.savedBibSummary\(/);
    assert.match(html, /editing/);
    assert.doesNotMatch(html, /id="done"/);
    assert.doesNotMatch(html, /saved[\s\S]{0,400}startAt|savedWave[\s\S]{0,120}slice\(11/);
  });

  it("prints nickname and real name on the summary and the form, not on the nick list", () => {
    assert.match(html, /id="savedIdentity"/);
    assert.match(html, /getElementById\("savedIdentity"\)\.textContent = EventBibForm\.bibIdentityLine\(participant\(\)\)/);
    assert.match(html, /getElementById\("who"\)\.textContent = EventBibForm\.bibIdentityLine\(row\)/);
    assert.doesNotMatch(html, /savedIdentity[\s\S]{0,80}innerHTML|getElementById\("who"\)\.innerHTML/);
    const nickLine = html.split("\n").find((line) => line.includes('class="nick-btn"'));
    assert.ok(nickLine);
    assert.equal(nickLine.includes("realName"), false);
    assert.match(nickLine, /esc\(row\.nickname\)/);
  });
});

describe("cheer bib distance and required goal", () => {
  it("saves a full course unless the participant is already another distance", () => {
    assert.equal(cheerBibSaveDistance(null), "full");
    assert.equal(cheerBibSaveDistance({}), "full");
    assert.equal(cheerBibSaveDistance({ distance: "  full  " }), "full");
    assert.equal(cheerBibSaveDistance({ distance: "half" }), "half");
    assert.equal(cheerBibSaveDistance({ distance: " 10K " }), "10K");
  });

  it("explains that cheering is full course only", () => {
    const note = nonFullCourseNote("하프");
    assert.match(note, /풀코스/);
    assert.match(note, /하프/);
    assert.match(note, /배번/);
    assert.match(nonFullCourseNote("?"), /다른 종목/);
    assert.match(nonFullCourseNote(""), /다른 종목/);
  });

  it("requires a 1 to 10 hour goal before the home form can qualify a runner", () => {
    assert.equal(boardGoalError({ goalH: "3", goalM: "30", goalS: "0" }), "");
    assert.match(boardGoalError({ goalH: "", goalM: "", goalS: "" }), /완주 목표 시간/);
    assert.match(boardGoalError({ goalH: "11", goalM: "0", goalS: "0" }), /1시간에서 10시간/);
    assert.match(boardGoalError({ goalH: "3", goalM: "75", goalS: "0" }), /0–59/);
  });
});

describe("cheer bib wave and goal helpers", () => {
  it("shows the wave choice whenever at least one group exists", () => {
    assert.equal(waveChoiceVisible(0), false);
    assert.equal(waveChoiceVisible(1), true);
    assert.equal(waveChoiceVisible(8), true);
  });

  it("sorts groups by startAt for chip order without a clock label", () => {
    const sorted = sortWaves([
      { id: "h", name: "H", startAt: "2026-11-01T08:05:00+09:00" },
      { id: "a", name: "A", startAt: "2026-11-01T07:30:00+09:00" },
    ]);
    assert.deepEqual(sorted.map((wave) => wave.name), ["A", "H"]);
  });

  it("previews pace only inside the 1 to 10 hour goal", () => {
    assert.equal(goalPaceLabel({ goalH: "3", goalM: "0", goalS: "0" }), "4:16/km");
    assert.equal(goalPaceLabel({ goalH: "", goalM: "", goalS: "" }), "");
    assert.equal(goalPaceLabel({ goalH: "11", goalM: "0", goalS: "0" }), "");
    assert.equal(goalPaceLabel({ goalH: "3", goalM: "75", goalS: "0" }), "");
  });

  it("moves focus across a one-line clock without skipping hour 10", () => {
    assert.equal(goalFocusNext("goalH", "3"), "goalM");
    assert.equal(goalFocusNext("goalH", "1"), "");
    assert.equal(goalFocusNext("goalH", "10"), "goalM");
    assert.equal(goalFocusNext("goalM", "5"), "");
    assert.equal(goalFocusNext("goalM", "05"), "goalS");
    assert.equal(goalFocusNext("goalS", "00"), "");
  });
});

describe("cheer board page", () => {
  const html = fs.readFileSync(path.join(__dirname, "../../cheer/index.html"), "utf8");
  it("refreshes an open runner detail on each poll", () => {
    assert.match(html, /view === "detail" && selected/);
  });

  it("does not print a wave start clock on the player board", () => {
    assert.doesNotMatch(html, /startAt\)\.slice\(11/);
    assert.doesNotMatch(html, /출발 " \+/);
  });

  it("shows nickname and real name on the map, rank, cluster picker, and detail", () => {
    assert.match(html, /<script src="\.\.\/assets\/event-bib-form\.js"><\/script>/);
    assert.match(html, /content="0\.21\.7"/);
    assert.match(html, /function runnerLabel\(runner\)/);
    assert.match(html, /return EventBibForm\.bibIdentityLine\(runner\)/);
    assert.match(html, /const name = runnerLabel\(lead\[0\]\)/);
    assert.match(html, /esc\(label\)/);
    assert.match(html, /esc\(runnerLabel\(runner\)\)/);
    assert.match(html, /data-nick="' \+ esc\(runner\.nickname\)/);
    assert.match(html, /data-nicks="' \+ esc\(lead\.map\(function \(r\) \{ return r\.nickname; \}\)\.join\("\|"\)\)/);
    assert.doesNotMatch(html, /startAt\)\.slice\(11/);
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
