#!/usr/bin/env node
/**
 * 춘백 S3 프로덕션 시즌 시드 — season_config + 100슬롯 골격
 *
 * 사용법:
 *   node scripts/seed-chunbaek-season.js --dry-run
 *   node scripts/seed-chunbaek-season.js
 *
 * 옵션:
 *   --csv=path          슬롯 CSV (기본: scripts/data/chunbaek-s3-slots-100days.csv)
 *   --start=YYYY-MM-DD  season_config.startDate (기본: 2026-07-20)
 *   --end=YYYY-MM-DD    season_config.endDate (기본: CSV 마지막 날)
 *   --emulator          Firestore 에뮬레이터 대상
 *
 * 정책: firestore-data-modification — 반드시 --dry-run 후 사용자 승인
 */
const fs = require("fs");
const path = require("path");

const functionsDir = path.join(__dirname, "..", "functions");
const nm = path.join(functionsDir, "node_modules");
if (!fs.existsSync(nm)) {
  console.error("functions/node_modules 없음. cd functions && npm ci");
  process.exit(1);
}
const { createRequire } = require("module");
const requireFromFunctions = createRequire(path.join(nm, "_"));
const { initializeApp } = requireFromFunctions("firebase-admin/app");
const { getFirestore, FieldValue } = requireFromFunctions("firebase-admin/firestore");

const dryRun = process.argv.includes("--dry-run");
const useEmulator = process.argv.includes("--emulator");

function getArg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const csvPath = path.resolve(getArg("csv", path.join(__dirname, "data", "chunbaek-s3-slots-100days.csv")));
const startDate = getArg("start", "2026-07-20");

if (useEmulator) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  }
} else if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.warn("[seed-chunbaek-season] FIRESTORE_EMULATOR_HOST 제거 → 프로덕션 대상");
  delete process.env.FIRESTORE_EMULATOR_HOST;
}

function parseCsv(text) {
  const lines = String(text).trim().split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row = {};
    header.forEach((key, idx) => { row[key] = (cols[idx] || "").trim(); });
    return {
      dayIndex: Number(row.dayIndex),
      date: row.date,
      week: Number(row.week),
      trainingTitle: row.trainingTitle || "",
      trainingContent: row.trainingContent || "",
      isProgramOff: row.isProgramOff === "true",
    };
  });
}

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

(async () => {
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV 없음: ${csvPath}`);
    console.error("먼저: node scripts/generate-chunbaek-slot-skeleton.js");
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  if (rows.length !== 100) {
    console.error(`슬롯 수 오류: ${rows.length} (100 필요)`);
    process.exit(1);
  }

  const endDate = getArg("end", rows[rows.length - 1].date);
  const target = useEmulator ? "에뮬레이터" : "프로덕션";
  const mode = dryRun ? "DRY RUN" : "실행";

  console.log(`[seed-chunbaek-season] ${mode} · ${target}`);
  console.log(`  season_config: start=${startDate}, end=${endDate}`);
  console.log(`  slots: ${rows.length}건 (${rows[0].date} ~ ${rows[rows.length - 1].date})`);
  console.log(`  CSV: ${csvPath}\n`);

  const [configSnap, slotsSnap, attSnap] = await Promise.all([
    db.collection("chunbaek_season_config").doc("chunbaek-s3").get(),
    db.collection("chunbaek_slots").get(),
    db.collection("chunbaek_attendance").limit(1).get(),
  ]);

  const configData = {
    seasonId: "chunbaek-s3",
    title: "춘백 시즌3",
    raceName: "2026 JTBC 서울마라톤",
    raceDate: "2026-11-01",
    races: [
      { name: "춘천 마라톤", date: "2026-10-25", dayIndex: 98, role: "mid-season", note: "참가자 일부 개인 목표" },
      { name: "2026 JTBC 서울마라톤", date: "2026-11-01", dayIndex: null, role: "goal", note: "참가자 일부 개인 목표" },
    ],
    departureCeremonyDate: "2026-07-16",
    startDate,
    endDate,
    weeklyTarget: 3,
    photoRequired: false,
  };

  console.log("1) chunbaek_season_config/chunbaek-s3");
  if (configSnap.exists) {
    console.log("   현재:", JSON.stringify(configSnap.data(), null, 2));
  } else {
    console.log("   현재: (없음)");
  }
  console.log("   변경:", JSON.stringify(configData, null, 2));

  console.log(`\n2) chunbaek_slots: 기존 ${slotsSnap.size}건 → ${rows.length}건 replace`);
  if (!attSnap.empty) {
    console.warn("   ⚠️ chunbaek_attendance 존재 — 슬롯 전체 삭제는 스킵됩니다 (API와 동일 정책)");
  }

  const sample = rows.slice(0, 3).concat(rows.slice(-2));
  console.log("   샘플:");
  sample.forEach((r) => {
    console.log(`     ${r.dayIndex} | ${r.date} | week ${r.week}`);
  });

  if (dryRun) {
    console.log("\n[DRY RUN] 변경 없음. 실행:");
    console.log("  node scripts/seed-chunbaek-season.js");
    process.exit(0);
  }

  await db.collection("chunbaek_season_config").doc("chunbaek-s3").set(configData, { merge: true });

  if (attSnap.empty && slotsSnap.size > 0) {
    const delBatch = db.batch();
    slotsSnap.forEach((doc) => delBatch.delete(doc.ref));
    await delBatch.commit();
    console.log(`   기존 슬롯 ${slotsSnap.size}건 삭제`);
  }

  const batchSize = 400;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = db.batch();
    rows.slice(i, i + batchSize).forEach((row) => {
      batch.set(db.collection("chunbaek_slots").doc(String(row.dayIndex)), {
        dayIndex: row.dayIndex,
        date: row.date,
        week: row.week,
        trainingTitle: row.trainingTitle,
        trainingContent: row.trainingContent,
        isProgramOff: row.isProgramOff,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    await batch.commit();
  }

  console.log(`\n✅ 시즌 시드 완료: config + slots ${rows.length}건`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
