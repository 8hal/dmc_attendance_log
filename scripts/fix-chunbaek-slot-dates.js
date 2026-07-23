#!/usr/bin/env node
/**
 * chunbaek_slots date/week 수정 — CSV 기준으로 date·week만 덮어씀
 * trainingTitle / trainingContent / isProgramOff 는 건드리지 않음
 *
 * 사용법:
 *   node scripts/fix-chunbaek-slot-dates.js --dry-run   # 변경 내용 확인
 *   node scripts/fix-chunbaek-slot-dates.js             # 실제 적용
 *
 * 옵션:
 *   --csv=path   슬롯 CSV (기본: scripts/data/chunbaek-s3-slots-100days.csv)
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

function getArg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const csvPath = path.resolve(
  getArg("csv", path.join(__dirname, "data", "chunbaek-s3-slots-100days.csv"))
);

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
    };
  });
}

if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.warn("[fix-slot-dates] FIRESTORE_EMULATOR_HOST 감지됨 → 에뮬레이터 대상");
} else {
  console.log("[fix-slot-dates] 프로덕션 대상");
}

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

(async () => {
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV 없음: ${csvPath}`);
    process.exit(1);
  }

  const csvRows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const csvMap = new Map(csvRows.map((r) => [r.dayIndex, r]));

  console.log(`[fix-chunbaek-slot-dates] ${dryRun ? "DRY RUN" : "실행"}`);
  console.log(`  CSV: ${csvPath}`);
  console.log(`  슬롯 ${csvRows.length}건 (${csvRows[0].date} ~ ${csvRows[csvRows.length - 1].date})\n`);

  // 현재 Firestore 슬롯 조회
  const snap = await db.collection("chunbaek_slots").orderBy("dayIndex").get();
  const existing = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // week ≥ 1 (season) 슬롯만 대상
  const targets = existing.filter((s) => {
    const di = s.dayIndex ?? Number(s.id);
    return s.week !== 0 && Number.isFinite(di) && di >= 1 && di <= 100;
  });

  console.log(`  Firestore season 슬롯 ${targets.length}건 확인`);

  let changed = 0;
  let skipped = 0;
  const changes = [];

  for (const slot of targets) {
    const di = slot.dayIndex ?? Number(slot.id);
    const csv = csvMap.get(di);
    if (!csv) {
      console.warn(`  dayIndex ${di}: CSV에 없음 — 스킵`);
      skipped += 1;
      continue;
    }

    const dateSame = slot.date === csv.date;
    const weekSame = slot.week === csv.week;

    if (dateSame && weekSame) {
      skipped += 1;
      continue;
    }

    changes.push({
      dayIndex: di,
      oldDate: slot.date,
      newDate: csv.date,
      oldWeek: slot.week,
      newWeek: csv.week,
    });
    changed += 1;
  }

  console.log(`\n  변경 필요: ${changed}건 / 스킵: ${skipped}건\n`);

  if (changes.length === 0) {
    console.log("  ✅ 모든 슬롯 date/week가 CSV와 일치합니다. 수정 불필요.");
    process.exit(0);
  }

  // 변경 목록 출력 (최대 20건)
  const preview = changes.slice(0, 20);
  console.log("  변경 내역 (최대 20건):");
  console.log("  dayIndex | 현재 date   | CSV date    | 현재 week | CSV week");
  console.log("  " + "-".repeat(65));
  for (const c of preview) {
    const dateMark = c.oldDate !== c.newDate ? "→" : "  ";
    const weekMark = c.oldWeek !== c.newWeek ? "→" : "  ";
    console.log(
      `  ${String(c.dayIndex).padStart(8)} | ${c.oldDate} ${dateMark} ${c.newDate} | ${String(c.oldWeek).padStart(9)} ${weekMark} ${c.newWeek}`
    );
  }
  if (changes.length > 20) {
    console.log(`  ... 외 ${changes.length - 20}건`);
  }

  if (dryRun) {
    console.log("\n[DRY RUN] 변경 없음. 실제 적용하려면:");
    console.log("  node scripts/fix-chunbaek-slot-dates.js");
    process.exit(0);
  }

  // 배치 업데이트 (500건씩)
  const BATCH_SIZE = 500;
  for (let i = 0; i < changes.length; i += BATCH_SIZE) {
    const chunk = changes.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const c of chunk) {
      const ref = db.collection("chunbaek_slots").doc(String(c.dayIndex));
      batch.set(ref, {
        date: c.newDate,
        week: c.newWeek,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
    console.log(`  배치 ${Math.floor(i / BATCH_SIZE) + 1} 완료 (${chunk.length}건)`);
  }

  console.log(`\n✅ ${changed}건 수정 완료`);
  console.log("  앱을 새로고침하면 정상 화면이 표시됩니다.");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
