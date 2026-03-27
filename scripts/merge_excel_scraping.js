#!/usr/bin/env node
/**
 * 엑셀 기록 ↔ 스크래핑 기록 병합
 *
 * 조건: 같은 회원 + 같은 종목 + 날짜 ±7일 + 스크래핑에 시간 없고 엑셀에 있음
 *   → 스크래핑 record에 finishTime 채우기
 *   → 엑셀 record를 status:"merged"로 처리
 *   → verifiedSources 필드 추가
 *
 * 실행:
 *   node scripts/merge_excel_scraping.js [--dry-run]
 */

const admin = require("./functions/node_modules/firebase-admin");
const fs = require("fs");
const path = require("path");

const DRY_RUN = process.argv.includes("--dry-run");

const svcPath = path.join(__dirname, "functions/service-account.json");
if (fs.existsSync(svcPath)) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(svcPath, "utf8"))) });
} else {
  admin.initializeApp({ projectId: "dmc-attendance" });
}
const db = admin.firestore();

function toSeconds(t) {
  if (!t || t === "undefined") return null;
  const parts = String(t).trim().split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

// 스크래핑 기록은 netTime 또는 gunTime 사용
function getTime(rec) {
  return toSeconds(rec.netTime) || toSeconds(rec.gunTime) || toSeconds(rec.finishTime) || null;
}

async function main() {
  console.log(`\n📦 race_results 전체 로딩...`);
  const snap = await db.collection("race_results").where("status", "==", "confirmed").get();
  const all = [];
  snap.forEach((doc) => all.push({ id: doc.id, ...doc.data() }));

  const excel   = all.filter((r) => r.source === "excel");
  const scraped = all.filter((r) => r.source !== "excel");
  console.log(`   엑셀: ${excel.length}건 / 스크래핑: ${scraped.length}건`);

  // ── 매칭 ──────────────────────────────────────────────
  const toMerge = [];   // { excelRec, scrapedRec }
  const excelRecordsHandled = new Set();

  for (const ex of excel) {
    const exDate = new Date(ex.eventDate);

    const exSec = toSeconds(ex.finishTime);
    if (!exSec) continue;

    const candidates = scraped.filter((s) =>
      s.memberRealName === ex.memberRealName &&
      s.distance?.toLowerCase() === ex.distance?.toLowerCase()
    );

    const dateCands = candidates.filter((s) => {
      const sDate = new Date(s.eventDate);
      return Math.abs(exDate - sDate) <= 7 * 24 * 60 * 60 * 1000;
    });

    if (dateCands.length === 0) continue;

    // 시간 ±60초 필터
    const timeCands = dateCands.filter((s) => {
      const sSec = getTime(s);
      return sSec !== null && Math.abs(exSec - sSec) <= 60;
    });
    if (timeCands.length === 0) continue;

    function textSim(a, b) {
      const norm = (s) => s.replace(/[^가-힣a-zA-Z0-9]/g, "").toLowerCase();
      const na = norm(a), nb = norm(b);
      if (!na || !nb) return 0;
      const shorter = na.length < nb.length ? na : nb;
      const longer  = na.length < nb.length ? nb : na;
      let common = 0;
      for (const ch of shorter) if (longer.includes(ch)) common++;
      return common / longer.length;
    }

    // 시간이 일치하는 후보 중 이름 유사도 가장 높은 것 선택
    const best = timeCands
      .map((s) => ({ ...s, score: textSim(ex.eventName, s.eventName) }))
      .sort((a, b) => b.score - a.score)[0];

    // 이미 처리된 엑셀 기록 중복 방지
    if (excelRecordsHandled.has(ex.id)) continue;

    toMerge.push({ excelRec: ex, scrapedRec: best });
    excelRecordsHandled.add(ex.id);
  }

  console.log(`\n🔗 병합 대상: ${toMerge.length}건`);

  // ── 병합 실행 ──────────────────────────────────────────
  let merged = 0;
  let batch = db.batch();
  let batchCount = 0;

  const commit = async () => {
    if (batchCount > 0 && !DRY_RUN) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
      process.stdout.write(".");
    }
  };

  const stats = { bySource: {}, byEvent: {} };

  for (const { excelRec: ex, scrapedRec: sc } of toMerge) {
    if (DRY_RUN) {
      console.log(
        `  [DRY] ${ex.memberRealName} | ${ex.eventDate} | ${ex.distance}`
        + `\n        엑셀: "${ex.eventName}" (${ex.finishTime})`
        + `\n        스크래핑: "${sc.eventName}" [${sc.source}] score=${sc.score?.toFixed(2)}`
        + `\n        → 스크래핑에 시간 채우고, 엑셀은 merged 처리`
      );
    }

    // 스크래핑 record 업데이트
    const scRef = db.collection("race_results").doc(sc.id);
    const scUpdate = {
      finishTime: ex.finishTime,
      verifiedSources: admin.firestore.FieldValue.arrayUnion("excel", sc.source || "scraping"),
      excelEventName: ex.eventName,       // 엑셀의 대회명도 보존
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // 엑셀 record → merged
    const exRef = db.collection("race_results").doc(ex.id);
    const exUpdate = {
      status: "merged",
      mergedInto: sc.id,
      mergedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (!DRY_RUN) {
      batch.update(scRef, scUpdate);
      batch.update(exRef, exUpdate);
      batchCount += 2;
      if (batchCount >= 498) await commit();
    }

    merged++;
    stats.bySource[sc.source] = (stats.bySource[sc.source] || 0) + 1;
    stats.byEvent[sc.eventName] = (stats.byEvent[sc.eventName] || 0) + 1;
  }

  await commit();

  // ── 결과 ────────────────────────────────────────────
  console.log(`\n\n✅ 병합 완료: ${merged}건`);
  console.log("\n스크래핑 소스별:");
  Object.entries(stats.bySource).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v}건`));
  console.log("\n대회별 (상위 10):");
  Object.entries(stats.byEvent).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([k,v]) => console.log(`  ${k}: ${v}건`));

  if (!DRY_RUN) {
    // confirmedCount 재계산
    console.log("\n📊 confirmedCount 재계산 중...");
    const allConfirmed = await db.collection("race_results").where("status", "==", "confirmed").get();
    const countByMember = {};
    allConfirmed.forEach((doc) => {
      const name = doc.data().memberRealName;
      if (name) countByMember[name] = (countByMember[name] || 0) + 1;
    });

    const membersSnap = await db.collection("members").get();
    let mbatch = db.batch();
    let mcount = 0;
    membersSnap.forEach((doc) => {
      const name = doc.data().realName;
      const cnt  = countByMember[name] || 0;
      mbatch.update(doc.ref, { confirmedCount: cnt, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      mcount++;
      if (mcount >= 499) {
        mbatch.commit();
        mbatch = db.batch();
        mcount = 0;
      }
    });
    if (mcount > 0) await mbatch.commit();
    console.log(`✅ confirmedCount 재계산 완료 (${membersSnap.size}명)`);
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
