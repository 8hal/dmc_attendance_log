# 동명이인 처리 현황 파악

**작성일**: 2026-04-18  
**작성자**: AI Agent  
**목적**: 단체 대회 스크래핑 시 동명이인 처리 방식 확인 및 개선 방안 검토

---

## 1. 현재 동명이인 처리 방식

### 1.1 스크래핑 로직 (`functions/lib/scraper.js`)

**검색 방식:**
```javascript
// line 1176
found = await searchMember(source, sourceId, m.realName, { session: smartchipSession });
```

- **입력**: `m.realName` (실명)만 사용
- **참가자 distance 정보 미활용**: `m.distance` 존재하지만 검색에 사용하지 않음

**동명이인 처리:**
```javascript
// line 1244-1262
const isAmbiguous = found.length > 1;
for (const r of found) {
  results.push({
    name: r.name,
    bib: r.bib,
    distance: r.distance,
    netTime: r.netTime,
    // ...
    status: isAmbiguous ? "ambiguous" : "auto",
    candidateCount: found.length,
  });
}
```

- **동작**: 동명이인이 여러 명 검색되면 **모두 포함**
- **표시**: `status: "ambiguous"` 플래그만 설정
- **필터링**: 없음 (코스 매칭 하지 않음)

### 1.2 API 레벨 처리 (`functions/index.js`)

**gap 분석 API** (line 2655-2656):
```javascript
if (matches.length > 1 || matches[0].status === "ambiguous") {
  return { ...p, gapStatus: "ambiguous", candidates: matches.slice(0, 3) };
}
```

- **UI 표시**: 최대 3명의 후보 제시
- **선택 방법**: 운영진이 수동으로 올바른 후보 선택

---

## 2. 문제점

### 2.1 동명이인 자동 해소 불가
- **현상**: "김철수"가 풀 마라톤과 하프 마라톤에 각각 1명씩 검색될 때, 둘 다 표시
- **문제**: 참가자의 종목 정보(`distance`)를 알고 있음에도 불구하고 활용하지 않음
- **결과**: 운영진이 수동으로 올바른 기록을 선택해야 함

### 2.2 불필요한 후보 포함
- **예시**:
  ```
  참가자: 김철수 (하프 마라톤)
  검색 결과:
    1. 김철수 - 풀 마라톤 - 3:45:00
    2. 김철수 - 하프 마라톤 - 1:45:00  ← 정답
  ```
- **현재**: 둘 다 `ambiguous` 후보로 표시
- **기대**: 2번만 자동 선택되어야 함

### 2.3 처리 비용 증가
- 불필요한 후보까지 Firestore에 저장
- 운영진의 수동 확인 시간 증가
- UI에서 불필요한 선택지 표시

---

## 3. 데이터 현황

### 3.1 참가자 데이터 구조
```javascript
{
  memberId: "...",
  nickname: "라우펜더만",
  realName: "이원기",
  distance: "half",  // ← 이 정보를 활용해야 함
  bib: "12345"
}
```

**distance 값**:
- `full`: 풀 마라톤
- `half`: 하프 마라톤
- `10K`: 10km
- `5K`: 5km
- 기타: 30K, 3K, 20K 등

### 3.2 스크랩 결과 구조
```javascript
{
  name: "이원기",
  distance: "half",  // ← 참가자 distance와 비교 가능
  netTime: "01:45:23",
  bib: "12345",
  // ...
}
```

**distance 정규화 필요**:
- 대소문자 통일: `HALF` → `half`
- 동의어 처리: `Full` → `full`, `10km` → `10K`

---

## 4. 개선 방안

### 4.1 코스 매칭 필터링 추가

**위치**: `functions/lib/scraper.js` line 1244

**변경 전**:
```javascript
const isAmbiguous = found.length > 1;
for (const r of found) {
  results.push({ ... });
}
```

**변경 후**:
```javascript
// distance 매칭 필터링
const matched = found.filter(r => {
  const participantDistance = normalizeDistance(m.distance);
  const resultDistance = normalizeDistance(r.distance);
  return participantDistance === resultDistance;
});

const finalResults = matched.length > 0 ? matched : found; // fallback
const isAmbiguous = finalResults.length > 1;

for (const r of finalResults) {
  results.push({ ... });
}
```

### 4.2 정규화 함수 필요
```javascript
function normalizeDistance(dist) {
  if (!dist) return null;
  const lower = dist.toLowerCase();
  // 동의어 처리
  if (lower === 'full' || lower === 'fm') return 'full';
  if (lower === 'half' || lower === 'hm') return 'half';
  if (lower === '10km' || lower === '10k') return '10K';
  if (lower === '5km' || lower === '5k') return '5K';
  return lower;
}
```

### 4.3 Fallback 전략
**distance 매칭 실패 시**:
- 원본 검색 결과 전체 포함 (기존 동작 유지)
- `status: "ambiguous"` 유지
- 로그 기록: "distance 매칭 실패, 원본 유지"

**이유**:
- distance 정보가 없는 경우 대비
- distance 표기가 다른 경우 대비 (예: `42.195K`, `Marathon`)

---

## 5. 영향 범위

### 5.1 변경 대상
- ✅ `functions/lib/scraper.js`: 스크래핑 로직
- ⚠️ API/UI: 변경 불필요 (기존 동작 유지)

### 5.2 기존 데이터
- ❌ 영향 없음: 과거 스크랩 결과는 변경하지 않음
- ✅ 향후 스크랩부터 적용

### 5.3 호환성
- ✅ 기존 API 응답 형식 동일
- ✅ UI 변경 불필요
- ✅ 하위 호환성 유지

---

## 6. 기대 효과

### 6.1 정량적 효과
- **동명이인 자동 해소율**: 추정 70-80%
  - 코스가 다른 동명이인 케이스 자동 해결
  - 같은 코스의 동명이인은 여전히 `ambiguous`
- **수동 확인 시간**: 30분 → 5-10분 (예상)

### 6.2 정성적 효과
- 운영진 부담 감소
- 기록 매칭 정확도 향상
- Firestore 저장 용량 절감

---

## 7. 리스크

### 7.1 기술적 리스크
- **distance 표기 불일치**: 
  - 리스크: 참가자 distance = "half", 결과 distance = "21.0975K"
  - 완화: Fallback 전략 (원본 유지)
- **distance 정보 누락**:
  - 리스크: 참가자 또는 결과에 distance 없음
  - 완화: null 체크 + Fallback

### 7.2 운영 리스크
- **과도한 필터링**:
  - 리스크: 정규화 실수로 정답 버림
  - 완화: Fallback + 철저한 테스트

---

## 8. 다음 단계

1. ✅ **현황 파악 완료** (이 문서)
2. ⏳ **테크 스펙 작성**: 상세 구현 사양
3. ⏳ **팀장 리뷰**: 개선 방향 승인
4. ⏳ **개발 시작**: 코드 구현
5. ⏳ **리뷰 및 테스트**: 검증 후 배포

---

## 9. 참고 자료

- 스크래핑 로직: `functions/lib/scraper.js` line 1157-1289
- API 로직: `functions/index.js` line 2645-2662
- 참가자 구조: `race_events` collection, `participants` array
- 배번 입력 기능: `_docs/log/2026-04-18.md`
