/**
 * 회원 공개 명단·결과 행 조립 (실명 제외. 배번·recordStatus 포함).
 */
const { matchResultByBib } = require("./group-scrape-bib");
const { effectiveNetTimeForConfirm } = require("./self-confirm");

function normalizeNick(n) {
  return String(n || "").trim();
}

function normalizeDist(d) {
  return String(d || "").trim().toLowerCase();
}

/** @returns {"DNS"|"DNF"|null} */
function publicDnStatus(row) {
  if (!row) return null;
  const candidates = [row.dnStatus, row.status];
  for (const c of candidates) {
    const v = String(c || "").trim().toLowerCase();
    if (v === "dns") return "DNS";
    if (v === "dnf") return "DNF";
  }
  return null;
}

function finishTimeFromConfirmed(confirmed) {
  if (!confirmed) return null;
  const netRaw = String(
    confirmed.netTime || confirmed.gunTime || confirmed.finishTime || ""
  ).trim();
  if (!netRaw || netRaw === "-" || netRaw === "--:--:--") return null;
  return netRaw;
}

function isConfirmedFinish(confirmed, dnStatus) {
  if (!confirmed || dnStatus) return false;
  if (String(confirmed.status || "").toLowerCase() !== "confirmed") return false;
  return !!finishTimeFromConfirmed(confirmed);
}

function isMissingDistance(raw, norm) {
  const t = String(raw == null ? "" : raw).trim();
  if (!t) return true;
  return norm(t) === "unknown";
}

/**
 * Exact `${realName}_${normDist}` first.
 * If participant distance is empty/unknown, fall back to a unique
 * confirmed row for that realName (or bib).
 */
function findConfirmedForParticipant(p, map, norm) {
  const realName = String((p && p.realName) || "").trim();
  const distance = norm(p && p.distance ? p.distance : "");
  const exact = realName ? map.get(`${realName}_${distance}`) : null;
  if (exact) return exact;
  if (!isMissingDistance(p && p.distance, norm)) return null;

  const bib = String((p && p.bib) || "").trim();
  const rows = [];
  map.forEach((row) => {
    if (row) rows.push(row);
  });

  const byName = realName
    ? rows.filter((r) => String(r.memberRealName || "").trim() === realName)
    : [];
  if (byName.length === 1) return byName[0];

  if (bib) {
    const byBib = rows.filter((r) => String(r.bib || "").trim() === bib);
    if (byBib.length === 1) return byBib[0];
  }
  return null;
}

/**
 * @param {Array<object>} participants race_events.participants
 * @param {Map<string, object>|Record<string, object>} confirmedByKey key = `${realName}_${normDist}`
 * @param {(d: string) => string} normalizeDistance
 * @param {Array<object>} [scrapeResults]
 * @returns {Array<{ nickname: string, distance: string, bib: string, netTime: string|null, pbConfirmed: boolean, hasResult: boolean, dnStatus: "DNS"|"DNF"|null, recordStatus: "confirmed"|"scraped"|"none" }>}
 */
function buildPublicRosterRows(participants, confirmedByKey, normalizeDistance, scrapeResults) {
  const list = Array.isArray(participants) ? participants : [];
  const norm =
    typeof normalizeDistance === "function"
      ? normalizeDistance
      : (d) => normalizeDist(d);
  const map =
    confirmedByKey instanceof Map
      ? confirmedByKey
      : new Map(Object.entries(confirmedByKey || {}));
  const scrapeList = Array.isArray(scrapeResults) ? scrapeResults : [];

  const rows = [];
  for (const p of list) {
    const nickname = normalizeNick(p && p.nickname);
    if (!nickname) continue;
    const bib = String((p && p.bib) || "").trim();
    const confirmed = findConfirmedForParticipant(p, map, norm);
    const dnStatus = publicDnStatus(confirmed);
    const isFinish = isConfirmedFinish(confirmed, dnStatus);

    let recordStatus = "none";
    let netTime = null;
    let pbConfirmed = false;
    let hasResult = false;
    let rowDnStatus = null;
    let attachedDistance = "";

    if (confirmed && (dnStatus || isFinish)) {
      recordStatus = "confirmed";
      netTime = dnStatus ? null : finishTimeFromConfirmed(confirmed);
      pbConfirmed = !!confirmed.pbConfirmed;
      hasResult = true;
      rowDnStatus = dnStatus;
      attachedDistance = confirmed.distance != null ? String(confirmed.distance).trim() : "";
    } else {
      const scrapedHit = bib ? matchResultByBib(scrapeList, bib, p && p.distance) : null;
      if (scrapedHit) {
        recordStatus = "scraped";
        const scrapedTime = effectiveNetTimeForConfirm(scrapedHit);
        netTime = scrapedTime || null;
        pbConfirmed = false;
        hasResult = false;
        attachedDistance = scrapedHit.distance != null ? String(scrapedHit.distance).trim() : "";
      }
    }

    const distance = isMissingDistance(p && p.distance, norm)
      ? norm(attachedDistance || "") || ""
      : norm(p.distance || "");
    rows.push({
      nickname,
      distance: distance || "",
      bib,
      netTime,
      pbConfirmed,
      hasResult,
      dnStatus: rowDnStatus,
      recordStatus,
    });
  }
  return rows;
}

function filterPublicRosterRows(rows, { distance, query } = {}) {
  let out = Array.isArray(rows) ? rows.slice() : [];
  const dist = normalizeDist(distance || "");
  if (dist && dist !== "all" && dist !== "전체") {
    out = out.filter((r) => normalizeDist(r.distance) === dist);
  }
  const q = String(query || "").trim().toLowerCase();
  if (q) {
    out = out.filter((r) => String(r.nickname || "").toLowerCase().includes(q));
  }
  return out;
}

/** Parse H:MM:SS or M:SS to seconds; invalid → null */
function timeToSortSeconds(t) {
  const s = String(t || "").trim();
  if (!s || s === "-" || s === "--:--:--") return null;
  const parts = s.split(":").map((x) => Number(x));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function isPublicDnRow(row) {
  const s = String((row && row.dnStatus) || "").toUpperCase();
  return s === "DNS" || s === "DNF";
}

function resultSortBucket(row) {
  const status = String((row && row.recordStatus) || "");
  const sec = timeToSortSeconds(row && row.netTime);
  if (status === "confirmed" && !isPublicDnRow(row) && sec != null) return 0;
  if (status === "scraped" && sec != null) return 1;
  if (status === "scraped") return 2;
  if (status === "confirmed" && isPublicDnRow(row)) return 3;
  return 4;
}

/**
 * sortBy: "result" | "nick" | "distance"
 * result: confirmed times → scraped times → scraped no-time → DNS/DNF → none, then nick
 */
function sortPublicRosterRows(rows, sortBy = "result") {
  const out = Array.isArray(rows) ? rows.slice() : [];
  const mode = String(sortBy || "result");
  out.sort((a, b) => {
    if (mode === "nick") {
      return String(a.nickname).localeCompare(String(b.nickname), "ko");
    }
    if (mode === "distance") {
      const d = String(a.distance).localeCompare(String(b.distance), "ko");
      if (d !== 0) return d;
      return String(a.nickname).localeCompare(String(b.nickname), "ko");
    }
    const bucketDiff = resultSortBucket(a) - resultSortBucket(b);
    if (bucketDiff !== 0) return bucketDiff;
    const sa = timeToSortSeconds(a && a.netTime);
    const sb = timeToSortSeconds(b && b.netTime);
    if (sa != null && sb != null && sa !== sb) return sa - sb;
    return String(a.nickname).localeCompare(String(b.nickname), "ko");
  });
  return out;
}

module.exports = {
  buildPublicRosterRows,
  filterPublicRosterRows,
  sortPublicRosterRows,
  timeToSortSeconds,
};
