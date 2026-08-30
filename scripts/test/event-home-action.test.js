const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const {
  resolveProfileCard,
  resolveBusCard,
  PROFILE_DISTANCES,
  pickNicknames,
  busRouteTitle,
} = require(path.join(__dirname, "../../assets/event-home-action.js"));

describe("event-home-action", () => {
  it("profile distances put full half 10K first", () => {
    assert.deepEqual(PROFILE_DISTANCES.slice(0, 3), ["full", "half", "10K"]);
    assert.ok(!PROFILE_DISTANCES.includes("unknown"));
  });

  it("no bib → profile bib", () => {
    const p = resolveProfileCard({
      participant: { bib: "", distance: "" },
      confirmMode: "none",
      isGuest: false,
    });
    assert.equal(p.state, "bib");
    assert.match(p.prompt, /대회 기록 자동 수집을 위해 배번과 종목을 입력해주세요/);
    assert.doesNotMatch(p.prompt, /먼저/);
  });

  it("bib without distance stays bib", () => {
    const p = resolveProfileCard({
      participant: { bib: "4821", distance: "" },
      confirmMode: "none",
    });
    assert.equal(p.state, "bib");
    assert.match(p.prompt, /대회 기록 자동 수집을 위해 배번과 종목을 입력해주세요/);
  });

  it("bib+distance no result → wait with large bib", () => {
    const p = resolveProfileCard({
      participant: { bib: "4821", distance: "half" },
      confirmMode: "none",
    });
    assert.equal(p.state, "wait");
    assert.match(p.prompt, /대회가 종료되면 기록을 자동 수집합니다/);
    assert.match(p.prompt, /대회 종료 후 기록을 확정해주세요/);
    assert.doesNotMatch(p.prompt, /기록이 올라오면 여기서 확인해요/);
    assert.equal(p.showManual, true);
    assert.equal(p.largeBib, true);
  });

  it("pending → confirm with pb", () => {
    const p = resolveProfileCard({
      participant: { bib: "4821", distance: "half" },
      confirmMode: "pending",
    });
    assert.equal(p.state, "pending");
    assert.equal(p.showPb, true);
    assert.equal(p.showManual, true);
  });

  it("아니에요 → bib edit, not manual", () => {
    const p = resolveProfileCard({
      participant: { bib: "4821", distance: "half" },
      confirmMode: "pending",
      intent: "reject",
    });
    assert.equal(p.state, "bib");
    assert.equal(p.showManual, false);
  });

  it("직접 입력 → manual; finish has PB, DNS does not", () => {
    const finish = resolveProfileCard({
      participant: { bib: "4821", distance: "half" },
      confirmMode: "none",
      intent: "manual",
      manualKind: "finish",
    });
    assert.equal(finish.state, "manual");
    assert.equal(finish.showPb, true);
    const dns = resolveProfileCard({
      participant: { bib: "4821", distance: "half" },
      intent: "manual",
      manualKind: "dns",
    });
    assert.equal(dns.showPb, false);
  });

  it("confirmed → copy only, no extra CTA", () => {
    const p = resolveProfileCard({
      participant: { bib: "4821", distance: "half" },
      confirmMode: "confirmed",
    });
    assert.equal(p.state, "confirmed");
    assert.match(p.prompt, /끝\. 동마클 대회 기록에 저장됐어요/);
    assert.equal(p.ctaLabel, null);
    assert.equal(p.ctaHref, null);
    assert.equal(p.secondaryHref, null);
    assert.equal(p.showManual, false);
  });

  it("guest has no profile confirm", () => {
    const p = resolveProfileCard({ isGuest: true, participant: null });
    assert.equal(p.state, "guest");
    assert.match(p.prompt, /지인 탑승은 대회 기록에 남지 않아요/);
  });

  it("bus ready independent of missing bib", () => {
    const b = resolveBusCard({
      openLeg: "outbound",
      busRow: {
        rideType: "roundtrip",
        legs: {
          outbound: { required: true, boarded: false },
          return: { required: true, boarded: false },
        },
      },
    });
    assert.equal(b.state, "ready");
    assert.equal(b.leg, "outbound");
    assert.equal(b.ctaLabel, "탑승하기");
  });

  it("outbound_only does not get return CTA", () => {
    const b = resolveBusCard({
      openLeg: "return",
      busRow: {
        legs: {
          outbound: { required: true, boarded: true },
          return: { required: false, boarded: false },
        },
      },
    });
    assert.notEqual(b.state, "ready");
  });

  it("no roster row → ask treasurer", () => {
    const b = resolveBusCard({ openLeg: "outbound", busRow: null });
    assert.equal(b.state, "missing");
    assert.match(b.prompt, /버스 명단/);
    assert.match(
      b.prompt,
      /이번 대회 버스 명단에 없습니다\. 버스 탑승 예정이면 총무에게 문의하세요/
    );
  });

  it("openLeg null and outbound required → locked, not time", () => {
    const b = resolveBusCard({
      openLeg: null,
      busRow: {
        legs: {
          outbound: { required: true, boarded: false },
          return: { required: true, boarded: false },
        },
      },
    });
    assert.equal(b.state, "locked");
    assert.match(b.prompt, /가는 버스 탑승 시간이 아닙니다/);
  });

  it("return_only closed is locked, not return time", () => {
    const b = resolveBusCard({
      openLeg: null,
      busRow: {
        rideType: "return_only",
        legs: {
          outbound: { required: false, boarded: false },
          return: { required: true, boarded: false },
        },
      },
    });
    assert.equal(b.state, "locked");
    assert.match(b.prompt, /오는 버스 탑승 시간이 아닙니다/);
  });

  it("outbound done and return closed is not ready", () => {
    const b = resolveBusCard({
      openLeg: null,
      busRow: {
        legs: {
          outbound: { required: true, boarded: true },
          return: { required: true, boarded: false },
        },
      },
    });
    assert.equal(b.state, "outbound_done");
    assert.notEqual(b.state, "ready");
    assert.notEqual(b.state, "locked");
  });

  it("return boarded is return_done even if outbound still unboarded", () => {
    const b = resolveBusCard({
      openLeg: "return",
      busRow: {
        legs: {
          outbound: { required: true, boarded: false },
          return: { required: true, boarded: true },
        },
      },
    });
    assert.equal(b.state, "return_done");
  });

  it("open return unboarded is ready; boarded is done", () => {
    const ready = resolveBusCard({
      openLeg: "return",
      busRow: {
        legs: {
          outbound: { required: true, boarded: true },
          return: { required: true, boarded: false },
        },
      },
    });
    assert.equal(ready.state, "ready");
    assert.equal(ready.leg, "return");
    assert.equal(ready.ctaLabel, "탑승하기");
    const done = resolveBusCard({
      openLeg: "return",
      busRow: {
        legs: {
          outbound: { required: true, boarded: true },
          return: { required: true, boarded: true },
        },
      },
    });
    assert.notEqual(done.state, "ready");
  });

  it("QR pick lists roster required for openLeg, including guests", () => {
    const nicks = pickNicknames({
      boardLanding: true,
      openLeg: "outbound",
      participants: [{ nickname: "기록만회원" }],
      roster: [
        {
          nickname: "가는지인",
          isGuest: true,
          legs: { outbound: { required: true, boarded: false } },
        },
        {
          nickname: "오는만",
          legs: { outbound: { required: false }, return: { required: true } },
        },
      ],
    });
    assert.deepEqual(nicks, ["가는지인"]);
  });

  it("normal pick unions participants and roster", () => {
    const nicks = pickNicknames({
      boardLanding: false,
      participants: [{ nickname: "회원A" }],
      roster: [{ nickname: "지인B", isGuest: true }],
    });
    assert.ok(nicks.includes("회원A"));
    assert.ok(nicks.includes("지인B"));
  });
});

describe("busRouteTitle", () => {
  it("outbound ready is 동탄 → dest", () => {
    assert.equal(
      busRouteTitle({ leg: "outbound", destination: "철원", done: false }),
      "동탄 → 철원"
    );
  });

  it("return ready is dest → 동탄", () => {
    assert.equal(
      busRouteTitle({ leg: "return", destination: "철원", done: false }),
      "철원 → 동탄"
    );
  });

  it("outbound_done appends · 탑승 완료", () => {
    assert.equal(
      busRouteTitle({ leg: "outbound", destination: "철원", done: true }),
      "동탄 → 철원 · 탑승 완료"
    );
  });

  it("return_done appends · 탑승 완료", () => {
    assert.equal(
      busRouteTitle({ leg: "return", destination: "철원", done: true }),
      "철원 → 동탄 · 탑승 완료"
    );
  });

  it("empty destination falls back to 대회", () => {
    assert.equal(
      busRouteTitle({ leg: "outbound", destination: "", done: false }),
      "동탄 → 대회"
    );
    assert.equal(
      busRouteTitle({ leg: "return", destination: null, done: true }),
      "대회 → 동탄 · 탑승 완료"
    );
  });

  it("uses placeClub when provided", () => {
    assert.equal(
      busRouteTitle({
        leg: "outbound",
        placeClub: "판교",
        destination: "철원",
        done: false,
      }),
      "판교 → 철원"
    );
    assert.equal(
      busRouteTitle({
        leg: "return",
        placeClub: "판교",
        destination: "철원",
        done: true,
      }),
      "철원 → 판교 · 탑승 완료"
    );
  });
});

describe("event-home bus card titles", () => {
  it("renderBusCard uses busRouteTitle instead of 가는/오는 버스", () => {
    const html = fs.readFileSync(
      path.join(__dirname, "../../event-home.html"),
      "utf8"
    );
    assert.match(html, /EventHomeAction\.busRouteTitle/);
    assert.doesNotMatch(html, /가는 버스"/);
    assert.doesNotMatch(html, /오는 버스"/);
    assert.doesNotMatch(html, /가는 버스 탑승 완료/);
    assert.doesNotMatch(html, /오는 버스 탑승 완료/);
  });

  it("passes busClubLabel into busRouteTitle", () => {
    const html = fs.readFileSync(
      path.join(__dirname, "../../event-home.html"),
      "utf8"
    );
    assert.match(html, /EventMemberCopy\.busClubLabel/);
    assert.match(html, /placeClub:/);
  });
});
