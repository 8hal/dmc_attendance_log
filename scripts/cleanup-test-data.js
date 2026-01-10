/**
 * 테스트 데이터 정리 스크립트
 * 
 * TEST_로 시작하는 닉네임의 출석 데이터를 삭제합니다.
 * - Firestore: attendance 컬렉션에서 삭제
 * - Google Sheets: 해당 행 삭제
 * 
 * 사용법:
 *   node scripts/cleanup-test-data.js
 * 
 * 옵션:
 *   --dry-run    실제 삭제 없이 삭제 대상만 출력
 *   --firestore  Firestore만 정리
 *   --sheets     Google Sheets만 정리
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

// ==================== 설정 ====================

const SERVICE_ACCOUNT_PATH = path.join(__dirname, "service-account.json");
const COLLECTION = "attendance";
const SPREADSHEET_ID = "1sn6sLKyBn5HjNIyZfn6P-foF9maoqp5vp04_j43zDYY";
const SHEET_NAME = "설문지 응답 시트2";
const TEST_PREFIX = "TEST_";
const BATCH_SIZE = 500;

// ==================== 인자 파싱 ====================

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FIRESTORE_ONLY = args.includes("--firestore");
const SHEETS_ONLY = args.includes("--sheets");

// ==================== Firestore 초기화 ====================

function initFirestore() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(`❌ 서비스 계정 키를 찾을 수 없습니다: ${SERVICE_ACCOUNT_PATH}`);
    process.exit(1);
  }
  
  const serviceAccount = require(SERVICE_ACCOUNT_PATH);
  initializeApp({
    credential: cert(serviceAccount),
    projectId: "dmc-attendance",
  });
  
  return getFirestore();
}

// ==================== Firestore 정리 ====================

async function cleanupFirestore(db) {
  console.log("\n📦 Firestore 테스트 데이터 검색 중...");
  
  const snapshot = await db
    .collection(COLLECTION)
    .where("nickname", ">=", TEST_PREFIX)
    .where("nickname", "<", TEST_PREFIX + "\uf8ff")
    .get();
  
  const docs = snapshot.docs;
  console.log(`   발견: ${docs.length}개`);
  
  if (docs.length === 0) {
    console.log("   ✅ 삭제할 테스트 데이터가 없습니다.");
    return 0;
  }
  
  // 삭제 대상 출력
  console.log("\n   삭제 대상:");
  docs.forEach((doc) => {
    const data = doc.data();
    console.log(`   - ${data.nickname} (${data.meetingDateKey})`);
  });
  
  if (DRY_RUN) {
    console.log("\n   ⏸️  --dry-run 모드: 실제 삭제하지 않음");
    return docs.length;
  }
  
  // 배치 삭제
  console.log("\n   삭제 중...");
  let deleted = 0;
  let batch = db.batch();
  let batchCount = 0;
  
  for (const doc of docs) {
    batch.delete(doc.ref);
    batchCount++;
    
    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      deleted += batchCount;
      console.log(`   ${deleted}개 삭제됨...`);
      batch = db.batch();
      batchCount = 0;
    }
  }
  
  if (batchCount > 0) {
    await batch.commit();
    deleted += batchCount;
  }
  
  console.log(`   ✅ Firestore: ${deleted}개 삭제 완료`);
  return deleted;
}

// ==================== Google Sheets 정리 ====================

async function cleanupSheets() {
  console.log("\n📊 Google Sheets 테스트 데이터 검색 중...");
  
  const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_PATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  
  const sheets = google.sheets({ version: "v4", auth });
  
  // 시트 ID 조회
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
  });
  
  const sheet = spreadsheet.data.sheets.find(
    (s) => s.properties.title === SHEET_NAME
  );
  
  if (!sheet) {
    console.log(`   ❌ 시트를 찾을 수 없습니다: ${SHEET_NAME}`);
    return 0;
  }
  
  const sheetId = sheet.properties.sheetId;
  
  // 데이터 읽기
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:E`,
  });
  
  const rows = response.data.values || [];
  console.log(`   전체 행: ${rows.length}개`);
  
  // TEST_ 행 찾기 (역순으로 삭제해야 인덱스가 안 밀림)
  const testRows = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const nickname = row[1] || ""; // B 컬럼: nickname
    if (nickname.startsWith(TEST_PREFIX)) {
      testRows.push({ index: i, nickname, date: row[4] || "" });
    }
  }
  
  console.log(`   발견: ${testRows.length}개`);
  
  if (testRows.length === 0) {
    console.log("   ✅ 삭제할 테스트 데이터가 없습니다.");
    return 0;
  }
  
  // 삭제 대상 출력
  console.log("\n   삭제 대상:");
  testRows.forEach((r) => {
    console.log(`   - 행 ${r.index + 1}: ${r.nickname} (${r.date})`);
  });
  
  if (DRY_RUN) {
    console.log("\n   ⏸️  --dry-run 모드: 실제 삭제하지 않음");
    return testRows.length;
  }
  
  // 행 삭제 요청 (역순이므로 인덱스가 안 밀림)
  console.log("\n   삭제 중...");
  const requests = testRows.map((r) => ({
    deleteDimension: {
      range: {
        sheetId: sheetId,
        dimension: "ROWS",
        startIndex: r.index,
        endIndex: r.index + 1,
      },
    },
  }));
  
  // 배치로 나눠서 실행
  for (let i = 0; i < requests.length; i += 100) {
    const batch = requests.slice(i, i + 100);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: batch },
    });
    console.log(`   ${Math.min(i + 100, requests.length)}개 삭제됨...`);
  }
  
  console.log(`   ✅ Google Sheets: ${testRows.length}개 행 삭제 완료`);
  return testRows.length;
}

// ==================== 메인 ====================

async function main() {
  console.log("🧹 테스트 데이터 정리 스크립트");
  console.log("=".repeat(40));
  
  if (DRY_RUN) {
    console.log("⚠️  DRY RUN 모드 (실제 삭제 없음)");
  }
  
  const db = initFirestore();
  
  let firestoreDeleted = 0;
  let sheetsDeleted = 0;
  
  if (!SHEETS_ONLY) {
    firestoreDeleted = await cleanupFirestore(db);
  }
  
  if (!FIRESTORE_ONLY) {
    sheetsDeleted = await cleanupSheets();
  }
  
  console.log("\n" + "=".repeat(40));
  console.log("✅ 정리 완료!");
  console.log(`   - Firestore: ${firestoreDeleted}개`);
  console.log(`   - Sheets: ${sheetsDeleted}개`);
  console.log("=".repeat(40));
}

main().catch((err) => {
  console.error("❌ 오류:", err.message || err);
  process.exit(1);
});
