const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  FULL_KM,
  goalFinishSecFromPace,
  mapSplitLabelToKm,
  projectRunner,
  buildCheerBoard,
  buildCheerRunner,
  normalizeWaves,
  resolveProgressPatch,
} = require("../../functions/lib/cheer-progress");

const START = Date.parse("2026-10-19T08:00:00+09:00");
const GOAL = 4 * 3600; // 4:00:00

describe("cheer progress math", () => {
  it("converts pace to finish seconds with FULL_KM * pace", () => {
    assert.equal(goalFinishSecFromPace(360), Math.round(FULL_KM * 360));
    assert.ok(goalFinishSecFromPace(360) > 14000);
  });

  it("stays at 0 km before the wave start", () => {
    const row = projectRunner({
      startMs: START,
      goalFinishSec: GOAL,
      nowMs: START - 60_000,
      lastSplit: null,
    });
    assert.equal(row.km, 0);
    assert.equal(row.elapsedSec, 0);
    assert.equal(row.chip, false);
    assert.ok(Math.abs(row.avgPaceSecPerKm - GOAL / FULL_KM) < 0.01);
  });

  it("projects from goal pace when there is no chip", () => {
    const hour = 3600;
    const row = projectRunner({
      startMs: START,
      goalFinishSec: GOAL,
      nowMs: START + hour * 1000,
      lastSplit: null,
    });
    const expectKm = hour / (GOAL / FULL_KM);
    assert.ok(Math.abs(row.km - expectKm) < 0.02);
    assert.equal(row.elapsedSec, hour);
    assert.equal(row.chip, false);
  });

  it("keeps the last chip km and projects the rest at goal pace", () => {
    const row = projectRunner({
      startMs: START,
      goalFinishSec: GOAL,
      nowMs: START + 3 * 3600 * 1000,
      lastSplit: { km: 30, elapsedSec: 3 * 3600 - 600 },
    });
    const goalPace = GOAL / FULL_KM;
    const expectKm = 30 + 600 / goalPace;
    assert.ok(Math.abs(row.km - expectKm) < 0.05);
    assert.equal(row.chip, true);
    assert.ok(row.km < FULL_KM);
  });

  it("freezes elapsed and pace once the runner is at the finish", () => {
    const row = projectRunner({
      startMs: START,
      goalFinishSec: GOAL,
      nowMs: START + 6 * 3600 * 1000,
      lastSplit: { km: FULL_KM, elapsedSec: 3 * 3600 + 50 * 60, fromNet: true },
    });
    assert.equal(row.km, FULL_KM);
    assert.equal(row.elapsedSec, 3 * 3600 + 50 * 60);
    assert.ok(Math.abs(row.avgPaceSecPerKm - row.elapsedSec / FULL_KM) < 0.01);
  });
});

describe("split labels", () => {
  it("does not map 15, 25, or 35 onto 5 km", () => {
    assert.equal(mapSplitLabelToKm("15"), 15);
    assert.equal(mapSplitLabelToKm("25km"), 25);
    assert.equal(mapSplitLabelToKm("35"), 35);
    assert.equal(mapSplitLabelToKm("5km"), 5);
    assert.equal(mapSplitLabelToKm("21.1"), 21.0975);
    assert.equal(mapSplitLabelToKm("하프"), 21.0975);
    assert.equal(mapSplitLabelToKm("완주"), FULL_KM);
    assert.equal(mapSplitLabelToKm("Section 3"), null);
  });
});

describe("cheer board", () => {
  const event = {
    eventDate: "2026-10-19",
    waves: [
      { id: "a", name: "A조", startAt: "2026-10-19T08:00:00+09:00" },
      { id: "b", name: "B조", startAt: "2026-10-19T08:20:00+09:00" },
    ],
    participants: [
      {
        nickname: "가람",
        realName: "김가람",
        bib: "101",
        distance: "full",
        waveId: "a",
        goalFinishSec: GOAL,
      },
      {
        nickname: "바다",
        realName: "이바다",
        bib: "202",
        distance: "full",
        waveId: "b",
        goalFinishSec: GOAL,
      },
      {
        nickname: "하프러",
        realName: "박하프",
        bib: "303",
        distance: "half",
      },
      {
        nickname: "미완",
        realName: "최미완",
        bib: "404",
        distance: "full",
      },
    ],
  };

  it("keeps only complete full runners and strips real names", () => {
    const board = buildCheerBoard({
      event,
      jobResults: [],
      nowMs: START + 3600 * 1000,
    });
    assert.equal(board.runners.length, 2);
    const blob = JSON.stringify(board);
    assert.equal(blob.includes("김가람"), false);
    assert.equal(blob.includes("이바다"), false);
    assert.equal(board.runners[0].nickname, "가람");
    assert.ok(board.runners[0].km > board.runners[1].km);
  });

  it("attaches mapped splits on the runner detail", () => {
    const detail = buildCheerRunner({
      event,
      jobResults: [
        {
          bib: "101",
          distance: "full",
          netTime: "",
          splits: [
            { label: "10km", time: "00:55:00" },
            { label: "15", time: "01:25:00" },
            { label: "weird", time: "nope" },
          ],
        },
      ],
      nowMs: START + 2 * 3600 * 1000,
      runnerNickname: "가람",
    });
    assert.equal(detail.ok, true);
    assert.equal(detail.runner.nickname, "가람");
    assert.equal(detail.runner.realName, undefined);
    assert.equal(detail.splits.length, 2);
    assert.equal(detail.splits[1].km, 15);
  });

  it("puts a runner with a goal but no wave on the earliest wave", () => {
    const board = buildCheerBoard({
      event: {
        eventDate: "2026-10-19",
        waves: [
          { id: "late", name: "B조", startAt: "2026-10-19T08:20:00+09:00" },
          { id: "early", name: "A조", startAt: "2026-10-19T08:00:00+09:00" },
        ],
        participants: [
          { nickname: "무조", bib: "505", distance: "full", goalFinishSec: GOAL },
          { nickname: "옛조", bib: "606", distance: "full", waveId: "gone", goalFinishSec: GOAL },
        ],
      },
      jobResults: [],
      nowMs: START + 3600 * 1000,
    });
    assert.equal(board.runners.length, 2);
    for (const runner of board.runners) {
      assert.equal(runner.waveId, "early");
      assert.equal(runner.elapsedSec, 3600);
    }
  });

  it("leaves goal runners off the board when no wave exists", () => {
    const board = buildCheerBoard({
      event: {
        eventDate: "2026-10-19",
        participants: [{ nickname: "무조", bib: "505", distance: "full", goalFinishSec: GOAL }],
      },
      jobResults: [],
      nowMs: START,
    });
    assert.equal(board.runners.length, 0);
  });

  it("404s when the nickname is not on the board", () => {
    const detail = buildCheerRunner({
      event,
      jobResults: [],
      nowMs: START,
      runnerNickname: "하프러",
    });
    assert.equal(detail.ok, false);
    assert.equal(detail.status, 404);
  });
});

describe("waves and bib progress", () => {
  it("rejects a start time on another date", () => {
    const result = normalizeWaves(
      [{ name: "A조", startAt: "2026-10-20T08:00:00+09:00" }],
      "2026-10-19"
    );
    assert.equal(result.ok, false);
  });

  it("keeps an existing wave id", () => {
    const result = normalizeWaves(
      [{ id: "a", name: "A조", startAt: "2026-10-19T08:00:00+09:00" }],
      "2026-10-19"
    );
    assert.equal(result.ok, true);
    assert.equal(result.waves[0].id, "a");
  });

  it("accepts wave and goal separately for full and rejects them on half", () => {
    const waves = [{ id: "a", name: "A조", startAt: "2026-10-19T08:00:00+09:00" }];
    const waveOnly = resolveProgressPatch({
      distance: "full",
      body: { waveId: "a" },
      waves,
    });
    assert.equal(waveOnly.ok, true);
    assert.deepEqual(waveOnly.patch, { waveId: "a" });

    const goalOnly = resolveProgressPatch({
      distance: "full",
      body: { goalFinishSec: GOAL },
      waves: [],
    });
    assert.equal(goalOnly.ok, true);
    assert.deepEqual(goalOnly.patch, { goalFinishSec: GOAL });

    const unknownWave = resolveProgressPatch({
      distance: "full",
      body: { waveId: "zz", goalFinishSec: GOAL },
      waves,
    });
    assert.equal(unknownWave.ok, false);
    assert.equal(unknownWave.error, "unknown waveId");

    const emptyGoal = resolveProgressPatch({
      distance: "full",
      body: { waveId: "a", goalFinishSec: 0 },
      waves,
    });
    assert.equal(emptyGoal.ok, false);

    const ok = resolveProgressPatch({
      distance: "full",
      body: { waveId: "a", goalPaceSecPerKm: 360 },
      waves,
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.patch.goalFinishSec, Math.round(FULL_KM * 360));

    const half = resolveProgressPatch({
      distance: "half",
      body: { waveId: "a", goalFinishSec: GOAL },
      waves,
    });
    assert.equal(half.ok, false);

    const halfClear = resolveProgressPatch({
      distance: "half",
      body: {},
      waves,
    });
    assert.equal(halfClear.ok, true);
    assert.equal(halfClear.clearProgress, true);
  });

  it("keeps a bib-only full save from older pages without touching wave or goal", () => {
    const waves = [{ id: "a", name: "A조", startAt: "2026-10-19T08:00:00+09:00" }];
    const bibOnly = resolveProgressPatch({
      distance: "full",
      body: { bib: "1" },
      waves,
    });
    assert.equal(bibOnly.ok, true);
    assert.equal(bibOnly.clearProgress, false);
    assert.equal(bibOnly.patch, null);

    const noWaves = resolveProgressPatch({
      distance: "full",
      body: { bib: "1", distance: "full" },
      waves: [],
    });
    assert.equal(noWaves.ok, true);
    assert.equal(noWaves.patch, null);
  });
});

describe("participants save keeps cheer progress", () => {
  const { mergeParticipantProgress } = require("../../functions/lib/cheer-progress");

  it("carries wave and goal over by memberId when group.html resends the roster", () => {
    const prev = [
      { memberId: "m1", nickname: "가", bib: "1", distance: "full", waveId: "w", goalFinishSec: GOAL },
      { memberId: "m2", nickname: "나", bib: "2", distance: "full", goalFinishSec: GOAL },
    ];
    const next = [
      { memberId: "m1", nickname: "가", realName: "김가", bib: "1", distance: "full" },
      { memberId: "m2", nickname: "나", realName: "이나", bib: "2", distance: "half" },
      { memberId: "m3", nickname: "다", realName: "박다" },
    ];
    const merged = mergeParticipantProgress(prev, next);
    assert.equal(merged[0].waveId, "w");
    assert.equal(merged[0].goalFinishSec, GOAL);
    assert.equal(merged[0].realName, "김가");
    assert.equal(merged[1].goalFinishSec, undefined, "not carried once distance is no longer full");
    assert.deepEqual(merged[2], next[2]);
  });

  it("returns rows unchanged when nothing was saved before", () => {
    const next = [{ memberId: "m1", nickname: "가", bib: "1", distance: "full" }];
    assert.deepEqual(mergeParticipantProgress([], next), next);
    assert.deepEqual(mergeParticipantProgress(undefined, next), next);
  });

  it("does not overwrite values the caller sent", () => {
    const merged = mergeParticipantProgress(
      [{ memberId: "m1", distance: "full", goalFinishSec: GOAL }],
      [{ memberId: "m1", distance: "full", goalFinishSec: 5000 }]
    );
    assert.equal(merged[0].goalFinishSec, 5000);
  });
});
