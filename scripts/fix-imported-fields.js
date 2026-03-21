/**
 * 임포트된 대회 기록의 필드명 + PB 수정 스크립트
 *
 * 수정 사항:
 *   1. nickname/realName → memberNickname/memberRealName
 *   2. note에 "PB" 포함된 항목 → isPB: true
 *   3. note에서 PB를 분리해서 비고만 남김 (예: "3위, PB" → note="3위", isPB=true)
 *
 * 사용법:
 *   cd functions && node ../scripts/fix-imported-fields.js
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

function parseNote(raw) {
  if (!raw) return { isPB: false, note: "" };
  const hasPB = /\bPB\b/i.test(raw);
  const cleaned = raw
    .replace(/,?\s*PB\s*,?/gi, "")
    .replace(/^[,\s]+|[,\s]+$/g, "")
    .trim();
  return { isPB: hasPB, note: cleaned };
}

async function main() {
  const snap = await db.collection("scrape_jobs")
    .where("source", "==", "manual")
    .where("status", "==", "complete")
    .get();

  console.log(`🔍 수정 대상: ${snap.size}건\n`);

  let fixed = 0;
  for (const doc of snap.docs) {
    const job = doc.data();
    if (!job.results?.length) continue;

    const fixedResults = job.results.map(r => {
      const { isPB, note } = parseNote(r.note || "");
      return {
        memberNickname: r.nickname || r.memberNickname || "",
        memberRealName: r.realName || r.memberRealName || "",
        memberGender: r.gender || r.memberGender || "",
        bib: r.bib || "",
        distance: r.distance || "",
        netTime: r.netTime || "",
        gunTime: r.gunTime || r.netTime || "",
        overallRank: r.overallRank || null,
        genderRank: r.genderRank || null,
        pace: r.pace || "",
        status: "auto",
        candidateCount: 1,
        isPB: isPB || r.isPB || false,
        pbConfirmed: false,
        isGuest: r.isGuest || false,
        note,
      };
    });

    const pbCount = fixedResults.filter(r => r.isPB).length;
    await doc.ref.update({ results: fixedResults });
    console.log(`✅ [${job.eventDate}] ${job.eventName} — ${fixedResults.length}건 수정 (PB: ${pbCount}명)`);
    fixed++;
  }

  console.log(`\n🎉 완료! ${fixed}개 대회 수정됨.`);
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ 오류:", e);
  process.exit(1);
});
