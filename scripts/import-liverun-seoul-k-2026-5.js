#!/usr/bin/env node
/**
 * 2026 서울 K 마라톤 (liverun pid 10699 출처) — 이강원 제외 5명 race_results 확정 저장.
 *
 *   node scripts/import-liverun-seoul-k-2026-5.js --dry-run
 *   node scripts/import-liverun-seoul-k-2026-5.js
 *
 * 프로덕션 Firestore (ADC). 에뮬이면 FIRESTORE_EMULATOR_HOST 제거 후 실행.
 */

const path = require("path");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { normalizeRaceDistance } = require("../functions/lib/raceDistance");

const DRY_RUN = process.argv.includes("--dry-run");

if (!DRY_RUN && process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("FIRESTORE_EMULATOR_HOST 가 설정되어 있습니다. 프로덕션 입력이 아닐 수 있습니다. 종료.");
  process.exit(1);
}

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

const EVENT_NAME = "2026 서울 K 마라톤";
const EVENT_DATE = "2026-03-29";

/** @type {{ realName: string; distance: string; netTime: string; bib: string; gender: string }[]} */
const ROWS = [
  { realName: "송진수", distance: "10K", netTime: "00:42:24", bib: "10067", gender: "M" },
  { realName: "서정모", distance: "half", netTime: "01:28:19", bib: "30072", gender: "M" },
  { realName: "장성남", distance: "half", netTime: "01:26:03", bib: "30021", gender: "M" },
  { realName: "한남규", distance: "half", netTime: "01:29:11", bib: "30070", gender: "M" },
  { realName: "진형권", distance: "half", netTime: "01:30:47", bib: "32121", gender: "M" },
];

function docIdFor(r) {
  const safeDate = EVENT_DATE.replace(/[^0-9\-]/g, "");
  const safeName = (r.realName || "").replace(/[^a-zA-Z0-9가-힣]/g, "_");
  const distNorm = normalizeRaceDistance(r.distance);
  const safeDist = (distNorm || "").replace(/[^a-zA-Z0-9]/g, "_");
  return `${safeName}_${safeDist}_${safeDate}`;
}

(async () => {
  const nickByName = {};
  const memSnap = await db.collection("members").get();
  memSnap.forEach((d) => {
    const data = d.data();
    if (data.realName) nickByName[data.realName] = { nickname: data.nickname || "", gender: data.gender || "" };
  });

  const now = new Date().toISOString();
  const payloads = ROWS.map((r) => {
    const distNorm = normalizeRaceDistance(r.distance);
    const meta = nickByName[r.realName] || { nickname: "", gender: "" };
    const gender = meta.gender || r.gender || "";
    // note는 races/my에서 배지로 노출됨 — bib 필드로 충분하므로 비움
    return {
      docId: docIdFor(r),
      data: {
        jobId: "manual",
        eventName: EVENT_NAME,
        eventDate: EVENT_DATE,
        source: "manual",
        sourceId: "",
        memberRealName: r.realName,
        memberNickname: meta.nickname,
        distance: distNorm,
        netTime: r.netTime,
        gunTime: "",
        finishTime: r.netTime,
        bib: r.bib,
        overallRank: null,
        gender,
        pbConfirmed: false,
        isGuest: false,
        note: "",
        status: "confirmed",
        confirmedAt: now,
        confirmSource: "liverun_manual",
      },
    };
  });

  console.log(DRY_RUN ? "[dry-run] 저장 예정:\n" : "저장:\n");
  for (const { docId, data } of payloads) {
    console.log(`  ${docId} | ${data.memberRealName} ${data.distance} ${data.netTime} bib=${data.bib}`);
  }

  if (DRY_RUN) {
    console.log("\n--dry-run 이므로 커밋 안 함.");
    process.exit(0);
  }

  let batch = db.batch();
  let n = 0;
  for (const { docId, data } of payloads) {
    batch.set(db.collection("race_results").doc(docId), data);
    n++;
    if (n >= 400) {
      await batch.commit();
      batch = db.batch();
      n = 0;
    }
  }
  if (n > 0) await batch.commit();
  console.log(`\n✅ race_results ${payloads.length}건 저장.`);

  console.log("members.confirmedCount 재계산...");
  const allConfirmed = await db.collection("race_results").where("status", "==", "confirmed").get();
  const countByMember = {};
  allConfirmed.forEach((doc) => {
    const name = doc.data().memberRealName;
    if (name) countByMember[name] = (countByMember[name] || 0) + 1;
  });
  let mbatch = db.batch();
  let mc = 0;
  for (const doc of memSnap.docs) {
    const name = doc.data().realName;
    const cnt = countByMember[name] || 0;
    mbatch.update(doc.ref, { confirmedCount: cnt, updatedAt: FieldValue.serverTimestamp() });
    mc++;
    if (mc >= 400) {
      await mbatch.commit();
      mbatch = db.batch();
      mc = 0;
    }
  }
  if (mc > 0) await mbatch.commit();
  console.log("✅ confirmedCount 반영 완료.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
