/**
 * 브라우저용 — 로직은 functions/lib/raceDistance.js 와 동일하게 유지할 것 (DIST_ALIASES 동기화).
 */
(function (g) {
  const RACE_DISTANCE_CANONICAL = [
    "full", "half", "10K", "5K", "3K", "ultra", "unknown",
  ];
  const DIST_ALIASES = {
    "5km": "5K", "5k": "5K", "5K": "5K",
    "3km": "3K", "3k": "3K", "3K": "3K",
    "10km": "10K", "10k": "10K", "10K": "10K",
    half: "half", 하프: "half", Half: "half", HALF: "half",
    하프마라톤: "half", "21.0975km": "half", "21km": "half",
    full: "full", 풀: "full", Full: "full", FULL: "full",
    풀코스: "full", "42.195km": "full", "42km": "full",
    marathon: "full", Marathon: "full",
    ultra: "ultra", 울트라: "ultra", "50km": "ultra", "100km": "ultra",
  };
  function normalizeRaceDistance(raw) {
    const t = String(raw || "").trim();
    if (!t) return "unknown";
    if (DIST_ALIASES[t]) return DIST_ALIASES[t];
    for (const k of Object.keys(DIST_ALIASES)) {
      const v = DIST_ALIASES[k];
      if (t.toLowerCase().includes(k.toLowerCase())) return v;
    }
    if (RACE_DISTANCE_CANONICAL.includes(t)) return t;
    return t;
  }
  g.normalizeRaceDistance = normalizeRaceDistance;
  g.RACE_DISTANCE_CANONICAL = RACE_DISTANCE_CANONICAL;
})(typeof window !== "undefined" ? window : globalThis);
