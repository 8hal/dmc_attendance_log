const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "../..", rel), "utf8");
}

function extractFn(html, name) {
  const start = html.indexOf("function " + name + "(");
  assert.ok(start >= 0, "missing function " + name);
  const next = html.indexOf("\n    function ", start + 1);
  return html.slice(start, next > 0 ? next : start + 500);
}

function extractAsyncFn(html, name) {
  const token = "async function " + name + "(";
  const start = html.indexOf(token);
  assert.ok(start >= 0, "missing async function " + name);
  const rest = html.slice(start + token.length);
  const nextAsync = rest.indexOf("\n    async function ");
  const nextFn = rest.indexOf("\n    function ");
  let end = rest.length;
  if (nextAsync >= 0) end = Math.min(end, nextAsync);
  if (nextFn >= 0) end = Math.min(end, nextFn);
  return html.slice(start, start + token.length + end);
}

describe("event-home nick pick chrome", () => {
  it("showPickView hides the tab bar and does not mount tabs", () => {
    const fn = extractFn(read("event-home.html"), "showPickView");
    assert.match(fn, /eventTabBar\.classList\.add\(["']hidden["']\)/);
    assert.doesNotMatch(fn, /mountTabs\s*\(/);
  });

  it("disabled today-cta is muted gray, done state stays green", () => {
    const css = read("assets/event-member-shell.css");
    const disabledBlock = css.match(/\.today-cta:disabled\s*\{[^}]+\}/);
    assert.ok(disabledBlock, "today-cta:disabled should have its own block");
    assert.match(disabledBlock[0], /#94a3b8|#cbd5e1|#64748b|slate/i);
    assert.doesNotMatch(disabledBlock[0], /#059669|green-9/);

    const doneBlock = css.match(/\.today-cta\.is-done\s*\{[^}]+\}/);
    assert.ok(doneBlock, "today-cta.is-done should keep a green block");
    assert.match(doneBlock[0], /#059669|green-9/);
  });

  it("does not open the day timeline as the primary path", () => {
    const html = read("event-home.html");
    assert.match(html, /id="timeline"/);
    assert.doesNotMatch(html, /<details class="timeline-details" open>/);
    const render = extractFn(html, "renderTimeline");
    assert.match(render, /classList\.add\(["']hidden["']\)/);
    assert.doesNotMatch(render, /classList\.remove\(["']hidden["']\)/);
  });

  it("member home uses 다른 사람 선택, not 닉네임 변경", () => {
    const html = read("event-home.html");
    assert.match(html, />다른 사람 선택</);
    assert.doesNotMatch(html, />닉네임 변경</);
  });

  it("nick change can be cancelled and unknown saved nicks go to pick", () => {
    const html = read("event-home.html");
    assert.match(html, /id="pickCancelBtn"/);
    const shell = extractFn(html, "renderEventShell");
    assert.match(shell, /matchInList/);
    assert.match(shell, /showPickView/);
    const pick = extractFn(html, "showPickView");
    assert.match(pick, /cancelable/);
  });

  it("home has profile and bus cards", () => {
    const html = read("event-home.html");
    assert.match(html, /id="profileCard"/);
    assert.match(html, /id="busCard"/);
    assert.match(html, /id="boardDoneOverlay"/);
    assert.doesNotMatch(html, /명단·결과/);
    assert.doesNotMatch(html, /function renderTodayCard/);
  });

  it("아니에요 does not auto-open manual", () => {
    const html = read("event-home.html");
    assert.match(html, /아니에요/);
    const reject = html.match(/아니에요[\s\S]{0,800}/)[0];
    assert.doesNotMatch(reject, /intent:\s*["']manual["']/);
    assert.match(html, /intent:\s*["']reject["']/);
  });

  it("confirmed profile has no roster CTA", () => {
    const html = read("event-home.html") + read("assets/event-home-action.js");
    assert.match(html, /동마클 대회 기록에 저장됐어요/);
    assert.doesNotMatch(html, /명단·결과 보기/);
    assert.doesNotMatch(html, /대회 기록 보기/);
  });

  it("pick list uses roster not participants-only", () => {
    const pick = extractFn(read("event-home.html"), "renderPickList");
    assert.match(pick, /pickNicknames/);
    assert.match(pick, /roster/);
  });

  it("pick copy is 참가자에서 본인 닉네임을 선택하세요", () => {
    const html = read("event-home.html");
    assert.match(html, /참가자에서 본인 닉네임을 선택하세요/);
    assert.doesNotMatch(html, /먼저/);
  });

  it("loadBusRow uses detail roster and home self-boards without resolveNextAction", () => {
    const html = read("event-home.html");
    const load = extractFn(html, "loadBusRow");
    assert.match(load, /busBoarding/);
    assert.match(load, /roster/);
    assert.doesNotMatch(load, /bus-boarding/);
    assert.doesNotMatch(html, /resolveNextAction/);
    assert.doesNotMatch(html, /busLauncherVisible/);
    assert.match(html, /self-board/);
    assert.match(html, /PROFILE_DISTANCES/);
    assert.match(html, /["']board["']/);
  });

  it("bib and time fields handle IME composition", () => {
    const html = read("event-home.html");
    assert.match(html, /profileBib/);
    assert.match(html, /profileTime/);
    const bind = extractFn(html, "bindImeInput");
    assert.match(bind, /compositionstart/);
    assert.match(bind, /compositionend/);
  });

  it("empty manual finish toasts and does not POST", () => {
    const html = read("event-home.html");
    const save = html.match(/function onManualSave\([\s\S]{0,800}/);
    assert.ok(save, "onManualSave");
    assert.match(save[0], /showToast/);
    assert.match(save[0], /return/);
    assert.match(save[0], /netTime|profileTime/);
  });

  it("showPickView hides the board overlay", () => {
    const fn = extractFn(read("event-home.html"), "showPickView");
    assert.match(fn, /boardDoneOverlay/);
    assert.match(fn, /hidden/);
  });

  it("submitSelfBoard ignores stale identity after await", () => {
    const fn = extractFn(read("event-home.html"), "submitSelfBoard");
    assert.match(fn, /await /);
    assert.match(fn, /activeIdentity\.nickname/);
    assert.match(fn, /!==/);
  });

  it("time IME re-renders only when leaving dns or dnf", () => {
    const html = read("event-home.html");
    const ime = html.match(/bindImeInput\(profileTime[\s\S]{0,450}/);
    assert.ok(ime, "profileTime IME bind");
    assert.match(ime[0], /dns/);
    assert.match(ime[0], /dnf/);
    assert.match(ime[0], /manualKind/);
  });

  it("pending defaults PB off only when entering pending", () => {
    const render = extractFn(read("event-home.html"), "renderProfileCard");
    assert.match(render, /prevProfileState/);
    assert.match(render, /profilePb\.checked\s*=\s*false/);
  });

  it("switching identity resets profile draft state", () => {
    const html = read("event-home.html");
    assert.match(html, /function resetProfileDraft/);
    const reset = extractFn(html, "resetProfileDraft");
    assert.match(reset, /profileIntent/);
    assert.match(reset, /manualKind/);
    assert.match(reset, /selectedDistance/);
    assert.match(reset, /bibDraft/);
    assert.match(reset, /timeDraft/);
    const home = extractFn(html, "showMemberHome");
    assert.match(home, /resetProfileDraft/);
  });

  it("resetProfileDraft hides profile sections", () => {
    const reset = extractFn(read("event-home.html"), "resetProfileDraft");
    assert.match(reset, /hideProfileSections\s*\(/);
  });

  it("homeGeneration bumps on pick and identity change", () => {
    const html = read("event-home.html");
    assert.match(html, /homeGeneration/);
    const pick = extractFn(html, "showPickView");
    assert.match(pick, /homeGeneration\s*\+=\s*1|homeGeneration\+\+|bumpHomeGeneration/);
    const home = extractFn(html, "showMemberHome");
    assert.match(home, /homeGeneration\s*\+=\s*1|homeGeneration\+\+|bumpHomeGeneration/);
  });

  it("async home loaders abort on stale homeGeneration", () => {
    const html = read("event-home.html");
    ["submitSelfBoard", "refreshHomeState", "loadConfirmState", "submitSelfConfirm", "submitUpdateBib"].forEach(
      function (name) {
        const fn = extractAsyncFn(html, name);
        assert.match(fn, /homeGeneration/, name + " should capture homeGeneration");
        assert.match(fn, /!==/, name + " should compare generation after await");
      }
    );
  });

  it("submitSelfBoard does not overlay when pick is visible", () => {
    const fn = extractAsyncFn(read("event-home.html"), "submitSelfBoard");
    assert.match(fn, /homeEl\.classList\.contains\(["']hidden["']\)|pickViewEl/);
  });
});
