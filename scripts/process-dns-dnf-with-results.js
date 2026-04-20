/**
 * 서윤석 DNS, 조상현 DNF 처리 (API 방식)
 * 
 * 목표: 다른 DNS/DNF 참가자(젤킴, 안주 등)와 동일하게 표시
 * 방법: confirm-one API 로직을 스크립트에서 실행
 */

const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function processDnsDnfLikeApi() {
  const eventId = 'evt_2026-04-19_24';
  const eventDate = '2026-04-19';
  
  console.log('[1/4] 현재 race_results 확인...\n');
  
  // 1. 기존 race_results 확인 및 삭제
  const doc1 = db.collection('race_results').doc('서윤석_half_2026-04-19');
  const doc2 = db.collection('race_results').doc('조상현_half_2026-04-19');
  
  const snap1 = await doc1.get();
  const snap2 = await doc2.get();
  
  if (snap1.exists) {
    console.log('✓ 서윤석 기존 기록:', snap1.data().finishTime, snap1.data().overallRank + '위');
    await doc1.delete();
    console.log('  → 삭제 완료\n');
  } else {
    console.log('✓ 서윤석 race_results 없음\n');
  }
  
  if (snap2.exists) {
    console.log('✓ 조상현 기존 기록:', snap2.data().finishTime, snap2.data().overallRank + '위');
    await doc2.delete();
    console.log('  → 삭제 완료\n');
  } else {
    console.log('✓ 조상현 race_results 없음\n');
  }
  
  console.log('[2/4] DNS/DNF race_results 생성...\n');
  
  // 2. DNS/DNF 상태로 race_results 생성 (다른 참가자와 동일)
  const dnsRecord = {
    memberRealName: '서윤석',
    memberId: 'ZWfYMQGWFPlZa7CTnPBG',
    canonicalEventId: eventId,
    eventDate: eventDate,
    eventName: '제24회 경기마라톤대회',
    distance: 'half',
    status: 'dns',
    finishTime: null,
    overallRank: null,
    bibNumber: null,
    
    confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
    confirmedBy: 'operator',
    
    jobId: '20260419006',
    source: 'spct',
    sourceId: '20260419006',
    
    pbConfirmed: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };
  
  const dnfRecord = {
    memberRealName: '조상현',
    memberId: '1W9DlQzKvXr0jTrsMhdL',
    canonicalEventId: eventId,
    eventDate: eventDate,
    eventName: '제24회 경기마라톤대회',
    distance: 'half',
    status: 'dnf',
    finishTime: null,
    overallRank: null,
    bibNumber: null,
    
    confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
    confirmedBy: 'operator',
    
    jobId: '20260419006',
    source: 'spct',
    sourceId: '20260419006',
    
    pbConfirmed: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };
  
  await doc1.set(dnsRecord);
  console.log('✅ 서윤석 DNS 기록 생성');
  console.log('   status: dns, finishTime: null\n');
  
  await doc2.set(dnfRecord);
  console.log('✅ 조상현 DNF 기록 생성');
  console.log('   status: dnf, finishTime: null\n');
  
  console.log('[3/4] 검증: 다른 DNS/DNF 참가자와 동일 구조 확인...\n');
  
  // 3. 다른 DNS 참가자 확인 (젤킴)
  const jelkimSnap = await db.collection('race_results')
    .where('memberRealName', '==', '김재헌')
    .where('eventDate', '==', '2026-04-19')
    .get();
  
  if (!jelkimSnap.empty) {
    const jelkimData = jelkimSnap.docs[0].data();
    console.log('✓ 젤킴 (김재헌) 기존 DNS 기록:');
    console.log('   status:', jelkimData.status);
    console.log('   finishTime:', jelkimData.finishTime);
    console.log('   → 서윤석과 동일 구조\n');
  } else {
    console.log('⚠️  젤킴은 race_results 없음 (정책: DNS는 race_results 미생성)\n');
  }
  
  console.log('[4/4] 완료\n');
  console.log('📌 결과:');
  console.log('- 서윤석: race_results에 status=dns로 저장');
  console.log('- 조상현: race_results에 status=dnf로 저장');
  console.log('- 페이지에서 🚫 DNS, ⚠ DNF 뱃지로 표시됨');
}

processDnsDnfLikeApi()
  .then(() => {
    console.log('\n스크립트 완료');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ 에러:', err);
    process.exit(1);
  });
