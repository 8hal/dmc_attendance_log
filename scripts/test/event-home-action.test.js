const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { resolveNextAction, pageHref } = require(path.join(
  __dirname,
  "../../assets/event-home-action.js"
));

describe("event-home-action", () => {
  it("no nickname → pick_identity", () => {
    const a = resolveNextAction({});
    assert.equal(a.kind, "pick_identity");
    assert.equal(a.ctaKind, "none");
  });

  it("outbound bus before bib", () => {
    const a = resolveNextAction({
      nickname: "하우스",
      busEnabled: true,
      busRow: {
        legs: {
          outbound: { required: true, boarded: false },
          return: { required: true, boarded: false },
        },
      },
      participant: { bib: "" },
      confirmMode: "none",
    });
    assert.equal(a.kind, "bus_outbound");
    assert.equal(a.ctaLabel, "탑승하기");
  });

  it("bib after outbound boarded", () => {
    const a = resolveNextAction({
      nickname: "하우스",
      busEnabled: true,
      busRow: {
        legs: {
          outbound: { required: true, boarded: true },
          return: { required: true, boarded: false },
        },
      },
      participant: { bib: "" },
      confirmMode: "none",
    });
    assert.equal(a.kind, "bib");
  });

  it("confirm pending before return bus", () => {
    const a = resolveNextAction({
      nickname: "하우스",
      busEnabled: true,
      busRow: {
        legs: {
          outbound: { required: true, boarded: true },
          return: { required: true, boarded: false },
        },
      },
      participant: { bib: "12345" },
      confirmMode: "pending",
    });
    assert.equal(a.kind, "confirm_pending");
    assert.equal(a.ctaLabel, "기록 확인하기");
    assert.doesNotMatch(a.ctaLabel, /컨펌/);
    assert.equal(a.secondaryLabel, "오는 버스 탑승");
    assert.equal(a.secondaryHref, "boardingReturn");
  });

  it("waiting_result after bib when scrape not ready; return bus is secondary", () => {
    const a = resolveNextAction({
      nickname: "하우스",
      busEnabled: true,
      busRow: {
        legs: {
          outbound: { required: true, boarded: true },
          return: { required: true, boarded: false },
        },
      },
      participant: { bib: "12345" },
      confirmMode: "none",
    });
    assert.equal(a.kind, "waiting_result");
    assert.equal(a.secondaryHref, "boardingReturn");
  });

  it("return bus after confirm when inbound still open", () => {
    const a = resolveNextAction({
      nickname: "하우스",
      busEnabled: true,
      busRow: {
        legs: {
          outbound: { required: true, boarded: true },
          return: { required: true, boarded: false },
        },
      },
      participant: { bib: "12345" },
      confirmMode: "confirmed",
    });
    assert.equal(a.kind, "bus_return");
    assert.equal(a.ctaHref, "boardingReturn");
  });

  it("confirmed → all_done when buses done", () => {
    const a = resolveNextAction({
      nickname: "하우스",
      busEnabled: true,
      busRow: {
        legs: {
          outbound: { required: true, boarded: true },
          return: { required: true, boarded: true },
        },
      },
      participant: { bib: "12345" },
      confirmMode: "confirmed",
    });
    assert.equal(a.kind, "all_done");
    assert.equal(a.done, true);
    assert.match(a.ctaLabel, /확정/);
    assert.equal(a.secondaryHref, "roster");
  });

  it("bib only when bus disabled", () => {
    const a = resolveNextAction({
      nickname: "하우스",
      busEnabled: false,
      participant: { bib: "" },
      confirmMode: "none",
    });
    assert.equal(a.kind, "bib");
  });

  it("waiting_result when bib set but no confirm yet", () => {
    const a = resolveNextAction({
      nickname: "하우스",
      busEnabled: false,
      participant: { bib: "999" },
      confirmMode: "none",
    });
    assert.equal(a.kind, "waiting_result");
    assert.equal(a.ctaKind, "reload");
    assert.equal(a.secondaryHref, "roster");
  });

  it("pageHref builds event URLs", () => {
    assert.equal(pageHref("home", "evt_x"), "event-home.html?eventId=evt_x");
    assert.equal(pageHref("boarding", "evt_x"), "boarding.html?eventId=evt_x&leg=outbound");
    assert.equal(
      pageHref("boardingReturn", "evt_x"),
      "boarding.html?eventId=evt_x&leg=return"
    );
  });
});
