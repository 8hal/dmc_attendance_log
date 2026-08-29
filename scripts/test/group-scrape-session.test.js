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
  restoreSubsetFailureStatuses,
  isStuckRunningJob,
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

function healthCheckBlock(src) {
  const start = src.indexOf("exports.scrapeHealthCheck");
  assert.ok(start >= 0, "missing scrapeHealthCheck");
  const next = src.indexOf("async function runWeekendScrapeReadinessCheck", start);
  assert.ok(next > start, "missing readiness check after health check");
  return src.slice(start, next);
}

function opsStuckBlock(src) {
  const start = src.indexOf("Stuck jobs:");
  assert.ok(start >= 0, "missing ops stuck jobs");
  const next = src.indexOf("주말 대회", start);
  assert.ok(next > start, "missing weekend events after stuck jobs");
  return src.slice(start, next);
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

  it("merge drops previous bib for the same memberRealName", () => {
    const merged = mergeJobResultsByBib(
      [{ bib: "A", memberRealName: "홍", netTime: "1:00:00" }],
      [{ bib: "B", memberRealName: "홍", netTime: "1:40:00" }]
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0].bib, "B");
    assert.equal(merged[0].netTime, "1:40:00");
  });

  it("participantConfirmKey normalizes 하프마라톤 to half", () => {
    assert.equal(participantConfirmKey("홍길동", "하프마라톤"), "홍길동_half");
    assert.equal(participantConfirmKey(" 홍길동 ", "half"), "홍길동_half");
  });

  it("two sequential subset merges keep both bibs", () => {
    const afterA = mergeJobResultsByBib(
      [{ bib: "X", netTime: "1:00:00" }, { bib: "Y", netTime: "" }],
      [{ bib: "A", netTime: "1:40:00" }]
    );
    const afterB = mergeJobResultsByBib(afterA, [{ bib: "B", netTime: "2:00:00" }]);
    const byBib = Object.fromEntries(afterB.map((r) => [r.bib, r]));
    assert.equal(byBib.X.netTime, "1:00:00");
    assert.equal(byBib.A.netTime, "1:40:00");
    assert.equal(byBib.B.netTime, "2:00:00");
  });
});

describe("restoreSubsetFailureStatuses / isStuckRunningJob", () => {
  it("restores done/complete when prior status is missing or running", () => {
    assert.deepEqual(restoreSubsetFailureStatuses("running", "running"), {
      groupScrapeStatus: "done",
      scrapeJobStatus: "running",
    });
    assert.deepEqual(restoreSubsetFailureStatuses(undefined, ""), {
      groupScrapeStatus: "done",
      scrapeJobStatus: "complete",
    });
  });

  it("keeps job running when captured job status is running", () => {
    assert.deepEqual(restoreSubsetFailureStatuses("done", "running"), {
      groupScrapeStatus: "done",
      scrapeJobStatus: "running",
    });
  });

  it("keeps prior done and complete on subset failure", () => {
    assert.deepEqual(restoreSubsetFailureStatuses("done", "complete"), {
      groupScrapeStatus: "done",
      scrapeJobStatus: "complete",
    });
    assert.deepEqual(restoreSubsetFailureStatuses("partial_failure", "partial_failure"), {
      groupScrapeStatus: "partial_failure",
      scrapeJobStatus: "partial_failure",
    });
  });

  it("07:00 job rescraped at 13:00 is not stuck at 13:10", () => {
    assert.equal(
      isStuckRunningJob(
        { createdAt: "2026-08-29T07:00:00.000Z", rescrapedAt: "2026-08-29T13:00:00.000Z" },
        "2026-08-29T12:10:00.000Z"
      ),
      false
    );
  });

  it("running job with only old createdAt is stuck", () => {
    assert.equal(
      isStuckRunningJob({ createdAt: "2026-08-29T07:00:00.000Z" }, "2026-08-29T12:10:00.000Z"),
      true
    );
  });

  it("resumedAt beats createdAt for stuck clock", () => {
    assert.equal(
      isStuckRunningJob(
        { createdAt: "2026-08-29T07:00:00.000Z", resumedAt: "2026-08-29T13:00:00.000Z" },
        "2026-08-29T12:10:00.000Z"
      ),
      false
    );
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
    assert.match(block, /claimGroupScrapeRunning/);
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

  it("if (!reusedJob) assigns groupScrapeJobId and reuse omits it", () => {
    const fn = triggerGroupScrapeSrc(src);
    assert.match(fn, /if\s*\(\s*!reusedJob\s*\)[\s\S]{0,200}groupScrapeJobId/);
  });

  it("reuse start jobRef.update does not wipe results and sets rescrapedAt", () => {
    const fn = triggerGroupScrapeSrc(src);
    const reuseStart = fn.indexOf("if (reusedJob)");
    assert.ok(reuseStart >= 0, "missing reusedJob start branch");
    const elseAt = fn.indexOf("} else {", reuseStart);
    assert.ok(elseAt > reuseStart, "missing else after reusedJob start");
    const startUpdate = fn.slice(reuseStart, elseAt);
    assert.match(startUpdate, /jobRef\.update/);
    assert.doesNotMatch(startUpdate, /results:\s*\[\]/);
    assert.match(startUpdate, /rescrapedAt/);
  });

  it("mergeJobResultsByBib runs after scrapeEvent via a post-scrape transaction get", () => {
    const fn = triggerGroupScrapeSrc(src);
    const scrapeAt = fn.indexOf("scraper.scrapeEvent");
    const mergeAt = fn.indexOf("mergeJobResultsByBib");
    const txAt = fn.indexOf("runTransaction", scrapeAt);
    assert.ok(scrapeAt >= 0, "missing scrapeEvent");
    assert.ok(mergeAt > scrapeAt, "mergeJobResultsByBib must follow scrapeEvent");
    assert.ok(txAt > scrapeAt, "runTransaction must follow scrapeEvent");
    const txBody = fn.slice(txAt, txAt + 1600);
    assert.match(txBody, /tx\.get\(\s*jobRef\s*\)/);
    assert.match(txBody, /mergeJobResultsByBib/);
    assert.doesNotMatch(fn, /\bpreviousResults\b/);
  });

  it("subset reuse catch restores event and reused job, but fallback new job can fail", () => {
    const fn = triggerGroupScrapeSrc(src);
    const catchAt = fn.indexOf("} catch (err)");
    assert.ok(catchAt >= 0, "missing catch");
    const catchBlock = fn.slice(catchAt);
    assert.match(catchBlock, /if\s*\(\s*reuseExistingJob/);
    assert.match(catchBlock, /restoreSubsetFailureStatuses/);
    assert.match(catchBlock, /lastSubsetError/);

    const eventIf = catchBlock.search(/if\s*\(\s*reuseExistingJob/);
    const eventElse = catchBlock.indexOf("} else {", eventIf);
    assert.ok(eventElse > eventIf, "reuseExistingJob event branch then else");
    const eventReuse = catchBlock.slice(eventIf, eventElse);
    assert.doesNotMatch(eventReuse, /groupScrapeStatus:\s*"failed"/);
    assert.match(catchBlock.slice(eventElse), /groupScrapeStatus:\s*"failed"/);

    const jobIf = catchBlock.search(/if\s*\(\s*reusedJob/);
    assert.ok(jobIf >= 0, "catch job path must consult reusedJob");
    const jobElse = catchBlock.indexOf("} else {", jobIf);
    assert.ok(jobElse > jobIf, "reusedJob job branch then else");
    const reusedJobCatch = catchBlock.slice(jobIf, jobElse);
    assert.doesNotMatch(reusedJobCatch, /status:\s*"failed"/);
    assert.match(catchBlock.slice(jobElse), /status:\s*"failed"/);
  });

  it("catch restore path keys off reuseExistingJob, not only reusedJob", () => {
    const fn = triggerGroupScrapeSrc(src);
    const catchBlock = fn.slice(fn.indexOf("} catch (err)"));
    assert.match(catchBlock, /if\s*\(\s*reuseExistingJob/);
    const reuseIf = catchBlock.search(/if\s*\(\s*reuseExistingJob/);
    assert.ok(reuseIf >= 0, "catch must consult reuseExistingJob");
    const elseAt = catchBlock.indexOf("} else {", reuseIf);
    assert.ok(elseAt > reuseIf, "reuseExistingJob branch then else");
    const reuseCatch = catchBlock.slice(reuseIf, elseAt);
    assert.doesNotMatch(reuseCatch, /groupScrapeStatus:\s*"failed"/);
    const elseCatch = catchBlock.slice(elseAt);
    assert.match(elseCatch, /groupScrapeStatus:\s*"failed"/);
  });

  it("update-bib claims running via claimGroupScrapeRunning before triggerGroupScrape", () => {
    const block = updateBibBlock(src);
    const claimAt = block.indexOf("claimGroupScrapeRunning");
    const triggerAt = block.indexOf("triggerGroupScrape");
    assert.ok(claimAt >= 0, "missing claimGroupScrapeRunning");
    assert.ok(triggerAt > claimAt, "claim running before triggerGroupScrape");
    assert.match(block.slice(claimAt, triggerAt), /claimed/);
  });

  it("claimGroupScrapeRunning is used in groupEventAutoScrape and update-bib", () => {
    const auto = autoScrapeBlock(src);
    const bib = updateBibBlock(src);
    assert.match(auto, /claimGroupScrapeRunning/);
    assert.match(bib, /claimGroupScrapeRunning/);
    assert.match(src, /async function claimGroupScrapeRunning/);
  });

  it("auto-scrape does not plain-update running without the claim helper", () => {
    const block = autoScrapeBlock(src);
    assert.match(block, /claimGroupScrapeRunning/);
    assert.doesNotMatch(block, /groupScrapeStatus:\s*"running"/);
  });

  it("health check and ops stuck jobs use rescrapedAt||resumedAt||createdAt", () => {
    const health = healthCheckBlock(src);
    const ops = opsStuckBlock(src);
    assert.match(health, /isStuckRunningJob|jobRunningStartedAt|rescrapedAt\s*\|\|\s*resumedAt\s*\|\|\s*createdAt/);
    assert.match(ops, /isStuckRunningJob|jobRunningStartedAt|rescrapedAt\s*\|\|\s*resumedAt\s*\|\|\s*createdAt/);
    assert.doesNotMatch(health, /where\(\s*"createdAt"\s*,\s*"<="\s*,\s*oneHourAgo\s*\)/);
    assert.doesNotMatch(ops, /where\(\s*"createdAt"\s*,\s*"<="\s*,\s*oneHourAgo\s*\)/);
  });
});
