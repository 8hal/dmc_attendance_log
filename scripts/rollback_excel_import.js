#!/usr/bin/env node
/**
 * excel_import 롤백 스크립트
 *
 * 삭제 대상: race_results 컬렉션에서
 *   - source == "excel"
 *   - confirmSource == "excel_import"
 *
 * 실행:
 *   node scripts/rollback_excel_import.js --dry-run   # 삭제 대상 확인만
 *   node scripts/rollback_excel_import.js             # 실제 삭제
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const DRY_RUN = process.argv.includes("--dry-run");

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

(async () => {
  console.log(DRY_RUN ? "🔵 DRY RUN — 실제 삭제 없음\n" : "🔴 실제 삭제 모드\n");

  const snap = await db.collection("race_results")
    .where("source", "==", "excel")
    .where("confirmSource", "==", "excel_import")
    .get();

  console.log(`삭제 대상: ${snap.size}건`);

  if (snap.size === 0) {
    console.log("삭제할 기록이 없습니다.");
    process.exit(0);
  }

  // 샘플 출력
  console.log("\n샘플 10건:");
  let i = 0;
  snap.forEach((doc) => {
    if (i++ < 10) {
      const d = doc.data();
      console.log(`  [${doc.id}] ${d.memberRealName} | ${d.eventName} | ${d.distance} | ${d.finishTime}`);
    }
  });

  if (DRY_RUN) {
    console.log("\n→ DRY RUN 종료. 실제 삭제하려면 --dry-run 없이 실행하세요.");
    process.exit(0);
  }

  // 실제 삭제 (500건 단위 batch)
  const docs = snap.docs;
  let deleted = 0;

  for (let i = 0; i < docs.length; i += 499) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + 499);
    chunk.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += chunk.length;
    process.stdout.write(`\r삭제 중... ${deleted}/${docs.length}`);
  }

  console.log(`\n\n✅ 삭제 완료: ${deleted}건`);

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
    const cnt = countByMember[name] || 0;
    mbatch.update(doc.ref, {
      confirmedCount: cnt,
      updatedAt: FieldValue.serverTimestamp(),
    });
    mcount++;
    if (mcount >= 499) {
      mbatch.commit();
      mbatch = db.batch();
      mcount = 0;
    }
  });
  if (mcount > 0) await mbatch.commit();
  console.log(`✅ confirmedCount 재계산 완료 (${membersSnap.size}명)`);

  process.exit(0);
})().catch((e) => {
  console.error("❌ 오류:", e.message);
  process.exit(1);
});
