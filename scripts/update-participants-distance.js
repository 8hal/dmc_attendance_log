/**
 * 엑셀 파일에서 distance 정보를 읽어 Firestore participants에 업데이트
 */
const admin = require('firebase-admin');
const XLSX = require('xlsx');

// Firebase Admin 초기화
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'dmc-attendance',
});

const db = admin.firestore();

async function updateParticipantsDistance() {
  const eventId = 'evt_2026-04-19_24';
  const excelPath = '/Users/taylor/Downloads/2026 경기 마라톤 참가자 명단.xlsx';
  
  // 1. 엑셀 파일 읽기
  console.log('📖 엑셀 파일 읽는 중...');
  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  
  // 2. 실명별 distance 매핑 (엑셀: 번호, 닉네임, 실명, distance)
  const distanceMap = {};
  data.forEach(row => { // 첫 줄부터 전부 데이터
    const realName = row[2]; // 세 번째 컬럼: 실명
    const distance = row[3]; // 네 번째 컬럼: distance
    
    if (realName && distance) {
      // HALF, FULL, 10K → half, full, 10K
      const normalized = distance.toLowerCase();
      distanceMap[realName] = normalized;
    }
  });
  
  console.log(`✅ ${Object.keys(distanceMap).length}명의 distance 정보 추출`);
  
  // 3. Firestore에서 이벤트 조회
  console.log(`\n📦 Firestore 이벤트 조회: ${eventId}`);
  const eventDoc = await db.collection('race_events').doc(eventId).get();
  
  if (!eventDoc.exists) {
    console.error('❌ 이벤트를 찾을 수 없습니다');
    process.exit(1);
  }
  
  const event = eventDoc.data();
  const participants = event.participants || [];
  
  console.log(`📋 기존 참가자: ${participants.length}명`);
  
  // 4. participants에 distance 추가 (실명 기준 매칭)
  let updated = 0;
  let notFound = 0;
  
  const updatedParticipants = participants.map(p => {
    const distance = distanceMap[p.realName];
    
    if (distance) {
      updated++;
      return { ...p, distance };
    } else {
      notFound++;
      console.log(`⚠️  distance 없음: ${p.nickname} (${p.realName})`);
      return p;
    }
  });
  
  // 5. Firestore 업데이트
  console.log(`\n💾 Firestore 업데이트 중...`);
  await db.collection('race_events').doc(eventId).update({
    participants: updatedParticipants
  });
  
  console.log('\n✅ 완료!');
  console.log(`   - 업데이트: ${updated}명`);
  console.log(`   - 매칭 안됨: ${notFound}명`);
  
  process.exit(0);
}

updateParticipantsDistance().catch(err => {
  console.error('❌ 에러:', err);
  process.exit(1);
});
