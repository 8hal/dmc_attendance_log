/**
 * 경기 마라톤 참가자 명단을 race_events에 업데이트
 * 
 * 전제: scripts/data/gyeonggi-participants.json (정회원 85명)
 * 
 * 사용법:
 *   node scripts/update-gyeonggi-participants.js --dry-run
 *   node scripts/update-gyeonggi-participants.js
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

const dryRun = process.argv.includes("--dry-run");

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

const participantsPath = path.join(__dirname, "data", "gyeonggi-participants.json");
const participantsData = JSON.parse(fs.readFileSync(participantsPath, "utf8"));

const EVENT_ID = "evt_2026-04-19_24";
const EVENT_NAME = "제24회 경기마라톤대회";

console.log(`\n[${dryRun ? "DRY RUN" : "실행"}] 경기 마라톤 참가자 업데이트`);
console.log(`Event ID: ${EVENT_ID}`);
console.log(`참가자: ${participantsData.length}명\n`);

async function updateParticipants() {
  // 1. members 조회 (memberId 매핑)
  const membersSnap = await db.collection("members").get();
  const membersMap = new Map();
  membersSnap.forEach(doc => {
    const data = doc.data();
    const key = `${data.realName}|${data.nickname}`;
    membersMap.set(key, { id: doc.id, ...data });
  });

  console.log(`Firestore members: ${membersMap.size}명\n`);

  // 2. 참가자 데이터 → participants 배열 생성
  const participants = [];
  const notFound = [];

  participantsData.forEach(p => {
    const key = `${p.realName}|${p.nickname}`;
    const member = membersMap.get(key);
    
    if (member) {
      participants.push({
        memberId: member.id,
        realName: p.realName,
        nickname: p.nickname
      });
    } else {
      notFound.push(p);
    }
  });

  console.log("=== 매칭 결과 ===\n");
  console.log(`✅ 매칭 성공: ${participants.length}명`);
  console.log(`❌ 미매칭: ${notFound.length}명\n`);

  if (notFound.length > 0) {
    console.log("=== 미매칭 회원 (Firestore에 없음) ===");
    notFound.forEach((p, i) => {
      console.log(`${i+1}. ${p.nickname} (${p.realName})`);
    });
    console.log("");
  }

  // 3. 종목별 분포
  console.log("=== 종목별 참가자 ===");
  const byDist = {};
  participantsData.forEach(p => {
    byDist[p.distance] = (byDist[p.distance] || 0) + 1;
  });
  Object.entries(byDist).forEach(([d, c]) => console.log(`  ${d}: ${c}명`));
  console.log("");

  // 4. race_events 업데이트
  if (!dryRun) {
    console.log("=== 실행 ===\n");
    
    await db.collection("race_events").doc(EVENT_ID).update({
      participants,
      updatedAt: new Date().toISOString()
    });
    
    console.log(`✅ ${EVENT_ID} 업데이트 완료`);
    console.log(`   참가자: ${participants.length}명`);
  } else {
    console.log("샘플 participants[0]:");
    console.log(JSON.stringify(participants[0], null, 2));
    console.log("\n실행: node scripts/update-gyeonggi-participants.js");
  }
}

updateParticipants().catch(err => {
  console.error("❌ 오류:", err);
  process.exit(1);
});
