/**
 * 게살볶음밥 철원DMZ(2026-09-05) 테스트 참여 데이터 초기화
 *
 * 대상 (검증된 memberId: wjwN15DBGn92tkBJ0T87):
 * 1) race_results/문광명_full_2026-09-05 삭제 (self-confirm 테스트 확정)
 * 2) race_events/evt_2026-09-05_23_dmz participants[] 해당 행 bib·distance 클리어
 * 3) 동일 이벤트 busBoarding.roster[] 해당 행 return 탑승 상태 리셋
 *
 * 유지:
 * - members/ 문서
 * - participants·roster 행 자체 (명단 소속)
 * - 경기마라톤(2026-04-19) 참가·기록
 * - attendance 출석 기록
 * - 다른 회원 데이터 / 이벤트 전체
 *
 * Usage:
 *   node scripts/reset-gesal-cheorwon-test-data.js --dry-run
 *   node scripts/reset-gesal-cheorwon-test-data.js
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.warn(
    "[reset] FIRESTORE_EMULATOR_HOST 제거 → 프로덕션 대상. 에뮬이면 이 스크립트를 쓰지 마세요.",
  );
  delete process.env.FIRESTORE_EMULATOR_HOST;
}

const PROJECT_ID =
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.FIREBASE_PROJECT_ID ||
  require("../.firebaserc").projects.default;
const MEMBER_ID = "wjwN15DBGn92tkBJ0T87";
const NICKNAME = "게살볶음밥";
const REAL_NAME = "문광명";
const EVENT_ID = "evt_2026-09-05_23_dmz";
const RESULT_DOC_ID = "문광명_full_2026-09-05";

const dryRun = process.argv.includes("--dry-run");

function initDb() {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: PROJECT_ID });
  }
  return admin.firestore();
}

function matchParticipant(p) {
  return (
    p.memberId === MEMBER_ID ||
    p.nickname === NICKNAME ||
    (p.realName === REAL_NAME && p.nickname === NICKNAME)
  );
}

async function writeBackup(payload) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(
    __dirname,
    "..",
    "backup",
    "gesal-cheorwon-reset",
    stamp,
  );
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "snapshot.json");
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return { dir, file };
}

async function main() {
  const db = initDb();
  const mode = dryRun ? "DRY RUN" : "실행";
  console.log(`\n[${mode}] 게살볶음밥 철원 테스트 데이터 초기화`);
  console.log(`  memberId: ${MEMBER_ID}`);
  console.log(`  eventId:  ${EVENT_ID}`);
  console.log(`  result:   race_results/${RESULT_DOC_ID}\n`);

  // --- verify member ---
  const memberDoc = await db.collection("members").doc(MEMBER_ID).get();
  if (!memberDoc.exists) {
    throw new Error(`members/${MEMBER_ID} 없음`);
  }
  const member = memberDoc.data();
  if (member.nickname !== NICKNAME) {
    throw new Error(
      `닉네임 불일치: expected ${NICKNAME}, got ${member.nickname}`,
    );
  }
  console.log(`✓ members/${MEMBER_ID} 확인 (유지): ${member.nickname} / ${member.realName}`);

  // --- load event ---
  const eventRef = db.collection("race_events").doc(EVENT_ID);
  const eventDoc = await eventRef.get();
  if (!eventDoc.exists) {
    throw new Error(`race_events/${EVENT_ID} 없음`);
  }
  const event = eventDoc.data();
  const participants = Array.isArray(event.participants)
    ? event.participants
    : [];
  const busBoarding = event.busBoarding || null;
  const roster = busBoarding && Array.isArray(busBoarding.roster)
    ? busBoarding.roster
    : [];

  const pIdx = participants.findIndex(matchParticipant);
  const rIdx = roster.findIndex(matchParticipant);
  if (pIdx < 0) {
    throw new Error("participants[]에 게살볶음밥 없음");
  }
  if (rIdx < 0) {
    throw new Error("busBoarding.roster[]에 게살볶음밥 없음");
  }

  const beforeParticipant = { ...participants[pIdx] };
  const beforeRoster = JSON.parse(JSON.stringify(roster[rIdx]));

  const afterParticipant = {
    ...beforeParticipant,
    bib: "",
    distance: "",
  };
  const afterRoster = JSON.parse(JSON.stringify(beforeRoster));
  if (!afterRoster.legs) afterRoster.legs = {};
  for (const leg of ["outbound", "return"]) {
    if (!afterRoster.legs[leg]) {
      afterRoster.legs[leg] = {
        required: true,
        boarded: false,
        boardedAt: null,
        boardedBy: null,
      };
    } else {
      afterRoster.legs[leg] = {
        ...afterRoster.legs[leg],
        boarded: false,
        boardedAt: null,
        boardedBy: null,
      };
    }
  }

  // --- load race result ---
  const resultRef = db.collection("race_results").doc(RESULT_DOC_ID);
  const resultDoc = await resultRef.get();
  if (!resultDoc.exists) {
    throw new Error(`race_results/${RESULT_DOC_ID} 없음`);
  }
  const beforeResult = resultDoc.data();
  if (
    beforeResult.memberNickname !== NICKNAME &&
    beforeResult.memberRealName !== REAL_NAME
  ) {
    throw new Error("race_results 소유자 검증 실패 — 중단");
  }
  if (beforeResult.eventDate !== "2026-09-05") {
    throw new Error(`unexpected eventDate: ${beforeResult.eventDate}`);
  }

  const backupPayload = {
    createdAt: new Date().toISOString(),
    memberId: MEMBER_ID,
    eventId: EVENT_ID,
    resultDocId: RESULT_DOC_ID,
    member: { id: MEMBER_ID, ...member },
    race_result: { id: RESULT_DOC_ID, ...beforeResult },
    participant_before: beforeParticipant,
    participant_after: afterParticipant,
    roster_before: beforeRoster,
    roster_after: afterRoster,
  };

  const { dir: backupDir, file: backupFile } = await writeBackup(backupPayload);
  console.log(`✓ 백업 저장: ${backupFile}\n`);

  console.log("── 영향 범위 ──");
  console.log("1) race_results 문서 1건 삭제");
  console.log(`   id: ${RESULT_DOC_ID}`);
  console.log(`   현재: status=${beforeResult.status}, bib=${beforeResult.bib}, netTime=${beforeResult.netTime}, confirmSource=${beforeResult.confirmSource}`);
  console.log("   변경 후: (문서 삭제)");
  console.log("");
  console.log("2) race_events participants[] 1행 필드 클리어 (행 유지)");
  console.log(`   event: ${EVENT_ID}`);
  console.log(`   현재: bib=${JSON.stringify(beforeParticipant.bib)}, distance=${JSON.stringify(beforeParticipant.distance)}`);
  console.log(`   변경 후: bib="", distance=""`);
  console.log("");
  console.log("3) race_events busBoarding.roster[] 1행 탑승 리셋 (행 유지)");
  console.log(`   rosterId: ${beforeRoster.rosterId}`);
  console.log(
    `   현재 return: boarded=${beforeRoster.legs?.return?.boarded}, boardedAt=${beforeRoster.legs?.return?.boardedAt}, boardedBy=${beforeRoster.legs?.return?.boardedBy}`,
  );
  console.log("   변경 후 return/outbound: boarded=false, boardedAt=null, boardedBy=null");
  console.log("");
  console.log("유지: members 문서, 명단 소속, 경기마라톤 기록, attendance, 타 회원");
  console.log("");

  if (dryRun) {
    console.log(`[DRY RUN] 실제 수정 없음. 백업만 기록됨: ${backupDir}`);
    console.log("실행하려면: node scripts/reset-gesal-cheorwon-test-data.js");
    process.exit(0);
  }

  // --- apply ---
  const newParticipants = participants.map((p, i) =>
    i === pIdx ? afterParticipant : p,
  );
  const newRoster = roster.map((r, i) => (i === rIdx ? afterRoster : r));

  await resultRef.delete();
  console.log(`✓ 삭제: race_results/${RESULT_DOC_ID}`);

  await eventRef.update({
    participants: newParticipants,
    "busBoarding.roster": newRoster,
  });
  console.log(`✓ 업데이트: race_events/${EVENT_ID} (participants + busBoarding.roster)`);

  // --- verify ---
  const vResult = await resultRef.get();
  const vEvent = await eventRef.get();
  const vParts = vEvent.data().participants || [];
  const vRoster = (vEvent.data().busBoarding || {}).roster || [];
  const vp = vParts.find(matchParticipant);
  const vr = vRoster.find(matchParticipant);

  console.log("\n── 검증 ──");
  console.log(`race_results 존재: ${vResult.exists} (기대 false)`);
  console.log(`participant bib/distance: ${JSON.stringify(vp?.bib)} / ${JSON.stringify(vp?.distance)}`);
  console.log(
    `roster return boarded: ${vr?.legs?.return?.boarded}, boardedBy: ${vr?.legs?.return?.boardedBy}`,
  );
  console.log(`members 유지: ${(await db.collection("members").doc(MEMBER_ID).get()).exists}`);
  console.log(`participants 총원: ${vParts.length} (기대 변경 없음)`);
  console.log(`roster 총원: ${vRoster.length} (기대 변경 없음)`);
  console.log(`\n✅ 완료. 백업: ${backupDir}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("오류:", err);
  process.exit(1);
});
