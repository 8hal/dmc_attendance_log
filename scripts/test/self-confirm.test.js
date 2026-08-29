"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  buildSelfConfirmDocId,
  buildSelfConfirmRow,
  assertBibOwnsPending,
  resolveMyPendingState,
} = require("../../functions/lib/self-confirm.js");

describe("self-confirm", () => {
  it("docId는 realName_distance_date", () => {
    const id = buildSelfConfirmDocId({
      realName: "김테스트",
      distance: "half",
      eventDate: "2026-04-12",
    });
    assert.match(id, /김테스트/);
    assert.match(id, /2026-04-12/);
    assert.equal(id, "김테스트_half_2026-04-12");
  });

  it("bib 불일치면 throw", () => {
    assert.throws(() =>
      assertBibOwnsPending({ bib: "4821" }, { bib: "9999" })
    );
  });

  it("bib 일치하면 통과", () => {
    assert.doesNotThrow(() =>
      assertBibOwnsPending({ bib: "4821" }, { bib: "4821" })
    );
  });

  it("row status confirmed + confirmSource personal", () => {
    const row = buildSelfConfirmRow({
      canonicalEventId: "evt1",
      event: {
        eventName: "철원",
        eventDate: "2026-04-12",
        groupSource: { source: "smartchip", sourceId: "x" },
        groupScrapeJobId: "job1",
      },
      participant: {
        realName: "김테스트",
        nickname: "게살볶음밥",
        distance: "half",
        bib: "4821",
      },
      pending: {
        bib: "4821",
        netTime: "1:42:18",
        gunTime: "",
        overallRank: 10,
        gender: "M",
      },
    });
    assert.equal(row.status, "confirmed");
    assert.equal(row.confirmSource, "personal");
    assert.equal(row.bib, "4821");
    assert.equal(row.netTime, "1:42:18");
    assert.equal(row.canonicalEventId, "evt1");
    assert.equal(row.memberRealName, "김테스트");
    assert.equal(row.memberNickname, "게살볶음밥");
    assert.equal(row.jobId, "job1");
    assert.equal(row.source, "smartchip");
    assert.equal(row.sourceId, "x");
    assert.equal(row.pbConfirmed, false);
    assert.equal(row.isGuest, false);
  });

  it("pbConfirmed from participant wins", () => {
    const row = buildSelfConfirmRow({
      canonicalEventId: "evt1",
      event: { eventDate: "2026-09-05", eventName: "철원" },
      participant: { realName: "김테스트", nickname: "닉", bib: "1", distance: "half", pbConfirmed: true },
      pending: { bib: "1", netTime: "1:00:00" },
    });
    assert.equal(row.pbConfirmed, true);
  });

  it("manual finish allows PB; DNS does not", () => {
    const finish = buildSelfConfirmRow({
      canonicalEventId: "evt1",
      event: { eventDate: "2026-09-05", eventName: "철원" },
      participant: { realName: "김테스트", nickname: "닉", bib: "1", distance: "half", netTime: "1:42:00", pbConfirmed: true },
      pending: null,
      allowManual: true,
    });
    assert.equal(finish.source, "manual");
    assert.equal(finish.pbConfirmed, true);
    const dns = buildSelfConfirmRow({
      canonicalEventId: "evt1",
      event: { eventDate: "2026-09-05", eventName: "철원" },
      participant: { realName: "김테스트", nickname: "닉", bib: "1", distance: "half", dnStatus: "DNS" },
      pending: null,
      allowManual: true,
    });
    assert.equal(dns.status, "dns");
    assert.equal(dns.pbConfirmed, false);
  });
});

describe("resolveMyPendingState", () => {
  const participant = { realName: "김테스트", nickname: "닉", bib: "4821", distance: "half" };
  const confirmed = { netTime: "1:42:18", status: "confirmed" };
  const pending = { bib: "4821", netTime: "1:40:00" };

  it("confirmed doc with groupScrapeJobId null → confirmed", () => {
    const out = resolveMyPendingState({
      participant,
      confirmed,
      bib: "4821",
      groupScrapeJobId: null,
      pending: null,
    });
    assert.equal(out.state, "confirmed");
    assert.equal(out.result, confirmed);
  });

  it("no confirmed and no job → none", () => {
    const out = resolveMyPendingState({
      participant,
      confirmed: null,
      bib: "4821",
      groupScrapeJobId: null,
      pending: null,
    });
    assert.equal(out.state, "none");
    assert.equal(out.result, null);
  });

  it("no confirmed, job + pending row → pending", () => {
    const out = resolveMyPendingState({
      participant,
      confirmed: null,
      bib: "4821",
      groupScrapeJobId: "job1",
      pending,
    });
    assert.equal(out.state, "pending");
    assert.equal(out.result, pending);
  });

  it("no participant → none", () => {
    const out = resolveMyPendingState({
      participant: null,
      confirmed,
      bib: "4821",
      groupScrapeJobId: "job1",
      pending,
    });
    assert.equal(out.state, "none");
    assert.equal(out.result, null);
  });
});

describe("my-pending-result wiring", () => {
  it("looks up race_results / buildSelfConfirmDocId before the jobId gate", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
    const start = src.indexOf('subAction === "my-pending-result"');
    assert.ok(start >= 0, "missing my-pending-result");
    const next = src.indexOf('subAction === "public-roster"', start);
    assert.ok(next > start, "missing public-roster after my-pending-result");
    const block = src.slice(start, next);

    const docIdAt = block.indexOf("buildSelfConfirmDocId");
    const resultsAt = block.indexOf("race_results");
    const jobIdAt = block.indexOf("groupScrapeJobId");
    assert.ok(docIdAt >= 0, "must call buildSelfConfirmDocId");
    assert.ok(resultsAt >= 0, "must read race_results");
    assert.ok(jobIdAt >= 0, "pending branch still uses groupScrapeJobId");
    assert.ok(resultsAt < jobIdAt, "race_results lookup must precede the jobId gate");
    assert.ok(docIdAt < jobIdAt, "buildSelfConfirmDocId must precede the jobId gate");
    assert.match(block, /resolveMyPendingState/);
  });
});
