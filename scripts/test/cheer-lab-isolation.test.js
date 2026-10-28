const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "../..");
const cheerDir = path.join(root, "cheer");
const pages = ["index.html", "bib.html", "waves.html"];

function rootHtmlFiles() {
  return fs.readdirSync(root).filter((name) => name.endsWith(".html"));
}

describe("cheer pages are a public feature off the member tab bar", () => {
  it("lives under cheer/ without a trial banner and stays noindex", () => {
    assert.equal(fs.existsSync(path.join(root, "lab/cheer")), false);
    for (const page of pages) {
      const html = fs.readFileSync(path.join(cheerDir, page), "utf8");
      assert.match(html, /<meta name="robots" content="noindex, nofollow" \/>/, page);
      assert.doesNotMatch(html, /시험|베타|class="lab"/, page);
      assert.match(html, /\.\.\/assets\//, page);
      assert.doesNotMatch(html, /(?:src|href)="assets\//, page);
      assert.doesNotMatch(html, /EventMemberTabs/, page);
    }
  });

  it("redirects today's lab/cheer links and keeps the file name", () => {
    const hosting = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8")).hosting;
    const redirects = hosting.redirects || [];
    const file = redirects.find((row) => row.source === "/lab/cheer/:file");
    assert.ok(file, "missing /lab/cheer/:file redirect");
    assert.equal(file.destination, "/cheer/:file");
    assert.equal(file.type, 301);
    assert.ok(redirects.some((row) => row.source === "/lab/cheer" && row.destination === "/cheer/index.html"));
  });

  it("gives operators copy and QR on event-admin, not a member-home tab", () => {
    const admin = fs.readFileSync(path.join(root, "event-admin.html"), "utf8");
    assert.match(admin, /id="copy-cheer-bib"/);
    assert.match(admin, /id="copy-cheer-board"/);
    assert.match(admin, /id="cheer-bib-qr"/);
    assert.match(admin, /id="cheer-board-qr"/);
    assert.match(admin, /cheer\/bib\.html/);
    assert.match(admin, /cheer\/index\.html/);
    assert.match(admin, /대회 전에는 선수에게 배번 링크를, 당일에는 응원 보드 링크를 보내세요/);
    assert.doesNotMatch(admin, /id="copy-bib-link-btn"/);
    assert.doesNotMatch(admin, /배번 입력 링크 복사/);
    assert.doesNotMatch(admin, /function bibUrl/);
    for (const name of rootHtmlFiles()) {
      if (name === "event-admin.html" || name === "event-home.html") continue;
      const text = fs.readFileSync(path.join(root, name), "utf8");
      assert.doesNotMatch(text, /\/cheer\/|cheer\/(?:index|bib|waves)\.html/, name);
    }
    const tabs = fs.readFileSync(path.join(root, "assets/event-member-tabs.js"), "utf8");
    const home = fs.readFileSync(path.join(root, "event-home.html"), "utf8");
    const action = fs.readFileSync(path.join(root, "assets/event-home-action.js"), "utf8");
    assert.doesNotMatch(tabs, /cheer/);
    assert.doesNotMatch(home, /data-tab="cheer"/);
    assert.match(action, /"my-bib\.html" \+ q/);
  });

  it("links member home to the public board and full-marathon goal form", () => {
    const home = fs.readFileSync(path.join(root, "event-home.html"), "utf8");
    const homeStart = home.indexOf('id="home"');
    const tabStart = home.indexOf('id="eventTabBar"');
    assert.ok(homeStart >= 0 && tabStart > homeStart);
    const homeBlock = home.slice(homeStart, tabStart);
    assert.match(homeBlock, /id="cheerBoardLink"/);
    assert.match(homeBlock, />응원 보드</);
    assert.match(homeBlock, /cheer\/index\.html/);
    assert.match(homeBlock, /id="cheerGoalLink"/);
    assert.match(homeBlock, />목표·조 수정</);
    assert.doesNotMatch(homeBlock, />풀코스 목표 입력</);
    assert.match(homeBlock, /cheer\/bib\.html/);
    assert.match(home, /EventHomeAction\.cheerLinks/);
    assert.doesNotMatch(home, /cheer\/waves\.html/);
    assert.doesNotMatch(home, /data-tab="cheer"/);
    assert.doesNotMatch(home, /cheer-board|cheer-runner|subAction=waves/);
  });
});
