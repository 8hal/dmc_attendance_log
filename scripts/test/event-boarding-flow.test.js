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

  it("already boarded required leg → done", () => {
    const boarded = [
      {
        nickname: "하우스",
        legs: {
          outbound: { required: true, boarded: true },
          return: { required: true, boarded: false },
        },
      },
    ];
    const e = resolveBoardingEntry({
      savedNickname: "하우스",
      roster: boarded,
      leg: "outbound",
    });
    assert.equal(e.screen, "done");
  });

  it("unknown nickname or excluded rider → list", () => {
    assert.equal(
      resolveBoardingEntry({ savedNickname: "없는사람", roster, leg: "outbound" }).screen,
      "list"
    );
    const excluded = [
      {
        nickname: "게스트",
        legs: {
          outbound: { required: false, boarded: false },
          return: { required: false, boarded: false },
        },
      },
    ];
    assert.equal(
      resolveBoardingEntry({ savedNickname: "게스트", roster: excluded, leg: "outbound" })
        .screen,
      "list"
    );
  });

  it("uses a pre-matched row (memberId / case)", () => {
    const e = resolveBoardingEntry({
      row: roster[0],
      roster,
      leg: "return",
    });
    assert.equal(e.screen, "confirm");
    assert.equal(e.leg, "return");
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

  it("hides when confirm is not pending", () => {
    assert.equal(
      resolveReturnConfirmBanner({ leg: "return", confirmMode: "none" }).show,
      false
    );
    assert.equal(
      resolveReturnConfirmBanner({ leg: "return", confirmMode: "confirmed" }).show,
      false
    );
  });
});
