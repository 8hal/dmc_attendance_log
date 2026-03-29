#!/usr/bin/env node
/**
 * 제14회 김포한강마라톤(smartchip_202650000034) 정리:
 * 1) race_results 중 eventDate 가 비어 있는 확정 행 삭제 (중복 docId 접미사 `_` 만 있는 것)
 * 2) race_events 생성 + 남은 확정 행에 canonicalEventId 설정
 *
 *   cd functions && node ../scripts/fix-gimpo-empty-date-and-race-event.js
 *   cd functions && node ../scripts/fix-gimpo-empty-date-and-race-event.js --apply
 *
 * 프로덕션 쓰기 — 백업 후 --apply.
 */

const fs = require("fs");
const path = require("path");
const functionsDir = path.join(__dirname, "..", "functions");
const functionsNodeModules = path.join(functionsDir, "node_modules");
if (!fs.existsSync(functionsNodeModules)) {
  console.error("functions/node_modules 가 없습니다. cd functions && npm ci");
  process.exit(1);
}
require("module").globalPaths.unshift(functionsNodeModules);
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { allocateCanonicalEventId } = require(path.join(functionsDir, "lib", "canonicalEventId.js"));

const APPLY = process.argv.includes("--apply");

const JOB_ID = "smartchip_202650000034";
const SOURCE = "smartchip";
const SOURCE_ID = "202650000034";
const PRIMARY_NAME = "제14회 김포한강마라톤";
const EVENT_DATE = "2026-03-29";

function isEmptyDate(d) {
  if (d == null) return true;
  return !String(d).trim();
}

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

(async () => {
  const snap = await db
    .collection("race_results")
    .where("jobId", "==", JOB_ID)
    .where("status", "==", "confirmed")
    .get();

  const toDelete = [];
  const toPatch = [];
  snap.forEach((doc) => {
    const x = doc.data();
    if (isEmptyDate(x.eventDate)) toDelete.push(doc.ref);
    else toPatch.push(doc.ref);
  });

  console.log(`jobId=${JOB_ID} confirmed: 총 ${snap.size}건`);
  console.log(`삭제 대상 (eventDate 비어 있음): ${toDelete.length}건`);
  toDelete.forEach((ref) => console.log("  -", ref.id));
  console.log(`유지 + canonicalEventId 백필 대상: ${toPatch.length}건`);
  toPatch.forEach((ref) => console.log("  -", ref.id));

  const canonicalEventId = await allocateCanonicalEventId(db, EVENT_DATE, PRIMARY_NAME);
  console.log("\n할당 canonicalEventId:", canonicalEventId);

  const evRef = db.collection("race_events").doc(canonicalEventId);
  const evSnap = await evRef.get();
  if (evSnap.exists) {
    console.log("race_events 이미 존재 — sourceMappings만 병합 시도");
  } else {
    const payload = {
      primaryName: PRIMARY_NAME,
      eventDate: EVENT_DATE,
      sourceMappings: [{ source: SOURCE, sourceId: SOURCE_ID }],
      createdAt: new Date().toISOString(),
      backfilledAt: new Date().toISOString(),
    };
    console.log("race_events 생성:", JSON.stringify(payload, null, 2));
    if (APPLY) await evRef.set(payload);
  }

  if (evSnap.exists) {
    const d = evSnap.data();
    const cur = Array.isArray(d.sourceMappings) ? [...d.sourceMappings] : [];
    const key = (m) => `${m.source}_${m.sourceId}`;
    const keys = new Set(cur.map(key));
    const sk = `${SOURCE}_${SOURCE_ID}`;
    if (!keys.has(sk)) {
      cur.push({ source: SOURCE, sourceId: SOURCE_ID });
      console.log("race_events.update sourceMappings +1");
      if (APPLY) await evRef.update({ sourceMappings: cur, updatedAt: new Date().toISOString() });
    }
  }

  if (APPLY && toDelete.length) {
    let batch = db.batch();
    let n = 0;
    for (const ref of toDelete) {
      batch.delete(ref);
      n++;
      if (n >= 400) {
        await batch.commit();
        batch = db.batch();
        n = 0;
      }
    }
    if (n) await batch.commit();
    console.log(`\n✅ 삭제 완료: ${toDelete.length}건`);
  }

  if (APPLY && toPatch.length) {
    let batch = db.batch();
    let n = 0;
    for (const ref of toPatch) {
      batch.update(ref, { canonicalEventId });
      n++;
      if (n >= 400) {
        await batch.commit();
        batch = db.batch();
        n = 0;
      }
    }
    if (n) await batch.commit();
    console.log(`✅ canonicalEventId 백필: ${toPatch.length}건 → ${canonicalEventId}`);
  }

  const jobRef = db.collection("scrape_jobs").doc(JOB_ID);
  if (APPLY) {
    await jobRef.update({
      canonicalEventId,
      eventDate: EVENT_DATE,
      eventName: PRIMARY_NAME,
    });
    console.log("✅ scrape_jobs 업데이트: canonicalEventId, eventDate, eventName");
  } else {
    console.log("\nDRY-RUN. 쓰려면: cd functions && node ../scripts/fix-gimpo-empty-date-and-race-event.js --apply");
  }

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
