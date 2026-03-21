/**
 * 기존 confirmed scrape_jobs에 confirmedCount 설정
 * race_results.where("jobId", "==", jobId) 로 실제 저장된 건수를 계산
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

async function run() {
  const jobsSnap = await db.collection("scrape_jobs")
    .where("status", "==", "confirmed")
    .get();

  console.log(`confirmed 대회 수: ${jobsSnap.size}`);

  let updated = 0;
  let skipped = 0;

  for (const jobDoc of jobsSnap.docs) {
    const d = jobDoc.data();

    // 이미 confirmedCount가 있으면 스킵
    if (d.confirmedCount !== undefined) {
      skipped++;
      continue;
    }

    const resultsSnap = await db.collection("race_results")
      .where("jobId", "==", jobDoc.id)
      .get();

    const count = resultsSnap.size;
    await jobDoc.ref.update({ confirmedCount: count });
    console.log(`  ✓ ${d.eventName || jobDoc.id}: ${count}명`);
    updated++;
  }

  console.log(`\n완료: ${updated}건 업데이트, ${skipped}건 스킵`);
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
