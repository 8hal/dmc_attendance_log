"use strict";

/**
 * Participants with a non-empty bib (after trim) for bib-first scrape.
 * @param {Array<{ bib?: string|null, [key: string]: unknown }>} participants
 * @returns {Array<{ bib: string, [key: string]: unknown }>}
 */
function pickBibScrapeTargets(participants) {
  const list = Array.isArray(participants) ? participants : [];
  const out = [];
  for (const p of list) {
    const bib = String(p?.bib ?? "").trim();
    if (!bib) continue;
    out.push({ ...p, bib });
  }
  return out;
}

/**
 * Find a scrape result by bib. When both `distance` and result.distance are
 * present (non-empty), require distance equality as well.
 * @param {Array<{ bib?: string|null, distance?: string|null, [key: string]: unknown }>} results
 * @param {string|null|undefined} bib
 * @param {string|null|undefined} [distance]
 * @returns {object|null}
 */
function matchResultByBib(results, bib, distance) {
  const targetBib = String(bib ?? "").trim();
  if (!targetBib) return null;

  const wantDist = distance == null ? "" : String(distance).trim();
  const list = Array.isArray(results) ? results : [];

  for (const r of list) {
    if (String(r?.bib ?? "").trim() !== targetBib) continue;
    const resultDist = r?.distance == null ? "" : String(r.distance).trim();
    if (wantDist && resultDist && wantDist !== resultDist) continue;
    return r;
  }
  return null;
}

module.exports = {
  pickBibScrapeTargets,
  matchResultByBib,
};
