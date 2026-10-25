"use strict";

const crypto = require("crypto");
const { matchResultByBib } = require("./group-scrape-bib");

const FULL_KM = 42.195;
const GOAL_MIN_SEC = 3600;
const GOAL_MAX_SEC = 36000;

function goalFinishSecFromPace(paceSecPerKm) {
  const pace = Number(paceSecPerKm);
  if (!Number.isFinite(pace) || pace <= 0) return null;
  return Math.round(FULL_KM * pace);
}

function parseHms(value) {
  const text = String(value == null ? "" : value).trim();
  const match = text.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function mapSplitLabelToKm(label) {
  let text = String(label == null ? "" : label).toLowerCase().replace(/\s+/g, "");
  if (!text) return null;
  if (text.includes("완주") || text.includes("도착") || text.includes("결승") || text === "finish") return FULL_KM;
  if (text === "half" || text === "하프" || text.includes("하프")) return 21.0975;
  text = text.replace(/km$/, "").replace(/k$/, "");
  const num = Number(text);
  if (!Number.isFinite(num)) return null;
  const table = [
    { n: 42.195, km: FULL_KM },
    { n: 42, km: FULL_KM },
    { n: 40, km: 40 },
    { n: 38, km: 38 },
    { n: 35, km: 35 },
    { n: 30, km: 30 },
    { n: 25, km: 25 },
    { n: 21.1, km: 21.0975 },
    { n: 21.0975, km: 21.0975 },
    { n: 20, km: 20 },
    { n: 15, km: 15 },
    { n: 10, km: 10 },
    { n: 5, km: 5 },
  ];
  let best = null;
  for (const row of table) {
    const delta = Math.abs(num - row.n);
    if (delta > 0.051) continue;
    if (!best || delta < best.delta) best = { km: row.km, delta };
  }
  return best ? best.km : null;
}

function kstDateKey(ms) {
  return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function projectRunner(input) {
  const startMs = Number(input && input.startMs);
  const goalFinishSec = Number(input && input.goalFinishSec);
  const nowMs = Number(input && input.nowMs);
  const lastSplit = input && input.lastSplit ? input.lastSplit : null;
  const goalPace = goalFinishSec / FULL_KM;
  const rawElapsed = Math.floor((nowMs - startMs) / 1000);
  if (!Number.isFinite(rawElapsed) || rawElapsed < 0) {
    return {
      km: 0,
      elapsedSec: 0,
      avgPaceSecPerKm: goalPace,
      chip: false,
    };
  }

  const chip = !!(lastSplit && Number(lastSplit.km) > 0);
  let km;
  if (!chip) {
    km = Math.min(FULL_KM, rawElapsed / goalPace);
  } else {
    const extra = Math.max(0, rawElapsed - Number(lastSplit.elapsedSec)) / goalPace;
    km = Math.min(FULL_KM, Number(lastSplit.km) + extra);
  }

  let elapsedSec = rawElapsed;
  let avgPace = km > 0 ? rawElapsed / km : goalPace;
  if (km >= FULL_KM - 1e-9) {
    km = FULL_KM;
    if (lastSplit && lastSplit.fromNet && Number(lastSplit.elapsedSec) > 0) {
      elapsedSec = Number(lastSplit.elapsedSec);
    } else if (lastSplit && Number(lastSplit.km) >= FULL_KM - 1e-9) {
      elapsedSec = Number(lastSplit.elapsedSec);
    } else if (!chip) {
      elapsedSec = Math.round(goalFinishSec);
    } else {
      const remain = Math.max(0, FULL_KM - Number(lastSplit.km));
      elapsedSec = Math.round(Number(lastSplit.elapsedSec) + remain * goalPace);
    }
    avgPace = elapsedSec / FULL_KM;
  }

  return {
    km,
    elapsedSec,
    avgPaceSecPerKm: avgPace,
    chip,
  };
}

function pickLastSplit(result) {
  if (!result) return null;
  const net = parseHms(result.netTime);
  if (net != null && net > 0) {
    return { km: FULL_KM, elapsedSec: net, fromNet: true };
  }
  const splits = Array.isArray(result.splits) ? result.splits : [];
  let best = null;
  for (const split of splits) {
    const km = mapSplitLabelToKm(split && split.label);
    const elapsedSec = parseHms(split && split.time);
    if (km == null || elapsedSec == null) continue;
    if (!best || km > best.km) {
      best = { km, elapsedSec, fromNet: false };
    }
  }
  return best;
}

function publicSplits(result) {
  const splits = result && Array.isArray(result.splits) ? result.splits : [];
  const out = [];
  for (const split of splits) {
    const label = split && split.label != null ? String(split.label) : "";
    const time = split && split.time != null ? String(split.time) : "";
    const km = mapSplitLabelToKm(label);
    const elapsedSec = parseHms(time);
    if (km == null || elapsedSec == null) continue;
    out.push({ label, time, km });
  }
  return out;
}

function waveMap(waves) {
  const map = new Map();
  const list = Array.isArray(waves) ? waves : [];
  for (const wave of list) {
    if (wave && wave.id) map.set(String(wave.id), wave);
  }
  return map;
}

function earliestWave(waves) {
  let best = null;
  for (const wave of waves) {
    const ms = Date.parse(wave && wave.startAt);
    if (!wave || !wave.id || Number.isNaN(ms)) continue;
    if (!best || ms < best.ms) best = { wave, ms };
  }
  return best ? best.wave : null;
}

// Wave is optional: a runner who did not pick one (or picked a deleted one) starts with the first gun.
function runnerWave(participant, wavesById, fallback) {
  return wavesById.get(String(participant.waveId || "")) || fallback;
}

function isBoardRunner(participant, wave) {
  if (!participant || !wave) return false;
  if (String(participant.distance || "") !== "full") return false;
  if (!String(participant.bib || "").trim()) return false;
  const goal = Number(participant.goalFinishSec);
  return Number.isFinite(goal) && goal >= GOAL_MIN_SEC && goal <= GOAL_MAX_SEC;
}

// 칩에 찍힌 출발 시각이 있으면 조 출발 시각보다 우선한다 (같은 KST 날짜 기준).
function chipStartMs(match, waveStartAt) {
  const clock = parseHms(match && match.startClock);
  const waveMs = Date.parse(waveStartAt);
  if (clock == null || Number.isNaN(waveMs)) return null;
  const dayKey = kstDateKey(waveMs);
  const ms = Date.parse(`${dayKey}T00:00:00+09:00`) + clock * 1000;
  return Number.isNaN(ms) ? null : ms;
}

function kstIso(ms) {
  return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 19) + "+09:00";
}

function toPublicRunner(participant, wave, projected, startOverride) {
  return {
    nickname: participant.nickname == null ? "" : String(participant.nickname),
    bib: String(participant.bib).trim(),
    waveId: String(wave.id),
    waveName: wave.name == null ? "" : String(wave.name),
    startAt: startOverride ? startOverride : String(wave.startAt),
    startFromChip: !!startOverride,
    goalFinishSec: Number(participant.goalFinishSec),
    km: projected.km,
    elapsedSec: projected.elapsedSec,
    avgPaceSecPerKm: projected.avgPaceSecPerKm,
    chip: projected.chip === true,
  };
}

function buildCheerBoard(input) {
  const event = (input && input.event) || {};
  const nowMs = Number(input && input.nowMs) || Date.now();
  const jobResults = (input && input.jobResults) || [];
  const waves = Array.isArray(event.waves) ? event.waves : [];
  const wavesById = waveMap(waves);
  const fallback = earliestWave(waves);
  const runners = [];
  for (const participant of event.participants || []) {
    const wave = participant ? runnerWave(participant, wavesById, fallback) : null;
    if (!isBoardRunner(participant, wave)) continue;
    const match = matchResultByBib(jobResults, participant.bib, participant.distance);
    const chipMs = chipStartMs(match, wave.startAt);
    const startMs = chipMs != null ? chipMs : Date.parse(wave.startAt);
    const lastSplit = pickLastSplit(match);
    const projected = projectRunner({
      startMs,
      goalFinishSec: Number(participant.goalFinishSec),
      nowMs,
      lastSplit,
    });
    runners.push(toPublicRunner(participant, wave, projected, chipMs != null ? kstIso(chipMs) : null));
  }
  runners.sort((a, b) => {
    if (b.km !== a.km) return b.km - a.km;
    return String(a.nickname).localeCompare(String(b.nickname), "ko");
  });
  return {
    ok: true,
    nowMs,
    waves: waves.map((wave) => ({
      id: String(wave.id),
      name: wave.name == null ? "" : String(wave.name),
      startAt: String(wave.startAt),
    })),
    runners,
  };
}

function buildCheerRunner(input) {
  const board = buildCheerBoard(input);
  const nickname = String((input && input.runnerNickname) || "").trim();
  const runner = board.runners.find((row) => row.nickname === nickname);
  if (!runner) return { ok: false, status: 404, error: "runner not on board" };
  const event = (input && input.event) || {};
  const participant = (event.participants || []).find(
    (row) => String(row.nickname || "") === nickname
  );
  const match = participant
    ? matchResultByBib(input.jobResults || [], participant.bib, participant.distance)
    : null;
  return {
    ok: true,
    nowMs: board.nowMs,
    runner,
    splits: publicSplits(match),
  };
}

function normalizeWaves(input, eventDate) {
  if (!Array.isArray(input)) return { ok: false, error: "waves required" };
  const waves = [];
  const seen = new Set();
  for (const row of input) {
    const name = String((row && row.name) || "").trim();
    if (!name) return { ok: false, error: "wave name required" };
    const startAt = String((row && row.startAt) || "").trim();
    const startMs = Date.parse(startAt);
    if (!startAt || Number.isNaN(startMs)) return { ok: false, error: "startAt invalid" };
    if (eventDate && kstDateKey(startMs) !== String(eventDate)) {
      return { ok: false, error: "startAt date must match eventDate" };
    }
    let id = String((row && row.id) || "").trim();
    if (!id) id = "w_" + crypto.randomBytes(4).toString("hex");
    if (seen.has(id)) return { ok: false, error: "duplicate wave id" };
    seen.add(id);
    waves.push({ id, name, startAt });
  }
  return { ok: true, waves };
}

function goalFromBody(body) {
  if (body && body.goalFinishSec != null && body.goalFinishSec !== "") {
    const goal = Number(body.goalFinishSec);
    return Number.isFinite(goal) ? Math.round(goal) : null;
  }
  if (body && body.goalPaceSecPerKm != null && body.goalPaceSecPerKm !== "") {
    return goalFinishSecFromPace(body.goalPaceSecPerKm);
  }
  return null;
}

function sentWave(body) {
  return !!(body && body.waveId != null && String(body.waveId).trim());
}

function sentGoal(body) {
  if (!body) return false;
  if (body.goalFinishSec != null && body.goalFinishSec !== "") return true;
  if (body.goalPaceSecPerKm != null && body.goalPaceSecPerKm !== "") return true;
  return false;
}

function resolveProgressPatch(input) {
  const distance = String((input && input.distance) || "");
  const body = (input && input.body) || {};
  const waves = (input && input.waves) || [];
  if (distance !== "full") {
    if (sentWave(body) || sentGoal(body)) {
      return { ok: false, error: "wave and goal are full marathon only" };
    }
    return { ok: true, clearProgress: true, patch: {} };
  }
  // Pages deployed before cheer send bib only; their full runners keep any saved wave/goal.
  if (!sentWave(body) && !sentGoal(body)) {
    return { ok: true, clearProgress: false, patch: null };
  }
  const patch = {};
  if (sentWave(body)) {
    const waveId = String(body.waveId).trim();
    if (!waves.some((wave) => String(wave.id) === waveId)) {
      return { ok: false, error: "unknown waveId" };
    }
    patch.waveId = waveId;
  }
  if (sentGoal(body)) {
    const goalFinishSec = goalFromBody(body);
    if (
      goalFinishSec == null ||
      goalFinishSec < GOAL_MIN_SEC ||
      goalFinishSec > GOAL_MAX_SEC
    ) {
      return { ok: false, error: "goal out of range" };
    }
    patch.goalFinishSec = goalFinishSec;
  }
  return { ok: true, clearProgress: false, patch };
}

// group.html rebuilds each row from memberId/nickname/realName/bib/distance only.
function mergeParticipantProgress(prevList, nextList) {
  const prevById = new Map();
  for (const row of Array.isArray(prevList) ? prevList : []) {
    if (row && row.memberId) prevById.set(String(row.memberId), row);
  }
  return (nextList || []).map((row) => {
    const prev = row && row.memberId ? prevById.get(String(row.memberId)) : null;
    if (!prev || String(row.distance || "") !== "full") return row;
    const merged = { ...row };
    if (merged.waveId === undefined && prev.waveId !== undefined) merged.waveId = prev.waveId;
    if (merged.goalFinishSec === undefined && prev.goalFinishSec !== undefined) {
      merged.goalFinishSec = prev.goalFinishSec;
    }
    return merged;
  });
}

module.exports = {
  mergeParticipantProgress,
  FULL_KM,
  GOAL_MIN_SEC,
  GOAL_MAX_SEC,
  goalFinishSecFromPace,
  parseHms,
  mapSplitLabelToKm,
  projectRunner,
  pickLastSplit,
  buildCheerBoard,
  buildCheerRunner,
  normalizeWaves,
  resolveProgressPatch,
};
