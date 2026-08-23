const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  parseBoardingLeg,
  resolveBoardingEntry,
  resolveBoardingDoneLinks,
  resolveReturnConfirmBanner,
} = require(path.join(__dirname, "../../assets/event-boarding-flow.js"));

describe("parseBoardingLeg", () => {
  it("defaults to outbound", () => {
    assert.equal(parseBoardingLeg(""), "outbound");
    assert.equal(parseBoardingLeg("?eventId=e1"), "outbound");
  });

  it("reads return from query", () => {
    assert.equal(parseBoardingLeg("?eventId=e1&leg=return"), "return");
  });
});

describe("resolveBoardingEntry", () => {
  const roster = [
    {
      nickname: "하우스",
      legs: {
        outbound: { required: true, boarded: false },
        return: { required: true, boarded: false },
      },
    },
  ];

  it("no nickname → pick list", () => {
    const e = resolveBoardingEntry({ savedNickname: "", roster, leg: "outbound" });
    assert.equal(e.screen, "list");
  });

  it("saved nickname + required leg → confirm", () => {
    const e = resolveBoardingEntry({
      savedNickname: "하우스",
      roster,
      leg: "outbound",
    });
    assert.equal(e.screen, "confirm");
    assert.equal(e.row.nickname, "하우스");
  });
});

describe("resolveBoardingDoneLinks", () => {
  it("outbound without bib offers bib next", () => {
    const d = resolveBoardingDoneLinks({ completedLeg: "outbound", hasBib: false });
    assert.equal(d.secondaryHref, "bib");
    assert.equal(d.secondaryLabel, "이어서 배번 입력");
  });

  it("return or bib already set has no bib secondary", () => {
    const d = resolveBoardingDoneLinks({ completedLeg: "return", hasBib: false });
    assert.equal(d.secondaryHref, null);
    const withBib = resolveBoardingDoneLinks({ completedLeg: "outbound", hasBib: true });
    assert.equal(withBib.secondaryHref, null);
  });
});

describe("resolveReturnConfirmBanner", () => {
  it("shows on return + pending", () => {
    const b = resolveReturnConfirmBanner({ leg: "return", confirmMode: "pending" });
    assert.equal(b.show, true);
    assert.equal(b.label, "기록 확정하기");
  });

  it("hides on outbound", () => {
    const b = resolveReturnConfirmBanner({ leg: "outbound", confirmMode: "pending" });
    assert.equal(b.show, false);
  });
});
