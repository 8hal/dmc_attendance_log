// 테스트 데이터 설정 스크립트
const admin = require('./functions/node_modules/firebase-admin');

// 에뮬레이터 설정
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

admin.initializeApp({
  projectId: 'dmc-attendance'
});

const db = admin.firestore();

async function setupTestData() {
  console.log('테스트 데이터 생성 중...');
  
  const testEvent = {
    eventName: '2026 춘천마라톤',
    eventDate: '2026-04-25',
    eventType: 'marathon',
    status: 'upcoming',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    participants: [
      {
        nickname: '디모',
        distance: 'full',
        bib: null
      },
      {
        nickname: '라우펜더만',
        distance: 'half',
        bib: '12345'
      },
      {
        nickname: '쏘니',
        distance: '10K',
        bib: null
      }
    ]
  };
  
  const docRef = await db.collection('race_events').add(testEvent);
  console.log('✅ 테스트 이벤트 생성 완료!');
  console.log(`   Event ID: ${docRef.id}`);
  console.log(`   URL: http://localhost:5000/my-bib.html?eventId=${docRef.id}`);
  console.log('');
  console.log('테스트 시나리오:');
  console.log('1. 닉네임 "디모" 입력 → 배번 "99999" 저장');
  console.log('2. 닉네임 "라우펜더만" 입력 → 기존 배번 "12345" 확인 후 변경');
  console.log('3. 닉네임 "외부인" 입력 → "해당 대회에 참가하지 않는 회원입니다" 오류');
  
  process.exit(0);
}

setupTestData().catch(err => {
  console.error('오류:', err);
  process.exit(1);
});
