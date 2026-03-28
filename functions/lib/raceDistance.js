/**
 * race_results.distance — 저장·표시 전 정규화용 enum
 *
 * - canonical 값만 DB에 두는 것을 목표로 하며, 별칭(10km 등)은 normalizeRaceDistance 로 흡수한다.
 * - 사이트 고유 표기(예: 32K)는 매핑 실패 시 원문 유지(기존 scraper 동작과 동일).
 */

/** @type {readonly string[]} */
const RACE_DISTANCE_CANONICAL = Object.freeze([
  "full",
  "half",
  "10K",
  "5K",
  "3K",
  "ultra",
  "unknown",
]);

const DIST_ALIASES = {
  "5km": "5K",
  "5k": "5K",
  "5K": "5K",
  "3km": "3K",
  "3k": "3K",
  "3K": "3K",
  "10km": "10K",
  "10k": "10K",
  "10K": "10K",
  half: "half",
  하프: "half",
  Half: "half",
  HALF: "half",
  하프마라톤: "half",
  "21.0975km": "half",
  "21km": "half",
  "21.1km": "half",
  "Half Marathon": "half",
  full: "full",
  풀: "full",
  Full: "full",
  FULL: "full",
  풀코스: "full",
  "42.195km": "full",
  "42km": "full",
  marathon: "full",
  Marathon: "full",
  ultra: "ultra",
  Ultra: "ultra",
  울트라: "ultra",
  "50km": "ultra",
  "50k": "ultra",
  "100km": "ultra",
  "100k": "ultra",
  "20km": "20K",
  "20k": "20K",
  "20K": "20K",
  "20Km": "20K",
};

/** 전체 문자열 일치(대소문자 무시) — includes 금지: "25k"·"8.15km" 등에서 "5k" 오탐 방지 */
const DIST_ALIAS_LOWER = Object.freeze(
  Object.fromEntries(
    Object.entries(DIST_ALIASES).map(([k, v]) => [k.toLowerCase(), v])
  )
);

/**
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeRaceDistance(raw) {
  const t = String(raw || "").trim();
  if (!t) return "unknown";
  if (DIST_ALIASES[t]) return DIST_ALIASES[t];
  const byLower = DIST_ALIAS_LOWER[t.toLowerCase()];
  if (byLower) return byLower;
  if (RACE_DISTANCE_CANONICAL.includes(t)) return t;
  return t;
}

/**
 * @param {string} s
 * @returns {boolean}
 */
function isCanonicalRaceDistance(s) {
  return RACE_DISTANCE_CANONICAL.includes(s);
}

module.exports = {
  RACE_DISTANCE_CANONICAL,
  DIST_ALIASES,
  DIST_ALIAS_LOWER,
  normalizeRaceDistance,
  isCanonicalRaceDistance,
};
