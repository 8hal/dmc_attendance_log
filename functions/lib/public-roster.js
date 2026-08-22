/**
 * 회원 공개 명단·결과 행 조립 (실명·배번 제외).
 */
function normalizeNick(n) {
  return String(n || "").trim();
}

function normalizeDist(d) {
  return String(d || "").trim().toLowerCase();
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
 * @returns {Array<{ nickname: string, distance: string, netTime: string|null, pbConfirmed: boolean, hasResult: boolean }>}
 */
function buildPublicRosterRows(participants, confirmedByKey, normalizeDistance) {
  const list = Array.isArray(participants) ? participants : [];
  const norm =
    typeof normalizeDistance === "function"
      ? normalizeDistance
      : (d) => normalizeDist(d);
  const map =
    confirmedByKey instanceof Map
      ? confirmedByKey
      : new Map(Object.entries(confirmedByKey || {}));

  const rows = [];
  for (const p of list) {
    const nickname = normalizeNick(p && p.nickname);
    if (!nickname) continue;
    const confirmed = findConfirmedForParticipant(p, map, norm);
    const isConfirmed = !!(confirmed && String(confirmed.status || "") === "confirmed");
    const netRaw = confirmed
      ? String(confirmed.netTime || confirmed.gunTime || confirmed.finishTime || "").trim()
      : "";
    const netTime =
      isConfirmed && netRaw && netRaw !== "-" && netRaw !== "--:--:--"
        ? netRaw
        : null;
    const fromConfirmed = confirmed && confirmed.distance != null ? String(confirmed.distance).trim() : "";
    const distance = isMissingDistance(p && p.distance, norm)
      ? norm(fromConfirmed || "") || ""
      : norm(p.distance || "");
    rows.push({
      nickname,
      distance: distance || "",
      netTime,
      pbConfirmed: !!(confirmed && confirmed.pbConfirmed),
      hasResult: isConfirmed,
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

/**
 * sortBy: "result" | "nick" | "distance"
 * result: hasResult first, then netTime asc, no result last; then nick
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
    // result
    if (a.hasResult !== b.hasResult) return a.hasResult ? -1 : 1;
    const sa = timeToSortSeconds(a.netTime);
    const sb = timeToSortSeconds(b.netTime);
    if (sa != null && sb != null && sa !== sb) return sa - sb;
    if (sa != null && sb == null) return -1;
    if (sa == null && sb != null) return 1;
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
