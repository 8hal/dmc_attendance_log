const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

const STATUS_PRIORITY = { confirmed: 0, complete: 1, running: 2 };

async function run() {
  const snap = await db.collection("scrape_jobs").get();
  console.log(`전체 scrape_jobs: ${snap.size}건`);

  const groups = new Map();
  snap.forEach((doc) => {
    const d = doc.data();
    const key = `${d.source}_${d.sourceId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id: doc.id, ...d });
  });

  const toDelete = [];

  for (const [key, jobs] of groups) {
    if (jobs.length <= 1) continue;

    jobs.sort((a, b) => {
      const aPri = STATUS_PRIORITY[a.status] ?? 9;
      const bPri = STATUS_PRIORITY[b.status] ?? 9;
      if (aPri !== bPri) return aPri - bPri;
      const aCount = a.confirmedCount ?? a.results?.length ?? 0;
      const bCount = b.confirmedCount ?? b.results?.length ?? 0;
      if (aCount !== bCount) return bCount - aCount;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });

    const keep = jobs[0];
    const remove = jobs.slice(1);

    console.log(`\n[${key}] ${jobs.length}건 중복`);
    console.log(`  ✓ 유지: ${keep.id} (${keep.status}, ${keep.confirmedCount ?? keep.results?.length ?? 0}명)`);
    for (const r of remove) {
      console.log(`  ✕ 삭제: ${r.id} (${r.status}, ${r.confirmedCount ?? r.results?.length ?? 0}명)`);
      toDelete.push(r.id);
    }
  }

  if (toDelete.length === 0) {
    console.log("\n중복 없음. 정리할 항목이 없습니다.");
    process.exit(0);
  }

  console.log(`\n총 ${toDelete.length}건 삭제 예정...`);

  const batchSize = 500;
  for (let i = 0; i < toDelete.length; i += batchSize) {
    const batch = db.batch();
    const slice = toDelete.slice(i, i + batchSize);
    for (const id of slice) {
      batch.delete(db.collection("scrape_jobs").doc(id));
    }
    await batch.commit();
    console.log(`  배치 삭제 완료: ${Math.min(i + batchSize, toDelete.length)}/${toDelete.length}`);
  }

  console.log(`\n완료: ${toDelete.length}건 삭제됨`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
