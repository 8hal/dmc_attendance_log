/**
 * Hotfix: 김형진 participants distance 수정 (10k → full)
 * 
 * 문제: race_results는 full, participants는 10k로 불일치하여 매칭 실패
 * 해결: participants.distance를 full로 수정
 */

const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function hotfixParticipantsDistance() {
  const eventId = 'evt_2026-04-19_24';
  const eventRef = db.collection('race_events').doc(eventId);
  
  console.log(`[1/3] race_events/${eventId} 읽기...`);
  const doc = await eventRef.get();
  
  if (!doc.exists) {
    console.error(`❌ 이벤트 ${eventId} 없음`);
    process.exit(1);
  }
  
  const data = doc.data();
  const participants = data.participants || [];
  
  console.log(`[2/3] 김형진 찾기... (총 ${participants.length}명)`);
  
  let updated = false;
  const updatedParticipants = participants.map(p => {
    if (p.realName === '김형진' && p.nickname === '우상향' && p.distance === '10k') {
      console.log(`✓ 김형진 (우상향) 발견: distance=${p.distance} → full`);
      updated = true;
      return { ...p, distance: 'full' };
    }
    return p;
  });
  
  if (!updated) {
    console.log(`⚠️  김형진 (distance=10k) 못 찾음. 이미 수정되었을 수 있습니다.`);
    
    // 디버깅: 김형진 모든 레코드 출력
    const kimRecords = participants.filter(p => p.realName === '김형진');
    console.log(`\n김형진 레코드 ${kimRecords.length}건:`);
    kimRecords.forEach((p, i) => {
      console.log(`  ${i+1}. ${p.nickname} - distance: ${p.distance}`);
    });
    
    process.exit(0);
  }
  
  console.log(`[3/3] Firestore 업데이트...`);
  await eventRef.update({
    participants: updatedParticipants
  });
  
  console.log(`✅ 완료: 김형진 distance 10k → full`);
  console.log(`\n다음 단계:`);
  console.log(`1. 페이지 새로고침`);
  console.log(`2. "우상향 김형진" 동명이인 해소 확인`);
}

hotfixParticipantsDistance()
  .then(() => {
    console.log('\n스크립트 완료');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ 에러:', err);
    process.exit(1);
  });
