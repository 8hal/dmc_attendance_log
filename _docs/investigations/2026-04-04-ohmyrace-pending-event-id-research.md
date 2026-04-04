# ohmyrace 예정 대회 ID 추출 리서치

**날짜**: 2026-04-04  
**목적**: ohmyrace "예정" 상태 대회의 event ID를 사전에 파악할 수 있는지 검증  
**대상**: 2026 군산 새만금 마라톤 대회 (순번 31)

---

## 문제 상황

### 배경
- ohmyrace는 예정 대회를 목록에 표시하지만, href가 `javascript:alert('아직 종료되지 않은 대회입니다.')`로 막혀있음
- 대회 ID를 알 수 없어서 사전 스크랩 준비 불가능
- 대회 당일 또는 종료 후에야 ID 노출

### 조사 목적
예정 대회의 event ID를 사전에 추출할 수 있는 방법이 있는지 확인

---

## 리서치 결과

### 1. HTML 구조 분석

**예정 대회 (순번 31, 군산 새만금)**:
```html
<li>
  <span class="new_num">31</span>
  <span class="new_cate">마라톤</span>
  <span class="new_sbj">
    <a href="javascript:alert('아직 종료되지 않은 대회입니다.')">
      <span class="admin-button status-button status-3">예정</span>
      2026 군산 새만금 마라톤 대회
    </a>
  </span>
  <span class="new_data">2026. 04. 05</span>
</li>
```

**종료 대회 (순번 35, 최종 군산 Test)**:
```html
<li>
  <span class="new_num">35</span>
  <span class="new_cate">마라톤</span>
  <span class="new_sbj">
    <a href="http://record.ohmyrace.co.kr/event/150">
      <span class="admin-button status-button status-2">종료</span>
      최종 군산 Test
    </a>
  </span>
  <span class="new_data">2026. 04. 05</span>
</li>
```

**차이점**:
- 예정: `href="javascript:alert(...)"`
- 종료: `href="http://record.ohmyrace.co.kr/event/150"`

---

### 2. 순번과 Event ID 관계 분석

**2026년 대회 목록 (날짜순)**:

| 날짜 | 순번 | Event ID | 대회명 | 상태 |
|------|------|----------|--------|------|
| 2026-02-02 | 27 | 121 | API 테스트 - 마라톤 | 종료 |
| 2026-02-22 | 28 | 117 | 제22회 밀양 아리랑 마라톤대회 | 종료 |
| 2026-03-22 | 29 | 133 | 260405_테스트 | 종료 |
| 2026-04-02 | 30 | 144 | 260402 API 테스트 | 종료 |
| **2026-04-05** | **31** | **None** | **2026 군산 새만금 마라톤 대회** | **예정** ⚠️ |
| **2026-04-05** | **32** | **None** | **창원 벚꽃마라톤** | **예정** ⚠️ |
| 2026-04-05 | 33 | 142 | 260402_창원 TEST | 종료 |
| 2026-04-05 | 34 | 143 | 260402_군산 TEST | 종료 |
| 2026-04-05 | 35 | 150 | 최종 군산 Test | 종료 |
| 2026-04-05 | 36 | 153 | Final_창원_SY | 종료 |
| **2026-05-16** | **37** | **None** | **정남진장흥철인3종** | **예정** ⚠️ |
| **2026-05-29** | **38** | **None** | **아이치 선발전(2차)** | **예정** ⚠️ |
| **2026-05-31** | **39** | **None** | **아이치 선발전(3차)** | **예정** ⚠️ |
| **2026-06-20** | **40** | **None** | **한강리버크로스** | **예정** ⚠️ |

**패턴 분석**:
- 순번(new_num): 등록 순서 (연속적)
- Event ID: 종료/공개 순서 (불연속)
- **예정 대회는 순번만 있고 ID 없음**

**Event ID 특징**:
- ID 범위: 116 ~ 153 (현재 최신)
- 빠진 ID: 29개 (118-120, 122-132, 134-141, 145-149, 151-152)
- **순번과 ID는 상관관계 없음** (순번 28=ID 117, 순번 29=ID 133)

---

### 3. 직접 접근 시도

#### 3.1 추측 ID로 접근 (실패)
```bash
curl -s "http://record.ohmyrace.co.kr/event/31"
# 결과: "오류안내 페이지"
```

**시도한 ID 범위**: 154-165 (최신 ID 153 이후)
- 모두 "오류안내 페이지" 반환
- 예정 대회 ID는 아직 생성되지 않았거나, 생성되었더라도 접근 차단됨

#### 3.2 빠진 ID 범위 확인 (실패)
```bash
curl -s "http://record.ohmyrace.co.kr/event/140"  # 오류 페이지
curl -s "http://record.ohmyrace.co.kr/event/145"  # 오류 페이지
```

**검증 결과**:
- 140-141, 145-149, 151-152: 모두 오류 페이지
- 실제 대회: 142, 143, 144, 150, 153만 접근 가능

---

### 4. 숨겨진 메타데이터 확인 (실패)

**확인한 항목**:
- ✗ `data-*` 속성: 없음
- ✗ `id` 속성: 없음 (페이지 전역 id만 존재)
- ✗ JavaScript 변수: 없음
- ✗ 쿠키/헤더: event ID 정보 없음

**결론**: HTML 어디에도 예정 대회의 event ID가 노출되지 않음

---

## 최종 결론

### ❌ 예정 대회 ID 사전 추출 불가능

**이유**:
1. HTML에서 ID 완전히 숨김 (href만 `javascript:alert(...)`)
2. 순번(new_num)은 단순 리스트 순번, event ID 아님
3. 추측 가능한 ID로 직접 접근 시 접근 차단
4. `data-*`, `id` 등 메타데이터 없음

**검증된 사실**:
- 순번과 event ID는 **상관관계 없음** (등록 순서 ≠ ID 순서)
- event ID는 **불연속적** (빠진 번호 많음)
- 예정 대회는 **종료/공개 시점에 ID 생성** 또는 **접근 권한 부여**

---

## 대응 방안

### 현실적 해결책: 대회 종료 후 상태 변경 대기

**워크플로우**:
```
1. 대회 전: 고러닝에서 발견 → ops.html "🔍 수동 필요" 표시
2. 대회 당일 저녁: ohmyrace 사이트 직접 확인
   - "예정" → "진행중" or "종료" 상태 변경 확인
   - href 생성 확인: event/XXX
3. ID 확보 후: report.html에서 수동 스크랩
```

**타임라인 예시 (군산 마라톤)**:
```
04-04 (금): 예정 상태, ID 없음
04-05 (토): 대회 진행
04-05 (토) 저녁: 상태 변경 확인 (ID 생성?)
04-06 (일): 기록 조회 가능, 스크랩 실행
```

---

### 자동화 가능 여부

**완전 자동화: 불가능**
- 사이트 정책으로 예정 대회 접근 차단
- 우회 방법 없음

**부분 자동화: 가능**
```javascript
// weeklyDiscoverAndScrape 함수에 추가
// 대회 당일 또는 +1일에 ohmyrace 재발견 시도
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

// 어제/오늘 대회 중 not_matched 재시도
const recentEvents = gorunningEvents.filter(e => 
  (e.date === yesterday || e.date === today) && 
  e.matchStatus === 'not_matched'
);

// ohmyrace 재크롤 → 상태 변경됐으면 ID 생성됨
const freshOhmyraceEvents = await discoverOhmyrace(2026);
for (const event of recentEvents) {
  const match = matchToOhmyrace(event, freshOhmyraceEvents);
  if (match) {
    // 자동 스크랩 트리거
  }
}
```

**예상 효과**:
- 대회 당일 자동 재매칭 (약 50% 성공 예상)
- 실패 시 수동 확인 필요

---

## 권장 사항

### 단기 (이번 군산 마라톤)
- ✅ **현재 시스템으로 처리 가능** (수동 개입 5-10분)
- 대회 당일 저녁 체크리스트 준비:
  1. ohmyrace 사이트 접속
  2. "군산 새만금" 검색
  3. 상태 "예정" → "종료" 확인
  4. event ID 메모
  5. report.html에서 스크랩

### 중기 (다음 주)
- 대회 당일 자동 재매칭 로직 구현
- `weeklyDiscoverAndScrape`에 D-Day 재시도 추가
- 성공률 모니터링

### 장기 (시스템 개선)
- ohmyrace 관리자 패턴 학습 (언제 상태 변경하는지)
- 알림 개선: "군산 마라톤 내일, ohmyrace 확인 필요"
- 다른 소스(smartchip, spct) 우선 전략

---

## 관련 문서
- 군산 마라톤 대응 계획: `_docs/investigations/2026-04-05-gunsan-marathon-ohmyrace-status.md`
- ohmyrace 조사: `_docs/investigations/2026-04-03-ohmyrace-investigation.md`
- 현재 스크래퍼: `functions/lib/scraper.js` (discoverOhmyrace, searchOhmyraceByName)

---

## 부록: 분석 데이터

### 순번-ID 매핑 (2026년)
```
순번  Event ID  차이  대회명
 26    116      90    2025 대한육상연맹과 함께 하는 겨울왕국 레이스
 27    121      94    API 테스트 - 마라톤
 28    117      89    제22회 밀양 아리랑 마라톤대회
 29    133     104    260405_테스트
 30    144     114    260402 API 테스트
 31   None       -    2026 군산 새만금 마라톤 대회 ⚠️
 32   None       -    국립창원대 벚꽃마라톤 ⚠️
 33    142     109    260402_창원 TEST
 34    143     109    260402_군산 TEST
 35    150     115    최종 군산 Test
 36    153     117    Final_창원_SY
 37   None       -    정남진장흥철인3종 ⚠️
 38   None       -    아이치 선발전(2차) ⚠️
 39   None       -    아이치 선발전(3차) ⚠️
 40   None       -    한강리버크로스 ⚠️
```

**관찰**:
- 순번과 ID는 **선형 관계 없음** (ID 117 → 133: +16, 133 → 144: +11)
- 평균 차이(ID - 순번): 104.6
- 최신 ID: 153

### 빠진 ID (29개)
```
118, 119, 120, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132,
134, 135, 136, 137, 138, 139, 140, 141, 145, 146, 147, 148, 149, 151, 152
```

### 접근 테스트 결과
```bash
# 최신 ID 이후
curl "http://record.ohmyrace.co.kr/event/154"  # 오류 페이지
curl "http://record.ohmyrace.co.kr/event/165"  # 오류 페이지

# 빠진 ID 범위
curl "http://record.ohmyrace.co.kr/event/140"  # 오류 페이지
curl "http://record.ohmyrace.co.kr/event/145"  # 오류 페이지
```

**결론**: 모든 미확인 ID는 오류 페이지 (404 아닌 200 + 오류 안내)

---

## 검증 완료 사항

- ✅ HTML에 event ID 노출 안 됨 (예정 대회)
- ✅ `data-*`, `id` 속성 없음
- ✅ 순차 ID 추측 불가능 (모두 오류 페이지)
- ✅ 순번-ID 관계 불규칙 (선형 모델 불가)

**최종 판단**: **기술적으로 우회 불가능**

---

**작성자**: AI Agent  
**리서치 도구**: curl, Python 스크립트, 정규표현식  
**검증 날짜**: 2026-04-04 (대회 1일 전)
