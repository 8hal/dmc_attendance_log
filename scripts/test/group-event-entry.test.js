const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function readHtml(name) {
  return fs.readFileSync(path.join(__dirname, "../..", name), "utf8");
}

describe("group event primary entry", () => {
  it("group.html card click opens event-admin", () => {
    const html = readHtml("group.html");
    assert.match(
      html,
      /\[data-event-card\][\s\S]*window\.location\.href = `event-admin\.html\?eventId=\$\{encodeURIComponent\(eventId\)\}`/
    );
  });

  it("group.html kebab keeps group-detail as legacy participant/record path", () => {
    const html = readHtml("group.html");
    assert.match(html, /data-legacy-detail=/);
    assert.match(html, /group-detail\.html\?eventId=/);
  });

  it("group.html kebab restores 참가자 편집 entry that opens modal", () => {
    const html = readHtml("group.html");
    assert.match(html, /data-edit-participants=/);
    assert.match(html, />참가자 편집</);
    assert.match(html, /data-edit-participants[\s\S]*openParticipantModal\(eventId\)/);
    assert.match(html, /editParticipants/);
  });

  it("group-detail pre-event mode drops obsolete auto-scrape copy", () => {
    const html = readHtml("group-detail.html");
    const start = html.indexOf("function showPreEventMode");
    assert.ok(start >= 0, "showPreEventMode missing");
    const next = html.indexOf("\n    function ", start + 1);
    const block = html.slice(start, next > 0 ? next : html.length);
    assert.match(block, /대회 준비 완료/);
    assert.match(block, /참가자 등록/);
    assert.doesNotMatch(block, /자동 스크랩/);
    assert.doesNotMatch(block, /대회 당일 안내/);
    assert.doesNotMatch(block, /15:00/);
    assert.doesNotMatch(block, /기록 소스:/);
    assert.match(block, /참가자 추가·변경/);
    assert.match(block, /참가자 편집/);
  });

  it("group-detail participant modal loads all-members (not stub 2 names)", () => {
    const html = readHtml("group-detail.html");
    assert.doesNotMatch(html, /라우펜더만/);
    assert.doesNotMatch(html, /쌩메/);
    assert.match(html, /id="participantModalHelp"/);
    assert.match(html, /대회 참가자로 넣을|대회 참가자 선택|전체 회원/);
    assert.match(html, /action=all-members/);
    assert.match(html, /function openParticipantModal/);
    assert.match(html, /subAction: "participants"/);
    assert.match(html, /editParticipantsBtn[\s\S]*openParticipantModal\(\)/);
  });

  it("group.html participant modal explains full-roster replace UX", () => {
    const html = readHtml("group.html");
    assert.match(html, /전체 회원/);
    assert.match(html, /통째로 교체/);
    assert.match(html, /prev\.bib/);
  });

  it("group-detail day hub points at event-admin and event-home", () => {
    const html = readHtml("group-detail.html");
    assert.match(html, /id="hubAdmin"/);
    assert.match(html, /event-admin\.html\?eventId=/);
    assert.match(html, /id="hubMemberHome"/);
    assert.match(html, /event-home\.html\?eventId=/);
    assert.match(html, /boarding\.html\?eventId=\$\{encodeURIComponent\(eventId\)\}&leg=outbound/);
  });

  it("event-admin sidebar links back to group list", () => {
    const html = readHtml("event-admin.html");
    assert.match(html, /id="link-group-list"/);
    assert.match(html, /href="group\.html"/);
  });

  it("event-admin has one participant QR without leg query", () => {
    const html = readHtml("event-admin.html");
    assert.match(html, /id="qr-img"/);
    assert.doesNotMatch(html, /id="qr-img-return"/);
    assert.doesNotMatch(html, /<details class="qr-return-details">/);
    assert.match(html, /event-home\.html/);
    assert.match(html, /board=1/);
    assert.doesNotMatch(html, /leg=return/);
    assert.doesNotMatch(html, /participantUrl\("return"\)/);
    assert.doesNotMatch(html, /id="copy-bib-link-btn"/);
    assert.doesNotMatch(html, /배번 입력 링크 복사/);
  });
});
