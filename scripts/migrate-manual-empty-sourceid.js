#!/usr/bin/env node
/**
 * confirmed race_results 중 source=manual 이고 sourceId가 비어 있는 문서에
 * 대회 단위 고유 sourceId 부여 (excel_${sha256(date|name).slice(0,12)}).
 * → race_events.sourceMappings 에 manual 을 넣을 때 §2.4 전역 유일 키 확보.
 *
 * 기본: DRY-RUN (출력만). 쓰기는 --apply + 팀 승인 후 (data-write-safety).
 *
 *   node scripts/migrate-manual-empty-sourceid.js
 *   node scripts/migrate-manual-empty-sourceid.js --apply
 */

const crypto = require("crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const APPLY = process.argv.includes("--apply");

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

function syntheticSourceId(eventDate, eventName) {
  const d = (eventDate || "").slice(0, 10);
  const n = String(eventName || "").trim();
  const h = crypto.createHash("sha256").update(`${d}|${n}`).digest("hex").slice(0, 12);
  return `excel_${h}`;
}

(async () => {
  const snap = await db
    .collection("race_results")
    .where("status", "==", "confirmed")
    .where("source", "==", "manual")
    .get();

  /** @type {Map<string, { sourceId: string; refs: import("firebase-admin/firestore").DocumentReference[] }>} */
  const groups = new Map();

  for (const doc of snap.docs) {
    const d = doc.data();
    const sid = d.sourceId != null ? String(d.sourceId) : "";
    if (sid !== "") continue;

    const date = (d.eventDate || "").slice(0, 10);
    const name = String(d.eventName || "").trim();
    const gkey = `${date}\t${name}`;
    const sourceId = syntheticSourceId(date, name);

    if (!groups.has(gkey)) {
      groups.set(gkey, { sourceId, refs: [] });
    }
    groups.get(gkey).refs.push(doc.ref);
  }

  console.log(`모드: ${APPLY ? "APPLY (쓰기)" : "DRY-RUN"}`);
  console.log(`대상 그룹(날짜+대회명): ${groups.size}개, 총 문서: ${[...groups.values()].reduce((s, g) => s + g.refs.length, 0)}건\n`);

  for (const [gkey, { sourceId, refs }] of [...groups.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    const [date, name] = gkey.split("\t");
    console.log(`${date} | ${name}`);
    console.log(`  → sourceId: ${sourceId} (${refs.length}건)`);
  }

  if (!APPLY) {
    console.log("\nDRY-RUN 끝. Firestore 반영은 팀 승인 후 --apply.");
    process.exit(0);
  }

  let batch = db.batch();
  let n = 0;
  let total = 0;

  const flush = async () => {
    if (n > 0) {
      await batch.commit();
      total += n;
    }
    batch = db.batch();
    n = 0;
  };

  for (const { sourceId, refs } of groups.values()) {
    for (const ref of refs) {
      batch.update(ref, { sourceId });
      n++;
      if (n >= 400) await flush();
    }
  }
  await flush();
  console.log(`\n✅ 업데이트 완료: ${total}건`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
