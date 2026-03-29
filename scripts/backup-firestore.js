/**
 * 기본: 프로덕션 Firestore (셸의 FIRESTORE_EMULATOR_HOST는 무시).
 * 에뮬만: node scripts/backup-firestore.js --emulator
 */
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

const useEmulator = process.argv.includes("--emulator");
if (!useEmulator && process.env.FIRESTORE_EMULATOR_HOST) {
  console.warn(
    "[backup] FIRESTORE_EMULATOR_HOST가 있어 에뮬에 붙습니다. 프로덕션 백업을 위해 이 변수를 제거하고 연결합니다.\n" +
      "        에뮬만 백업: node scripts/backup-firestore.js --emulator (프로젝트 루트에서)",
  );
  delete process.env.FIRESTORE_EMULATOR_HOST;
}
if (useEmulator && !process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  console.log("[backup] --emulator: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080");
}

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

const COLLECTIONS = ["scrape_jobs", "race_results", "members", "search_cache", "member_search_jobs", "event_logs"];

async function backup() {
  console.log(`[backup] 대상: ${useEmulator ? "Firestore 에뮬레이터" : "프로덕션 (dmc-attendance)"}\n`);
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
