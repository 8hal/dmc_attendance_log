#!/usr/bin/env node
/**
 * search_cache 매칭 실패한 엑셀 기록 → 수동 입력
 *
 * confirm_from_excel.js에서 매칭 실패한 47건 중
 * 박조련(정식 등록 아님) 제외한 46건을 수동으로 race_results에 저장합니다.
 *
 * 저장 방식: source="manual", confirmSource="excel_import", finishTime 사용
 *
 * 실행:
 *   node scripts/manual_import_excel.js --dry-run
 *   node scripts/manual_import_excel.js
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

const SKIP_NAMES = new Set();

(async () => {
  // 1. 엑셀 기록 로딩
  const excelData = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../data/race_records_from_excel.json"), "utf8")
  );
  const activeExcel = excelData.filter(
    (r) => r.memberStatus === "active" && r.memberRealName && r.finishTime && r.eventDate
  );

  // 2. search_cache 매칭 실패 목록 재계산 (confirm_from_excel.js와 동일 로직)
  console.log("search_cache 로딩 중...");
  const cacheSnap = await db.collection("search_cache").where("found", "==", true).get();

  const cacheByName = {};
  cacheSnap.forEach((doc) => {
    const d = doc.data();
    if (!d.realName || !d.result) return;
    const { eventName, eventDate, source, sourceId, records = [] } = d.result;
    records.forEach((rec) => {
      if (!cacheByName[d.realName]) cacheByName[d.realName] = [];
      cacheByName[d.realName].push({ source, sourceId, eventName, eventDate, rec });
    });
  });

  const unmatched = [];
  for (const ex of activeExcel) {
    const exSec = toSec(ex.finishTime);
    if (!exSec) continue;
    const entries = cacheByName[ex.memberRealName] || [];
    const hit = entries.find((e) => {
      if ((e.eventDate || "").substring(0, 10) !== (ex.eventDate || "").substring(0, 10)) return false;
      const cSec = toSec(e.rec.netTime) || toSec(e.rec.gunTime);
      return cSec !== null && Math.abs(cSec - exSec) <= 1;
    });
    if (!hit) unmatched.push(ex);
  }

  // 박조련 제외
  const toInsert = unmatched.filter((r) => !SKIP_NAMES.has(r.memberRealName));

  console.log(`\n수동 입력 대상: ${toInsert.length}건\n`);

  if (DRY_RUN) {
    toInsert.forEach((r) => {
      console.log(`  ${r.memberRealName} | ${r.eventDate} | ${r.distance} | ${r.finishTime} | ${r.eventName}`);
    });
    console.log("\nDRY RUN 종료. 실제 저장하려면 --dry-run 없이 실행하세요.");
    process.exit(0);
  }

  // 3. race_results에 저장
  const now = new Date().toISOString();
  let batch = db.batch();
  let batchCount = 0;
  let savedCount = 0;

  for (const ex of toInsert) {
    const safeName = (ex.memberRealName || "").replace(/[^a-zA-Z0-9가-힣]/g, "_");
    const safeDist = (ex.distance || "").replace(/[^a-zA-Z0-9]/g, "_");
    const safeDate = (ex.eventDate || "").replace(/[^0-9\-]/g, "");
    const docId = `${safeName}_${safeDist}_${safeDate}`;

    const ref = db.collection("race_results").doc(docId);
    batch.set(ref, {
      jobId: "manual",
      eventName: ex.eventName || "",
      eventDate: ex.eventDate,
      source: "manual",
      sourceId: "",
      memberRealName: ex.memberRealName,
      memberNickname: ex.memberNickName || "",
      distance: ex.distance,
      netTime: "",
      gunTime: "",
      finishTime: ex.finishTime,
      bib: "",
      overallRank: null,
      gender: "",
      pbConfirmed: false,
      isGuest: false,
      note: "",
      status: "confirmed",
      confirmedAt: now,
      confirmSource: "excel_import",
    });
    batchCount++;
    savedCount++;
    if (batchCount >= 499) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }
  if (batchCount > 0) await batch.commit();
  console.log(`✅ race_results에 ${savedCount}건 저장 완료 (source: "manual", confirmSource: "excel_import")`);

  // 4. confirmedCount 재계산
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
