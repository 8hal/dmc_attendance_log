#!/usr/bin/env node
/**
 * chunbaek_slots date/week 감사 — 저장값 vs 시즌 파생값(SSOT) 비교
 *
 * 사용법:
 *   node scripts/verify-chunbaek-slot-dates.js              # 프로덕션
 *   node scripts/verify-chunbaek-slot-dates.js --emulator   # Firestore 에뮬
 *   node scripts/verify-chunbaek-slot-dates.js --skip-beta  # beta 901–907 생략
 *
 * exit 0 = 불일치 0건, exit 1 = 불일치 있음 (또는 로드 실패)
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
const { getFirestore } = requireFromFunctions("firebase-admin/firestore");

const {
  deriveSeasonDate,
  deriveSeasonWeek,
  deriveSlotDate,
  BETA_DAY_INDEX_BASE,
  BETA_DAY_COUNT,
} = require("../functions/lib/chunbaek-stats");

const useEmulator = process.argv.includes("--emulator");
const skipBeta = process.argv.includes("--skip-beta");
const SEASON_ID = "chunbaek-s3";

if (useEmulator) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  }
} else if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.warn("[verify-chunbaek-slot-dates] FIRESTORE_EMULATOR_HOST 제거 → 프로덕션 대상");
  delete process.env.FIRESTORE_EMULATOR_HOST;
}

const target = useEmulator ? "에뮬레이터" : "프로덕션";
console.log(`[verify-chunbaek-slot-dates] 대상: ${target}`);
if (useEmulator) {
  console.log(`  FIRESTORE_EMULATOR_HOST=${process.env.FIRESTORE_EMULATOR_HOST}`);
}

try {
  initializeApp({ projectId: "dmc-attendance" });
} catch (e) {
  console.error("Firebase Admin 초기화 실패:", e.message || e);
  process.exit(1);
}
const db = getFirestore();

function slotKey(slot) {
  const di = Number(slot.dayIndex ?? slot.id);
  return Number.isFinite(di) ? di : null;
}

(async () => {
  let configSnap;
  let slotsSnap;
  try {
    [configSnap, slotsSnap] = await Promise.all([
      db.collection("chunbaek_season_config").doc(SEASON_ID).get(),
      db.collection("chunbaek_slots").get(),
    ]);
  } catch (e) {
    console.error("Firestore 로드 실패 (자격 증명/에뮬 연결을 확인하세요):");
    console.error(e.message || e);
    process.exit(1);
  }

  if (!configSnap.exists) {
    console.error(`chunbaek_season_config/${SEASON_ID} 없음`);
    process.exit(1);
  }

  const config = configSnap.data() || {};
  const allSlots = slotsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const byDay = new Map();
  for (const slot of allSlots) {
    const di = slotKey(slot);
    if (di != null) byDay.set(di, slot);
  }

  console.log(`  season_config.startDate=${config.startDate || "(없음)"} endDate=${config.endDate || "(없음)"}`);
  console.log(`  chunbaek_slots 문서 ${allSlots.length}건\n`);

  const mismatches = [];

  for (let di = 1; di <= 100; di += 1) {
    const expectedDate = deriveSeasonDate(config, di);
    const expectedWeek = deriveSeasonWeek(di);
    const slot = byDay.get(di);

    if (!slot) {
      mismatches.push({
        dayIndex: di,
        kind: "missing",
        storedDate: null,
        expectedDate,
        storedWeek: null,
        expectedWeek,
      });
      continue;
    }

    const storedDate = slot.date == null ? null : String(slot.date);
    const storedWeek = slot.week == null ? null : Number(slot.week);
    const dateOk = storedDate === expectedDate;
    const weekOk = storedWeek === expectedWeek;

    if (!dateOk || !weekOk) {
      mismatches.push({
        dayIndex: di,
        kind: "season",
        storedDate,
        expectedDate,
        storedWeek,
        expectedWeek,
        dateOk,
        weekOk,
      });
    }
  }

  if (!skipBeta) {
    for (let i = 0; i < BETA_DAY_COUNT; i += 1) {
      const di = BETA_DAY_INDEX_BASE + i;
      const slot = byDay.get(di);
      if (!slot) {
        mismatches.push({
          dayIndex: di,
          kind: "beta-missing",
          storedDate: null,
          expectedDate: deriveSlotDate({ dayIndex: di, week: 0 }, config, allSlots),
          storedWeek: null,
          expectedWeek: 0,
        });
        continue;
      }
      const expectedDate = deriveSlotDate(slot, config, allSlots);
      const storedDate = slot.date == null ? null : String(slot.date);
      if (storedDate !== expectedDate) {
        mismatches.push({
          dayIndex: di,
          kind: "beta",
          storedDate,
          expectedDate,
          storedWeek: slot.week == null ? null : Number(slot.week),
          expectedWeek: 0,
          dateOk: false,
          weekOk: true,
        });
      }
    }
  }

  if (mismatches.length === 0) {
    console.log("✅ 불일치 0건 — date/week가 파생값과 일치합니다.");
    process.exit(0);
  }

  console.log(`❌ 불일치 ${mismatches.length}건\n`);
  console.log("  dayIndex | kind         | stored date | expected date | stored week | expected week");
  console.log("  " + "-".repeat(78));
  for (const m of mismatches) {
    console.log(
      `  ${String(m.dayIndex).padStart(8)} | ${String(m.kind).padEnd(12)} | ${String(m.storedDate ?? "-").padEnd(11)} | ${String(m.expectedDate ?? "-").padEnd(13)} | ${String(m.storedWeek ?? "-").padStart(11)} | ${m.expectedWeek ?? "-"}`
    );
  }

  console.log("\n복구 (CSV 기준 date/week만):");
  console.log("  node scripts/fix-chunbaek-slot-dates.js --dry-run");
  console.log("  node scripts/fix-chunbaek-slot-dates.js");
  process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
