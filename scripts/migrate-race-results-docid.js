/**
 * 기존 race_results 문서 ID를 {realName}_{distance}_{eventDate} 형식으로 마이그레이션
 * 실행: FIRESTORE_EMULATOR_HOST="" node migrate-race-results-docid.js
 */
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

process.env.FIRESTORE_EMULATOR_HOST = "";
initializeApp({ credential: cert(require("./service-account.json")), projectId: "dmc-attendance" });

const db = getFirestore();

function makeDocId(realName, distance, eventDate) {
  const safeName = (realName || "").replace(/[^a-zA-Z0-9가-힣]/g, "_");
  const safeDist = (distance || "").replace(/[^a-zA-Z0-9]/g, "_");
  const safeDate = (eventDate || "").replace(/[^0-9\-]/g, "");
  return `${safeName}_${safeDist}_${safeDate}`;
}

async function migrate() {
  const snap = await db.collection("race_results").get();
  console.log(`총 ${snap.size}건 조회`);

  let migrated = 0;
  let skipped = 0;
  let duplicates = 0;
  const seen = new Map(); // newId → 기존 doc.id

  for (const doc of snap.docs) {
    const d = doc.data();
    const newId = makeDocId(d.memberRealName, d.distance, d.eventDate);

    if (doc.id === newId) {
      skipped++;
      continue;
    }

    if (seen.has(newId)) {
      console.log(`⚠️  중복: ${newId}`);
      console.log(`   기존: ${seen.get(newId)}`);
      console.log(`   현재: ${doc.id}`);
      duplicates++;
      continue;
    }

    seen.set(newId, doc.id);

    // 새 문서 생성 후 기존 문서 삭제
    const newRef = db.collection("race_results").doc(newId);
    await newRef.set({ ...d });
    await doc.ref.delete();
    console.log(`✅ ${doc.id} → ${newId}`);
    migrated++;
  }

  console.log(`\n완료: 마이그레이션 ${migrated}건 / 이미완료 ${skipped}건 / 중복 ${duplicates}건`);
}

migrate().catch(console.error);
