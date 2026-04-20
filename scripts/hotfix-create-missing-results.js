/**
 * Hotfix: 서윤석, 조상현 race_results 생성
 * 
 * 문제: participants에만 존재, race_results에 레코드 없음
 * 해결: PDF 정보 기반으로 race_results 생성
 */

const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function createMissingRaceResults() {
  const eventDate = '2026-04-19';
  const eventId = 'evt_2026-04-19_24';
  const jobId = '20260419006';
  
  // PDF에서 확인된 정보
  const missingRecords = [
    {
      memberRealName: '서윤석',
      nickname: '쌩메',
      distance: 'half',
      finishTime: '00:53:24',
      overallRank: 592,
      bibNumber: '11870',
      memberId: 'ZWfYMQGWFPlZa7CTnPBG'
    },
    {
      memberRealName: '조상현',
      nickname: 'Josh',
      distance: 'half',
      finishTime: '04:10:26',
      overallRank: 474,
      bibNumber: '40911',
      memberId: '1W9DlQzKvXr0jTrsMhdL'
    }
  ];
  
  console.log(`[1/3] race_results 생성 시작 (${missingRecords.length}건)...\n`);
  
  for (const record of missingRecords) {
    const docId = `${record.memberRealName}_${record.distance}_${eventDate}`;
    const docRef = db.collection('race_results').doc(docId);
    
    // 이미 존재하는지 확인
    const existing = await docRef.get();
    if (existing.exists) {
      console.log(`⚠️  이미 존재: ${docId}`);
      continue;
    }
    
    const raceResult = {
      memberRealName: record.memberRealName,
      memberId: record.memberId,
      canonicalEventId: eventId,
      eventDate: eventDate,
      eventName: '제24회 경기마라톤대회',
      distance: record.distance,
      finishTime: record.finishTime,
      overallRank: record.overallRank,
      bibNumber: record.bibNumber,
      status: 'finished',
      
      // 확정 정보
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      confirmedBy: 'operator',
      
      // 메타데이터
      jobId: jobId,
      source: 'spct',
      sourceId: jobId,
      
      // 기타
      pbConfirmed: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await docRef.set(raceResult);
    console.log(`✓ 생성: ${docId}`);
    console.log(`  - ${record.nickname} ${record.memberRealName}`);
    console.log(`  - ${record.finishTime} (${record.overallRank}위) ${record.distance}`);
  }
  
  console.log(`\n[2/3] 완료: ${missingRecords.length}건 생성`);
  console.log(`\n[3/3] 다음 단계:`);
  console.log(`1. 페이지 새로고침`);
  console.log(`2. "쌩메 서윤석", "Josh 조상현" 정상 표시 확인`);
}

createMissingRaceResults()
  .then(() => {
    console.log('\n스크립트 완료');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ 에러:', err);
    process.exit(1);
  });
