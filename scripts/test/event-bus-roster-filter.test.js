const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  normalizeBoardFilter,
  boardStatus,
  matchesBoardFilter,
  filterRosterRows,
} = require(path.join(__dirname, "../../assets/event-bus-roster-filter.js"));

function row(partial) {
  return {
    nickname: "닉",
    realName: "실명",
    note: "",
    legs: {
      outbound: { required: true, boarded: false },
      return: { required: true, boarded: false },
    },
    ...partial,
  };
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "../..", rel), "utf8");
}

function extractFn(html, name) {
  const start = html.indexOf("function " + name + "(");
  assert.ok(start >= 0, "missing function " + name);
  const next = html.indexOf("\n    function ", start + 1);
  return html.slice(start, next > 0 ? next : html.length);
}

describe("event-bus-roster-filter", () => {
  it("normalizes unknown filter to all", () => {
    assert.equal(normalizeBoardFilter("all"), "all");
    assert.equal(normalizeBoardFilter("pending"), "pending");
    assert.equal(normalizeBoardFilter("boarded"), "boarded");
    assert.equal(normalizeBoardFilter(""), "all");
    assert.equal(normalizeBoardFilter("nope"), "all");
  });

  it("boardStatus is pending / boarded / skip for the current leg", () => {
    const pending = row();
    const boarded = row({
      legs: {
        outbound: { required: true, boarded: true },
        return: { required: true, boarded: false },
      },
    });
    const skip = row({
      legs: {
        outbound: { required: false, boarded: false },
        return: { required: true, boarded: false },
      },
    });
    assert.equal(boardStatus(pending, "outbound"), "pending");
    assert.equal(boardStatus(boarded, "outbound"), "boarded");
    assert.equal(boardStatus(skip, "outbound"), "skip");
    assert.equal(boardStatus(skip, "return"), "pending");
  });

  it("pending filter keeps required unboarded only", () => {
    const pending = row({ nickname: "미탑승" });
    const boarded = row({
      nickname: "탑승",
      legs: {
        outbound: { required: true, boarded: true },
        return: { required: true, boarded: false },
      },
    });
    const skip = row({
      nickname: "해당없음",
      legs: {
        outbound: { required: false, boarded: false },
        return: { required: true, boarded: false },
      },
    });
    assert.equal(matchesBoardFilter(pending, "outbound", "pending"), true);
    assert.equal(matchesBoardFilter(boarded, "outbound", "pending"), false);
    assert.equal(matchesBoardFilter(skip, "outbound", "pending"), false);
    assert.equal(matchesBoardFilter(boarded, "outbound", "boarded"), true);
    assert.equal(matchesBoardFilter(skip, "outbound", "all"), true);
  });

  it("filterRosterRows combines nickname search with board filter", () => {
    const rows = [
      row({ nickname: "개마고원", realName: "박세진" }),
      row({
        nickname: "게살볶음밥",
        legs: {
          outbound: { required: true, boarded: true },
          return: { required: true, boarded: false },
        },
      }),
      row({ nickname: "6스타", note: "앞자리" }),
    ];
    const pending = filterRosterRows(rows, {
      query: "",
      boardFilter: "pending",
      currentLeg: "outbound",
    });
    assert.deepEqual(
      pending.map((r) => r.nickname),
      ["개마고원", "6스타"]
    );
    const searched = filterRosterRows(rows, {
      query: "박세",
      boardFilter: "pending",
      currentLeg: "outbound",
    });
    assert.deepEqual(
      searched.map((r) => r.nickname),
      ["개마고원"]
    );
    const boarded = filterRosterRows(rows, {
      query: "",
      boardFilter: "boarded",
      currentLeg: "outbound",
    });
    assert.deepEqual(
      boarded.map((r) => r.nickname),
      ["게살볶음밥"]
    );
  });
});

describe("event-admin bus board filter UI", () => {
  const html = read("event-admin.html");

  it("loads the filter module and shows 전체/미탑승/탑승 tabs", () => {
    assert.match(html, /src="assets\/event-bus-roster-filter\.js"/);
    assert.match(html, /id="board-filter-all"[^>]*>전체</);
    assert.match(html, /id="board-filter-pending"[^>]*>미탑승</);
    assert.match(html, /id="board-filter-boarded"[^>]*>탑승</);
  });

  it("renderRoster applies EventBusRosterFilter before painting cards", () => {
    const fn = extractFn(html, "renderRoster");
    assert.match(fn, /EventBusRosterFilter\.filterRosterRows/);
    const setFn = extractFn(html, "setBoardFilter");
    assert.match(setFn, /board-filter-pending/);
    assert.match(setFn, /renderRoster\(/);
  });
});

describe("boarding-admin bus board filter UI", () => {
  const html = read("boarding-admin.html");

  it("loads the filter module and shows 전체/미탑승/탑승 tabs", () => {
    assert.match(html, /src="assets\/event-bus-roster-filter\.js"/);
    assert.match(html, /id="boardFilterAll"[^>]*>전체</);
    assert.match(html, /id="boardFilterPending"[^>]*>미탑승</);
    assert.match(html, /id="boardFilterBoarded"[^>]*>탑승</);
  });

  it("renderRoster applies EventBusRosterFilter", () => {
    const fn = extractFn(html, "renderRoster");
    assert.match(fn, /EventBusRosterFilter\.filterRosterRows/);
  });
});
