/**
 * race_results.confirmSource 값을 새 enum으로 마이그레이션
 *
 * 매핑:
 *   event          → operator
 *   excel_verified → operator
 *   excel_import   → operator
 *   liverun_manual → operator
 *   personal       → 그대로
 *   suggestion     → 그대로
 *   (없음/null)    → 그대로 (2026-03-23 이전 데이터, 추적 불가)
 *
 * 사용법:
 *   node scripts/migrate-confirm-source.js          # dry-run
 *   node scripts/migrate-confirm-source.js --apply  # 실제 적용
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

const useEmulator = process.argv.includes("--emulator");
if (useEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
} else if (process.env.FIRESTORE_EMULATOR_HOST) {
  delete process.env.FIRESTORE_EMULATOR_HOST;
}

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

const APPLY = process.argv.includes("--apply");

const MAPPING = {
  event:          "operator",
  excel_verified: "operator",
  excel_import:   "operator",
  liverun_manual: "operator",
  suggestion:     "personal",
};

async function main() {
  console.log(`모드: ${APPLY ? "⚠️  APPLY (실제 쓰기)" : "🔍 DRY-RUN"}\n`);

  const snap = await db.collection("race_results")
    .where("status", "==", "confirmed")
    .get();

  const targets = [];
  snap.forEach((doc) => {
    const cs = doc.data().confirmSource;
    if (cs && MAPPING[cs]) {
      targets.push({ ref: doc.ref, id: doc.id, from: cs, to: MAPPING[cs] });
    }
  });

  if (targets.length === 0) {
    console.log("✅ 마이그레이션 대상 없음 (이미 완료됐거나 해당 값 없음)");
    process.exit(0);
  }

  // 분포 출력
  const dist = {};
  targets.forEach(({ from, to }) => {
    const key = `${from} → ${to}`;
    dist[key] = (dist[key] || 0) + 1;
  });
  console.log(`총 ${targets.length}건 변경 예정:`);
  Object.entries(dist).forEach(([k, v]) => console.log(`  ${v}건  ${k}`));

  if (!APPLY) {
    console.log("\n▶ 실제 적용하려면: node scripts/migrate-confirm-source.js --apply");
    process.exit(0);
  }

  // batch write (500개 단위)
  let committed = 0;
  for (let i = 0; i < targets.length; i += 500) {
    const batch = db.batch();
    targets.slice(i, i + 500).forEach(({ ref, to }) => {
      batch.update(ref, { confirmSource: to });
    });
    await batch.commit();
    committed += Math.min(500, targets.length - i);
    console.log(`  커밋: ${committed}/${targets.length}`);
  }

  console.log(`\n✅ ${targets.length}건 confirmSource 마이그레이션 완료`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
