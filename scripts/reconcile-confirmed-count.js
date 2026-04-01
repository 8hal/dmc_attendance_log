#!/usr/bin/env node
/**
 * scrape_jobs.confirmedCount 를 SSOT인 race_results(확정 행, jobId 일치) 건수에 맞춘다.
 * data-integrity API(`status === "confirmed"` 잡만 검사)와 동일한 규칙.
 *
 *   node scripts/reconcile-confirmed-count.js              # dry-run (기본)
 *   node scripts/reconcile-confirmed-count.js --apply      # 쓰기 (백업 후)
 *   node scripts/reconcile-confirmed-count.js --emulator
 *
 * firebase-admin: functions/node_modules
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
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const APPLY = process.argv.includes("--apply");
const useEmulator = process.argv.includes("--emulator");

if (useEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
} else if (process.env.FIRESTORE_EMULATOR_HOST) {
  delete process.env.FIRESTORE_EMULATOR_HOST;
}

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

async function main() {
  const target = useEmulator ? "에뮬" : "프로덕션";
  console.log(`[reconcile-confirmed-count] 대상: ${target}`);
  console.log(`모드: ${APPLY ? "적용(--apply)" : "dry-run (쓰기 없음)"}\n`);

  const jobsSnap = await db.collection("scrape_jobs").where("status", "==", "confirmed").get();
  const rrSnap = await db.collection("race_results").where("status", "==", "confirmed").get();

  const actualByJob = {};
  rrSnap.forEach((doc) => {
    const jid = doc.data().jobId || "none";
    actualByJob[jid] = (actualByJob[jid] || 0) + 1;
  });

  const diffs = [];
  jobsSnap.forEach((doc) => {
    const d = doc.data();
    const actual = actualByJob[doc.id] || 0;
    const claimed = d.confirmedCount ?? 0;
    if (claimed !== actual) {
      diffs.push({
        ref: doc.ref,
        jobId: doc.id,
        eventName: d.eventName || "",
        claimed,
        actual,
        delta: actual - claimed,
      });
    }
  });

  diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  console.log(`확정 잡 수: ${jobsSnap.size}, 확정 race_results: ${rrSnap.size}`);
  console.log(`불일치 잡: ${diffs.length}건\n`);

  if (diffs.length === 0) {
    console.log("조정할 잡이 없습니다.");
    return;
  }

  for (const row of diffs) {
    console.log(
      `  ${row.jobId} | ${row.eventName.slice(0, 40)} | claimed=${row.claimed} → actual=${row.actual} (Δ${row.delta >= 0 ? "+" : ""}${row.delta})`,
    );
  }

  if (!APPLY) {
    console.log(`\n적용하려면: 백업 후 node scripts/reconcile-confirmed-count.js --apply`);
    console.log(`  cd functions && node ../scripts/backup-firestore.js`);
    return;
  }

  let batch = db.batch();
  let n = 0;
  let batches = 0;
  for (const row of diffs) {
    batch.update(row.ref, { confirmedCount: row.actual, reconciledAt: FieldValue.serverTimestamp() });
    n++;
    if (n >= 450) {
      await batch.commit();
      batches++;
      batch = db.batch();
      n = 0;
    }
  }
  if (n > 0) await batch.commit();
  console.log(`\n✅ ${diffs.length}건 confirmedCount 업데이트 완료 (batch commits: ${batches + (n > 0 ? 1 : 0)})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
