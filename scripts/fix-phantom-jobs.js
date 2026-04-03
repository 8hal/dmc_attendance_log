// Phantom Jobs 자동 정리 스크립트
// 목적: search_* 및 test 잡을 confirmed → complete로 다운그레이드

const admin = require("firebase-admin");

// Firebase Admin 초기화 (Application Default Credentials)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

// Phase 1: search_* 및 test 잡 다운그레이드
const jobsToDowngrade = [
  "manual_manual_1775222584867", // 테스트
  "search_3tShsj67juAa2UWk8NeM_0",
  "search_3tShsj67juAa2UWk8NeM_1",
  "search_3tShsj67juAa2UWk8NeM_2",
  "search_3tShsj67juAa2UWk8NeM_3",
  "search_ybLLXH8sBo2PCMRuxZnD_0",
  "search_ybLLXH8sBo2PCMRuxZnD_1",
  "search_ybLLXH8sBo2PCMRuxZnD_3",
  "search_ybLLXH8sBo2PCMRuxZnD_4",
  "search_ybLLXH8sBo2PCMRuxZnD_5",
  "search_ybLLXH8sBo2PCMRuxZnD_6",
];

async function fixPhantomJobs() {
  console.log("=== Phantom Jobs 자동 정리 ===\n");
  console.log(`대상: ${jobsToDowngrade.length}개 잡\n`);

  // Dry-run: 현재 상태 확인
  console.log("[Dry-run] 현재 상태 확인...");
  const existingJobs = [];
  
  for (const jobId of jobsToDowngrade) {
    const doc = await db.collection("scrape_jobs").doc(jobId).get();
    if (!doc.exists) {
      console.log(`✗ ${jobId}: 문서 없음`);
      continue;
    }

    const data = doc.data();
    existingJobs.push({ id: jobId, data });
    console.log(`✓ ${jobId}:`);
    console.log(`  - eventName: ${data.eventName}`);
    console.log(`  - status: ${data.status}`);
    console.log(`  - confirmedAt: ${data.confirmedAt || "(없음)"}`);
    console.log(`  - results 개수: ${(data.results || []).length}`);
  }

  console.log(`\n발견: ${existingJobs.length}/${jobsToDowngrade.length}개 잡`);

  if (existingJobs.length === 0) {
    console.log("\n처리할 잡이 없습니다.");
    process.exit(0);
  }

  if (!process.argv.includes("--execute")) {
    console.log("\n계속하려면 아래 명령어를 실행하세요:");
    console.log("node scripts/fix-phantom-jobs.js --execute");
    process.exit(0);
  }

  console.log("\n[실행] status 업데이트 중...");
  const batch = db.batch();

  for (const { id, data } of existingJobs) {
    const docRef = db.collection("scrape_jobs").doc(id);
    
    if (data.status === "confirmed") {
      batch.update(docRef, {
        status: "complete",
        confirmedAt: admin.firestore.FieldValue.delete(),
      });
      console.log(`✓ ${id}: confirmed → complete`);
    } else {
      console.log(`⊙ ${id}: 이미 ${data.status} (스킵)`);
    }
  }

  await batch.commit();
  console.log(`\n✅ 업데이트 완료`);
  console.log("\nops.html을 새로고침하여 Phantom Jobs 개수를 확인하세요.");
  console.log("예상: 18개 → 6~7개 (정규 잡만 남음)");

  process.exit(0);
}

fixPhantomJobs().catch((err) => {
  console.error("오류:", err);
  process.exit(1);
});
