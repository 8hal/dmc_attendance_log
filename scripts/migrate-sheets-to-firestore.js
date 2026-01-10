/**
 * Google Sheets → Firestore 마이그레이션 스크립트
 * 
 * 사용법:
 * 1. Google Sheets에서 CSV로 내보내기 (파일 > 다운로드 > CSV)
 * 2. CSV 파일을 scripts/data.csv로 저장
 * 3. 실행: node scripts/migrate-sheets-to-firestore.js
 * 
 * CSV 컬럼 (기존 Sheets 스키마):
 * A: timestamp (DateTime)
 * B: nickname (string)
 * C: teamLabel (string, 예: 1팀, S팀)
 * D: meetingTypeLabel (string, 예: 토요일, 기타)
 * E: meetingDate (Date 또는 "YYYY. M. D" 문자열)
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

// ==================== 설정 ====================

const CSV_PATH = path.join(__dirname, "data.csv");
const SERVICE_ACCOUNT_PATH = path.join(__dirname, "service-account.json");
const COLLECTION = "attendance";
const BATCH_SIZE = 500; // Firestore batch limit

// 라벨 → 코드 매핑
const TEAM_CODE = {
  "1팀": "T1",
  "2팀": "T2",
  "3팀": "T3",
  "4팀": "T4",
  "5팀": "T5",
  "S팀": "S",
};

const MEETING_TYPE_CODE = {
  "기타": "ETC",
  "화요일": "TUE",
  "목요일": "THU",
  "토요일": "SAT",
};

// ==================== 헬퍼 함수 ====================

function parseDate(dateStr) {
  if (!dateStr) return null;
  
  // "2026. 1. 3" 형식
  const dotMatch = dateStr.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (dotMatch) {
    const y = parseInt(dotMatch[1]);
    const m = parseInt(dotMatch[2]) - 1;
    const d = parseInt(dotMatch[3]);
    return new Date(y, m, d);
  }
  
  // ISO 형식 또는 다른 형식
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  return null;
}

function dateToDateKey(date) {
  if (!date || isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

function dateKeyToMonthKey(dateKey) {
  if (!dateKey) return "";
  const parts = dateKey.split("/");
  return `${parts[0]}-${parts[1]}`;
}

function parseCSV(content) {
  const lines = content.split("\n");
  const rows = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // 간단한 CSV 파싱 (쉼표로 분리, 따옴표 처리)
    const cells = [];
    let current = "";
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    
    // 첫 줄이 헤더인지 확인 (timestamp 또는 타임스탬프)
    if (i === 0) {
      const firstCell = cells[0].toLowerCase();
      if (firstCell.includes("timestamp") || firstCell.includes("타임스탬프") || firstCell.includes("시간")) {
        continue; // 헤더 스킵
      }
    }
    
    rows.push(cells);
  }
  
  return rows;
}

// ==================== 메인 ====================

async function main() {
  console.log("🚀 마이그레이션 시작...\n");
  
  // CSV 파일 확인
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ CSV 파일을 찾을 수 없습니다: ${CSV_PATH}`);
    console.log("\n📝 사용법:");
    console.log("1. Google Sheets에서 CSV로 내보내기");
    console.log("2. scripts/data.csv로 저장");
    console.log("3. 다시 실행");
    process.exit(1);
  }
  
  // Firebase 초기화 (서비스 계정 키 사용)
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(`❌ 서비스 계정 키를 찾을 수 없습니다: ${SERVICE_ACCOUNT_PATH}`);
    console.log("\n📝 서비스 계정 키 생성 방법:");
    console.log("1. Firebase Console > 프로젝트 설정 > 서비스 계정");
    console.log("2. '새 비공개 키 생성' 클릭");
    console.log("3. 다운로드된 JSON을 scripts/service-account.json으로 저장");
    process.exit(1);
  }
  
  const serviceAccount = require(SERVICE_ACCOUNT_PATH);
  initializeApp({
    credential: cert(serviceAccount),
    projectId: "dmc-attendance",
  });
  const db = getFirestore();
  
  // CSV 읽기
  const content = fs.readFileSync(CSV_PATH, "utf-8");
  const rows = parseCSV(content);
  
  console.log(`📄 ${rows.length}개 행 발견\n`);
  
  if (rows.length === 0) {
    console.log("⚠️ 마이그레이션할 데이터가 없습니다.");
    process.exit(0);
  }
  
  // 배치 처리
  let batch = db.batch();
  let batchCount = 0;
  let totalCount = 0;
  let errorCount = 0;
  
  for (const row of rows) {
    try {
      // 컬럼: timestamp, nickname, teamLabel, meetingTypeLabel, meetingDate
      const [timestampStr, nickname, teamLabel, meetingTypeLabel, meetingDateStr] = row;
      
      if (!nickname || !nickname.trim()) {
        continue; // 닉네임 없으면 스킵
      }
      
      const timestamp = parseDate(timestampStr);
      const meetingDate = parseDate(meetingDateStr) || timestamp;
      const meetingDateKey = dateToDateKey(meetingDate);
      const monthKey = dateKeyToMonthKey(meetingDateKey);
      
      if (!meetingDateKey) {
        console.warn(`⚠️ 날짜 파싱 실패: ${meetingDateStr}`);
        errorCount++;
        continue;
      }
      
      const teamCode = TEAM_CODE[teamLabel] || "";
      const meetingTypeCode = MEETING_TYPE_CODE[meetingTypeLabel] || "";
      
      const docRef = db.collection(COLLECTION).doc();
      batch.set(docRef, {
        nickname: nickname.trim(),
        nicknameKey: nickname.trim().toLowerCase(),
        team: teamCode,
        teamLabel: teamLabel || "",
        meetingType: meetingTypeCode,
        meetingTypeLabel: meetingTypeLabel || "",
        meetingDateKey,
        monthKey,
        timestamp: timestamp || null,
        ts: timestamp ? timestamp.getTime() : meetingDate.getTime(),
      });
      
      batchCount++;
      totalCount++;
      
      // 배치 커밋
      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        console.log(`✅ ${totalCount}개 처리됨...`);
        batch = db.batch();
        batchCount = 0;
      }
    } catch (err) {
      console.error(`❌ 행 처리 오류:`, row, err.message);
      errorCount++;
    }
  }
  
  // 남은 배치 커밋
  if (batchCount > 0) {
    await batch.commit();
  }
  
  console.log("\n" + "=".repeat(40));
  console.log(`✅ 마이그레이션 완료!`);
  console.log(`   - 성공: ${totalCount}개`);
  console.log(`   - 오류: ${errorCount}개`);
  console.log("=".repeat(40));
}

main().catch((err) => {
  console.error("❌ 마이그레이션 실패:", err);
  process.exit(1);
});
