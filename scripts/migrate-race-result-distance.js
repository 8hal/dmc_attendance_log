#!/usr/bin/env node
/**
 * race_results.distance 를 normalizeRaceDistance 로 맞추고, docId 가 달라지면 이동/병합.
 * 10K 전용이 아님 — functions/lib/raceDistance.js 의 모든 별칭(5km→5K, half, full, …)에 동일 적용.
 * 같은 사람·같은 날짜에 거리 표기만 다른 중복 문서(..._5km_ vs ..._5K_ 등)를 canonical docId 한 건으로 정리.
 *
 *   node scripts/migrate-race-result-distance.js           # = dry-run (기본)
 *   node scripts/migrate-race-result-distance.js --dry-run
 *   node scripts/migrate-race-result-distance.js --apply   # 프로덕션만. 팀 승인 + 백업 후
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { normalizeRaceDistance } = require("../functions/lib/raceDistance");

const APPLY = process.argv.includes("--apply");

if (APPLY && process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "migrate-race-result-distance: FIRESTORE_EMULATOR_HOST 가 설정되어 있습니다. --apply 는 프로덕션 전용입니다. 에뮬레이터를 끄거나 환경변수를 해제한 뒤 prod ADC 로 실행하세요."
  );
  process.exit(1);
}

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

function buildDocId(memberRealName, distanceNorm, eventDate) {
  const safeName = String(memberRealName || "").replace(/[^a-zA-Z0-9가-힣]/g, "_");
  const safeDist = String(distanceNorm || "").replace(/[^a-zA-Z0-9]/g, "_");
  const safeDate = String(eventDate || "").replace(/[^0-9\-]/g, "");
  return `${safeName}_${safeDist}_${safeDate}`;
}

function scoreRow(d) {
  let s = 0;
  if (d.pbConfirmed) s += 20;
  if (d.source && d.source !== "manual") s += 10;
  if (d.bib && String(d.bib).trim()) s += 2;
  if (d.netTime && String(d.netTime).trim()) s += 1;
  return s;
}

(async () => {
  const snap = await db.collection("race_results").where("status", "==", "confirmed").get();
  /** @type {Map<string, FirebaseFirestore.QueryDocumentSnapshot>} */
  const byId = new Map();
  snap.forEach((d) => byId.set(d.id, d));

  /** @type {{ kind: string; detail: string }[]} */
  const log = [];

  let patchOnly = 0;
  let moves = 0;
  let merges = 0;
  /** @type {Map<string, number>} */
  const transitionCounts = new Map();

  const flushWrites = async (ops) => {
    let batch = db.batch();
    let n = 0;
    const commit = async () => {
      if (n > 0) {
        if (APPLY) await batch.commit();
        batch = db.batch();
        n = 0;
      }
    };
    for (const op of ops) {
      op(batch);
      n++;
      if (n >= 400) await commit();
    }
    await commit();
  };

  const writeOps = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const oldDist = data.distance;
    const newDist = normalizeRaceDistance(oldDist);
    if (oldDist === newDist) continue;

    const transKey = `${String(oldDist)} → ${newDist}`;
    transitionCounts.set(transKey, (transitionCounts.get(transKey) || 0) + 1);

    const newId = buildDocId(data.memberRealName, newDist, data.eventDate);
    const detailBase = `${doc.id} | ${data.memberRealName} | ${oldDist}→${newDist} | →${newId}`;

    if (newId === doc.id) {
      log.push({ kind: "patch", detail: detailBase });
      patchOnly++;
      writeOps.push((b) => b.update(doc.ref, { distance: newDist }));
      continue;
    }

    const targetSnap = byId.get(newId);
    if (!targetSnap) {
      log.push({ kind: "move", detail: detailBase });
      moves++;
      const payload = { ...data, distance: newDist };
      writeOps.push((b) => {
        b.set(db.collection("race_results").doc(newId), payload);
        b.delete(doc.ref);
      });
      byId.set(newId, { id: newId, data: () => payload, ref: db.collection("race_results").doc(newId) });
      byId.delete(doc.id);
      continue;
    }

    const keepData = targetSnap.data();
    const loseData = data;
    const merged = {
      ...keepData,
      distance: newDist,
      pbConfirmed: !!(keepData.pbConfirmed || loseData.pbConfirmed),
      bib: (keepData.bib && String(keepData.bib).trim()) ? keepData.bib : loseData.bib || "",
      netTime: (keepData.netTime && String(keepData.netTime).trim()) ? keepData.netTime : loseData.netTime || "",
      gunTime: (keepData.gunTime && String(keepData.gunTime).trim()) ? keepData.gunTime : loseData.gunTime || "",
      canonicalEventId: keepData.canonicalEventId || loseData.canonicalEventId || null,
    };
    if (scoreRow(loseData) > scoreRow(keepData)) {
      merged.memberNickname = loseData.memberNickname || keepData.memberNickname;
      merged.note = [keepData.note, loseData.note].filter(Boolean).join(" | ") || keepData.note || "";
    }

    log.push({ kind: "merge", detail: `${detailBase} (유지 ${newId}, 삭제 소스=${loseData.source})` });
    merges++;
    writeOps.push((b) => {
      b.set(db.collection("race_results").doc(newId), merged);
      b.delete(doc.ref);
    });
    byId.delete(doc.id);
  }

  console.log(`모드: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`대상 confirmed 문서: ${snap.size}건`);
  console.log(`변경 예정: patch ${patchOnly}건, 이동 ${moves}건, 병합(중복삭제) ${merges}건`);
  if (transitionCounts.size > 0) {
    console.log("\n거리 변환 요약 (normalizeRaceDistance 기준):");
    const sorted = [...transitionCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [k, n] of sorted) console.log(`  ${n}건  ${k}`);
  }
  console.log("");

  for (const row of log.slice(0, 80)) {
    console.log(`[${row.kind}] ${row.detail}`);
  }
  if (log.length > 80) console.log(`\n… 외 ${log.length - 80}건`);

  if (!APPLY) {
    console.log("\nDRY-RUN 끝. 반영은 팀 승인 후 --apply");
    process.exit(0);
  }

  await flushWrites(writeOps);
  console.log("\n✅ migrate-race-result-distance 적용 완료");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
