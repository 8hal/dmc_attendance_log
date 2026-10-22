"use strict";

const { normalizeRaceDistance } = require("./raceDistance");

/**
 * MyResult course_cd → race_results.distance.
 * 2025·2026 춘천/JTBC: Full·EF 42.195, EH 21.098, 10K 10.000.
 * W(휠체어)는 거리 코드가 아니라 부문이라 half로 합치지 않는다.
 */
const MYRESULT_COURSE_DISTANCE = Object.freeze({
  full: "full",
  ef: "full",
  eh: "half",
  half: "half",
  "10k": "10K",
  "10km": "10K",
  "5k": "5K",
  "5km": "5K",
  "3k": "3K",
  "3km": "3K",
});

const MAX_DURATION_SEC = 12 * 3600;

/**
 * @param {unknown} courseCd
 * @returns {string}
 */
function mapMyResultCourse(courseCd) {
  const raw = String(courseCd ?? "").trim();
  if (!raw) return "unknown";
  const mapped = MYRESULT_COURSE_DISTANCE[raw.toLowerCase()];
  if (mapped) return mapped;
  return normalizeRaceDistance(raw);
}

/**
 * Clock time "H:MM:SS" or "HH:MM:SS.s" → milliseconds from midnight.
 * Fractional part is kept (up to ms) so 출발 칩 기준 경과가 넷타임과 맞는다.
 * @param {unknown} raw
 * @returns {number|null}
 */
function clockToMs(raw) {
  const m = String(raw ?? "").trim().match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (!m) return null;
  const frac = m[4] ? Number(m[4].padEnd(3, "0").slice(0, 3)) : 0;
  return ((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000) + frac;
}

/**
 * Elapsed ms → HH:MM:SS. Drops the fractional second (normTime과 동일).
 * @param {number} ms
 * @returns {string}
 */
function formatElapsedMs(ms) {
  let left = ms;
  if (left < 0) left += 24 * 3600 * 1000;
  const total = Math.floor(left / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
function normNetTime(raw) {
  const ms = clockToMs(raw);
  if (ms == null) return "";
  return formatElapsedMs(ms);
}

/**
 * @param {string} hhmmss
 * @returns {number|null}
 */
function hhmmssToSec(hhmmss) {
  const m = String(hhmmss || "").match(/^(\d+):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/**
 * result_guntime이 23:59:* 처럼 시계/센티널이면 빈 문자열.
 * 12시간 이하이고 넷타임보다 많이 짧지 않을 때만 건타임으로 쓴다.
 * @param {unknown} raw
 * @param {string} netTime
 * @returns {string}
 */
function usableGunDuration(raw, netTime) {
  const ms = clockToMs(raw);
  if (ms == null) return "";
  const formatted = formatElapsedMs(ms);
  const sec = hhmmssToSec(formatted);
  if (sec == null || sec <= 0 || sec > MAX_DURATION_SEC) return "";
  const netSec = hhmmssToSec(netTime);
  if (netSec != null && sec + 2 < netSec) return "";
  return formatted;
}

/**
 * @param {object|null|undefined} player
 * @returns {object|null}
 */
function myResultPlayerToRecord(player) {
  if (!player || typeof player !== "object") return null;
  const netTime = normNetTime(player.result_nettime);
  if (!netTime || netTime === "00:00:00") return null;

  const records = Array.isArray(player.records) ? player.records : [];
  const points = records
    .map((r) => {
      const point = r && r.point && typeof r.point === "object" ? r.point : {};
      const distance = Number(point.distance);
      return {
        pointCd: String(r?.point_cd ?? "").trim(),
        label: String(point.name || r?.point_cd || "").trim(),
        distance: Number.isFinite(distance) ? distance : null,
        timeMs: clockToMs(r?.time_point),
      };
    })
    .filter((p) => p.timeMs != null && p.label);

  const start = points.find((p) => p.distance === 0 || p.label === "출발" || p.pointCd === "P0");
  const startMs = start ? start.timeMs : null;

  const splits = [];
  if (startMs != null) {
    const timed = points
      .filter((p) => p !== start && !(p.distance === 0 || p.label === "출발"))
      .slice()
      .sort((a, b) => {
        const da = a.distance == null ? Number.POSITIVE_INFINITY : a.distance;
        const db = b.distance == null ? Number.POSITIVE_INFINITY : b.distance;
        if (da !== db) return da - db;
        return a.label.localeCompare(b.label);
      });
    for (const p of timed) {
      splits.push({ label: p.label, time: formatElapsedMs(p.timeMs - startMs) });
    }
  }

  const finish = points.find((p) => p.label === "도착")
    || points.slice().sort((a, b) => (b.distance || 0) - (a.distance || 0))[0];
  let gunTime = usableGunDuration(player.result_guntime, netTime);
  const courseGunMs = clockToMs(player.course && player.course.guntime);
  if (!gunTime && finish && finish.timeMs != null && courseGunMs != null) {
    gunTime = usableGunDuration(formatElapsedMs(finish.timeMs - courseGunMs), netTime);
  }

  const genderRaw = String(player.gender || "").trim().toUpperCase();
  const gender = genderRaw === "M" || genderRaw === "F" ? genderRaw : null;

  return {
    name: player.name || "",
    bib: String(player.num ?? "").trim(),
    distance: mapMyResultCourse(player.course_cd),
    netTime,
    gunTime: gunTime || "",
    overallRank: null,
    genderRank: null,
    ageGroupRank: null,
    gender,
    splits,
    pace: player.pace_nettime || "",
  };
}

module.exports = {
  MYRESULT_COURSE_DISTANCE,
  mapMyResultCourse,
  myResultPlayerToRecord,
  clockToMs,
  formatElapsedMs,
};
