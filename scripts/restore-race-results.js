/**
 * 서윤석, 조상현 race_results 복원
 * 
 * 문제: 완주 기록을 DNS/DNF로 잘못 이해하고 삭제함
 * 해결: PDF 기록 기반으로 race_results 재생성
 */

const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function restoreRaceResults() {
  const eventDate = '2026-04-19';
  const eventId = 'evt_2026-04-19_24';
  const jobId = '20260419006';
  
  // PDF에서 확인된 완주 기록
  const records = [
    {
      memberRealName: '서윤석',
      nickname: '쌩메',
      memberId: 'ZWfYMQGWFPlZa7CTnPBG',
      distance: 'half',
      finishTime: '00:53:24',
      overallRank: 592,
      bibNumber: '11870',
      status: 'finished'
    },
    {
      memberRealName: '조상현',
      nickname: 'Josh',
      memberId: '1W9DlQzKvXr0jTrsMhdL',
      distance: 'half',
      finishTime: '04:10:26',
      overallRank: 474,
      bibNumber: '40911',
      status: 'finished'
    }
  ];
  
  console.log('[1/2] race_results 복원 시작...\n');
  
  for (const record of records) {
    const docId = `${record.memberRealName}_${record.distance}_${eventDate}`;
    const docRef = db.collection('race_results').doc(docId);
    
    // 기존 문서 확인
    const existing = await docRef.get();
    if (existing.exists) {
      console.log(`⚠️  이미 존재: ${docId}`);
      console.log(`   현재: ${existing.data().finishTime} (${existing.data().overallRank}위)`);
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
      status: record.status,
      
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      confirmedBy: 'operator',
      
      jobId: jobId,
      source: 'spct',
      sourceId: jobId,
      
      pbConfirmed: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      
      restoredFrom: 'pdf',
      restorationNote: 'DNS/DNF로 잘못 삭제됨, PDF 기반 복원 (2026-04-20)'
    };
    
    await docRef.set(raceResult);
    
    console.log(`✅ 복원: ${docId}`);
    console.log(`   ${record.nickname} ${record.memberRealName}`);
    console.log(`   ${record.finishTime} (${record.overallRank}위) ${record.distance}`);
    console.log();
  }
  
  console.log('[2/2] 완료\n');
  console.log('📌 참고:');
  console.log('- 두 사람 모두 완주 기록');
  console.log('- 페이지 새로고침 시 정상 표시됨');
}

restoreRaceResults()
  .then(() => {
    console.log('\n스크립트 완료');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ 에러:', err);
    process.exit(1);
  });
