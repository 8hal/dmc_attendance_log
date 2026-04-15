# 단체 대회 상세 페이지 설계안

**작성일**: 2026-04-15  
**목표**: 단체 대회 관리 UX 개선 - 상세 페이지 추가

---

## 배경

### 현재 문제점

`group.html`은 단체 대회 **목록만** 제공:
- 카드에 요약 정보만 표시 (참가자 6명 칩 + +N명)
- 배번 입력 불가 → 동명이인 문제 수동 해결
- 통계 없음 (완주율, 기록대 분포 등)
- 참가자 전체 목록 보기 어려움

### 사용자 요구사항

> "참가자 목록 열람하고, 배번도 옵셔널하게 등록할 수 있고, 경기 기록 취합된 것도 볼 수 있고 해야 하지 않을까 싶다."

**핵심 니즈:**
1. **배번 입력** → 스크랩 시 배번 매칭으로 동명이인 자동 해소
2. **참가자 전체 목록** → 이름, 배번, 기록, 순위 테이블
3. **통계 요약** → 완주율, 평균 기록, 기록대 분포

---

## 설계 방향

### 선택한 방안: 별도 페이지 (group-detail.html)

**이유:**
- URL 기반 네비게이션 (북마크, 공유, 새로고침 가능)
- 파일 분리로 유지보수 용이
- 목록/상세 관심사 분리

**대안:**
- ❌ 같은 페이지 URL 파라미터: group.html이 너무 커짐
- ❌ 전체화면 모달: URL 공유 불가

---

## 아키텍처

### 파일 구조

```
group.html          → 목록 + 카드 클릭 → 상세 이동
group-detail.html   → 단체 대회 상세 (신규)
functions/index.js  → API 2개 추가
```

### 네비게이션

```
group.html 카드 클릭
  ↓
location.href = "group-detail.html?eventId=evt_..."
  ↓
← 뒤로가기 버튼 (group.html 복귀)
```

---

## 페이지 구성

### group-detail.html 레이아웃

```
┌──────────────────────────────────────────┐
│ ← 기록 관리   제24회 경기마라톤대회       │
│ 2026-04-19 (일)                          │
├──────────────────────────────────────────┤
│ 📊 통계 요약                             │
│                                          │
│ 등록: 85명 / 확정: 81명 / 미확정: 4명   │
│ 완주율: 95.3% (81/85)                    │
│                                          │
│ 【 풀마라톤 (27명) 】                    │
│ 평균: 3:42:15 / 완주: 26명               │
│ Sub-3: 2명 | Sub-3:30: 8명 | Sub-4: 14명 | 4시간+: 2명
│                                          │
│ 【 하프 (32명) 】                        │
│ 평균: 1:52:30 / 완주: 31명               │
│ Sub-1:30: 3명 | Sub-2:00: 18명 | 2시간+: 10명
│                                          │
│ 【 10K (26명) 】                         │
│ 평균: 58:23 / 완주: 24명                 │
│ Sub-40: 2명 | Sub-50: 8명 | Sub-60: 12명 | 60분+: 2명
├──────────────────────────────────────────┤
│ 🔍 검색 [        ] 🔄 새로고침          │
├──────────────────────────────────────────┤
│ 👥 참가자 목록 (85명)                    │
│ ┌────────────────────────────────────┐   │
│ │ 1. 라우펜더만 (이원기) HALF        │   │
│ │    배번: [12345] 💾                │   │
│ │    기록: 1:45:23 (125위) ✅확정    │   │
│ ├────────────────────────────────────┤   │
│ │ 2. 쌩메 (서윤석) HALF              │   │
│ │    배번: [     ] 💾 (미입력)      │   │
│ │    기록: 대기 중                   │   │
│ ├────────────────────────────────────┤   │
│ │ 3. 디모 (김성한) FULL              │   │
│ │    배번: [99999] 💾                │   │
│ │    기록: ⚠️ 동명이인 2명           │   │
│ │    ◉ 김성한 (45세) 3:28:15        │   │
│ │    ○ 김성한 (52세) 4:12:30        │   │
│ │    [이 기록으로 확정]               │   │
│ └────────────────────────────────────┘   │
├──────────────────────────────────────────┤
│ 📋 대회 정보                             │
│   날짜: 2026-04-19                       │
│   소스: smartchip (202650000123)         │
│   스크랩: ✅ 완료 (2026-04-19 15:05)    │
│   참가자 편집: group.html에서 수정       │
└──────────────────────────────────────────┘
```

---

## 주요 기능

### 1. 통계 요약 (상단)

**전체 통계:**
- 등록 인원 / 확정 인원 / 미확정 인원
- 완주율 (확정 기록 수 / 등록 인원)

**종목별 통계:**
각 종목(FULL/HALF/10K)마다:
- 참가 인원
- 평균 기록 (확정된 기록만)
- 완주 인원
- 기록대별 분포

**기록대 기준:**
- **풀마라톤**: Sub-3(3시간 미만) / Sub-3:30 / Sub-4 / 4시간 이상
- **하프**: Sub-1:30 / Sub-2:00 / 2시간 이상
- **10K**: Sub-40 / Sub-50 / Sub-60 / 60분 이상

### 2. 참가자 목록 테이블

**표시 항목:**
- 순번 (자동)
- 닉네임 (실명)
- 종목
- **배번** (인라인 편집)
- 기록 (넷타임)
- 순위
- 상태 (확정/대기/동명이인/기록없음)

**배번 입력:**
```
배번: [12345] 💾
      ↑
   입력 후 포커스 아웃 또는 Enter → 자동 저장
```

**상태별 UI:**
- ✅ **확정됨**: 기록 표시, 수정 버튼
- ⏸️ **대기 중**: "기록 대기 중" (스크랩 전)
- ⚠️ **동명이인**: 후보 라디오 버튼 + 선택 확정
- 🔴 **기록 없음**: DNS/DNF 버튼 + 직접 입력

### 3. 검색 및 필터

**검색:**
- 닉네임, 실명으로 실시간 필터링
- 배번으로도 검색 가능

**필터 (선택):**
- 종목별 (FULL/HALF/10K)
- 상태별 (전체/확정/미확정)

### 4. 갭 탐지·확정

현재 `group.html`의 갭 탐지 기능을 상세 페이지로 이동:
- 갭 API 호출 → 참가자 목록에 통합 표시
- 일괄 확정 (자동 매칭된 것만)
- 건별 확정 (동명이인 선택)
- DNS/DNF 처리
- 직접 기록 입력

---

## API 설계

### 1. GET detail - 상세 정보 조회

**요청:**
```
GET ?action=group-events&subAction=detail&eventId=evt_2026-04-19_24
```

**응답:**
```javascript
{
  ok: true,
  event: {
    id: "evt_2026-04-19_24",
    eventName: "제24회 경기마라톤대회",
    eventDate: "2026-04-19",
    isGroupEvent: true,
    participants: [
      { memberId: "abc", realName: "이원기", nickname: "라우펜더만", bib: "12345" }
    ],
    groupSource: { source: "smartchip", sourceId: "202650000123" },
    groupScrapeStatus: "done",
    groupScrapeJobId: "smartchip_202650000123"
  },
  gap: [
    { 
      memberId: "abc", 
      realName: "이원기", 
      nickname: "라우펜더만",
      bib: "12345",
      gapStatus: "ok", 
      result: { finishTime: "01:45:23", rank: 125, distance: "half" }
    },
    {
      memberId: "def",
      realName: "김성한",
      nickname: "디모",
      bib: "99999",
      gapStatus: "ambiguous",
      candidates: [
        { finishTime: "03:28:15", rank: 234, age: 45, bib: "99999" },
        { finishTime: "04:12:30", rank: 567, age: 52, bib: "88888" }
      ]
    }
  ],
  stats: {
    total: 85,
    confirmed: 81,
    pending: 4,
    completionRate: 95.3,
    byDistance: {
      full: {
        count: 27,
        finished: 26,
        avgTime: "03:42:15",
        distribution: {
          sub3: 2,
          sub330: 8,
          sub4: 14,
          over4: 2
        }
      },
      half: {
        count: 32,
        finished: 31,
        avgTime: "01:52:30",
        distribution: {
          sub130: 3,
          sub200: 18,
          over200: 10
        }
      },
      "10k": {
        count: 26,
        finished: 24,
        avgTime: "00:58:23",
        distribution: {
          sub40: 2,
          sub50: 8,
          sub60: 12,
          over60: 2
        }
      }
    }
  }
}
```

### 2. POST update-bib - 배번 업데이트

**요청:**
```javascript
POST ?action=group-events
{
  subAction: "update-bib",
  eventId: "evt_2026-04-19_24",
  memberId: "abc123",
  bib: "12345"
}
```

**응답:**
```javascript
{ ok: true }
```

**저장 위치:**
- `race_events/{eventId}.participants[].bib` 필드 추가

---

## 데이터 스키마 변경

### race_events.participants 필드 확장

**기존:**
```javascript
participants: [
  { memberId: "abc", realName: "이원기", nickname: "라우펜더만" }
]
```

**변경 후:**
```javascript
participants: [
  { 
    memberId: "abc", 
    realName: "이원기", 
    nickname: "라우펜더만",
    bib: "12345",              // 신규: 배번 (옵셔널)
    distance: "half",          // 신규: 종목
    updatedAt: "2026-04-15T..." // 신규: 수정 시각
  }
]
```

---

## 구현 범위

### Phase 1: 기본 상세 페이지 (필수)

- [ ] `group-detail.html` 생성
- [ ] 페이지 헤더 (← 뒤로가기, 대회명, 날짜)
- [ ] 통계 섹션 (등록/확정/미확정, 완주율)
- [ ] 종목별 통계 (인원, 평균, 기록대 분포)
- [ ] 참가자 목록 테이블
- [ ] 배번 입력 (인라인 편집 + 자동 저장)
- [ ] API: `detail`, `update-bib`
- [ ] `group.html` 카드 클릭 → 상세 이동

### Phase 2: 갭 탐지·확정 이동 (선택)

현재 `group.html`의 갭 기능을 상세 페이지로 이동:
- [ ] 갭 API 연동
- [ ] 동명이인 선택 UI
- [ ] DNS/DNF 처리
- [ ] 일괄/건별 확정
- [ ] 직접 기록 입력

**트레이드오프:**
- 장점: 상세 페이지에서 모든 작업 완료
- 단점: 구현 복잡도 증가, 기존 group.html 로직 이동

---

## 배번 매칭 로직 (스크래퍼 개선)

### 현재 (realName 기반)

```javascript
// 동명이인 시 ambiguous
if (scrapeResults.filter(r => r.name === realName).length > 1) {
  return { status: "ambiguous", candidates: [...] };
}
```

### 개선 (배번 우선)

```javascript
// 1. 배번이 있으면 배번으로 먼저 매칭
if (participant.bib) {
  const match = scrapeResults.find(r => r.bib === participant.bib);
  if (match) return { status: "ok", result: match }; // 배번 일치 → 확정
}

// 2. 배번 없거나 매칭 실패 → realName 기반 (기존 로직)
const nameMatches = scrapeResults.filter(r => r.name === realName);
if (nameMatches.length === 1) return { status: "ok", result: nameMatches[0] };
if (nameMatches.length > 1) return { status: "ambiguous", candidates: nameMatches };
return { status: "missing" };
```

**효과:**
- 배번 입력한 회원 → 동명이인 자동 해소
- 배번 없는 회원 → 기존 방식 (수동 선택)

---

## 상세 기능 명세

### 1. 통계 계산 로직

**완주율:**
```javascript
completionRate = (확정된 기록 수 / 등록 인원) × 100
```

**평균 기록:**
```javascript
avgTime = 확정된 기록의 finishTime 평균
// DNS/DNF 제외, HH:MM:SS 형식
```

**기록대 분포:**

| 종목 | 구간 |
|------|------|
| FULL | Sub-3 (<3:00:00) / Sub-3:30 / Sub-4 / 4시간+ |
| HALF | Sub-1:30 / Sub-2:00 / 2시간+ |
| 10K | Sub-40 / Sub-50 / Sub-60 / 60분+ |

### 2. 배번 입력 UX

**인라인 편집:**
```html
배번: <input type="text" value="12345" maxlength="6" 
             onblur="saveBib(eventId, memberId, this.value)">
```

**저장 피드백:**
- 성공: 입력란 테두리 초록색 깜빡임 (0.5초)
- 실패: 빨간색 + 에러 메시지

**배번 형식:**
- 숫자만 허용 (1~6자리)
- 빈 값 허용 (삭제)

### 3. 참가자 목록 정렬

**기본 정렬:**
- 종목별 (FULL → HALF → 10K)
- 각 종목 내 기록 빠른 순

**정렬 옵션 (선택):**
- 닉네임순 (가나다)
- 배번순
- 상태별 (미확정 먼저)

---

## 구현 우선순위

### 우선순위 1 (핵심)

1. `group-detail.html` 기본 구조
2. API: `detail` (통계 포함)
3. 통계 섹션 렌더링
4. 참가자 목록 테이블
5. 배번 입력 + API: `update-bib`
6. `group.html` 카드 클릭 이벤트

### 우선순위 2 (향상)

7. 검색 기능
8. 필터 (종목/상태)
9. 정렬 옵션

### 우선순위 3 (선택)

10. 갭 탐지 UI 이동
11. 확정 기능 이동
12. 동명이인 선택 UI

---

## 기술 스택

**Frontend:**
- HTML/CSS/JS (vanilla) - 기존 패턴 일관성
- `API_BASE` 상수 사용
- `fetch` + `showToast` 오류 처리

**Backend:**
- Cloud Functions (Node.js 24)
- Firestore (race_events 컬렉션)

**스타일:**
- 기존 `group.html` CSS 재사용
- 테이블: `report.html` 패턴 참고
- 통계 카드: 그리드 레이아웃

---

## 배번 매칭 구현 (스크래퍼)

### 수정 파일

`functions/lib/scraper.js` - 각 소스별 매칭 로직

### 수정 위치

`triggerGroupScrape` 헬퍼 함수 또는 confirm 시점:

**Option A: 스크랩 시 배번 매칭** (권장)
- `scraper.js`의 각 소스 파서에 배번 매칭 로직 추가
- `memberRealNames` 대신 `memberData: [{ realName, bib }]` 전달

**Option B: 갭 탐지 시 배번 매칭**
- `gap` API에서 배번 기준 재매칭
- 스크래퍼 수정 불필요, 백엔드 로직만 수정

**권장: Option B** (스크래퍼 변경 최소화)

---

## 테스트 시나리오

### 시나리오 1: 배번 있는 회원 (동명이인)

1. 참가자 선택: 김성한(디모) + 김성한2(가명) 등록
2. 상세 페이지: 디모 배번 `12345` 입력
3. 스크랩 실행
4. 갭 조회: 배번 `12345` 매칭 → `ok` (자동 해소)

### 시나리오 2: 배번 없는 회원

1. 참가자 선택: 서윤석(쌩메) 등록
2. 배번 미입력
3. 스크랩 실행
4. 갭 조회: realName만으로 매칭 (기존 방식)

### 시나리오 3: 통계 확인

1. 대회 후 스크랩 완료
2. 상세 페이지 접속
3. 통계 섹션: 완주율, 평균, 기록대 분포 표시
4. 참가자 목록: 기록순 정렬

---

## 제약사항 및 고려사항

### 1. 배번 데이터 신뢰성

- 배번은 **사용자 수동 입력** → 오타 가능
- 검증: 스크랩 결과에 해당 배번이 없으면 경고

### 2. 종목 정보

- 현재 `participants`에 종목 정보 없음
- **추가 필요**: 참가자 선택 시 또는 상세 페이지에서 종목 지정
- 또는 스크랩 결과의 distance로 자동 채움

### 3. 스크랩 전 통계

- 스크랩 전에는 통계 계산 불가
- "기록 대기 중" 안내 표시

### 4. 모바일 대응

- 테이블이 모바일에서 깨질 수 있음
- 반응형 처리 (카드 레이아웃 전환)

---

## 예상 작업량

**추정:**
- Phase 1 (기본): 4-6시간
- Phase 2 (갭 이동): 2-3시간
- 배번 매칭 로직: 1-2시간
- 테스트: 1-2시간

**총**: 8-13시간

---

## 다음 단계

1. ✅ 설계안 작성 완료
2. ⏭️ 구현 계획서 작성 (writing-plans 스킬)
3. ⏭️ 구현 실행 (Phase별 분리)

---

## 참고 문서

- 현재 구현: `group.html`
- API 패턴: `_docs/development/api-patterns.md`
- 기존 계획: `_docs/superpowers/plans/2026-04-06-group-event-pipeline-impl.md`
