const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  PANELS,
  panelFromHash,
  resolveDefaultPanel,
} = require(path.join(__dirname, "../../assets/event-admin-panels.js"));

describe("event-admin-panels", () => {
  it("exposes prep / bus / bib / scrape", () => {
    assert.deepEqual(PANELS, ["prep", "bus", "bib", "scrape"]);
  });

  it("hash override wins when valid", () => {
    assert.equal(panelFromHash("#bus"), "bus");
    assert.equal(panelFromHash("#scrape"), "scrape");
    assert.equal(panelFromHash("#nope"), null);
    assert.equal(panelFromHash(""), null);
  });

  it("bus off → prep", () => {
    assert.equal(
      resolveDefaultPanel({
        busEnabled: false,
        outboundRequired: 40,
        outboundBoarded: 0,
        bibMissing: 12,
        scrapePending: 0,
      }),
      "prep"
    );
  });

  it("bus on and outbound incomplete → bus", () => {
    assert.equal(
      resolveDefaultPanel({
        busEnabled: true,
        outboundRequired: 40,
        outboundBoarded: 3,
        bibMissing: 12,
        scrapePending: 0,
      }),
      "bus"
    );
  });

  it("outbound done but bibs missing → bib", () => {
    assert.equal(
      resolveDefaultPanel({
        busEnabled: true,
        outboundRequired: 40,
        outboundBoarded: 40,
        bibMissing: 12,
        scrapePending: 0,
      }),
      "bib"
    );
  });

  it("bibs filled → scrape", () => {
    assert.equal(
      resolveDefaultPanel({
        busEnabled: true,
        outboundRequired: 40,
        outboundBoarded: 40,
        bibMissing: 0,
        scrapePending: 8,
      }),
      "scrape"
    );
  });
});
