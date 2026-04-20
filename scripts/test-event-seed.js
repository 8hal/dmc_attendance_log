/**
 * 에뮬레이터용 테스트 이벤트 생성
 */
const admin = require('firebase-admin');

// 에뮬레이터 연결
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

admin.initializeApp({
  projectId: 'dmc-attendance',
});

const db = admin.firestore();

async function seed() {
  const eventId = 'evt_2026-04-19_24';
  
  const testEvent = {
    eventName: '제24회 경기마라톤대회',
    eventDate: '2026-04-19',
    isGroupEvent: true,
    participants: [
      {
        memberId: 'test-member-1',
        nickname: '라우펜더만',
        realName: '김동탄',
        distance: 'half',
        bib: ''
      },
      {
        memberId: 'test-member-2',
        nickname: '테스트러너',
        realName: '이동탄',
        distance: '10K',
        bib: '12345'
      },
      {
        memberId: 'test-member-3',
        nickname: '동마클',
        realName: '박동탄',
        distance: 'half',
        bib: ''
      }
    ],
    groupSource: null,
    groupScrapeStatus: 'pending',
    groupScrapeJobId: null,
    groupScrapeTriggeredAt: null
  };
  
  await db.collection('race_events').doc(eventId).set(testEvent);
  
  console.log('✅ 테스트 이벤트 생성 완료:', eventId);
  console.log('📋 참가자:', testEvent.participants.length, '명');
  console.log('');
  console.log('🌐 테스트 URL:');
  console.log(`http://localhost:5000/my-bib.html?eventId=${eventId}`);
  
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ 에러:', err);
  process.exit(1);
});
