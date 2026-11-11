const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
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
    assert.equal(row.finished, false);
    assert.equal(row.status, "racing");
    assert.equal(row.recordAnomaly, false);
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
    assert.equal(mapSplitLabelToKm("20K"), 20);
    assert.equal(mapSplitLabelToKm("35"), 35);
    assert.equal(mapSplitLabelToKm("5km"), 5);
    assert.equal(mapSplitLabelToKm("21.1"), 21.0975);
    assert.equal(mapSplitLabelToKm("하프"), 21.0975);
    assert.equal(mapSplitLabelToKm("완주"), FULL_KM);
    assert.equal(mapSplitLabelToKm("도착"), FULL_KM);
    assert.equal(mapSplitLabelToKm("Section 3"), null);
  });

  it("maps decimal km labels, including ones that are not on the 5 km grid", () => {
    assert.equal(mapSplitLabelToKm("30.5km"), 30.5);
    assert.equal(mapSplitLabelToKm("38.3km"), 38.3);
    assert.equal(mapSplitLabelToKm("18.0km"), 18);
    assert.equal(mapSplitLabelToKm("25.9km"), 25.9);
    assert.equal(mapSplitLabelToKm("32.2km"), 32.2);
    assert.equal(mapSplitLabelToKm("30.9km"), 30.9);
    assert.equal(mapSplitLabelToKm("42.2km"), 42.2);
    assert.equal(mapSplitLabelToKm("42"), FULL_KM);
    assert.equal(mapSplitLabelToKm("42.195"), FULL_KM);
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

  it("keeps only complete full runners and includes their real names", () => {
    const board = buildCheerBoard({
      event,
      jobResults: [],
      nowMs: START + 3600 * 1000,
    });
    assert.equal(board.runners.length, 2);
    const blob = JSON.stringify(board);
    assert.equal(blob.includes("박하프"), false);
    assert.equal(blob.includes("최미완"), false);
    const garam = board.runners.find((row) => row.nickname === "가람");
    const bada = board.runners.find((row) => row.nickname === "바다");
    assert.equal(garam.realName, "김가람");
    assert.equal(bada.realName, "이바다");
    assert.ok(board.runners[0].km > board.runners[1].km);
  });

  it("trims a real name and uses an empty string when it is missing", () => {
    const board = buildCheerBoard({
      event: {
        eventDate: "2026-10-19",
        waves: [{ id: "a", name: "A", startAt: "2026-10-19T08:00:00+09:00" }],
        participants: [
          { nickname: "공백", realName: "  김공백  ", bib: "1", distance: "full", waveId: "a", goalFinishSec: GOAL },
          { nickname: "없음", bib: "2", distance: "full", waveId: "a", goalFinishSec: GOAL },
        ],
      },
      jobResults: [],
      nowMs: START + 1000,
    });
    const byNick = Object.fromEntries(board.runners.map((row) => [row.nickname, row.realName]));
    assert.deepEqual(byNick, { 공백: "김공백", 없음: "" });
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
    assert.equal(detail.runner.realName, "김가람");
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

  it("does not expose a stored ready-shot URL on cheer-runner or the board", () => {
    const readyShotUrl = "https://firebasestorage.googleapis.com/v0/b/demo/o/cheer%2Fready.jpg?alt=media&token=abc";
    const withPhoto = {
      ...event,
      participants: event.participants.map((row) => (
        row.nickname === "가람" ? { ...row, readyShotUrl } : row
      )),
    };
    const detail = buildCheerRunner({
      event: withPhoto,
      jobResults: [],
      nowMs: START + 1000,
      runnerNickname: "가람",
    });
    assert.equal(detail.runner.readyShotUrl, undefined);
    assert.equal(detail.runner.nickname, "가람");
    const board = buildCheerBoard({ event: withPhoto, jobResults: [], nowMs: START + 1000 });
    const garam = board.runners.find((row) => row.nickname === "가람");
    assert.equal(garam.readyShotUrl, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(garam, "readyShotUrl"), false);
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

  it("keeps a ready shot when the roster is saved again, including a distance change", () => {
    const url = "https://firebasestorage.googleapis.com/v0/b/demo/o/a.jpg?alt=media&token=t";
    const merged = mergeParticipantProgress(
      [
        { memberId: "m1", nickname: "가", distance: "full", readyShotUrl: url, waveId: "w" },
        { memberId: "m2", nickname: "나", distance: "full", readyShotUrl: url },
      ],
      [
        { memberId: "m1", nickname: "가", distance: "full", bib: "11" },
        { memberId: "m2", nickname: "나", distance: "half", bib: "22" },
      ]
    );
    assert.equal(merged[0].readyShotUrl, url);
    assert.equal(merged[0].waveId, "w");
    assert.equal(merged[1].readyShotUrl, url);
    assert.equal(merged[1].goalFinishSec, undefined);
  });
});

describe("record anomaly", () => {
  // 다음 구간까지 예상 시간의 1.5배, 다만 마지막 구간 이후 최소 15분.
  const GRACE_FLOOR_SEC = 15 * 60;
  function overdueAfterSec(intervalSec) {
    return Math.max(1.5 * intervalSec, GRACE_FLOOR_SEC);
  }

  const event = {
    eventDate: "2026-10-19",
    waves: [{ id: "a", name: "A조", startAt: "2026-10-19T08:00:00+09:00" }],
    participants: [
      { nickname: "끊김", realName: "김끊김", bib: "3082", distance: "full", waveId: "a", goalFinishSec: GOAL },
      { nickname: "무칩", realName: "이무칩", bib: "1037", distance: "full", waveId: "a", goalFinishSec: GOAL },
      { nickname: "느림", realName: "최느림", bib: "6237", distance: "full", waveId: "a", goalFinishSec: GOAL },
      { nickname: "완주", realName: "박완주", bib: "1", distance: "full", waveId: "a", goalFinishSec: GOAL },
    ],
  };

  it("marks a missed next split after 1.5x the expected interval and freezes the last chip", () => {
    const lastKm = 30;
    const lastSec = 3 * 3600;
    const pace = lastSec / lastKm;
    const intervalSec = (35 - lastKm) * pace;
    const wait = overdueAfterSec(intervalSec);
    const stalled = projectRunner({
      startMs: START,
      goalFinishSec: GOAL,
      nowMs: START + (lastSec + wait + 1) * 1000,
      lastSplit: { km: lastKm, elapsedSec: lastSec },
    });
    assert.equal(stalled.status, "recordAnomaly");
    assert.equal(stalled.recordAnomaly, true);
    assert.equal(stalled.finished, false);
    assert.equal(stalled.chip, true);
    assert.equal(stalled.km, lastKm);
    assert.equal(stalled.elapsedSec, lastSec);
    assert.equal(stalled.projectedFinishSec, null);

    const inside = projectRunner({
      startMs: START,
      goalFinishSec: GOAL,
      nowMs: START + (lastSec + intervalSec) * 1000,
      lastSplit: { km: lastKm, elapsedSec: lastSec },
    });
    assert.equal(inside.status, "racing");
    assert.equal(inside.recordAnomaly, false);
    assert.equal(inside.finished, false);
    assert.ok(inside.km > lastKm);
    assert.ok(inside.km < FULL_KM);
    assert.equal(Number.isFinite(inside.projectedFinishSec), true);
  });

  it("waits at least 15 minutes when the next split is only the half", () => {
    const lastKm = 20;
    const pace = 360;
    const lastSec = lastKm * pace;
    const intervalSec = (21.0975 - lastKm) * pace;
    assert.ok(1.5 * intervalSec < GRACE_FLOOR_SEC);
    const stillRacing = projectRunner({
      startMs: START,
      goalFinishSec: GOAL,
      nowMs: START + (lastSec + GRACE_FLOOR_SEC) * 1000,
      lastSplit: { km: lastKm, elapsedSec: lastSec },
    });
    assert.equal(stillRacing.recordAnomaly, false);
    assert.ok(stillRacing.km > lastKm);
    const anomaly = projectRunner({
      startMs: START,
      goalFinishSec: GOAL,
      nowMs: START + (lastSec + GRACE_FLOOR_SEC + 1) * 1000,
      lastSplit: { km: lastKm, elapsedSec: lastSec },
    });
    assert.equal(anomaly.status, "recordAnomaly");
    assert.equal(anomaly.km, lastKm);
    assert.equal(anomaly.elapsedSec, lastSec);
    assert.equal(anomaly.projectedFinishSec, null);
  });

  it("keeps a net-time finish as finished after the grace window", () => {
    const row = projectRunner({
      startMs: START,
      goalFinishSec: GOAL,
      nowMs: START + 8 * 3600 * 1000,
      lastSplit: { km: FULL_KM, elapsedSec: 3 * 3600 + 40 * 60, fromNet: true },
    });
    assert.equal(row.status, "finished");
    assert.equal(row.recordAnomaly, false);
    assert.equal(row.finished, true);
    assert.equal(row.km, FULL_KM);
    assert.equal(row.elapsedSec, 3 * 3600 + 40 * 60);
    assert.equal(row.projectedFinishSec, row.elapsedSec);
  });

  it("keeps a no-chip runner on goal pace until the goal plus 15 minutes", () => {
    const racing = projectRunner({
      startMs: START,
      goalFinishSec: GOAL,
      nowMs: START + 3600 * 1000,
      lastSplit: null,
    });
    assert.equal(racing.status, "racing");
    assert.equal(racing.recordAnomaly, false);
    assert.equal(racing.chip, false);
    assert.ok(racing.km > 0 && racing.km < FULL_KM);
    assert.equal(Number.isFinite(racing.projectedFinishSec), true);

    const atGoal = projectRunner({
      startMs: START,
      goalFinishSec: GOAL,
      nowMs: START + (GOAL + GRACE_FLOOR_SEC) * 1000,
      lastSplit: null,
    });
    assert.equal(atGoal.recordAnomaly, false);
    assert.equal(atGoal.finished, false);
    assert.equal(atGoal.km, FULL_KM);

    const anomaly = projectRunner({
      startMs: START,
      goalFinishSec: GOAL,
      nowMs: START + (GOAL + GRACE_FLOOR_SEC + 1) * 1000,
      lastSplit: null,
    });
    assert.equal(anomaly.status, "recordAnomaly");
    assert.equal(anomaly.recordAnomaly, true);
    assert.equal(anomaly.finished, false);
    assert.equal(anomaly.chip, false);
    assert.equal(anomaly.km, 0);
    assert.equal(anomaly.projectedFinishSec, null);
  });

  it("clears the anomaly when a later split arrives inside the next grace window", () => {
    const lastSec = 3 * 3600;
    const pace = lastSec / 30;
    const wait = overdueAfterSec(5 * pace);
    const nowMs = START + (lastSec + wait + 1) * 1000;
    const stalled = buildCheerBoard({
      event,
      nowMs,
      jobResults: [
        { bib: "3082", distance: "full", netTime: "", splits: [{ label: "30K", time: "03:00:00" }] },
      ],
    });
    const stuck = stalled.runners.find((row) => row.bib === "3082");
    assert.equal(stuck.status, "recordAnomaly");
    assert.equal(stuck.recordAnomaly, true);
    assert.equal(stuck.km, 30);
    assert.equal(stuck.elapsedSec, lastSec);
    assert.equal(stuck.projectedFinishSec, null);
    assert.equal(stuck.etaFinishAt, null);
    assert.equal(stuck.finished, false);

    const caught = buildCheerBoard({
      event,
      nowMs,
      jobResults: [
        {
          bib: "3082",
          distance: "full",
          netTime: "",
          splits: [
            { label: "30K", time: "03:00:00" },
            { label: "35K", time: "03:28:00" },
          ],
        },
      ],
    });
    const moving = caught.runners.find((row) => row.bib === "3082");
    assert.equal(moving.status, "racing");
    assert.equal(moving.recordAnomaly, false);
    assert.equal(moving.finished, false);
    assert.ok(moving.km > 35);
    assert.ok(moving.km < 40);
    assert.equal(Number.isFinite(moving.projectedFinishSec), true);
    assert.equal(typeof moving.etaFinishAt, "string");
  });

  it("does not count an anomaly as racing or finished and leaves a real finish alone", () => {
    const lastSec = 3 * 3600;
    const pace = lastSec / 30;
    const nowMs = START + (lastSec + overdueAfterSec(5 * pace) + 1) * 1000;
    const board = buildCheerBoard({
      event,
      nowMs,
      jobResults: [
        { bib: "3082", distance: "full", netTime: "", splits: [{ label: "30K", time: "03:00:00" }] },
        { bib: "6237", distance: "full", netTime: "", splits: [{ label: "10K", time: "03:40:01" }] },
        { bib: "1", distance: "full", netTime: "03:40:00", splits: [{ label: "도착", time: "03:40:00" }] },
      ],
    });
    const byBib = Object.fromEntries(board.runners.map((row) => [row.bib, row]));
    assert.equal(byBib["3082"].status, "recordAnomaly");
    assert.equal(byBib["3082"].km, 30);
    assert.equal(byBib["6237"].status, "racing");
    assert.equal(byBib["6237"].recordAnomaly, false);
    assert.ok(byBib["6237"].km < byBib["3082"].km);
    assert.equal(byBib["1"].status, "finished");
    assert.equal(byBib["1"].recordAnomaly, false);
    assert.equal(byBib["1"].finished, true);
    assert.equal(byBib["1"].km, FULL_KM);
    assert.equal(byBib["1037"].status, "racing");
    assert.equal(byBib["1037"].recordAnomaly, false);
    assert.ok(byBib["1037"].km > 0);
    const order = board.runners.map((row) => row.bib);
    assert.deepEqual(order, ["1037", "6237", "3082", "1"]);
  });

  it("flags a no-chip runner on the board only after the goal plus 15 minutes", () => {
    const before = buildCheerBoard({
      event,
      nowMs: START + (GOAL + GRACE_FLOOR_SEC) * 1000,
      jobResults: [],
    });
    const still = before.runners.find((row) => row.bib === "1037");
    assert.equal(still.recordAnomaly, false);
    assert.equal(still.chip, false);
    assert.equal(still.km, FULL_KM);

    const after = buildCheerBoard({
      event,
      nowMs: START + (GOAL + GRACE_FLOOR_SEC + 1) * 1000,
      jobResults: [],
    });
    const anomaly = after.runners.find((row) => row.bib === "1037");
    assert.equal(anomaly.status, "recordAnomaly");
    assert.equal(anomaly.km, 0);
    assert.equal(anomaly.projectedFinishSec, null);
    assert.equal(anomaly.etaFinishAt, null);
    assert.equal(anomaly.finished, false);
  });

  it("groups 기록 이상 apart from racing dots and the finish list", () => {
    const html = fs.readFileSync(path.join(__dirname, "../../cheer/index.html"), "utf8");
    const rank = html.slice(html.indexOf("function renderRank"), html.indexOf("function hhmm"));
    assert.match(rank, /if \(runner\.recordAnomaly\) anomaly\.push\(runner\);/);
    assert.match(rank, /else if \(runner\.finished\) done\.push\(runner\);/);
    assert.match(rank, /기록 이상 /);
    assert.match(html, /!r\.finished && !r\.recordAnomaly/);
    const detail = html.slice(html.indexOf("function openRunner"), html.indexOf("function showPicker"));
    assert.match(detail, /runner\.recordAnomaly/);
    assert.match(detail, /기록 이상/);
    assert.match(detail, /runner\.finished[\s\S]*도착 예상/);
    assert.match(html, /기록이 끊긴 선수는 마지막 구간에 멈춰 둡니다/);
  });

  it("keeps an 도착 split as finished when there is no net time", () => {
    const board = buildCheerBoard({
      event,
      nowMs: START + 8 * 3600 * 1000,
      jobResults: [
        { bib: "1", distance: "full", netTime: "", splits: [{ label: "도착", time: "03:40:00" }] },
      ],
    });
    const row = board.runners.find((runner) => runner.bib === "1");
    assert.equal(row.status, "finished");
    assert.equal(row.recordAnomaly, false);
    assert.equal(row.finished, true);
    assert.equal(row.km, FULL_KM);
    assert.equal(row.elapsedSec, 3 * 3600 + 40 * 60);
    assert.equal(row.finishSec, 3 * 3600 + 40 * 60);
  });

  it("does not finish a runner from a 42.2 split when the net time is missing", () => {
    const board = buildCheerBoard({
      event,
      nowMs: START + 8 * 3600 * 1000,
      jobResults: [
        { bib: "1", distance: "full", netTime: "", splits: [{ label: "42.2km", time: "03:10:00" }] },
      ],
    });
    const row = board.runners.find((runner) => runner.bib === "1");
    assert.equal(row.finished, false);
    assert.notEqual(row.status, "finished");
    assert.equal(row.chip, true);
  });

  it("moves a runner using a decimal smartchip split", () => {
    const board = buildCheerBoard({
      event,
      nowMs: START + (3 * 3600 + 40 * 60) * 1000,
      jobResults: [
        {
          bib: "1",
          distance: "full",
          netTime: "",
          splits: [
            { label: "30.5km", time: "02:49:35" },
            { label: "38.3km", time: "03:34:59" },
          ],
        },
      ],
    });
    const row = board.runners.find((runner) => runner.bib === "1");
    assert.equal(row.finished, false);
    assert.equal(row.chip, true);
    assert.ok(row.km >= 38.3);
    assert.ok(row.km < FULL_KM);
  });
});
