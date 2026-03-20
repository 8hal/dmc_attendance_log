/**
 * members.json → Firestore 마이그레이션 스크립트
 *
 * 사용법: node scripts/migrate-members-to-firestore.js [--dry-run]
 *
 * members.json의 154명 회원 데이터를 Firestore members 컬렉션에 저장한다.
 * 중복 방지: realName 기준으로 기존 문서가 있으면 스킵한다.
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

const MEMBERS_PATH = path.join(__dirname, "..", "data", "members.json");
const SERVICE_ACCOUNT_PATH = path.join(__dirname, "service-account.json");
const COLLECTION = "members";
const BATCH_SIZE = 500;

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (dryRun) {
    console.log("[DRY RUN] Firestore에 실제로 쓰지 않습니다.\n");
  }

  if (!fs.existsSync(MEMBERS_PATH)) {
    console.error(`members.json을 찾을 수 없습니다: ${MEMBERS_PATH}`);
    process.exit(1);
  }

  const { members } = JSON.parse(fs.readFileSync(MEMBERS_PATH, "utf-8"));
  console.log(`${members.length}명 회원 데이터 로드 완료\n`);

  if (dryRun) {
    const genderStats = { M: 0, F: 0 };
    members.forEach((m) => genderStats[m.gender]++);
    console.log(`남성: ${genderStats.M}명, 여성: ${genderStats.F}명`);
    console.log(`\n처음 5명:`);
    members.slice(0, 5).forEach((m) =>
      console.log(`  ${m.nickname} (${m.realName}, ${m.gender})`)
    );
    console.log(`\n--dry-run 완료. 실제 마이그레이션은 --dry-run 없이 실행하세요.`);
    return;
  }

  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(`서비스 계정 키를 찾을 수 없습니다: ${SERVICE_ACCOUNT_PATH}`);
    console.error("Firebase Console > 프로젝트 설정 > 서비스 계정에서 키를 생성하세요.");
    process.exit(1);
  }

  const serviceAccount = require(SERVICE_ACCOUNT_PATH);
  initializeApp({
    credential: cert(serviceAccount),
    projectId: "dmc-attendance",
  });
  const db = getFirestore();

  const existing = await db.collection(COLLECTION).get();
  const existingNames = new Set();
  existing.forEach((doc) => {
    const data = doc.data();
    if (data.realName) existingNames.add(data.realName);
  });
  console.log(`기존 Firestore members: ${existingNames.size}명`);

  let batch = db.batch();
  let batchCount = 0;
  let created = 0;
  let skipped = 0;

  for (const member of members) {
    if (existingNames.has(member.realName)) {
      skipped++;
      continue;
    }

    const docRef = db.collection(COLLECTION).doc();
    batch.set(docRef, {
      realName: member.realName,
      nickname: member.nickname,
      gender: member.gender || "",
      hidden: false,
      createdAt: new Date().toISOString(),
    });

    batchCount++;
    created++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      console.log(`${created}명 처리됨...`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`\n마이그레이션 완료: 생성 ${created}명, 스킵 ${skipped}명 (이미 존재)`);
}

main().catch((err) => {
  console.error("마이그레이션 실패:", err);
  process.exit(1);
});
