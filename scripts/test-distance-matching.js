/**
 * Distance 매칭 필터링 단위 테스트
 * 가상의 데이터로 scraper.js의 distance 매칭 로직을 검증
 */

const { normalizeRaceDistance } = require("../functions/lib/raceDistance");

// ─────────────────────────────────────────────────────────────
// 테스트 헬퍼: scraper.js의 필터링 로직 시뮬레이션
// ─────────────────────────────────────────────────────────────

function simulateDistanceFiltering(participant, searchResults) {
  const participantDistance = normalizeRaceDistance(participant.distance);
  let filteredResults = searchResults;
  
  if (participantDistance && participantDistance !== 'unknown') {
    const matched = searchResults.filter(r => {
      const resultDistance = normalizeRaceDistance(r.distance);
      return resultDistance === participantDistance;
    });
    
    // Fallback: 매칭 실패 시 원본 유지
    if (matched.length > 0) {
      filteredResults = matched;
    } else {
      console.warn(
        `  ⚠️  distance 매칭 실패, 원본 유지: ${participant.realName} ` +
        `(참가자: ${participant.distance}, 검색: ${searchResults.map(r => r.distance).join(', ')})`
      );
    }
  }
  
  const isAmbiguous = filteredResults.length > 1;
  
  return {
    filteredResults,
    isAmbiguous,
    originalCount: searchResults.length,
    filteredCount: filteredResults.length
  };
}

// ─────────────────────────────────────────────────────────────
// 테스트 케이스
// ─────────────────────────────────────────────────────────────

const testCases = [
  {
    name: "케이스 1: 동명이인 + 다른 종목 → 필터링으로 1개 선택",
    participant: { realName: "김철수", nickname: "철수", distance: "HALF" },
    searchResults: [
      { name: "김철수", bib: "1001", distance: "하프 마라톤", netTime: "01:45:00" },
      { name: "김철수", bib: "2001", distance: "풀 마라톤", netTime: "03:30:00" }
    ],
    expected: {
      filteredCount: 1,
      isAmbiguous: false,
      selectedBib: "1001"
    }
  },
  {
    name: "케이스 2: 동명이인 + 같은 종목 → ambiguous 유지",
    participant: { realName: "이영희", nickname: "영희", distance: "10K" },
    searchResults: [
      { name: "이영희", bib: "3001", distance: "10K", netTime: "00:50:00" },
      { name: "이영희", bib: "3002", distance: "10km", netTime: "00:52:00" }
    ],
    expected: {
      filteredCount: 2,
      isAmbiguous: true
    }
  },
  {
    name: "케이스 3: distance 정보 없음 → 원본 유지 (fallback)",
    participant: { realName: "박민수", nickname: "민수", distance: null },
    searchResults: [
      { name: "박민수", bib: "4001", distance: "하프 마라톤", netTime: "01:50:00" },
      { name: "박민수", bib: "4002", distance: "풀 마라톤", netTime: "03:40:00" }
    ],
    expected: {
      filteredCount: 2,
      isAmbiguous: true
    }
  },
  {
    name: "케이스 4: 정규화 테스트 (HALF/half/하프 → half)",
    participant: { realName: "최지훈", nickname: "지훈", distance: "half" },
    searchResults: [
      { name: "최지훈", bib: "5001", distance: "HALF", netTime: "01:40:00" },
      { name: "최지훈", bib: "5002", distance: "10K", netTime: "00:45:00" }
    ],
    expected: {
      filteredCount: 1,
      isAmbiguous: false,
      selectedBib: "5001"
    }
  },
  {
    name: "케이스 5: 참가자 종목과 검색 결과 종목 불일치 → 원본 유지",
    participant: { realName: "정수진", nickname: "수진", distance: "5K" },
    searchResults: [
      { name: "정수진", bib: "6001", distance: "10K", netTime: "00:48:00" },
      { name: "정수진", bib: "6002", distance: "하프 마라톤", netTime: "01:55:00" }
    ],
    expected: {
      filteredCount: 2,
      isAmbiguous: true
    }
  },
  {
    name: "케이스 6: 단일 결과 + 종목 일치 → 필터링 후에도 단일",
    participant: { realName: "강동원", nickname: "동원", distance: "FULL" },
    searchResults: [
      { name: "강동원", bib: "7001", distance: "풀 마라톤", netTime: "03:15:00" }
    ],
    expected: {
      filteredCount: 1,
      isAmbiguous: false,
      selectedBib: "7001"
    }
  },
  {
    name: "케이스 7: 3명 동명이인 + 2명 같은 종목 → 2명으로 필터링",
    participant: { realName: "김미나", nickname: "미나", distance: "10K" },
    searchResults: [
      { name: "김미나", bib: "8001", distance: "10K", netTime: "00:50:00" },
      { name: "김미나", bib: "8002", distance: "10km", netTime: "00:52:00" },
      { name: "김미나", bib: "8003", distance: "하프 마라톤", netTime: "01:45:00" }
    ],
    expected: {
      filteredCount: 2,
      isAmbiguous: true
    }
  },
  {
    name: "케이스 8: unknown distance → 원본 유지",
    participant: { realName: "홍길동", nickname: "길동", distance: "알 수 없음" },
    searchResults: [
      { name: "홍길동", bib: "9001", distance: "10K", netTime: "00:48:00" }
    ],
    expected: {
      filteredCount: 1,
      isAmbiguous: false,
      selectedBib: "9001"
    }
  }
];

// ─────────────────────────────────────────────────────────────
// 테스트 실행
// ─────────────────────────────────────────────────────────────

function runTests() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Distance 매칭 필터링 단위 테스트");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  let passed = 0;
  let failed = 0;

  testCases.forEach((tc, idx) => {
    console.log(`\n[테스트 ${idx + 1}/${testCases.length}] ${tc.name}`);
    console.log(`  참가자: ${tc.participant.realName} (${tc.participant.distance || 'null'})`);
    console.log(`  검색 결과: ${tc.searchResults.length}개`);
    tc.searchResults.forEach(r => {
      console.log(`    - ${r.name} / ${r.bib} / ${r.distance} / ${r.netTime}`);
    });

    const result = simulateDistanceFiltering(tc.participant, tc.searchResults);
    
    console.log(`\n  필터링 결과:`);
    console.log(`    원본: ${result.originalCount}개 → 필터링 후: ${result.filteredCount}개`);
    console.log(`    ambiguous: ${result.isAmbiguous}`);
    
    if (result.filteredResults.length > 0) {
      console.log(`    선택된 기록:`);
      result.filteredResults.forEach(r => {
        console.log(`      - ${r.name} / ${r.bib} / ${r.distance} / ${r.netTime}`);
      });
    }

    // Assertion
    let testPassed = true;
    const errors = [];

    if (result.filteredCount !== tc.expected.filteredCount) {
      testPassed = false;
      errors.push(`filteredCount 불일치: expected ${tc.expected.filteredCount}, got ${result.filteredCount}`);
    }

    if (result.isAmbiguous !== tc.expected.isAmbiguous) {
      testPassed = false;
      errors.push(`isAmbiguous 불일치: expected ${tc.expected.isAmbiguous}, got ${result.isAmbiguous}`);
    }

    if (tc.expected.selectedBib && result.filteredResults[0]?.bib !== tc.expected.selectedBib) {
      testPassed = false;
      errors.push(`selectedBib 불일치: expected ${tc.expected.selectedBib}, got ${result.filteredResults[0]?.bib}`);
    }

    if (testPassed) {
      console.log(`\n  ✅ 통과`);
      passed++;
    } else {
      console.log(`\n  ❌ 실패`);
      errors.forEach(err => console.log(`    - ${err}`));
      failed++;
    }
  });

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  테스트 결과: ${passed}/${testCases.length} 통과`);
  if (failed > 0) {
    console.log(`  실패: ${failed}개`);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  process.exit(failed > 0 ? 1 : 0);
}

// ─────────────────────────────────────────────────────────────
// 실행
// ─────────────────────────────────────────────────────────────

runTests();
