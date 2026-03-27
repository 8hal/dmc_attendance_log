#!/usr/bin/env node
/**
 * 엑셀 기록 → search_cache 매칭 → confirm 처리
 *
 * 플랜:
 *   1. 엑셀 기록의 realName + eventDate + finishTime으로 search_cache 조회
 *   2. 날짜 정확히 일치 + 시간 ±1초 이내 → race_results에 confirm 저장
 *      (confirmSource: "excel_verified", 공식 대회명/source/bib 등 사용)
 *   3. 매칭 실패 → 스킵 (넣지 않음)
 *
 * 실행:
 *   node scripts/confirm_from_excel.js --dry-run   (확인만)
 *   node scripts/confirm_from_excel.js             (실제 저장)
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

const DRY_RUN = process.argv.includes("--dry-run");

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

function toSec(t) {
  if (!t) return null;
  const p = String(t).trim().split(":").map(Number);
  if (p.length !== 3 || p.some(isNaN)) return null;
  return p[0] * 3600 + p[1] * 60 + p[2];
}

(async () => {
  // 1. 엑셀 기록 로딩
  const excelData = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../data/race_records_from_excel.json"), "utf8")
  );
  const activeExcel = excelData.filter(
    (r) => r.memberStatus === "active" && r.memberRealName && r.finishTime && r.eventDate
  );
  console.log(`엑셀 기록 (active + 기록있음): ${activeExcel.length}건`);

  // 2. search_cache 로딩 (found:true)
  console.log("search_cache 로딩 중...");
  const cacheSnap = await db.collection("search_cache").where("found", "==", true).get();

  // realName → [{ cacheDocId, source, sourceId, eventName, eventDate, record }]
  const cacheByName = {};
  cacheSnap.forEach((doc) => {
    const d = doc.data();
    if (!d.realName || !d.result) return;
    const { eventName, eventDate, source, sourceId, records = [] } = d.result;
    records.forEach((rec) => {
      if (!cacheByName[d.realName]) cacheByName[d.realName] = [];
      cacheByName[d.realName].push({
        cacheDocId: doc.id,
        source,
        sourceId,
        eventName,
        eventDate,
        rec,
      });
    });
  });
  const cachedMemberCount = Object.keys(cacheByName).length;
  console.log(`search_cache found:true → ${cacheSnap.size}건, ${cachedMemberCount}명\n`);

  // 3. 매칭
  const matched = [];
  const unmatched = [];

  for (const ex of activeExcel) {
    const exSec = toSec(ex.finishTime);
    if (!exSec) {
      unmatched.push({ ex, reason: "finishTime 파싱 불가" });
      continue;
    }

    const entries = cacheByName[ex.memberRealName] || [];
    if (entries.length === 0) {
      unmatched.push({ ex, reason: "캐시 없음 (스크래핑 미수집)" });
      continue;
    }

    const hit = entries.find((e) => {
      if ((e.eventDate || "").substring(0, 10) !== (ex.eventDate || "").substring(0, 10)) return false;
      const cSec = toSec(e.rec.netTime) || toSec(e.rec.gunTime);
      return cSec !== null && Math.abs(cSec - exSec) <= 1;
    });

    if (hit) {
      matched.push({ ex, hit });
    } else {
      unmatched.push({ ex, reason: "날짜/시간 불일치" });
    }
  }

  const covRate = Math.round((matched.length / activeExcel.length) * 100);
  console.log(`✅ 매칭 성공: ${matched.length}건 (${covRate}%)`);
  console.log(`❌ 매칭 실패: ${unmatched.length}건\n`);

  // 실패 이유 분포
  const reasons = {};
  unmatched.forEach((u) => { reasons[u.reason] = (reasons[u.reason] || 0) + 1; });
  console.log("[매칭 실패 이유]");
  Object.entries(reasons).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}건`));

  if (DRY_RUN) {
    console.log("\n[매칭 성공 샘플 20건]");
    matched.slice(0, 20).forEach(({ ex, hit }) => {
      console.log(
        `  ${ex.memberRealName} | ${ex.eventDate} | ${ex.distance} | ${ex.finishTime}`
        + `\n    → [${hit.source}_${hit.sourceId}] "${hit.eventName}" netTime=${hit.rec.netTime}`
      );
    });
    console.log("\n[매칭 실패 전체 목록]");
    unmatched.forEach(({ ex, reason }) => {
      console.log(`  ${ex.memberRealName} | ${ex.eventDate} | ${ex.distance} | ${ex.finishTime} | ${ex.eventName} (${reason})`);
    });
    console.log("\nDRY RUN 종료. 실제 저장하려면 --dry-run 없이 실행하세요.");
    process.exit(0);
  }

  // 4. race_results에 confirm 저장
  const now = new Date().toISOString();
  let batch = db.batch();
  let batchCount = 0;
  let savedCount = 0;

  const commitBatch = async () => {
    if (batchCount > 0) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
      process.stdout.write(".");
    }
  };

  for (const { ex, hit } of matched) {
    const { source, sourceId, eventName, eventDate, rec } = hit;
    const canonicalJobId = (source && sourceId) ? `${source}_${sourceId}` : "manual";

    const safeName = (ex.memberRealName || "").replace(/[^a-zA-Z0-9가-힣]/g, "_");
    const safeDist = (ex.distance || "").replace(/[^a-zA-Z0-9]/g, "_");
    const safeDate = (ex.eventDate || "").replace(/[^0-9\-]/g, "");
    const docId = `${safeName}_${safeDist}_${safeDate}`;

    const ref = db.collection("race_results").doc(docId);
    batch.set(ref, {
      jobId: canonicalJobId,
      eventName: eventName || "",
      eventDate: eventDate || ex.eventDate,
      source: source || "",
      sourceId: sourceId || "",
      memberRealName: ex.memberRealName,
      memberNickname: ex.memberNickName || "",
      distance: ex.distance,
      netTime: rec.netTime || "",
      gunTime: rec.gunTime || "",
      bib: rec.bib || "",
      overallRank: rec.overallRank || null,
      gender: rec.gender || "",
      pbConfirmed: false,
      isGuest: false,
      note: "",
      status: "confirmed",
      confirmedAt: now,
      confirmSource: "excel_verified",
    });
    batchCount++;
    savedCount++;
    if (batchCount >= 499) await commitBatch();
  }
  await commitBatch();
  console.log(`\n\n✅ race_results에 ${savedCount}건 저장 완료 (confirmSource: "excel_verified")`);

  // 5. confirmedCount 재계산
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
    const cnt = countByMember[name] || 0;
    mbatch.update(doc.ref, { confirmedCount: cnt, updatedAt: FieldValue.serverTimestamp() });
    mcount++;
    if (mcount >= 499) { mbatch.commit(); mbatch = db.batch(); mcount = 0; }
  });
  if (mcount > 0) await mbatch.commit();
  console.log(`✅ confirmedCount 재계산 완료 (${membersSnap.size}명)`);

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
