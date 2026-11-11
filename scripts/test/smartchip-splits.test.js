"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { parseSmartChipResult } = require("../../functions/lib/scraper");
const { FULL_KM, buildCheerBoard, buildCheerRunner } = require("../../functions/lib/cheer-progress");

const FIXTURE_DIR = path.join(__dirname, "fixtures/smartchip");

function loadFixture(name) {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8");
}

function splitPairs(record) {
  return (record.splits || []).map((split) => `${split.label} ${split.time}`);
}

const CASES = [
  {
    file: "incheon2025_202550000298_40486.html",
    name: "강동원",
    bib: "40486",
    distance: "full",
    netTime: "03:59:41",
    gender: "M",
    splits: [
      "5.0km 00:28:16",
      "10.0km 00:56:30",
      "15.0km 01:25:09",
      "20.0km 01:52:50",
      "21.1km 01:58:41",
      "25.0km 02:19:14",
      "30.0km 02:47:07",
      "30.5km 02:49:35",
      "35.0km 03:15:39",
      "38.3km 03:34:59",
      "40.0km 03:46:21",
      "42.2km 03:59:41",
    ],
    first: { clockTime: "09:03:13", pace: "05:39" },
    finish: { clockTime: "12:34:39", pace: "06:03" },
  },
  {
    file: "incheon2025_202550000298_50093.html",
    name: "김유정",
    bib: "50093",
    distance: "full",
    netTime: "03:53:09",
    gender: "F",
    splits: [
      "5.0km 00:25:29",
      "10.0km 00:50:23",
      "15.0km 01:15:57",
      "20.0km 01:42:09",
      "21.1km 01:48:04",
      "25.0km 02:09:05",
      "30.0km 02:40:09",
      "30.5km 02:42:34",
      "35.0km 03:10:21",
      "38.3km 03:29:29",
      "40.0km 03:40:23",
      "42.2km 03:53:09",
    ],
  },
  {
    file: "gongju2026_202650000172_30057.html",
    name: "김형석",
    bib: "30057",
    distance: "32K",
    netTime: "02:23:08",
    gender: "M",
    splits: [
      "18.0km 01:18:11",
      "25.9km 01:55:34",
      "32.2km 02:23:08",
    ],
  },
  {
    file: "gongju2026_202650000172_40702.html",
    name: "이영철",
    bib: "40702",
    distance: "full",
    netTime: "03:31:52",
    gender: "M",
    splits: [
      "18.0km 01:27:27",
      "30.9km 02:32:28",
      "42.2km 03:31:52",
    ],
  },
  {
    file: "gyeongju2026_202650000218_11457.html",
    name: "한남규",
    bib: "11457",
    distance: "full",
    netTime: "03:07:26",
    gender: "M",
    splits: [
      "5.0km 00:21:23",
      "10.0km 00:42:42",
      "15.0km 01:03:58",
      "20.0km 01:25:55",
      "25.0km 01:48:30",
      "30.0km 02:10:29",
      "35.0km 02:33:28",
      "40.0km 02:56:43",
      "42.2km 03:07:26",
    ],
  },
  {
    file: "gyeongju2026_202650000218_10300.html",
    name: "이순실",
    bib: "10300",
    distance: "full",
    netTime: "02:51:34",
    gender: "M",
    splits: [
      "5.0km 00:20:05",
      "10.0km 00:39:56",
      "15.0km 00:59:49",
      "20.0km 01:19:41",
      "25.0km 01:39:55",
      "30.0km 01:59:39",
      "35.0km 02:20:41",
      "40.0km 02:41:47",
      "42.2km 02:51:34",
    ],
  },
];

describe("parseSmartChipResult splits", () => {
  for (const sample of CASES) {
    it(`reads ${sample.bib} net time and elapsed splits from saved HTML`, () => {
      const record = parseSmartChipResult(loadFixture(sample.file), sample.name);
      assert.ok(record);
      assert.equal(record.name, sample.name);
      assert.equal(record.bib, sample.bib);
      assert.equal(record.distance, sample.distance);
      assert.equal(record.netTime, sample.netTime);
      assert.equal(record.gender, sample.gender);
      assert.deepEqual(splitPairs(record), sample.splits);
      assert.equal(record.splits.at(-1).time, sample.netTime);
      for (const split of record.splits) {
        assert.match(split.time, /^\d{2}:\d{2}:\d{2}$/);
        assert.equal(split.time === "--:--:--", false);
      }
    });
  }

  it("keeps clock time and pace on a filled incheon split", () => {
    const record = parseSmartChipResult(loadFixture(CASES[0].file), "강동원");
    assert.equal(record.splits[0].clockTime, "09:03:13");
    assert.equal(record.splits[0].pace, "05:39");
    assert.equal(record.splits.at(-1).clockTime, "12:34:39");
    assert.equal(record.splits.at(-1).pace, "06:03");
  });

  it("treats --:--:-- as an empty net and drops a gapped 42.2 split", () => {
    const record = parseSmartChipResult(
      loadFixture("gyeongju2026_notime_202650000218_14433.html"),
      "김선홍"
    );
    assert.ok(record);
    assert.equal(record.bib, "14433");
    assert.equal(record.netTime, "");
    assert.deepEqual(splitPairs(record), [
      "5.0km 00:34:37",
      "10.0km 01:09:41",
      "15.0km 01:42:22",
    ]);
    assert.equal(record.splits.some((split) => split.label.startsWith("42.2")), false);
  });

  it("returns null when there is neither a net time nor a split", () => {
    assert.equal(parseSmartChipResult("<html><body>기록이 없습니다</body></html>", "홍길동"), null);
    assert.equal(parseSmartChipResult("", "홍길동"), null);
  });

  it("reads saved HTML without calling fetch", () => {
    const original = global.fetch;
    let calls = 0;
    global.fetch = () => {
      calls += 1;
      throw new Error("smartchip request is not allowed in tests");
    };
    try {
      const record = parseSmartChipResult(loadFixture(CASES[0].file), "강동원");
      assert.equal(record.netTime, "03:59:41");
      assert.equal(calls, 0);
    } finally {
      global.fetch = original;
    }
  });
});

describe("smartchip splits on the cheer board", () => {
  const start = Date.parse("2026-10-19T08:00:00+09:00");

  function boardFor(record, nowMs) {
    return buildCheerBoard({
      event: {
        eventDate: "2026-10-19",
        waves: [{ id: "a", name: "A조", startAt: "2026-10-19T08:00:00+09:00" }],
        participants: [
          {
            nickname: "선수",
            realName: record.name,
            bib: record.bib,
            distance: "full",
            waveId: "a",
            goalFinishSec: 4 * 3600,
          },
        ],
      },
      jobResults: [record],
      nowMs,
    });
  }

  it("shows a gapped runner at the last real split instead of the finish", () => {
    const record = parseSmartChipResult(
      loadFixture("gyeongju2026_notime_202650000218_14433.html"),
      "김선홍"
    );
    const nowMs = start + (1 * 3600 + 50 * 60) * 1000;
    const board = boardFor(record, nowMs);
    const row = board.runners.find((runner) => runner.bib === "14433");
    assert.ok(row);
    assert.equal(row.finished, false);
    assert.equal(row.chip, true);
    assert.ok(row.km > 15);
    assert.ok(row.km < 20);
    const detail = buildCheerRunner({
      event: {
        eventDate: "2026-10-19",
        waves: [{ id: "a", name: "A조", startAt: "2026-10-19T08:00:00+09:00" }],
        participants: [
          {
            nickname: "선수",
            realName: record.name,
            bib: record.bib,
            distance: "full",
            waveId: "a",
            goalFinishSec: 4 * 3600,
          },
        ],
      },
      jobResults: [record],
      nowMs,
      runnerNickname: "선수",
    });
    assert.equal(detail.splits.some((split) => String(split.label).startsWith("42.2")), false);
    assert.equal(detail.splits.some((split) => split.km === 15), true);
  });

  it("finishes a runner from the net time, not from the 42.2 split alone", () => {
    const record = parseSmartChipResult(loadFixture(CASES[0].file), "강동원");
    const nowMs = start + 8 * 3600 * 1000;
    const board = boardFor(record, nowMs);
    const row = board.runners.find((runner) => runner.bib === "40486");
    assert.equal(row.finished, true);
    assert.equal(row.status, "finished");
    assert.equal(row.km, FULL_KM);
    const detail = buildCheerRunner({
      event: {
        eventDate: "2026-10-19",
        waves: [{ id: "a", name: "A조", startAt: "2026-10-19T08:00:00+09:00" }],
        participants: [
          {
            nickname: "선수",
            realName: record.name,
            bib: record.bib,
            distance: "full",
            waveId: "a",
            goalFinishSec: 4 * 3600,
          },
        ],
      },
      jobResults: [record],
      nowMs,
      runnerNickname: "선수",
    });
    assert.equal(detail.splits.some((split) => split.km === 30.5), true);
    assert.equal(detail.splits.some((split) => split.km === 38.3), true);
  });
});
