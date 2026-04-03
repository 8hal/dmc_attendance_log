# 고러닝 매칭 개선 계획 (discovered-events.json 통합)

## 현재 문제
- 고러닝 대회 129개 모두 "수동 검색 필요"
- 근본 원인: 대회 전이라 scrape_jobs 없음
- 대회 후에만 매칭 가능

## 목표
**대회 전에도 "발견 가능" 표시**
- `discover-events.js`로 발견된 대회와 매칭
- `data/discovered-events-2026.json` 활용

## 설계

### 현재 로직 (functions/index.js:2243-2327)
```javascript
// 1. 고러닝 크롤링
const gorunningEvents = await scraper.crawlGorunningEvents();

// 2. 최근 3개월 scrape_jobs 조회
const scrapeJobs = await db.collection("scrape_jobs")
  .where("createdAt", ">=", threeMonthsAgo)
  .get();

// 3. 매칭
const enrichedEvents = gorunningEvents.map(e => {
  const match = scraper.matchGorunningToJob(e, scrapeJobs);
  return { ...e, matchStatus: match ? "matched" : "not_matched" };
});
```

### 개선 로직 (Phase 1: discovered-events 추가)
```javascript
// 1. 고러닝 크롤링 (동일)
const gorunningEvents = await scraper.crawlGorunningEvents();

// 2a. 최근 3개월 scrape_jobs (기존)
const scrapeJobs = [...]; // 기존 로직

// 2b. discovered-events.json 로드 (신규)
const discoveredEvents = JSON.parse(
  fs.readFileSync("./data/discovered-events-2026.json", "utf8")
);

// 3. 매칭 (2단계)
const enrichedEvents = gorunningEvents.map(e => {
  // Step 1: scrape_jobs 매칭 (대회 후)
  const jobMatch = scraper.matchGorunningToJob(e, scrapeJobs);
  if (jobMatch) {
    return {
      ...e,
      matchStatus: "scraped", // 이미 스크랩됨
      matchedJob: jobMatch,
    };
  }

  // Step 2: discovered-events 매칭 (대회 전)
  const discoveredMatch = scraper.matchGorunningToDiscovered(e, discoveredEvents);
  if (discoveredMatch) {
    return {
      ...e,
      matchStatus: "discovered", // 발견됨 (스크랩 가능)
      matchedEvent: discoveredMatch,
    };
  }

  // Step 3: 매칭 실패
  return {
    ...e,
    matchStatus: "not_matched", // 수동 검색 필요
    matchedJob: null,
  };
});
```

### 새 함수: matchGorunningToDiscovered
```javascript
// functions/lib/scraper.js
function matchGorunningToDiscovered(gorunningEvent, discoveredEvents) {
  // Step 1: 날짜 필터 (±2일)
  const eventDate = new Date(gorunningEvent.date);
  const candidates = discoveredEvents.filter(ev => {
    if (!ev.date) return false;
    const evDate = new Date(ev.date);
    const diffDays = Math.abs((eventDate - evDate) / (1000 * 60 * 60 * 24));
    return diffDays <= 2;
  });

  if (candidates.length === 0) return null;

  // Step 2: 이름 유사도
  const scored = candidates.map(ev => ({
    event: ev,
    similarity: calculateNameSimilarity(ev.name, gorunningEvent.name),
  }));

  // Step 3: 임계치 (>0.7)
  const qualified = scored.filter(s => s.similarity > 0.7);
  if (qualified.length === 0) return null;

  // Step 4: 최고 점수
  qualified.sort((a, b) => b.similarity - a.similarity);
  return {
    event: qualified[0].event,
    similarity: qualified[0].similarity,
  };
}
```

## UI 변경 (ops.html)

### 현재
```
🔍 수동 검색 필요
💡 액션: report.html "발견"에서 수동 검색...
```

### 개선 (3가지 상태)
```
✅ 스크랩 완료 (scraped)
  → [확정 완료 →] 링크

🔍 발견 가능 (discovered)
  → smartchip_202650000100 (예상)
  → [스크랩 시작 →] 링크

❓ 수동 검색 필요 (not_matched)
  → 💡 액션: report.html "발견"에서...
```

## 구현 단계

### Task 1: matchGorunningToDiscovered 함수 추가
- [ ] `functions/lib/scraper.js`에 함수 추가
- [ ] exports에 추가
- [ ] 로컬 테스트

### Task 2: ops-gorunning-events API 수정
- [ ] `discovered-events-2026.json` 로드
- [ ] 2단계 매칭 로직 구현
- [ ] 응답 형식 업데이트 (matchStatus 3가지)

### Task 3: ops.html UI 업데이트
- [ ] 3가지 상태 렌더링
- [ ] 아이콘 및 링크 수정

### Task 4: 테스트 및 배포
- [ ] 로컬 에뮬레이터 테스트
- [ ] pre-deploy-test
- [ ] 배포

## 예상 결과
- 고러닝 129개 대회 중:
  - scraped: 0개 (대회 전)
  - discovered: 50~80개 (발견 가능)
  - not_matched: 40~70개 (수동 필요)

## 참조
- `_docs/investigations/2026-04-04-ops-urgent-issues.md`
- `data/discovered-events-2026.json`
- `scripts/discover-events.js`
