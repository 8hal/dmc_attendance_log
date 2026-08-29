"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  startSession,
  stopSession,
  hasEverStartedSession,
  isSessionActive,
  pickRetryParticipants,
  decideAutoScrapeTick,
  mergeJobResultsByBib,
  participantConfirmKey,
  WINDOW_MS,
} = require("../../functions/lib/group-scrape-session.js");

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "../..", rel), "utf8");
}

function extractFn(html, name) {
  const start = html.indexOf("function " + name + "(");
  assert.ok(start >= 0, "missing function " + name);
  const next = html.indexOf("\n    function ", start + 1);
  const nextAsync = html.indexOf("\n    async function ", start + 1);
  let end = html.length;
  if (next > start) end = Math.min(end, next);
  if (nextAsync > start) end = Math.min(end, nextAsync);
  return html.slice(start, end);
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

function scrapePostBlock(src) {
  const start = src.indexOf('subAction === "scrape"');
  assert.ok(start >= 0, "missing scrape subAction");
  const next = src.indexOf('subAction === "confirm-one"', start);
  assert.ok(next > start, "missing confirm-one after scrape");
  return src.slice(start, next);
}

function autoScrapeBlock(src) {
  const start = src.indexOf("exports.groupEventAutoScrape");
  assert.ok(start >= 0, "missing groupEventAutoScrape");
  const next = src.indexOf("exports.scrapeHealthCheck");
  assert.ok(next > start, "missing scrapeHealthCheck after auto scrape");
  return src.slice(start, next);
}

function updateBibBlock(src) {
  const start = src.indexOf('subAction === "update-bib"');
  assert.ok(start >= 0, "missing update-bib");
  const next = src.indexOf('action === "bus-boarding"', start);
  assert.ok(next > start, "missing bus-boarding after update-bib");
  return src.slice(start, next);
}

function triggerGroupScrapeSrc(src) {
  const start = src.indexOf("async function triggerGroupScrape");
  assert.ok(start >= 0, "missing triggerGroupScrape");
  const next = src.indexOf("exports.race = onRequest", start);
  assert.ok(next > start, "missing race export after triggerGroupScrape");
  return src.slice(start, next);
}

function triggerCallAt(src, fromIdx) {
  const callIdx = src.indexOf("triggerGroupScrape", fromIdx);
  assert.ok(callIdx >= 0, "missing triggerGroupScrape call");
  return src.slice(callIdx, callIdx + 700);
}

describe("startSession / stopSession / isSessionActive", () => {
  it("startSession sets startedAt, until = now+6h, intervalMinutes 10", () => {
    const session = startSession(0);
    assert.equal(session.startedAt, new Date(0).toISOString());
    assert.equal(session.until, new Date(WINDOW_MS).toISOString());
    assert.equal(session.intervalMinutes, 10);
  });

  it("stopSession keeps startedAt and sets until to now", () => {
    const started = startSession(0);
    const stopped = stopSession(started, 1);
    assert.equal(stopped.startedAt, started.startedAt);
    assert.equal(stopped.until, new Date(1).toISOString());
    assert.equal(stopped.intervalMinutes, 10);
  });

  it("stopSession without a session still returns an object with startedAt", () => {
    const stopped = stopSession(null, 5);
    assert.ok(stopped.startedAt);
    assert.equal(stopped.until, new Date(5).toISOString());
  });

  it("hasEverStartedSession stays true after stop", () => {
    const stopped = stopSession(startSession(0), 1);
    assert.equal(hasEverStartedSession(stopped), true);
    assert.equal(hasEverStartedSession(null), false);
    assert.equal(hasEverStartedSession({}), false);
  });

  it("isSessionActive is true inside the window and false after until", () => {
    const session = startSession(0);
    assert.equal(isSessionActive(session, 1), true);
    assert.equal(isSessionActive(session, WINDOW_MS - 1), true);
    assert.equal(isSessionActive(session, WINDOW_MS), false);
    assert.equal(isSessionActive(stopSession(session, 1), 2), false);
  });
});

describe("decideAutoScrapeTick", () => {
  it("active session retries even if groupScrapeStatus is done", () => {
    const session = startSession(0);
    assert.equal(
      decideAutoScrapeTick({ groupScrapeSession: session, groupScrapeStatus: "done" }, 60_000, 15, 0),
      "session-retry"
    );
  });
  it("stopped session never oneshots at 15:00", () => {
    const session = stopSession(startSession(0), 1);
    assert.equal(
      decideAutoScrapeTick({ groupScrapeSession: session, groupScrapeStatus: "done" }, 2, 15, 0),
      "skip"
    );
  });
  it("no session object oneshots at 15:00", () => {
    assert.equal(
      decideAutoScrapeTick({ groupScrapeStatus: "pending" }, 0, 15, 0),
      "oneshot"
    );
  });
  it("no session object skips outside 15:00", () => {
    assert.equal(
      decideAutoScrapeTick({ groupScrapeStatus: "pending" }, 0, 14, 0),
      "skip"
    );
  });
  it("running active session skips the tick", () => {
    const session = startSession(0);
    assert.equal(
      decideAutoScrapeTick({ groupScrapeSession: session, groupScrapeStatus: "running" }, 60_000, 10, 0),
      "skip"
    );
  });
});

describe("pickRetryParticipants", () => {
  it("pickRetry skips finishers and confirmed DNS", () => {
    const retry = pickRetryParticipants(
      [
        { realName: "완주", bib: "1", distance: "half" },
        { realName: "DNS", bib: "2", distance: "half" },
        { realName: "미완", bib: "3", distance: "half" },
      ],
      [{ bib: "1", netTime: "1:40:00" }],
      new Set(["DNS_half"])
    );
    assert.deepEqual(retry.map((p) => p.bib), ["3"]);
  });

  it("pickRetry treats 하프마라톤 participant as confirmed when key uses half", () => {
    const retry = pickRetryParticipants(
      [{ realName: "홍길동", bib: "9", distance: "하프마라톤" }],
      [],
      new Set(["홍길동_half"])
    );
    assert.deepEqual(retry, []);
  });
});

describe("mergeJobResultsByBib", () => {
  it("mergeJobResultsByBib keeps other bibs and upserts the scraped bib", () => {
    const merged = mergeJobResultsByBib(
      [
        { bib: "A", netTime: "1:40:00", memberRealName: "완주" },
        { bib: "B", netTime: "", memberRealName: "미완" },
      ],
      [{ bib: "B", netTime: "2:00:00", memberRealName: "미완" }]
    );
    const byBib = Object.fromEntries(merged.map((r) => [r.bib, r]));
    assert.equal(byBib.A.netTime, "1:40:00");
    assert.equal(byBib.B.netTime, "2:00:00");
  });

  it("mergeJobResultsByBib keeps existing empty-bib rows and appends incoming no-bib", () => {
    const merged = mergeJobResultsByBib(
      [
        { bib: "", netTime: "1:00:00", memberRealName: "기존무배번" },
        { bib: "A", netTime: "1:40:00", memberRealName: "완주" },
      ],
      [
        { bib: "A", netTime: "1:41:00", memberRealName: "완주" },
        { bib: "  ", netTime: "9:00:00", memberRealName: "신규무배번" },
      ]
    );
    const empty = merged.filter((r) => !String(r.bib || "").trim());
    assert.equal(empty.length, 2);
    assert.equal(empty[0].memberRealName, "기존무배번");
    assert.equal(empty[1].memberRealName, "신규무배번");
    const byBib = Object.fromEntries(merged.filter((r) => String(r.bib || "").trim()).map((r) => [r.bib, r]));
    assert.equal(byBib.A.netTime, "1:41:00");
  });

  it("participantConfirmKey normalizes 하프마라톤 to half", () => {
    assert.equal(participantConfirmKey("홍길동", "하프마라톤"), "홍길동_half");
    assert.equal(participantConfirmKey(" 홍길동 ", "half"), "홍길동_half");
  });
});

describe("event-admin scrape session UI", () => {
  const html = read("event-admin.html");

  it("has scrape-stop-btn", () => {
    assert.match(html, /id="scrape-stop-btn"/);
  });

  it("posts stop: true", () => {
    assert.match(html, /stop:\s*true/);
  });

  it("keeps scrape-btn as start without stop", () => {
    const startFn = extractAsyncFn(html, "scrapeGroupEvent");
    assert.match(startFn, /subAction:\s*"scrape"/);
    assert.doesNotMatch(startFn, /stop:\s*true/);
    assert.match(html, /id="scrape-btn"/);
  });

  it("checklist item 7 scrape-stop uses until, not stoppedAt", () => {
    assert.match(html, /data-check="scrape-stop"/);
    const fn = extractFn(html, "updateChecklist");
    assert.match(fn, /untilMs\s*<=\s*Date\.now\(\)|until.*Date\.now/);
    assert.doesNotMatch(fn, /stoppedAt/);
    assert.match(fn, /"scrape-stop":\s*scrapeStopped/);
  });
});

describe("scrape POST and auto-scrape wiring", () => {
  const src = read("functions/index.js");

  it("requires group-scrape-session helpers", () => {
    assert.match(src, /require\("\.\/lib\/group-scrape-session"\)/);
    assert.match(src, /startSession/);
    assert.match(src, /stopSession/);
    assert.match(src, /isSessionActive/);
    assert.match(src, /pickRetryParticipants/);
    assert.match(src, /decideAutoScrapeTick/);
  });

  it("handles stop: true before source/participants/running/empty-bib 400s", () => {
    const block = scrapePostBlock(src);
    const stopAt = block.search(/stop\s*===\s*true|body\.stop/);
    assert.ok(stopAt >= 0, "stop: true must be handled in scrape POST");
    const sourceAt = block.indexOf("기록 소스 미입력");
    const partsAt = block.indexOf("참가자 미등록");
    const bibAt = block.indexOf("배번 등록 참가자 없음");
    const runningAt = block.indexOf("이미 스크랩이 진행 중입니다");
    assert.ok(sourceAt > stopAt, "stop before source 400");
    assert.ok(partsAt > stopAt, "stop before participants 400");
    assert.ok(bibAt > stopAt, "stop before empty-bib 400");
    assert.ok(runningAt > stopAt, "stop before running 400");
    assert.match(block, /stopSession/);
    assert.doesNotMatch(block.slice(0, sourceAt), /triggerGroupScrape/);
  });

  it("start scrape sets startSession and does not touch session when running", () => {
    const block = scrapePostBlock(src);
    const runningAt = block.indexOf("이미 스크랩이 진행 중입니다");
    const afterRunning = block.slice(runningAt);
    assert.match(afterRunning, /startSession/);
    const beforeRunning = block.slice(0, runningAt);
    assert.doesNotMatch(beforeRunning, /startSession/);
    assert.match(block, /이미 스크랩이 진행 중입니다/);
  });

  it("never deletes groupScrapeSession", () => {
    assert.doesNotMatch(src, /groupScrapeSession:\s*FieldValue\.delete/);
    assert.doesNotMatch(src, /delete.*groupScrapeSession/);
  });

  it("groupEventAutoScrape uses decideAutoScrapeTick and */10 cron", () => {
    const block = autoScrapeBlock(src);
    assert.match(block, /schedule:\s*"\*\/10 \* \* \* \*"/);
    assert.match(block, /timeZone:\s*"Asia\/Seoul"/);
    assert.match(block, /decideAutoScrapeTick/);
    assert.doesNotMatch(
      block,
      /groupScrapeStatus === "done" \|\| event\.groupScrapeStatus === "running"/
    );
  });

  it("session-retry loads job results and confirmed keys then pickRetryParticipants", () => {
    const block = autoScrapeBlock(src);
    assert.match(block, /session-retry/);
    assert.match(block, /groupScrapeJobId/);
    assert.match(block, /scrape_jobs/);
    assert.match(block, /race_results/);
    assert.match(block, /pickRetryParticipants/);
    assert.match(block, /oneshot/);
    assert.match(block, /pickBibScrapeTargets/);
    assert.match(block, /triggerGroupScrape/);
  });

  it("update-bib triggers one-person scrape only when session is active and not running", () => {
    const block = updateBibBlock(src);
    assert.match(block, /isSessionActive/);
    assert.match(block, /groupScrapeStatus !== "running"/);
    assert.match(block, /triggerGroupScrape/);
  });

  it("triggerGroupScrape mentions reuseExistingJob and mergeJobResultsByBib", () => {
    const fn = triggerGroupScrapeSrc(src);
    assert.match(fn, /reuseExistingJob/);
    assert.match(fn, /mergeJobResultsByBib/);
  });

  it("session-retry call passes reuseExistingJob true or equivalent", () => {
    const block = autoScrapeBlock(src);
    const retryIdx = block.indexOf("session-retry");
    assert.ok(retryIdx >= 0, "missing session-retry");
    const call = triggerCallAt(block, retryIdx);
    assert.match(
      call,
      /reuseExistingJob:\s*true|reuseExistingJob:\s*tick\s*===\s*"session-retry"/
    );
  });

  it("update-bib triggerGroupScrape passes reuseExistingJob true", () => {
    const block = updateBibBlock(src);
    const call = triggerCallAt(block, 0);
    assert.match(call, /reuseExistingJob:\s*true/);
  });

  it("scrape POST triggerGroupScrape does not pass reuseExistingJob true", () => {
    const block = scrapePostBlock(src);
    const call = triggerCallAt(block, 0);
    assert.doesNotMatch(call, /reuseExistingJob:\s*true/);
  });

  it("auto-scrape confirmedKeys uses participantConfirmKey", () => {
    const block = autoScrapeBlock(src);
    assert.match(block, /participantConfirmKey/);
    assert.doesNotMatch(block, /confirmedKeys\.add\(`\$\{name\}_\$\{dist\}`\)/);
    assert.doesNotMatch(block, /normalizeRaceDistance\(dist\)/);
  });
});
