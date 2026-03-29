#!/usr/bin/env node
/**
 * confirmed race_results 중복 후보: 같은 대회(식별자) + 같은 실명으로 2건 이상.
 *
 *   node scripts/find-duplicate-race-results.js
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { normalizeRaceDistance } = require("../functions/lib/raceDistance");

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

function row(doc) {
  const d = doc.data();
  const distRaw = d.distance || "";
  const distN = normalizeRaceDistance(distRaw);
  return {
    id: doc.id,
    memberRealName: d.memberRealName || "",
    eventDate: d.eventDate || "",
    eventName: d.eventName || "",
    source: d.source || "",
    sourceId: d.sourceId || "",
    distance: distRaw,
    distanceNorm: distN,
    netTime: d.netTime || "",
    bib: d.bib || "",
    canonicalEventId: d.canonicalEventId || "",
    jobId: d.jobId || "",
    pbConfirmed: !!d.pbConfirmed,
    isGuest: !!d.isGuest,
  };
}

function add(map, key, r) {
  if (!key || key.includes("undefined")) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(r);
}

(async () => {
  const snap = await db.collection("race_results").where("status", "==", "confirmed").get();
  /** @type {Map<string, ReturnType<typeof row>[]>} */
  const byCanonical = new Map();
  const bySource = new Map();
  const byNameDate = new Map();

  snap.forEach((doc) => {
    const r = row(doc);
    const name = r.memberRealName;
    if (!name) return;

    if (r.canonicalEventId) {
      add(byCanonical, `${r.canonicalEventId}\t${name}`, r);
    }
    if (r.source && r.sourceId) {
      add(bySource, `${r.source}\t${r.sourceId}\t${name}`, r);
    }
    const dateKey = `${name}\t${r.eventDate}`;
    add(byNameDate, dateKey, r);
  });

  function dupes(map, label) {
    const out = [];
    for (const [k, rows] of map) {
      if (rows.length < 2) continue;
      out.push({ key: k, count: rows.length, rows });
    }
    out.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    return { label, totalGroups: out.length, groups: out };
  }

  const canon = dupes(byCanonical, "canonicalEventId + memberRealName");
  const src = dupes(bySource, "source + sourceId + memberRealName");
  // 같은 날짜·실명만으로는 다른 대회도 묶일 수 있어, 2건 이상이면서 eventName 유사도 높은 것만 보조로
  const nameDate = dupes(byNameDate, "memberRealName + eventDate (같은 날 여러 대회 가능 — 참고용)");

  console.log("=== confirmed race_results 중복 후보 ===\n");
  console.log(`전체 문서: ${snap.size}건\n`);

  function printReport(rep, maxGroups = 80) {
    console.log(`--- ${rep.label} ---`);
    console.log(`중복 그룹 수: ${rep.totalGroups}\n`);
    let shown = 0;
    for (const g of rep.groups) {
      if (shown >= maxGroups) break;
      const [a, b, c] = g.key.split("\t");
      const keyHuman =
        rep.label.startsWith("canonical")
          ? `canonicalEventId=${a} | ${b}`
          : rep.label.startsWith("source")
            ? `${a} ${b} | ${c}`
            : `${a} | ${b}`;
      console.log(`▶ ${keyHuman} (${g.count}건)`);
      for (const r of g.rows) {
        console.log(
          `    ${r.id} | dist=${r.distance}→${r.distanceNorm} | ${r.netTime} | bib=${r.bib || "-"} | ${r.eventName.slice(0, 36)} | pb=${r.pbConfirmed} guest=${r.isGuest}`
        );
      }
      console.log("");
      shown++;
    }
    if (rep.groups.length > maxGroups) {
      console.log(`… 외 ${rep.groups.length - maxGroups}그룹\n`);
    }
  }

  printReport(canon, 100);
  printReport(src, 60);
  printReport(nameDate, 25);

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
