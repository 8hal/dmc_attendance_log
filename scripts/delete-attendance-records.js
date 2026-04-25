/**
 * 특정 닉네임+날짜 출석 기록 삭제 스크립트
 *
 * Usage:
 *   node scripts/delete-attendance-records.js --dry-run   # 삭제 대상 확인만
 *   node scripts/delete-attendance-records.js             # 실제 삭제
 */

const admin = require("firebase-admin");

const PROJECT_ID = "dmc-attendance";
const COLLECTION = "attendance";

// ── 삭제 대상 설정 ─────────────────────────────────────────────
const NICKNAME_KEY = "게살볶음밥";   // nicknameKey 검색용 (소문자 변환)
const TARGET_DATES = ["2026/04/23", "2026/04/24"]; // meetingDateKey 형식
// ───────────────────────────────────────────────────────────────

const dryRun = process.argv.includes("--dry-run");

async function main() {
  admin.initializeApp({ projectId: PROJECT_ID });
  const db = admin.firestore();

  const nicknameKey = NICKNAME_KEY.toLowerCase().replace(/\s/g, "");
  console.log(`\n[${dryRun ? "DRY RUN" : "실행"}] 출석 기록 삭제`);
  console.log(`  닉네임키: ${nicknameKey}`);
  console.log(`  대상 날짜: ${TARGET_DATES.join(", ")}\n`);

  let totalFound = 0;

  for (const dateKey of TARGET_DATES) {
    const snap = await db
      .collection(COLLECTION)
      .where("nicknameKey", "==", nicknameKey)
      .where("meetingDateKey", "==", dateKey)
      .get();

    if (snap.empty) {
      console.log(`  [${dateKey}] 기록 없음`);
      continue;
    }

    for (const doc of snap.docs) {
      const d = doc.data();
      totalFound++;
      console.log(`  [${dateKey}] 문서ID: ${doc.id}`);
      console.log(`    nickname: ${d.nickname}`);
      console.log(`    team: ${d.teamLabel || d.team}`);
      console.log(`    meetingType: ${d.meetingTypeLabel || d.meetingType}`);
      console.log(`    ts: ${d.ts ? new Date(d.ts).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "없음"}`);
      console.log(`    isGuest: ${d.isGuest}`);

      if (!dryRun) {
        await doc.ref.delete();
        console.log(`    → 삭제 완료`);
      } else {
        console.log(`    → [DRY RUN] 삭제 예정`);
      }
    }
  }

  console.log(`\n총 ${totalFound}건 ${dryRun ? "삭제 예정" : "삭제 완료"}.`);
  if (dryRun) {
    console.log("\n실제 삭제하려면: node scripts/delete-attendance-records.js");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("오류:", err);
  process.exit(1);
});
