/**
 * 기존 그룹 대회에 primaryName 필드 추가
 * 
 * race_events 컬렉션의 isGroupEvent === true 문서들 중
 * primaryName이 없는 문서에 eventName을 primaryName으로 복사
 */

const admin = require('firebase-admin');

admin.initializeApp({ projectId: 'dmc-attendance' });
const db = admin.firestore();

async function fixGroupEventPrimaryNames() {
  console.log('그룹 대회 primaryName 수정 시작...\n');
  
  const snapshot = await db.collection('race_events')
    .where('isGroupEvent', '==', true)
    .get();
  
  console.log(`총 ${snapshot.size}개의 그룹 대회 발견\n`);
  
  let fixed = 0;
  let alreadyOk = 0;
  
  const batch = db.batch();
  
  snapshot.forEach(doc => {
    const data = doc.data();
    const eventName = data.eventName || '';
    const primaryName = data.primaryName || '';
    
    if (!primaryName && eventName) {
      console.log(`수정: ${doc.id}`);
      console.log(`  eventName: ${eventName}`);
      console.log(`  primaryName 추가\n`);
      
      batch.update(doc.ref, { primaryName: eventName });
      fixed++;
    } else if (primaryName) {
      console.log(`이미 OK: ${doc.id}`);
      console.log(`  primaryName: ${primaryName}\n`);
      alreadyOk++;
    } else {
      console.log(`경고: ${doc.id} - eventName도 없음\n`);
    }
  });
  
  if (fixed > 0) {
    console.log(`\n${fixed}개 문서 업데이트 중...`);
    await batch.commit();
    console.log('✅ 업데이트 완료\n');
  } else {
    console.log('\n수정할 문서 없음\n');
  }
  
  console.log('=== 요약 ===');
  console.log(`수정됨: ${fixed}`);
  console.log(`이미 OK: ${alreadyOk}`);
  console.log(`전체: ${snapshot.size}`);
}

fixGroupEventPrimaryNames()
  .then(() => {
    console.log('\n완료');
    process.exit(0);
  })
  .catch(err => {
    console.error('오류:', err);
    process.exit(1);
  });
