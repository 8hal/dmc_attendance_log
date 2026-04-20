#!/usr/bin/env node
/**
 * confirmSource 필드 마이그레이션
 * 
 * 목적: 2026-04-20 이전 확정된 기록에 confirmSource: "operator" 추가
 * 실행: node scripts/migrate-confirm-source.js
 * 
 * 배경:
 * - 2026-04-20 이전: confirmSource 필드 없음
 * - 2026-04-20 이후: 재확정 시 confirmSource 필터 사용
 * - 필드 없으면 쿼리 매칭 안 되어 중복 기록 발생 가능
 */

const admin = require('firebase-admin');

// Firebase Admin 초기화
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function migrate() {
  console.log('=== confirmSource 마이그레이션 시작 ===\n');
  
  try {
    // 1. confirmSource 없는 문서 조회
    console.log('1. confirmSource 필드 없는 문서 조회 중...');
    const snap = await db.collection('race_results')
      .where('status', '==', 'confirmed')
      .get();
    
    console.log(`   총 ${snap.size}건 확정 기록 발견\n`);
    
    // 2. confirmSource 없는 문서 필터링
    const docsToMigrate = [];
    snap.forEach(doc => {
      const data = doc.data();
      if (!data.confirmSource) {
        docsToMigrate.push({
          id: doc.id,
          data: data
        });
      }
    });
    
    console.log(`2. 마이그레이션 필요: ${docsToMigrate.length}건`);
    
    if (docsToMigrate.length === 0) {
      console.log('   ✅ 마이그레이션 불필요 (모든 기록에 confirmSource 존재)\n');
      return;
    }
    
    // 3. 샘플 출력
    console.log('\n   샘플 (처음 5건):');
    docsToMigrate.slice(0, 5).forEach((doc, idx) => {
      console.log(`   ${idx + 1}. ${doc.id}`);
      console.log(`      realName: ${doc.data.memberRealName}`);
      console.log(`      eventName: ${doc.data.eventName}`);
      console.log(`      eventDate: ${doc.data.eventDate}`);
      console.log(`      confirmedAt: ${doc.data.confirmedAt || 'N/A'}`);
    });
    
    // 4. 사용자 확인
    console.log(`\n⚠️  ${docsToMigrate.length}건의 기록에 confirmSource: "operator"를 추가합니다.`);
    console.log('   계속하려면 아래 명령어를 실행하세요:\n');
    console.log('   DRY_RUN=false node scripts/migrate-confirm-source.js\n');
    
    if (process.env.DRY_RUN !== 'false') {
      console.log('   (DRY_RUN 모드: 실제 변경 안 함)\n');
      return;
    }
    
    // 5. 배치 업데이트
    console.log('3. 마이그레이션 실행 중...\n');
    const BATCH_SIZE = 500;
    let updated = 0;
    
    for (let i = 0; i < docsToMigrate.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = docsToMigrate.slice(i, i + BATCH_SIZE);
      
      chunk.forEach(doc => {
        const ref = db.collection('race_results').doc(doc.id);
        batch.update(ref, { confirmSource: 'operator' });
      });
      
      await batch.commit();
      updated += chunk.length;
      console.log(`   진행: ${updated}/${docsToMigrate.length}건`);
    }
    
    console.log(`\n✅ 마이그레이션 완료: ${updated}건\n`);
    
    // 6. 검증
    console.log('4. 검증 중...');
    const verifySnap = await db.collection('race_results')
      .where('status', '==', 'confirmed')
      .get();
    
    let withoutSource = 0;
    verifySnap.forEach(doc => {
      if (!doc.data().confirmSource) {
        withoutSource++;
      }
    });
    
    if (withoutSource === 0) {
      console.log('   ✅ 검증 성공: 모든 기록에 confirmSource 존재\n');
    } else {
      console.log(`   ⚠️  검증 실패: ${withoutSource}건에 confirmSource 없음\n`);
    }
    
  } catch (error) {
    console.error('\n❌ 마이그레이션 실패:', error);
    process.exit(1);
  }
}

// 실행
migrate().then(() => {
  console.log('=== 완료 ===\n');
  process.exit(0);
}).catch(err => {
  console.error('예상치 못한 에러:', err);
  process.exit(1);
});
