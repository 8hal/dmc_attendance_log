const {
  normalizeRaceDistance,
  isCanonicalRaceDistance,
} = require("./raceDistance");

function normalizeBibDistance(distance) {
  const d = normalizeRaceDistance(distance);
  if (!d || d === "unknown" || !isCanonicalRaceDistance(d)) {
    return { ok: false, error: "canonical distance required" };
  }
  return { ok: true, distance: d };
}

module.exports = { normalizeBibDistance };
