# 테크 스펙: 동명이인 코스 매칭 필터링

**작성일**: 2026-04-18  
**상태**: 승인됨  
**구현 우선순위**: P1 (High)  

---

## 1. 개요

### 1.1 목적

단체 대회 스크래핑 시 참가자의 종목(distance) 정보를 활용하여 동명이인 후보를 자동으로 필터링한다.

### 1.2 배경

- **현재 문제**: 동명이인이 여러 종목에 나왔을 때 모든 결과를 `ambiguous`로 표시
- **예시**: "김철수"가 풀과 하프 각 1명씩 검색 → 둘 다 후보로 표시
- **결과**: 운영진이 수동으로 올바른 기록 선택 (시간 소요)

### 1.3 목표

- 참가자가 하프 마라톤 신청 → 검색 결과 중 하프 마라톤만 선택
- 동명이인 자동 해소율 70-80% 달성
- 수동 확인 시간 30분 → 5-10분 단축
- **코스 표시 통일**: 모든 페이지에서 동일한 distance 레이블 사용 (half → "하프", full → "풀")

---

## 2. 기술 설계

### 2.1 변경 범위

**Backend**:

- `functions/lib/scraper.js`: distance 매칭 필터링 로직 추가 (line 1244)
- `functions/lib/raceDistance.js`: 기존 `normalizeRaceDistance` 함수 재사용 (변경 없음)

**Frontend**:

- `assets/distance-utils.js`: 공통 distance 표시 유틸 (신규)
- `my-bib.html`: 공통 유틸 import 및 사용
- `group-detail.html`: 공통 유틸 import 및 사용
- `my.html`: 기존 DIST_LABELS 사용 유지 (변경 없음, 이미 동일 규칙)

### 2.2 구현 상세

#### A. Backend - distance 매칭 필터링

**파일**: `functions/lib/scraper.js`

**import 추가** (상단):

```javascript
const { normalizeRaceDistance } = require('./raceDistance');
```

**변경 위치**: line 1244-1263

**변경 내용**: 다음 섹션 참조

#### B. Frontend - 공통 distance 표시 유틸

**파일**: `assets/distance-utils.js` (신규)

- `formatDistance(distance)`: distance → 한글 레이블
- `distBadge(distance)`: distance → 배지 HTML
- `DIST_LABELS`: my.html과 동일한 매핑

**사용 예시**:

```html
<script src="assets/distance-utils.js"></script>
<script>
  console.log(formatDistance('half')); // "하프"
  console.log(formatDistance('10K'));  // "10K"
</script>
```

**위치**: `functions/lib/raceDistance.js`

**기존 함수**: `normalizeRaceDistance(raw)`

```javascript
// line 79-87
function normalizeRaceDistance(raw) {
  const t = String(raw || "").trim();
  if (!t) return "unknown";
  if (DIST_ALIASES[t]) return DIST_ALIASES[t];
  const byLower = DIST_ALIAS_LOWER[t.toLowerCase()];
  if (byLower) return byLower;
  if (RACE_DISTANCE_CANONICAL.includes(t)) return t;
  return t;
}
```

**지원하는 동의어** (일부):

- 풀: `FULL`, `Full`, `full`, `풀`, `풀코스`, `42.195km`, `42km`, `marathon` → `"full"`
- 하프: `HALF`, `Half`, `half`, `하프`, `하프마라톤`, `21.0975km`, `21km` → `"half"`
- 10K: `10K`, `10k`, `10km` → `"10K"`
- 5K: `5K`, `5k`, `5km` → `"5K"`
- 기타: 30K, 32K, 20K, ultra 등

**특징**:

- ✅ 매우 포괄적인 동의어 지원
- ✅ 대소문자 무관 매칭
- ✅ 매핑 실패 시 원본 반환 (Fallback 내장)
- ✅ 빈 값 처리: `"unknown"` 반환

**scraper.js에서 import**:

```javascript
const { normalizeRaceDistance } = require('./raceDistance');
```

#### C. Backend - 코스 매칭 필터링 로직

**위치**: `functions/lib/scraper.js` line 1244

**변경 전**:

```javascript
const isAmbiguous = found.length > 1;
for (const r of found) {
  const pb = pbMap ? isPB(pbMap, m.realName, r.distance, r.netTime) : false;
  results.push({
    name: r.name,
    bib: r.bib,
    distance: r.distance,
    netTime: r.netTime,
    gunTime: r.gunTime || "",
    overallRank: r.overallRank || null,
    genderRank: r.genderRank || null,
    pace: r.pace || "",
    memberRealName: m.realName,
    memberNickname: m.nickname,
    memberGender: m.gender || "",
    status: isAmbiguous ? "ambiguous" : "auto",
    candidateCount: found.length,
    isPB: pb,
  });
}
```

**변경 후**:

```javascript
// 1. 참가자 distance 정규화
const participantDistance = normalizeRaceDistance(m.distance);

// 2. distance 매칭 필터링
let filteredResults = found;
if (participantDistance && participantDistance !== 'unknown') {
  const matched = found.filter(r => {
    const resultDistance = normalizeRaceDistance(r.distance);
    return resultDistance === participantDistance;
  });
  
  // 3. Fallback: 매칭 실패 시 원본 유지
  if (matched.length > 0) {
    filteredResults = matched;
  } else {
    // 매칭 실패 로그
    console.warn(
      `[scrapeEvent] distance 매칭 실패, 원본 유지: ${m.realName} ` +
      `(참가자: ${m.distance}, 검색: ${found.map(r => r.distance).join(', ')})`
    );
  }
}

// 4. 결과 저장
const isAmbiguous = filteredResults.length > 1;
for (const r of filteredResults) {
  const pb = pbMap ? isPB(pbMap, m.realName, r.distance, r.netTime) : false;
  results.push({
    name: r.name,
    bib: r.bib,
    distance: r.distance,
    netTime: r.netTime,
    gunTime: r.gunTime || "",
    overallRank: r.overallRank || null,
    genderRank: r.genderRank || null,
    pace: r.pace || "",
    memberRealName: m.realName,
    memberNickname: m.nickname,
    memberGender: m.gender || "",
    status: isAmbiguous ? "ambiguous" : "auto",
    candidateCount: found.length, // 원본 후보 수 (필터링 전)
    filteredCount: filteredResults.length, // 필터링 후 후보 수
    isPB: pb,
  });
}
```

### 2.3 데이터 구조 변경

**추가 필드**: `filteredCount` (optional)

```javascript
{
  // 기존 필드들...
  candidateCount: 3,      // 필터링 전 원본 후보 수
  filteredCount: 1,       // 필터링 후 최종 후보 수 (새 필드)
  status: "auto"          // filteredCount === 1이면 "auto"
}
```

**호환성**: 

- 기존 코드는 `filteredCount` 미사용 → 영향 없음
- 향후 모니터링/디버깅 용도로 활용 가능

---

## 3. 동작 시나리오

### 3.1 정상 케이스: 매칭 성공

**입력**:

```javascript
참가자: { realName: "김철수", distance: "half" }
검색 결과: [
  { name: "김철수", distance: "FULL", netTime: "3:45:00" },
  { name: "김철수", distance: "HALF", netTime: "1:45:00" }
]
```

**처리**:

1. `normalizeDistance("half")` → `"half"`
2. 필터링: `"HALF"` → `"half"` 매칭 → 1개 선택
3. `filteredResults.length === 1` → `status: "auto"`

**출력**:

```javascript
results: [{
  name: "김철수",
  distance: "HALF",
  netTime: "1:45:00",
  status: "auto",
  candidateCount: 2,
  filteredCount: 1
}]
```

### 3.2 Fallback 케이스: 매칭 실패

**입력**:

```javascript
참가자: { realName: "이영희", distance: "half" }
검색 결과: [
  { name: "이영희", distance: "21.0975km", netTime: "1:50:00" },  // 표기 다름
  { name: "이영희", distance: "10K", netTime: "0:55:00" }
]
```

**처리**:

1. `normalizeDistance("half")` → `"half"`
2. 필터링: `"21.0975km"` → `"21.0975km"` (매핑 없음) → 매칭 실패
3. Fallback: 원본 2개 유지
4. `filteredResults.length === 2` → `status: "ambiguous"`

**출력**:

```javascript
results: [
  {
    name: "이영희",
    distance: "21.0975km",
    netTime: "1:50:00",
    status: "ambiguous",
    candidateCount: 2,
    filteredCount: 2
  },
  {
    name: "이영희",
    distance: "10K",
    netTime: "0:55:00",
    status: "ambiguous",
    candidateCount: 2,
    filteredCount: 2
  }
]
```

**로그**:

```
⚠️ [scrapeEvent] distance 매칭 실패, 원본 유지: 이영희 (참가자: half, 검색: 21.0975km, 10K)
```

### 3.3 Edge Case: distance 정보 없음

**입력**:

```javascript
참가자: { realName: "박민수", distance: null }
검색 결과: [
  { name: "박민수", distance: "HALF", netTime: "1:40:00" },
  { name: "박민수", distance: "10K", netTime: "0:50:00" }
]
```

**처리**:

1. `participantDistance === null` → 필터링 건너뜀
2. 원본 2개 유지
3. `status: "ambiguous"`

**출력**: 기존 동작과 동일 (모든 후보 포함)

---

## 4. 테스트 계획

### 4.1 Unit Test

**파일**: `functions/test/scraper.test.js` (또는 기존 테스트 파일)

**기존 함수 테스트** (`normalizeRaceDistance`는 이미 검증됨):

- `functions/lib/raceDistance.js`에 정의되어 있고 프로덕션에서 사용 중
- 추가 테스트 불필요

**통합 테스트**:

```javascript
const { normalizeRaceDistance } = require('../lib/raceDistance');

describe('distance 매칭 필터링', () => {
  test('동명이인 - 종목 다름 → 필터링 성공', () => {
    const participant = { realName: "김철수", distance: "half" };
    const searchResults = [
      { name: "김철수", distance: "FULL", netTime: "3:45:00" },
      { name: "김철수", distance: "HALF", netTime: "1:45:00" }
    ];
    
    const participantDist = normalizeRaceDistance(participant.distance);
    const filtered = searchResults.filter(r => 
      normalizeRaceDistance(r.distance) === participantDist
    );
    
    expect(filtered.length).toBe(1);
    expect(filtered[0].distance).toBe("HALF");
    expect(filtered[0].netTime).toBe("1:45:00");
  });
  
  test('distance 정보 없음 → Fallback', () => {
    const participant = { realName: "박민수", distance: null };
    const searchResults = [
      { name: "박민수", distance: "HALF", netTime: "1:40:00" },
      { name: "박민수", distance: "10K", netTime: "0:50:00" }
    ];
    
    const participantDist = normalizeRaceDistance(participant.distance);
    const filtered = participantDist && participantDist !== 'unknown'
      ? searchResults.filter(r => normalizeRaceDistance(r.distance) === participantDist)
      : searchResults;
    
    expect(filtered.length).toBe(2); // Fallback: 원본 유지
  });
  
  test('동명이인 - 같은 종목 여러 명 → ambiguous 유지', () => {
    const participant = { realName: "이영희", distance: "10K" };
    const searchResults = [
      { name: "이영희", distance: "10km", netTime: "0:50:00" },
      { name: "이영희", distance: "10K", netTime: "0:52:00" }
    ];
    
    const participantDist = normalizeRaceDistance(participant.distance);
    const filtered = searchResults.filter(r => 
      normalizeRaceDistance(r.distance) === participantDist
    );
    
    expect(filtered.length).toBe(2); // 여전히 ambiguous
  });
});
```

### 4.2 Integration Test

**방법**: 실제 대회 데이터로 스크래핑 후 결과 확인

**테스트 케이스**:


| 참가자 | distance | 검색 결과                        | 기대 결과                    | 검증 항목       |
| --- | -------- | ---------------------------- | ------------------------ | ----------- |
| 김철수 | half     | FULL (3:45), HALF (1:45)     | HALF만 선택, status=auto    | 매칭 성공       |
| 이영희 | 10K      | 10km (0:50), HALF (1:45)     | 10km만 선택, status=auto    | 대소문자 정규화    |
| 박민수 | null     | HALF (1:40), 10K (0:50)      | 둘 다 포함, status=ambiguous | distance 없음 |
| 최지원 | half     | 21.0975km (1:50), 10K (0:55) | Fallback: 둘 다 포함         | 표기 불일치      |


**검증 명령**:

```bash
# 실제 대회로 스크래핑 테스트
node scripts/test-distance-matching.js evt_2026-04-19_24
```

### 4.3 수동 테스트

**시나리오**:

1. 제24회 경기마라톤대회 재스크래핑
2. gap 분석 UI에서 `ambiguous` 건수 확인
3. 기대: 기존 대비 70-80% 감소

**측정 지표**:

- 스크래핑 전 `ambiguous` 건수: X건
- 스크래핑 후 `ambiguous` 건수: Y건
- 개선율: (X - Y) / X * 100%

---

## 5. 모니터링

### 5.1 로그

**추가 로그**:

```javascript
console.warn(
  `[scrapeEvent] distance 매칭 실패, 원본 유지: ${m.realName} ` +
  `(참가자: ${m.distance}, 검색: ${found.map(r => r.distance).join(', ')})`
);
```

**목적**: distance 표기 불일치 케이스 추적 → 정규화 함수 개선

### 5.2 메트릭

**Firestore 쿼리**:

```javascript
// ambiguous 건수 확인
db.collection('scrape_jobs')
  .where('status', '==', 'complete')
  .where('results', 'array-contains', { status: 'ambiguous' })
  .count();

// filteredCount !== candidateCount 건수
db.collection('scrape_jobs')
  .where('results.filteredCount', '!=', 'results.candidateCount')
  .count();
```

---

## 6. 배포 전략

### 6.1 단계별 배포

**Phase 1: 카나리 배포**

- 1개 대회로 테스트 스크래핑
- 결과 수동 검증
- 문제 없으면 Phase 2 진행

**Phase 2: 점진적 롤아웃**

- 신규 스크래핑에만 적용
- 기존 데이터는 건드리지 않음
- 모니터링 1주일

**Phase 3: 전면 적용**

- 모든 스크래핑에 적용
- 지속적 모니터링

### 6.2 롤백 계획

**트리거**:

- `ambiguous` 건수 오히려 증가
- 정답 기록이 필터링되는 사례 발견
- 스크래핑 실패율 증가

**롤백 방법**:

```bash
git revert <commit-sha>
firebase deploy --only functions
```

**소요 시간**: 5분 이내

---

## 7. 향후 개선 방안

### 7.1 distance 정규화 고도화

- 머신러닝 기반 distance 매칭
- 역사적 데이터 기반 동의어 추가
- 각 대회별 distance 표기 패턴 학습

### 7.2 추가 필터링 기준

- 배번(bib) 매칭: 참가자 bib 입력되어 있으면 활용
- 성별(gender) 매칭: 성별 정보 있으면 추가 필터
- 나이(age) 매칭: 생년월일 정보 있으면 연령대 확인

### 7.3 UI 개선

- 필터링된 후보 수 표시: "3명 중 1명 선택"
- 필터링 이유 표시: "종목 일치로 자동 선택"
- 수동 override: 필터링 결과 불만족 시 원본 보기

---

## 8. 체크리스트

**개발 전**:

- 현황 파악 완료
- 테크 스펙 작성
- 팀장 승인

**개발 중**:

- `scraper.js`에 `normalizeRaceDistance` import 추가
- 코스 매칭 필터링 로직 추가 (line 1244)
- `assets/distance-utils.js` 생성 (완료)
- `my-bib.html`에서 공통 유틸 사용
- `group-detail.html`에서 공통 유틸 사용
- Unit test 작성 및 통과
- Linter 통과

**배포 전**:

- Integration test 실행
- 수동 테스트 (카나리)
- 코드 리뷰
- 로그 확인
- 문서 업데이트 (README, 변경 로그)

**배포 후**:

- 메트릭 모니터링 (1주일)
- `ambiguous` 건수 감소 확인
- 오류 로그 모니터링
- 운영진 피드백 수집

---

## 9. 참고 자료

- 현황 파악: `_docs/analysis/2026-04-18-duplicate-name-distance-matching.md`
- 구현 대상 파일: `functions/lib/scraper.js`
- 관련 이슈: 동명이인 수동 매칭 시간 과다 소요

