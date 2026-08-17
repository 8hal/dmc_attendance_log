"use strict";

/**
 * Sources whose search APIs accept bib as the query (not name-only).
 * - smartchip: nameorbibno
 * - ohmyrace: bib param
 * - spct: searchResultsName accepts bib (2025 철원 live check)
 * marazone always sends bibNum:"" — excluded until fixed.
 * @type {ReadonlySet<string>}
 */
const BIB_MODE_GROUP_SCRAPE_SOURCES = Object.freeze(
  new Set(["smartchip", "ohmyrace", "spct"])
);

/**
 * Whether group scrape may use queryBy=bib for this source.
 * @param {string|null|undefined} source
 * @returns {boolean}
 */
function isBibModeGroupScrapeSource(source) {
  return BIB_MODE_GROUP_SCRAPE_SOURCES.has(String(source ?? "").trim());
}

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

/**
 * Build scrapeEvent members from bib scrape targets.
 * Gender from members map when present; missing realName in roster is allowed.
 * @param {Array<{ realName?: string, nickname?: string, bib?: string, distance?: string }>} scrapeTargets
 * @param {Map<string, { gender?: string }>} membersByRealName
 * @returns {Array<{ realName: string, nickname: string, gender: string, distance: string|undefined, bib: string }>}
 */
function buildBibScrapeMembers(scrapeTargets, membersByRealName) {
  const byName = membersByRealName instanceof Map ? membersByRealName : new Map();
  const list = Array.isArray(scrapeTargets) ? scrapeTargets : [];
  return list.map((t) => {
    const realName = t?.realName == null ? "" : String(t.realName);
    const fromRoster = byName.get(realName);
    return {
      realName,
      nickname: t?.nickname == null ? "" : String(t.nickname),
      gender: (fromRoster && fromRoster.gender) || "",
      distance: t?.distance,
      bib: String(t?.bib ?? "").trim(),
    };
  });
}

module.exports = {
  BIB_MODE_GROUP_SCRAPE_SOURCES,
  isBibModeGroupScrapeSource,
  pickBibScrapeTargets,
  matchResultByBib,
  buildBibScrapeMembers,
};
