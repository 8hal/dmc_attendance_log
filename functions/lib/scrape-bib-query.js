"use strict";

/**
 * Query string for searchMember / source APIs.
 * Bib present → bib only (no name fallback). Else realName (personal/ops path).
 * @param {{ bib?: string|null, realName?: string|null }} member
 * @returns {string}
 */
function resolveMemberSearchQuery(member) {
  const bib = String(member?.bib ?? "").trim();
  if (bib) return bib;
  return String(member?.realName ?? "").trim();
}

/**
 * Prefer the requested scrape bib on job results when present.
 * @param {string|null|undefined} scrapedBib
 * @param {string|null|undefined} requestBib
 * @returns {string}
 */
function resultBibFromSearch(scrapedBib, requestBib) {
  const req = String(requestBib ?? "").trim();
  if (req) return req;
  return scrapedBib == null ? "" : String(scrapedBib);
}

module.exports = {
  resolveMemberSearchQuery,
  resultBibFromSearch,
};
