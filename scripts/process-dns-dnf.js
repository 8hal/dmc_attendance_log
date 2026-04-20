/**
 * 서윤석 DNS, 조상현 DNF 처리
 * 
 * 정책: DNS/DNF는 race_results 생성하지 않음
 * 작업:
 *   1. race_results 삭제
 *   2. participants status 업데이트 (선택)
 */

const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function processDnsDnf() {
  console.log('[1/2] race_results 삭제...\n');
  
  // 서윤석 DNS 처리
  const doc1 = db.collection('race_results').doc('서윤석_half_2026-04-19');
  const snap1 = await doc1.get();
  
  if (snap1.exists) {
    console.log('✓ 서윤석 삭제 전 데이터:');
    console.log('  -', snap1.data().finishTime, snap1.data().overallRank + '위');
    await doc1.delete();
    console.log('✅ 서윤석_half_2026-04-19 삭제 완료 (DNS 처리)\n');
  } else {
    console.log('⚠️  서윤석 race_results 없음 (이미 삭제됨)\n');
  }
  
  // 조상현 DNF 처리
  const doc2 = db.collection('race_results').doc('조상현_half_2026-04-19');
  const snap2 = await doc2.get();
  
  if (snap2.exists) {
    console.log('✓ 조상현 삭제 전 데이터:');
    console.log('  -', snap2.data().finishTime, snap2.data().overallRank + '위');
    await doc2.delete();
    console.log('✅ 조상현_half_2026-04-19 삭제 완료 (DNF 처리)\n');
  } else {
    console.log('⚠️  조상현 race_results 없음 (이미 삭제됨)\n');
  }
  
  console.log('[2/2] 완료\n');
  console.log('📌 참고:');
  console.log('- race_results 삭제됨 (정책: DNS/DNF는 race_results 미생성)');
  console.log('- participants는 그대로 유지 (UI에서 미확정으로 표시됨)');
  console.log('- UI에서 케밥 메뉴 → DNS/DNF 처리로 최종 확정 가능');
}

processDnsDnf()
  .then(() => {
    console.log('\n스크립트 완료');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ 에러:', err);
    process.exit(1);
  });
