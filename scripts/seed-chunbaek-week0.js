#!/usr/bin/env node
/**
 * 춘백 S3 0주차(베타) 슬롯 시드 — 7/13~7/19, dayIndex 901~907
 *
 * 사용법:
 *   node scripts/seed-chunbaek-week0.js --dry-run
 *   node scripts/seed-chunbaek-week0.js
 *
 * 옵션:
 *   --beta-start=YYYY-MM-DD  (기본: 2026-07-13)
 *   --emulator               Firestore 에뮬레이터
 *
 * 정책: firestore-data-modification — 반드시 --dry-run 후 사용자 승인
 */
const path = require("path");

const functionsDir = path.join(__dirname, "..", "functions");
const nm = path.join(functionsDir, "node_modules");
if (!require("fs").existsSync(nm)) {
  console.error("functions/node_modules 없음. cd functions && npm ci");
  process.exit(1);
}
const { createRequire } = require("module");
const requireFromFunctions = createRequire(path.join(nm, "_"));
const { initializeApp } = requireFromFunctions("firebase-admin/app");
const { getFirestore, FieldValue } = requireFromFunctions("firebase-admin/firestore");

const { addDaysIso, BETA_DAY_INDEX_BASE } = require("../functions/lib/chunbaek-stats");

const dryRun = process.argv.includes("--dry-run");
const useEmulator = process.argv.includes("--emulator");

function getArg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const betaStart = getArg("beta-start", "2026-07-13");
const betaEnd = addDaysIso(betaStart, 6);

if (useEmulator) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  }
} else if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.warn("[seed-chunbaek-week0] FIRESTORE_EMULATOR_HOST 제거 → 프로덕션 대상");
  delete process.env.FIRESTORE_EMULATOR_HOST;
}

const rows = Array.from({ length: 7 }, (_, i) => ({
  dayIndex: BETA_DAY_INDEX_BASE + i,
  date: addDaysIso(betaStart, i),
  week: 0,
  trainingTitle: "",
  trainingContent: "",
  isProgramOff: false,
}));

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

(async () => {
  const target = useEmulator ? "에뮬레이터" : "프로덕션";
  const mode = dryRun ? "DRY RUN" : "실행";
  console.log(`[seed-chunbaek-week0] ${mode} · ${target}`);
  console.log(`  0주차: ${betaStart} ~ ${betaEnd}`);
  console.log(`  dayIndex: ${rows[0].dayIndex} ~ ${rows[rows.length - 1].dayIndex}\n`);

  const configRef = db.collection("chunbaek_season_config").doc("chunbaek-s3");
  const configSnap = await configRef.get();
  const configPatch = {
    betaWeekStartDate: betaStart,
    betaWeekEndDate: betaEnd,
  };

  console.log("1) season_config merge");
  console.log("   추가 필드:", JSON.stringify(configPatch));

  console.log("\n2) chunbaek_slots 0주차 7건");
  rows.forEach((r) => {
    console.log(`   ${r.dayIndex}  ${r.date}  week=${r.week}`);
  });

  if (dryRun) {
    console.log("\n[DRY RUN] 변경 없음. 승인 후 --dry-run 없이 실행하세요.");
    process.exit(0);
  }

  await configRef.set(configPatch, { merge: true });
  const batch = db.batch();
  for (const row of rows) {
    batch.set(
      db.collection("chunbaek_slots").doc(String(row.dayIndex)),
      { ...row, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  await batch.commit();
  console.log("\n✅ 0주차 베타 슬롯 7건 + season_config beta 날짜 적용 완료");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
