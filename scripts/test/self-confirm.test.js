"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildSelfConfirmDocId,
  buildSelfConfirmRow,
  assertBibOwnsPending,
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
});
