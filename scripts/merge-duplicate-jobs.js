/**
 * 중복 scrape_jobs 통합 마이그레이션
 *
 * 1. 같은 source:sourceId를 가진 job 그룹 찾기
 * 2. canonical ID (source_sourceId) job을 유지 대상으로 선택
 * 3. 비정규 job의 race_results.jobId → canonical ID로 이관
 * 4. 비정규 scrape_jobs 문서 삭제
 *
 * --dry-run 으로 실행하면 변경 없이 계획만 출력
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

const DRY_RUN = process.argv.includes("--dry-run");

async function run() {
  if (DRY_RUN) console.log("⚠️  DRY RUN — 실제 변경 없음\n");

  const snap = await db.collection("scrape_jobs").get();
  console.log(`전체 scrape_jobs: ${snap.size}건\n`);

  const groups = new Map();
  snap.forEach((doc) => {
    const d = doc.data();
    const key = `${d.source}_${d.sourceId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id: doc.id, ...d });
  });

  let totalMigrated = 0;
  let totalDeleted = 0;

  for (const [canonicalId, jobs] of groups) {
    if (jobs.length <= 1) continue;

    const canonical = jobs.find((j) => j.id === canonicalId);
    const others = jobs.filter((j) => j.id !== canonicalId);

    if (!canonical) {
      console.log(`⚠️  [${canonicalId}] canonical job 없음, 스킵`);
      continue;
    }

    console.log(`\n[${canonicalId}] ${jobs.length}건 중복`);
    console.log(`  ✓ 유지: ${canonical.id} (${canonical.status})`);

    for (const old of others) {
      console.log(`  ✕ 이관+삭제: ${old.id} (${old.status})`);

      const resultsSnap = await db.collection("race_results")
        .where("jobId", "==", old.id)
        .get();

      if (resultsSnap.size > 0) {
        console.log(`    → race_results ${resultsSnap.size}건 jobId 이관`);

        if (!DRY_RUN) {
          const batch = db.batch();
          resultsSnap.forEach((doc) => {
            batch.update(doc.ref, { jobId: canonicalId });
          });
          await batch.commit();
        }
        totalMigrated += resultsSnap.size;
      }

      if (!DRY_RUN) {
        await db.collection("scrape_jobs").doc(old.id).delete();
      }
      totalDeleted++;
    }

    if (!DRY_RUN && canonical) {
      const newResultsSnap = await db.collection("race_results")
        .where("jobId", "==", canonicalId)
        .where("status", "==", "confirmed")
        .get();
      await db.collection("scrape_jobs").doc(canonicalId).update({
        confirmedCount: newResultsSnap.size,
        status: newResultsSnap.size > 0 ? "confirmed" : canonical.status,
      });
      console.log(`  → confirmedCount 갱신: ${newResultsSnap.size}`);
    }
  }

  console.log(`\n${"=".repeat(40)}`);
  console.log(`race_results 이관: ${totalMigrated}건`);
  console.log(`scrape_jobs 삭제: ${totalDeleted}건`);
  if (DRY_RUN) console.log("\n⚠️  DRY RUN이었습니다. --dry-run 제거 후 다시 실행하세요.");
  else console.log("\n✅ 마이그레이션 완료");
}

run().catch((err) => { console.error(err); process.exit(1); });
