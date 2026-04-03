# 군산 마라톤 ohmyrace 상태 변경 대응 계획

**날짜**: 2026-04-03  
**대회**: 2026 군산 새만금 마라톤 대회  
**대회일**: 2026-04-05 (토)  
**소스**: ohmyrace (ID: 31)

## 문제 상황

### 현재 상태
- **고러닝**: "2026 군산새만금마라톤" 발견 ✅
- **ohmyrace**: "2026 군산 새만금 마라톤 대회" 존재하나 **수집 불가** ❌

### 원인
ohmyrace 사이트에서 "예정" 상태 대회는 실제 링크가 없음:

```html
<a href="javascript:alert('아직 종료되지 않은 대회입니다.')">
    <span class="admin-button status-button status-3">예정</span>
    2026 군산 새만금 마라톤 대회
</a>
```

- 정상 대회: `href="http://record.ohmyrace.co.kr/event/150"` (ID 추출 가능)
- 예정 대회: `href="javascript:alert(...)"` (ID 추출 불가)

### 시스템 동작
```
고러닝 발견 → ohmyrace 매칭 시도 
→ sourceId 없어서 매칭 실패 
→ ops.html에서 "🔍 수동 검색 필요" 표시
```

## 예상 시나리오

### 시나리오 A: 대회 당일 상태 변경
대회가 시작되면 ohmyrace 관리자가 상태를 "예정" → "진행중" 또는 "종료"로 변경:
- 정상 href 생성: `event/31`
- `discoverOhmyrace()` 재실행 시 수집 가능
- 자동 매칭 가능

### 시나리오 B: 예정 상태 유지
대회 당일에도 "예정" 상태 유지:
- 여전히 수집 불가
- 운영자가 수동으로 report.html에서 검색 필요

### 시나리오 C: 대회 종료 후 공개
대회 종료 후 기록이 입력되면서 상태 변경:
- 며칠 후 자동 수집 가능
- 하지만 회원들은 이미 기다렸을 가능성

## 대응 계획

### Phase 1: 관찰 (2026-04-04 ~ 04-06)

**목적**: ohmyrace 사이트의 상태 변경 패턴 파악

**체크포인트**:
- [ ] **04-04 (금) 18:00** - 대회 전날 상태 확인
  ```bash
  curl -s "http://record.ohmyrace.co.kr/event" | grep -B 5 -A 3 "군산"
  ```
- [ ] **04-05 (토) 09:00** - 대회 당일 오전 상태 확인
- [ ] **04-05 (토) 15:00** - 대회 진행 중 상태 확인
- [ ] **04-06 (일) 10:00** - 대회 종료 후 상태 확인

**기록할 정보**:
- href 변경 시점
- 실제 기록 조회 가능 시점
- ohmyrace 관리자의 상태 변경 패턴

### Phase 2: 임시 대응 (04-05 대회 당일)

**수동 대응**:
1. Report.html "발견" 탭에서 "군산 새만금" 수동 검색
2. ohmyrace에서 직접 회원 기록 조회
3. 필요 시 수동으로 scrape_jobs 생성

**기록 사항**:
- 실제 소요 시간
- 어려웠던 점
- 자동화 필요성 판단

### Phase 3: 자동화 설계 (04-06 이후)

관찰 결과에 따라 선택:

#### Option A: D-Day 재매칭 로직
```javascript
// weeklyDiscoverAndScrape에 추가
// 대회 당일(D-Day)인 고러닝 이벤트 중 not_matched 재시도
const today = new Date().toISOString().split('T')[0];
const todayEvents = gorunningEvents.filter(e => 
  e.date === today && e.matchStatus === 'not_matched'
);

// 재매칭 시도 (ohmyrace 상태가 변경되었을 수 있음)
for (const event of todayEvents) {
  const freshMatch = await matchGorunningToJob(event, scrapeJobs);
  if (freshMatch) {
    // 매칭 성공 → 자동 scrape_jobs 생성
  }
}
```

**장점**: 자동화, 당일 즉시 반영  
**단점**: 매일 실행 오버헤드

#### Option B: Report.html 재매칭 버튼
```javascript
// report.html에 "🔄 재매칭" 버튼 추가
// 운영자가 대회 당일 수동 클릭
async function retryMatching(gorunningEventId) {
  const response = await fetch(`${API_BASE}?action=retry-gorunning-match`, {
    method: 'POST',
    body: JSON.stringify({ eventId: gorunningEventId })
  });
  // 성공 시 UI 업데이트
}
```

**장점**: 유연함, 필요할 때만 실행  
**단점**: 수동 개입 필요

#### Option C: 주기적 재발견 (주말 전용)
```javascript
// 매주 금요일 저녁 + 토요일 아침에만 실행
// 이번 주말 대회의 ohmyrace 상태 재확인
if (dayOfWeek === 5 || dayOfWeek === 6) {
  const thisWeekendEvents = getWeekendEvents();
  await rediscoverOhmyrace(thisWeekendEvents);
}
```

**장점**: 주말 대회에 최적화  
**단점**: 주중 대회는 커버 안됨

### Phase 4: 구현 우선순위

**Phase 3 결과에 따라 결정**:

1. **패턴이 명확한 경우** (예: 항상 대회 전날 18시에 공개)
   → Option A (D-Day 재매칭) 구현

2. **패턴이 불규칙한 경우**
   → Option B (수동 재매칭 버튼) 구현

3. **대부분 대회가 주말인 경우**
   → Option C (주말 전용 재발견) 구현

## 추가 고려사항

### 다른 사이트도 확인 필요
- **SmartChip**: 예정 대회 상태 확인
- **MyResult**: 예정 대회 상태 확인
- **SPCT**: 예정 대회 상태 확인
- **Marazone**: 예정 대회 상태 확인

각 사이트마다 "예정" 상태 처리 방식이 다를 수 있음.

### 알림 개선
`weekendScrapeReadinessCheck` 이메일에 추가:
```
⚠️ 재매칭 필요 대회:
- 2026 군산새만금마라톤 (고러닝 발견, ohmyrace 매칭 대기)
  → 대회 당일 재확인 필요
```

### 문서화
- 운영 매뉴얼에 "예정 상태 대회 처리 방법" 추가
- 대회 당일 체크리스트 작성

## 성공 기준

### 단기 (이번 군산 마라톤)
- [ ] 회원 기록을 놓치지 않고 수집
- [ ] 수동 개입 시간 최소화 (< 10분)
- [ ] 상태 변경 패턴 파악 완료

### 중기 (향후 대회)
- [ ] 자동화 로직 구현 완료
- [ ] 테스트 및 검증
- [ ] 운영 매뉴얼 업데이트

### 장기 (시스템 개선)
- [ ] 모든 소스 사이트의 예정 상태 핸들링 통일
- [ ] 재매칭 성공률 90% 이상
- [ ] 수동 개입 없이 자동 처리

## 관련 문서
- 군산 마라톤 발견 이슈: `_docs/investigations/2026-04-03-gunsan-marathon-discovery-issue.md`
- ohmyrace 스크래퍼: `functions/lib/scraper.js` (Line 775-809)
- 고러닝 매칭 로직: `functions/lib/scraper.js` (matchGorunningToJob)

## 타임라인

| 날짜 | 시간 | 액션 | 담당 |
|------|------|------|------|
| 04-04 (금) | 18:00 | 대회 전날 상태 확인 | 시스템/운영자 |
| 04-05 (토) | 09:00 | 대회 당일 오전 상태 확인 | 운영자 |
| 04-05 (토) | 15:00 | 대회 진행 중 상태 확인 | 운영자 |
| 04-05 (토) | 저녁 | 필요 시 수동 스크래핑 | 운영자 |
| 04-06 (일) | 10:00 | 대회 종료 후 상태 확인 | 운영자 |
| 04-07 (월) | - | 관찰 결과 정리 및 자동화 설계 | 개발 |

---

**작성자**: AI Agent  
**마지막 업데이트**: 2026-04-03
