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
  return html.slice(start, next > 0 ? next : html.length);
}

describe("boarding member shell", () => {
  const html = read("boarding.html");

  it("uses the shared event-app shell and a left-aligned title, not an emoji header", () => {
    assert.match(html, /class="event-app"/);
    assert.match(html, /class="summary-title"/);
    assert.doesNotMatch(html, /class="header-icon"/);
    const headerStart = html.indexOf("<header");
    const header = html.slice(headerStart, html.indexOf("</header>", headerStart) + 9);
    assert.doesNotMatch(header, /🚌/);
  });

  it("does not show real names on the list or confirm screen", () => {
    assert.doesNotMatch(html, /participant-realname/);
    assert.doesNotMatch(html, /confirmRealName/);
    assert.doesNotMatch(html, />실명</);
    const render = extractFn(html, "renderParticipantList");
    assert.doesNotMatch(render, /realName/);
    const select = extractFn(html, "selectParticipant");
    assert.doesNotMatch(select, /realName/);
  });

  it("search placeholder is nickname-only", () => {
    assert.match(html, /placeholder="닉네임 검색"/);
    assert.doesNotMatch(html, /실명 검색/);
  });

  it("done screen returns to member home", () => {
    assert.match(html, />홈으로</);
    const goHome = extractFn(html, "goToHome");
    assert.match(goHome, /memberHomeHref/);
  });

  it("loads EventBoardingFlow and honors leg query + confirm banner + bib next", () => {
    assert.match(html, /event-boarding-flow\.js/);
    const load = extractFn(html, "loadStatus");
    assert.match(load, /parseBoardingLeg/);
    assert.match(load, /resolveBoardingEntry/);
    assert.match(html, /id="confirmRecordBanner"/);
    assert.match(html, /id="doneBibBtn"/);
    assert.match(html, /기록 확정하기/);
    assert.match(html, /이어서 배번 입력/);
    assert.match(html, /다른 사람 선택/);
    assert.match(html, /readSavedIdentity/);
    assert.match(html, /matchInList/);
    assert.match(html, /clearNicknames/);
    assert.match(html, /doneRecordBanner/);
    assert.match(html, /이미 탑승됨/);
    assert.match(html, /id="errorRetryBtn"/);
    assert.match(html, /출석으로 돌아가기/);
    const doneFn = extractFn(html, "showDoneScreen");
    assert.match(doneFn, /currentHasBib/);
    assert.doesNotMatch(doneFn, /hasBib:\s*false/);
    assert.match(html, /subAction=detail/);
    const mount = extractFn(html, "mountTabs");
    assert.match(mount, /busLeg/);
    const confirmStart = html.indexOf('id="confirmScreen"');
    const confirm = html.slice(confirmStart, html.indexOf('id="doneScreen"'));
    assert.ok(
      confirm.indexOf("confirmRecordBanner") < confirm.indexOf("confirmNickname"),
      "confirm banner should sit above the nickname"
    );
    const doneStart = html.indexOf('id="doneScreen"');
    const done = html.slice(doneStart, html.indexOf('id="eventTabBar"'));
    assert.ok(
      done.indexOf("doneRecordBanner") < done.indexOf("doneTitle"),
      "done banner should sit above the success title"
    );
    assert.ok(
      done.indexOf("doneBackBtn") < done.indexOf("doneBibBtn"),
      "home should be the primary done action, bib secondary"
    );
  });

  it("shows the member-facing event title", () => {
    assert.match(html, /event-member-copy\.js/);
    assert.match(html, /memberEventTitle\(/);
  });
});

describe("member pages use EventMemberCopy", () => {
  it("event-home titles go through memberEventTitle", () => {
    const html = read("event-home.html");
    assert.match(html, /event-member-copy\.js/);
    const pick = extractFn(html, "showPickView");
    const home = extractFn(html, "showMemberHome");
    assert.match(pick, /memberEventTitle\(/);
    assert.match(home, /memberEventTitle\(/);
  });

  it("event-roster title and distances use member copy", () => {
    const html = read("event-roster.html");
    assert.match(html, /event-member-copy\.js/);
    assert.match(html, /memberEventTitle\(/);
    assert.match(html, /memberDistanceLabel\(/);
    assert.doesNotMatch(html, /formatDistance\(/);
  });
});
