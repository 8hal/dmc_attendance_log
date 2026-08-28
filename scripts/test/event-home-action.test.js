const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { resolveNextAction, resolveHomeTasks, pageHref } = require(path.join(
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
    assert.match(a.desc, /탑승을 눌러/);
    assert.doesNotMatch(a.desc, /체크/);
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
    assert.match(a.desc, /확정/);
    assert.doesNotMatch(a.ctaLabel, /컨펌/);
    assert.doesNotMatch(a.desc, /컨펌/);
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

function taskById(tasks, id) {
  return tasks.find((t) => t.id === id);
}

describe("resolveHomeTasks", () => {
  const roundtrip = {
    legs: {
      outbound: { required: true, boarded: false },
      return: { required: true, boarded: false },
    },
  };

  it("always returns the four member tasks in order", () => {
    const tasks = resolveHomeTasks({
      busEnabled: false,
      busRow: null,
      participant: { bib: "" },
      confirmMode: "none",
    });
    assert.deepEqual(
      tasks.map((t) => t.id),
      ["bus_outbound", "bib", "bus_return", "confirm"]
    );
    assert.deepEqual(
      tasks.map((t) => t.title),
      ["가는 버스 탑승", "배번 입력", "오는 버스 탑승", "기록 확인"]
    );
  });

  it("locks both buses until treasurer enables boarding", () => {
    const tasks = resolveHomeTasks({
      busEnabled: false,
      busRow: roundtrip,
      participant: { bib: "" },
      confirmMode: "none",
    });
    assert.equal(taskById(tasks, "bus_outbound").state, "locked");
    assert.equal(taskById(tasks, "bus_return").state, "locked");
    assert.equal(taskById(tasks, "bib").state, "ready");
    assert.equal(taskById(tasks, "confirm").state, "locked");
  });

  it("opens outbound and return independently of bib and confirm", () => {
    const tasks = resolveHomeTasks({
      busEnabled: true,
      busRow: roundtrip,
      participant: { bib: "" },
      confirmMode: "none",
    });
    assert.equal(taskById(tasks, "bus_outbound").state, "ready");
    assert.equal(taskById(tasks, "bus_outbound").hrefKey, "boarding");
    assert.equal(taskById(tasks, "bus_return").state, "ready");
    assert.equal(taskById(tasks, "bus_return").hrefKey, "boardingReturn");
    assert.equal(taskById(tasks, "bib").state, "ready");
    assert.equal(taskById(tasks, "confirm").state, "locked");
  });

  it("marks boarded legs done and skips a leg that is not required", () => {
    const tasks = resolveHomeTasks({
      busEnabled: true,
      busRow: {
        legs: {
          outbound: { required: true, boarded: true },
          return: { required: false, boarded: false },
        },
      },
      participant: { bib: "12" },
      confirmMode: "none",
    });
    assert.equal(taskById(tasks, "bus_outbound").state, "done");
    assert.equal(taskById(tasks, "bus_return").state, "skip");
    assert.equal(taskById(tasks, "bib").state, "done");
  });

  it("opens record confirm only after the result is collected", () => {
    const pending = resolveHomeTasks({
      busEnabled: true,
      busRow: roundtrip,
      participant: { bib: "12" },
      confirmMode: "pending",
    });
    assert.equal(taskById(pending, "confirm").state, "ready");
    assert.equal(taskById(pending, "confirm").ctaKind, "confirm");
    const confirmed = resolveHomeTasks({
      busEnabled: true,
      busRow: roundtrip,
      participant: { bib: "12" },
      confirmMode: "confirmed",
    });
    assert.equal(taskById(confirmed, "confirm").state, "done");
  });
});
