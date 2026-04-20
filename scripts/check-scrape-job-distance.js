/**
 * scrape_jobs 컬렉션에서 특정 job의 participants distance 정보 확인
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

async function checkScrapeJobDistance() {
  const eventId = "evt_2026-04-19_24";
  
  console.log(`\n━━━ Race Event + Scrape Job Distance 체크 ━━━\n`);
  
  try {
    // 1. race_events에서 groupScrapeJobId 가져오기
    const eventDoc = await db.collection("race_events").doc(eventId).get();
    
    if (!eventDoc.exists) {
      console.log("❌ Event를 찾을 수 없습니다.");
      return;
    }
    
    const eventData = eventDoc.data();
    const jobId = eventData.groupScrapeJobId;
    
    console.log(`대회명: ${eventData.eventName || '—'}`);
    console.log(`날짜: ${eventData.eventDate || '—'}`);
    console.log(`groupScrapeJobId: ${jobId || '없음'}`);
    
    if (!jobId) {
      console.log("\n❌ groupScrapeJobId가 없습니다. 스크래핑이 실행되지 않았습니다.");
      return;
    }
    
    // 2. scrape_jobs에서 results 가져오기
    const jobDoc = await db.collection("scrape_jobs").doc(jobId).get();
    
    if (!jobDoc.exists) {
      console.log(`\n❌ Scrape Job ${jobId}를 찾을 수 없습니다.`);
      return;
    }
    
    const jobData = jobDoc.data();
    const results = jobData.results || [];
    
    console.log(`\n━━━ Scrape Job 정보 ━━━`);
    console.log(`Status: ${jobData.status}`);
    console.log(`Results: ${results.length}개`);
    console.log(`\n━━━ Results 샘플 (처음 10개) ━━━\n`);
    
    if (results.length === 0) {
      console.log("⚠️  results 배열이 비어있습니다.");
      return;
    }
    
    const participants = eventData.participants || [];
    console.log(`총 참가자 수: ${participants.length}명\n`);
    
    // 처음 10개 results 샘플
    const sample = results.slice(0, 10);
    
    sample.forEach((r, idx) => {
      console.log(`[${idx + 1}] ${r.memberNickname || '—'} (${r.memberRealName || '—'})`);
      console.log(`    참가자 distance: ${r.memberDistance || 'null'}`);
      console.log(`    검색 결과 distance: ${r.distance || 'null'}`);
      console.log(`    status: ${r.status}`);
      console.log(`    candidateCount: ${r.candidateCount || 0}`);
      console.log(`    filteredCount: ${r.filteredCount || '—'}`);
      console.log(`    netTime: ${r.netTime || '—'}`);
      console.log(`    bib: ${r.bib || '—'}`);
      console.log('');
    });
    
    // Status 통계
    console.log('\n━━━ Status 통계 ━━━\n');
    
    const statusCounts = {};
    results.forEach(r => {
      const status = r.status || 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}개`);
    });
    
    // Ambiguous 케이스 분석
    console.log('\n━━━ Ambiguous 케이스 분석 ━━━\n');
    
    const ambiguousCases = results.filter(r => r.status === 'ambiguous');
    console.log(`총 ambiguous: ${ambiguousCases.length}개\n`);
    
    if (ambiguousCases.length > 0) {
      // 처음 5개만 상세 출력
      ambiguousCases.slice(0, 5).forEach(r => {
        console.log(`${r.memberNickname} (참가 종목: ${r.memberDistance || 'null'})`);
        console.log(`  candidateCount: ${r.candidateCount}`);
        console.log(`  filteredCount: ${r.filteredCount || '필터링 전'}`);
        console.log(`  검색 결과: distance=${r.distance}, bib=${r.bib}, time=${r.netTime}`);
        console.log('');
      });
    }
    
    // FilteredCount 통계
    console.log('\n━━━ FilteredCount 통계 (distance 매칭 효과) ━━━\n');
    
    const filtered = results.filter(r => r.filteredCount !== undefined);
    console.log(`filteredCount 필드 있는 results: ${filtered.length}개`);
    
    if (filtered.length === 0) {
      console.log("⚠️  filteredCount 필드가 없습니다. 배포 전 스크래핑 데이터입니다.");
    } else {
      const reduced = filtered.filter(r => r.filteredCount < r.candidateCount);
      console.log(`필터링으로 감소한 케이스: ${reduced.length}개`);
      
      if (reduced.length > 0) {
        console.log('\n샘플:');
        reduced.slice(0, 3).forEach(r => {
          console.log(`  ${r.memberNickname}: ${r.candidateCount}개 → ${r.filteredCount}개`);
        });
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkScrapeJobDistance();
