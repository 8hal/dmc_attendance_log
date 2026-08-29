"use strict";

const { normalizeRaceDistance } = require("./raceDistance");

/**
 * confirm 시 race_results.netTime: net → finishTime → gun (DNF 플레이스홀더 제외).
 * Mirrors effectiveNetTimeForConfirm in functions/index.js.
 * @param {{ netTime?: string, finishTime?: string, gunTime?: string }} r
 * @returns {string}
 */
function effectiveNetTimeForConfirm(r) {
  const net = String(r?.netTime || "").trim();
  if (net && net !== "--:--:--" && net !== "-") return net;
  const fin = String(r?.finishTime || "").trim();
  if (fin && fin !== "-") return fin;
  const gun = String(r?.gunTime || "").trim();
  if (gun && gun !== "-") return gun;
  return "";
}

/**
 * race_results docId — same key as confirm-one.
 * @param {{ realName?: string, distance?: string, eventDate?: string }} opts
 * @returns {string}
 */
function buildSelfConfirmDocId({ realName, distance, eventDate }) {
  const safeDate = String(eventDate || "").replace(/[^0-9\-]/g, "");
  const safeName = String(realName || "").replace(/[^a-zA-Z0-9가-힣]/g, "_");
  const distNorm = normalizeRaceDistance(distance);
  const safeDist = String(distNorm || "").replace(/[^a-zA-Z0-9]/g, "_");
  return `${safeName}_${safeDist}_${safeDate}`;
}

/**
 * Home / my-pending-result state. Confirmed race_results wins even with no scrape job.
 * @param {{
 *   participant?: object|null,
 *   confirmed?: object|null,
 *   bib?: string,
 *   groupScrapeJobId?: string|null,
 *   pending?: object|null,
 * }} opts
 * @returns {{ state: "none"|"pending"|"confirmed", result: object|null }}
 */
function resolveMyPendingState({ participant, confirmed, bib, groupScrapeJobId, pending }) {
  if (!participant) return { state: "none", result: null };
  if (confirmed) return { state: "confirmed", result: confirmed };
  if (!bib || !groupScrapeJobId || !pending) return { state: "none", result: null };
  return { state: "pending", result: pending };
}

/**
 * Ensure participant bib owns the pending scrape row.
 * @param {{ bib?: string|null }} participant
 * @param {{ bib?: string|null }|null|undefined} pending
 */
function assertBibOwnsPending(participant, pending) {
  const pBib = String(participant?.bib ?? "").trim();
  const rBib = String(pending?.bib ?? "").trim();
  if (!pBib || !rBib || pBib !== rBib) {
    throw new Error("bib mismatch");
  }
}

/**
 * Build race_results row for participant self-confirm.
 * confirmSource is always "personal".
 * @param {{
 *   canonicalEventId: string,
 *   event: {
 *     eventName?: string,
 *     eventDate?: string,
 *     groupSource?: { source?: string, sourceId?: string },
 *     groupScrapeJobId?: string,
 *   },
 *   participant: {
 *     realName?: string,
 *     nickname?: string,
 *     distance?: string,
 *     bib?: string,
 *     pbConfirmed?: boolean,
 *     note?: string,
 *     dnStatus?: string,
 *     netTime?: string,
 *     finishTime?: string,
 *   },
 *   pending: {
 *     bib?: string,
 *     netTime?: string,
 *     gunTime?: string,
 *     finishTime?: string,
 *     overallRank?: number|null,
 *     gender?: string,
 *     distance?: string,
 *   }|null,
 *   confirmedAt?: string,
 *   allowManual?: boolean,
 * }} opts
 * @returns {object}
 */
function buildSelfConfirmRow({
  canonicalEventId,
  event,
  participant,
  pending,
  confirmedAt,
  allowManual,
}) {
  if (!allowManual) {
    assertBibOwnsPending(participant, pending);
  }

  const ev = event || {};
  const p = participant || {};
  const rowSource = allowManual
    ? {
        netTime: p.netTime,
        finishTime: p.finishTime,
        gunTime: p.gunTime,
      }
    : {
        netTime: pending?.netTime,
        finishTime: pending?.finishTime ?? p.finishTime,
        gunTime: pending?.gunTime,
      };
  const distNorm = normalizeRaceDistance(pending?.distance || p.distance);
  const now = confirmedAt || new Date().toISOString();
  const finishTrim = String(rowSource.finishTime || "").trim();
  const dnStatus = p.dnStatus;
  const isDn = !!String(dnStatus || "").trim();

  const row = {
    jobId: ev.groupScrapeJobId || canonicalEventId,
    canonicalEventId,
    eventName: ev.eventName || "",
    eventDate: ev.eventDate || "",
    source: allowManual ? "manual" : ((ev.groupSource && ev.groupSource.source) || "manual"),
    sourceId: allowManual ? "" : ((ev.groupSource && ev.groupSource.sourceId) || ""),
    memberRealName: p.realName,
    memberNickname: p.nickname || p.realName,
    distance: distNorm,
    netTime: effectiveNetTimeForConfirm(rowSource),
    gunTime: allowManual ? (p.gunTime || "") : (pending?.gunTime || ""),
    bib: String(pending?.bib ?? p.bib ?? "").trim(),
    overallRank: allowManual ? null : (pending?.overallRank != null ? pending.overallRank : null),
    gender: allowManual ? "" : (pending?.gender || ""),
    pbConfirmed: isDn ? false : (p.pbConfirmed != null ? p.pbConfirmed : false),
    isGuest: false,
    note: p.note || "",
    status: dnStatus ? String(dnStatus).toLowerCase() : "confirmed",
    confirmedAt: now,
    confirmSource: "personal",
  };
  if (!dnStatus && finishTrim && finishTrim !== "-") {
    row.finishTime = finishTrim;
  }
  return row;
}

module.exports = {
  buildSelfConfirmDocId,
  buildSelfConfirmRow,
  assertBibOwnsPending,
  effectiveNetTimeForConfirm,
  resolveMyPendingState,
};
