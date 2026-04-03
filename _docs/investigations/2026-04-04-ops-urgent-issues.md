# ops.html 긴급 이슈 조사 (2026-04-04)

## 개요

ops.html에서 두 가지 긴급 이슈 발견:
1. **Phantom Jobs 18건** (🔴 긴급: 시스템 점검 필요)
2. **고러닝 매칭 0/129** (스크랩 가능 0개, 수동 필요 129개)

## Issue 1: Phantom Jobs 18건

### 증상
- `data-integrity` API 응답: 18개 phantom jobs
- Phantom job 정의: `status=confirmed` 이나 `race_results`가 없는 job

### 영향
- 시스템 건강도 표시: 🔴 긴급 (임계치: 6건 이상)
- 실제 데이터 무결성 문제 가능성

### Phase 1: Root Cause Investigation

#### 1.1 Phantom Jobs 목록
```
1. 오사카마라톤 (GMVYn1ixPXQMOdHutHn9)
2. 부산비치울트라 (QXrRSojIdwcwi7w54CAL)
3. 고구려마라톤 (WReDO1OwpGceKhhZ2Zku)
4. 테스트 (manual_manual_1775222584867)
5. 무한도전 Run with 쿠팡플레이 (search_3tShsj67juAa2UWk8NeM_0)
6. 제 7회 기장바다마라톤 (search_3tShsj67juAa2UWk8NeM_1)
7. 2025 부안해변마라톤 (search_3tShsj67juAa2UWk8NeM_2)
8. 2025 경기수원 국제하프마라톤 (search_3tShsj67juAa2UWk8NeM_3)
9. 2025 JTBC 서울마라톤 (search_ybLLXH8sBo2PCMRuxZnD_0)
10. 2025 안양천단풍길마라톤 (search_ybLLXH8sBo2PCMRuxZnD_1)
11. 2025 슈퍼블루마라톤 (search_ybLLXH8sBo2PCMRuxZnD_3)
12. 제22회 여주 세종대왕 마라톤대회 (search_ybLLXH8sBo2PCMRuxZnD_4)
13. 2025 MBN 전국나주마라톤대회 (search_ybLLXH8sBo2PCMRuxZnD_5)
14. 2025철원DMZ국제평화마라톤 (search_ybLLXH8sBo2PCMRuxZnD_6)
15. 2025 포항마라톤 챔피언십 (smartchip_202550000306)
16. 제35회 진주마라톤대회 (smartchip_202550000318)
17. 2025 부산바다마라톤 (spct_2025102601)
18. 제23회 희망드림동계국제마라톤 (spct_2026022101)
```

#### 1.2 패턴 분석
- **테스트/수동**: 1건 (manual_manual_*)
- **search_* 잡**: 11건 (2개 회원에서 생성된 잡)
- **정규 스크랩**: 6건 (smartchip 2건, spct 2건, 기타 2건)

#### 1.3 가설
**가설 1**: 2026-04-03 P0 버그 수정 전 생성된 잡
- 재확정 시 기존 race_results 삭제 안 되던 버그
- 일부 잡은 결과가 삭제되었을 가능성

**가설 2**: 0건 확정 잡
- 2026-04-03 이전에는 0건 저장 불가
- 확정 버튼을 눌렀지만 실제로는 results가 없는 경우

**가설 3**: search_* 잡 특수성
- `search_` 프리픽스 잡은 일시적 검색용
- confirm 워크플로우가 다를 수 있음

#### 1.4 검증 결과
✓ 매칭 로직 자체는 정상 작동 (로컬 테스트 통과)
✓ 고러닝 크롤링 정상 (129개 대회 발견)

**근본 원인 확인:**
```bash
curl "https://race-nszximpvtq-du.a.run.app?action=data-integrity"
```
- totalJobs: 150개
- totalResults: 842개
- **Phantom jobs: 18개** (confirmed이나 race_results 없음)

샘플 Phantom job:
```json
{
  "jobId": "GMVYn1ixPXQMOdHutHn9",
  "eventName": "오사카마라톤",
  "actual": 0
}
```

#### 1.5 Phantom Jobs 근본 원인

**확정**: 0건 확정 잡들
- 2026-04-03 이전: 0건 저장 불가 (UI 제약)
- 사용자가 확정 버튼을 눌렀으나 실제로는 results가 없는 상태로 confirmed됨
- 또는 재확정 시 기존 results 삭제되고 새 results 없는 경우

**해결 방안:**
1. 18개 phantom jobs를 `status: "complete"` 또는 삭제
2. 실제로 기록이 있어야 하는 잡인지 확인 (수동 재검색)

---

## Issue 2: 고러닝 매칭 0/129

### 증상
- `ops-gorunning-events` API 응답: 129개 대회 모두 `matchStatus: "not_matched"`
- 매칭 로직: 이름 유사도 + 날짜 ±2일

### 영향
- 고러닝 대회 자동 발견 기능 무용
- 모든 대회 수동 검색 필요

### Phase 1: Root Cause Investigation

#### 1.1 매칭 로직 검토
`functions/lib/scraper.js` (2026-04-03 배포):
```javascript
function matchGorunningToJob(gorunningEvent, scrapeJobs) {
  // Step 1: 날짜 필터 (±2일)
  const eventDate = new Date(gorunningEvent.date);
  const candidates = scrapeJobs.filter(job => {
    if (!job.eventDate) return false;
    const jobDate = new Date(job.eventDate);
    const diffDays = Math.abs((eventDate - jobDate) / (1000 * 60 * 60 * 24));
    return diffDays <= 2;
  });
  
  if (candidates.length === 0) return null;
  
  // Step 2: 이름 유사도 계산 및 점수화
  const scored = candidates.map(job => ({
    job,
    similarity: calculateNameSimilarity(job.eventName, gorunningEvent.name)
  }));
  
  // Step 3: 임계치 적용 (>0.7)
  const qualified = scored.filter(s => s.similarity > 0.7);
  
  if (qualified.length === 0) return null;
  
  // Step 4: 최고 점수 반환
  qualified.sort((a, b) => b.similarity - a.similarity);
  return {
    job: qualified[0].job,
    similarity: qualified[0].similarity
  };
}
```

#### 1.2 가설
**가설 1**: scrapeJobs 범위 문제
- API가 최근 3개월 jobs만 조회
- 고러닝 대회 대부분 향후 2개월 (아직 스크랩 안 됨)

**가설 2**: 날짜 필터 실패
- `job.eventDate` 필드가 없거나 형식 문제
- 고러닝 `date` 형식과 불일치

**가설 3**: 이름 유사도 임계치 너무 높음
- 0.7 임계치로 모든 매칭 실패
- 한글 정규화 문제 (띄어쓰기, 연도, 특수문자)

**가설 4**: 최근 3개월 jobs에 해당 대회 없음
- 고러닝 대회가 우리 시스템에 아직 등록 안 됨
- 군산새만금(04-05)도 매칭 실패 → 아직 스크랩 안 된 상태

#### 1.3 검증 결과 (로컬 테스트)

**매칭 로직 검증:**
```bash
cd functions && node ../scripts/test-gorunning-matching-local.js
```

결과:
- ✓ 날짜 필터 정상 (±2일 범위)
- ✓ 이름 유사도 정상 (100% 매칭 성공)
- ✓ 임계치 0.7 적용 정상
- ✓ 고러닝 크롤링 정상 (129개 대회)

테스트 케이스:
```
대회: "2026 군산새만금마라톤" (2026-04-05)
Job: "2026 군산 새만금 마라톤" (2026-04-05)
→ 유사도 100.0% ✓ 매칭됨
```

**근본 원인 확정:**
```bash
curl "https://race-nszximpvtq-du.a.run.app?action=ops-gorunning-events"
```

응답:
- total: 129개 대회
- matched: 0개
- notMatched: 129개
- lastCrawled: 2026-04-03T16:07:29.290Z (캐시)

**API 코드 분석:**
```javascript
// functions/index.js:2269-2282
const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
const jobsSnap = await db.collection("scrape_jobs")
  .where("createdAt", ">=", threeMonthsAgo)
  .get();
```

**문제:**
- API가 `createdAt >= 최근 3개월` 조건으로 scrape_jobs 조회
- 군산새만금(04-05) 대회는 **아직 스크랩되지 않음** (대회 전)
- 모든 고러닝 대회(향후 2개월)가 아직 스크랩 안 된 상태
- → scrapeJobs 배열이 비어있거나, 해당 날짜의 jobs가 없음

#### 1.4 근본 원인

**확정: 고러닝 대회들이 아직 스크랩되지 않음**

1. 고러닝 대회 대부분 향후 2개월 (미래)
2. scrape_jobs는 **대회 후**에 생성됨 (기록 스크랩 시)
3. 매칭 로직은 **기존 scrape_jobs**와 비교
4. → 대회 전에는 jobs가 없어서 매칭 불가

**예시:**
- 군산새만금: 2026-04-05 (내일)
- 현재 시점: 2026-04-04
- scrape_jobs에 군산새만금 job 없음 (대회 전)
- → 매칭 실패 (정상 동작)

#### 1.5 해결 방안

**옵션 1: 설계 의도 확인**
- 고러닝 매칭은 **대회 후** 자동 매칭용
- 대회 전 "수동 검색 필요"는 정상 동작

**옵션 2: discover-events.js 통합**
- `discover-events.js` 실행으로 발견된 대회 목록
- `data/discovered-events-2026.json`과 매칭
- 대회 전에도 "발견 가능" 표시

**옵션 3: 매칭 로직 변경**
- scrape_jobs뿐 아니라 `race_events` 컬렉션도 확인
- 또는 `discovered-events.json` 파일과 비교

---

## 다음 행동
1. Issue 1 (Phantom Jobs): Firestore 직접 조회로 근본 원인 파악
2. Issue 2 (고러닝 매칭): 매칭 로직 각 단계 디버깅

## 참조
- systematic-debugging 스킬 Phase 1-2 진행 중
- 관련 커밋: 2026-04-03 ops.html 리뉴얼 배포 (v0.10.0)
