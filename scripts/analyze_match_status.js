#!/usr/bin/env node
/**
 * 엑셀 기록 vs search_cache 매칭 현황 (±1초 허용)
 * 미매칭 이벤트별 집계 및 스크래핑 필요 여부 분류
 */
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

function toSec(t) {
  if (!t) return null;
  const p = String(t).trim().split(":").map(Number);
  if (p.length !== 3 || p.some(isNaN)) return null;
  return p[0] * 3600 + p[1] * 60 + p[2];
}

(async () => {
  const excelData = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../data/race_records_from_excel.json"), "utf8")
  );
  const activeExcel = excelData.filter((r) => r.memberStatus === "active" && r.memberRealName && r.finishTime);

  console.log("search_cache 로딩 중...");
  const cacheSnap = await db.collection("search_cache").where("found", "==", true).get();

  // realName → [{eventDate, netTime, gunTime, eventName, source, sourceId}]
  const cacheByName = {};
  cacheSnap.forEach((doc) => {
    const d = doc.data();
    if (!d.realName || !d.result) return;
    if (!cacheByName[d.realName]) cacheByName[d.realName] = [];
    (d.result.records || []).forEach((r) => {
      cacheByName[d.realName].push({
        eventDate: d.result.eventDate,
        eventName: d.result.eventName,
        source: d.result.source,
        sourceId: d.result.sourceId,
        netTime: r.netTime,
        gunTime: r.gunTime,
      });
    });
  });

  const matched = [];
  const unmatched = [];

  for (const ex of activeExcel) {
    const exSec = toSec(ex.finishTime);
    const caches = cacheByName[ex.memberRealName] || [];

    const hit = caches.find((c) => {
      if (c.eventDate !== ex.eventDate) return false;
      const cSec = toSec(c.netTime) || toSec(c.gunTime);
      return cSec !== null && exSec !== null && Math.abs(cSec - exSec) <= 1;
    });

    if (hit) matched.push({ ...ex, matchedSource: hit.source, matchedEvent: hit.eventName });
    else unmatched.push(ex);
  }

  const total = activeExcel.length;
  const covRate = Math.round((matched.length / total) * 100);

  console.log(`\n=== 매칭 현황 (±1초 허용) ===`);
  console.log(`전체: ${total}건 | 매칭: ${matched.length}건 | 미매칭: ${unmatched.length}건 | 커버리지: ${covRate}%`);

  // 연도별
  const byYear = {};
  [...matched, ...unmatched].forEach((r) => {
    const y = (r.eventDate || "").substring(0, 4);
    if (!byYear[y]) byYear[y] = { m: 0, u: 0 };
  });
  matched.forEach((r) => { const y = (r.eventDate || "").substring(0, 4); if (byYear[y]) byYear[y].m++; });
  unmatched.forEach((r) => { const y = (r.eventDate || "").substring(0, 4); if (byYear[y]) byYear[y].u++; });

  console.log("\n연도별:");
  ["2024", "2025", "2026"].forEach((y) => {
    const s = byYear[y] || { m: 0, u: 0 };
    const t = s.m + s.u;
    const r = t > 0 ? Math.round((s.m / t) * 100) : 0;
    console.log(`  ${y}년: 매칭=${s.m} 미매칭=${s.u} (${r}%)`);
  });

  // 미매칭 이벤트별 집계
  const unmatchedEvents = {};
  unmatched.forEach((r) => {
    const key = `${(r.eventDate || "").substring(0, 7)} | ${r.eventName}`;
    if (!unmatchedEvents[key]) unmatchedEvents[key] = { count: 0, date: r.eventDate, members: [] };
    unmatchedEvents[key].count++;
    unmatchedEvents[key].members.push(r.memberRealName);
  });

  const sorted = Object.entries(unmatchedEvents).sort((a, b) => b[1].count - a[1].count);

  console.log("\n=== 미매칭 이벤트 TOP (스크래핑 우선순위) ===");
  sorted.slice(0, 25).forEach(([key, val]) => {
    console.log(`  ${String(val.count).padStart(3)}명 | ${key}`);
  });

  // 해외/트레일 분류 (스크래핑 불가)
  const overseasKeywords = ["시카고", "오사카", "뉴욕", "런던", "시드니", "도쿄", "보스톤", "대마도"];
  const trailKeywords = ["트레일", "울트라", "스카이", "힐클라임", "그란폰도", "그란페스타"];

  let domesticUnmatched = 0, overseasUnmatched = 0, trailUnmatched = 0;
  sorted.forEach(([key, val]) => {
    const k = key.toLowerCase();
    if (overseasKeywords.some(w => k.includes(w.toLowerCase()))) overseasUnmatched += val.count;
    else if (trailKeywords.some(w => k.includes(w.toLowerCase()))) trailUnmatched += val.count;
    else domesticUnmatched += val.count;
  });

  console.log("\n=== 미매칭 분류 ===");
  console.log(`  국내 일반 대회 (스크래핑 시도 가능): ${domesticUnmatched}건`);
  console.log(`  트레일/울트라 (전용 사이트 필요):    ${trailUnmatched}건`);
  console.log(`  해외 대회 (스크래핑 불가):           ${overseasUnmatched}건`);

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
