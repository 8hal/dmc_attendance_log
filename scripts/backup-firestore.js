const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

const COLLECTIONS = ["scrape_jobs", "race_results", "members", "search_cache", "member_search_jobs"];

async function backup() {
  const date = new Date().toISOString().slice(0, 10);
  const dir = path.join(__dirname, "..", "backup", date);
  fs.mkdirSync(dir, { recursive: true });

  for (const col of COLLECTIONS) {
    console.log(`[backup] ${col}...`);
    const snap = await db.collection(col).get();
    const docs = {};
    snap.forEach((doc) => { docs[doc.id] = doc.data(); });
    const filePath = path.join(dir, `${col}.json`);
    fs.writeFileSync(filePath, JSON.stringify(docs, null, 2));
    console.log(`  → ${snap.size}건 → ${filePath}`);
  }

  console.log(`\n✅ 백업 완료: ${dir}`);
}

backup().catch((err) => { console.error(err); process.exit(1); });
