# 대회 정보 매핑 시스템 설계

**작성일**: 2026-04-04  
**배경**: 고러닝 등 대회 정보 전용 소스를 race_events와 연결하여, 여러 소스로부터 robust한 대회 정보를 구축

---

## 1. 문제 정의

### 현재 상황
- **기록 사이트** 6개: smartchip, myresult, spct, marazone, ohmyrace, manual
  - 역할: 실제 기록 제공 (이름, 기록, 순위 등)
  - 연결: `race_events.sourceMappings`
- **대회 정보 사이트** 1개: 고러닝
  - 역할: 대회 일정·정보 제공 (기록 제공 ✗)
  - 현황: race_events와 연결 없음 → 사용자가 수동 매칭 필요

### 사용자 제공 데이터
- 16개 수동 매칭: 고러닝 대회 → discovered-events (source, sourceId)
- 예시:
  ```json
  {
    "gorunning": {
      "id": "gorunning_2026-04-04_1",
      "name": "2026 글로컬 건양대학교 K-국방 마라톤",
      "date": "2026-04-04"
    },
    "discovered": {
      "source": "spct",
      "sourceId": "20260404001",
      "name": "k 국방마라톤"
    }
  }
  ```

### 목표
1. **대회 정보 소스 → race_events 연결** (고러닝 우선)
2. **확장 가능한 구조** (미래에 네이버스포츠 등 추가 시)
3. **여러 소스로 교차 검증** (robust한 진실 발견)

---

## 2. 설계 개요

### 핵심 아이디어
**`race_events`를 중심 허브로 사용:**
- 대회 정보 소스 (고러닝, 네이버스포츠, ...) → `race_events`
- 기록 사이트 (spct, smartchip, ...) → `race_events`
- 모든 소스가 하나의 `canonicalEventId`로 수렴

### 아키텍처

```
대회 정보 소스 (기록 ✗)          기록 사이트 (기록 ✓)
├─ 고러닝                        ├─ spct
├─ 네이버스포츠                  ├─ smartchip
└─ 한국마라톤협회                └─ marazone
         │                              │
         └──────────┬───────────────────┘
                    ↓
           race_events (허브)
           evt_2026-04-04_k-defense
                    ↓
           race_results (실제 기록)
```

---

## 3. 데이터 모델

### 3.1 새 컬렉션: `event_info_mappings`

**역할**: 대회 정보 소스 식별자 → canonicalEventId 매핑

**스키마**:
```javascript
{
  // 문서 ID: 자동 생성 (Firestore auto-ID)
  // 이유: 고러닝 ID가 인덱스 기반으로 불안정
  
  // === 대회 정보 소스 식별 ===
  infoSource: string,        // "gorunning", "naversports", ...
  infoSourceId: string,      // 소스의 안정적 식별자
                            // - 고러닝: URL slug (예: "1019", "/races/1019/..." 에서 추출)
                            // - 네이버: API ID
                            // 주의: 현재 gorunning_{date}_{i} 형식은 불안정 (인덱스 밀림)
  infoName: string,         // 소스에서 제공한 대회명 (원본 보존)
  infoDate: string,         // "YYYY-MM-DD"
  infoUrl: string,          // 필수: 소스 페이지 URL (안정적 식별자 추출 원천)
  infoLocation: string?,    // 선택: 지역
  infoDistance: string?,    // 선택: 거리 (예: "풀,하프,10K")
  
  // === 통합 이벤트 연결 ===
  canonicalEventId: string, // race_events 문서 ID (예: "evt_2026-04-04_k-defense")
  
  // === 매핑 메타 ===
  mappedBy: "manual" | "auto_suggested",
  confirmedBy: "operator" | null,  // auto_suggested일 때만 확인 필요
  status: "active" | "rejected",   // 거부 시 "rejected" (삭제하지 않음)
  confidence: number?,             // 0.0~1.0, 자동 매칭 시 유사도 점수
  
  createdAt: string,        // ISO timestamp
  updatedAt: string
}
```

**제약 조건**:
- **(infoSource, infoSourceId, status="active") → 전역 유일**: 
  - 같은 (infoSource, infoSourceId)에 대해 active 매핑은 최대 1개
  - rejected 상태로 전환 후 재등록 시: 기존 rejected 문서는 유지, 새 active 문서 생성
  - 쿼리: `WHERE infoSource == X AND infoSourceId == Y AND status == "active"`
- 하나의 (infoSource, infoSourceId)는 **최대 하나의 active canonicalEventId**만 가짐
- 하나의 canonicalEventId는 **여러 대회 정보 매핑** 가질 수 있음 (다대일)

**인덱스**:
- `(infoSource, infoSourceId)` 복합 유니크 (중복 방지)
- `canonicalEventId` (역조회: "이 evt에 연결된 정보 소스는?")
- `infoDate, mappedBy, status` (날짜 범위 + 미확인 매핑 조회)

---

### 3.2 기존 컬렉션: `race_events` (변경 없음)

**역할**: 통합 대회 엔티티 (SSOT)

**스키마**:
```javascript
{
  id: string,               // canonicalEventId (예: "evt_2026-04-04_k-defense")
  primaryName: string,      // 정본 대회명
  eventDate: string,        // "YYYY-MM-DD"
  
  // 기록 사이트 매핑 (기존)
  sourceMappings: [
    { source: "spct", sourceId: "20260404001" },
    { source: "smartchip", sourceId: "202650000040" }
  ],
  
  createdAt: string
}
```

**참고**: 대회 정보 소스는 `sourceMappings`에 **넣지 않음** (역할 분리)

---

### 3.3 기존 파일: `discovered-events-YYYY.json` (변경 없음)

**역할**: 기록 사이트별 향후 대회 목록 (스크랩 가능)

**형식**:
```json
{
  "year": 2026,
  "events": [
    {
      "source": "spct",
      "sourceId": "20260404001",
      "name": "k 국방마라톤",
      "date": "2026-04-04",
      "distances": "풀,하프",
      "location": "논산"
    }
  ]
}
```

---

## 4. 워크플로우

### 4.1 초기 매핑 투입 (16개 수동 매핑)

**입력**: `gorunning-mappings-2026-04-04.json` (사용자 제공)

**처리 로직**:
```
FOR EACH 매핑 IN 16개:
  1. 고러닝 URL에서 안정적 ID 추출
     - URL 형식: https://gorunning.kr/races/1019/...
     - infoSourceId: "1019" (URL slug)
     
  2. discovered-events에서 (source, sourceId) 찾기
  
  3. race_events에서 해당 sourceMappings 있는지 확인
     - 있으면: 기존 canonicalEventId 사용
     - 없으면:
       a. 날짜+이름 유사도로 기존 race_events 검색
       b. 매칭 실패 시: 새 canonicalEventId 생성 (스텁)
          - evt_{date}_{slug} 형식
          - primaryName, eventDate 설정
          - sourceMappings는 빈 배열 (기록 아직 없음)
          
  4. event_info_mappings 문서 생성
     - 문서 ID: Firestore auto-ID (자동 생성)
     - infoSource: "gorunning"
     - infoSourceId: URL slug (예: "1019")
     - infoUrl: 원본 URL (필수)
     - canonicalEventId: 위에서 찾은/생성한 ID
     - mappedBy: "manual"
     - status: "active"
```

**스텁 race_events 예시**:
```javascript
{
  id: "evt_2026-04-04_k-defense",
  primaryName: "k 국방마라톤",  // discovered-events.name 사용
  eventDate: "2026-04-04",
  sourceMappings: [],  // 아직 기록 없음 (향후 스크랩 시 추가)
  createdAt: "2026-04-04T..."
}
```

---

### 4.2 ops-gorunning-events API 수정

**현재**:
```json
{
  "id": "gorunning_2026-04-04_1",
  "name": "2026 K-국방 마라톤",
  "matchStatus": "discovered",
  "matchedEvent": {
    "source": "spct",
    "sourceId": "20260404001"
  }
}
```

**변경 후**:
```json
{
  "id": "gorunning_1019",          // URL slug 기반 (안정적)
  "name": "2026 K-국방 마라톤",
  "url": "https://gorunning.kr/races/1019/...",
  "matchStatus": "mapped",         // 새 상태 추가
  "canonicalEventId": "evt_2026-04-04_k-defense",
  "recordSources": [               // race_events.sourceMappings 기반
    { "source": "spct", "sourceId": "20260404001" },
    { "source": "smartchip", "sourceId": "202650000040" }
  ]
}
```

**매칭 우선순위 (결정 트리)**:
```
1. event_info_mappings 조회 (고러닝 URL slug → canonicalEventId)
   ├─ 매핑 없음 → 4번으로
   └─ 매핑 있음 → 2번으로
   
2. 매핑된 race_events의 sourceMappings 확인
   ├─ sourceMappings 있음 (기록 사이트 연결됨) → mapped
   └─ sourceMappings 비어있음 (스텁만) → 3번으로
   
3. scrape_jobs 별도 매칭 확인
   ├─ scrape_jobs 매칭 있음 → mapped_with_jobs (스텁 + 별도 잡)
   └─ 없음 → mapped_pending (스텁만, 기록 아직 없음)
   
4. 기존 로직 (매핑 없을 때)
   ├─ scrape_jobs 매칭 → scraped
   ├─ discovered-events 매칭 → discovered
   └─ 없음 → not_matched
```

**응답 예시**:

```javascript
// 케이스 1: mapped (매핑 + sourceMappings 있음)
{
  "matchStatus": "mapped",
  "canonicalEventId": "evt_2026-04-04_k-defense",
  "recordSources": [
    { "source": "spct", "sourceId": "20260404001" },
    { "source": "smartchip", "sourceId": "202650000040" }
  ]
}

// 케이스 2: mapped_pending (매핑 있지만 sourceMappings 비어있음)
{
  "matchStatus": "mapped_pending",
  "canonicalEventId": "evt_2026-04-04_k-defense",
  "recordSources": []
}

// 케이스 3: mapped_with_jobs (스텁 + 별도 scrape_jobs 매칭)
{
  "matchStatus": "mapped_with_jobs",
  "canonicalEventId": "evt_2026-04-04_k-defense",
  "recordSources": [],
  "matchedJob": {  // scrape_jobs 매칭 정보
    "jobId": "spct_20260404001",
    "source": "spct",
    "sourceId": "20260404001"
  }
}
```

**중요**: 매핑과 스크랩이 동시 존재하는 경우는 **운영자 검토 필요**
- UI에서 두 정보 모두 표시 (매핑된 evt + 별도 잡)
- 운영자가 잡을 evt에 통합하거나, 별도 유지 결정

---

### 4.3 미래: 두 번째 정보 소스 추가 (네이버스포츠)

**단계**:
```
1. 네이버스포츠 크롤러 구현
   - discoverNaverSports(year) 함수
   - 결과: [{ name, date, url, ... }]

2. 자동 매칭 (날짜 ±2일 + 이름 유사도 > 0.7)
   - race_events 전체 검색
   - confidence 점수 계산

3. event_info_mappings 생성
   - mappedBy: "auto_suggested"
   - confirmedBy: null (운영자 확인 필요)
   - status: "active"

4. ops 화면에 "확인 필요" 큐 표시
   - 운영자가 승인 → confirmedBy: "operator"
   - 거부 → status: "rejected" (문서는 유지, 감사 추적용)
```

---

### 4.4 최종 결과: 교차 검증

**예시**: evt_2026-04-04_k-defense

```
race_events (evt_2026-04-04_k-defense)
├─ primaryName: "k 국방마라톤"
├─ eventDate: "2026-04-04"
└─ sourceMappings:
   ├─ spct_20260404001       ← 기록 사이트
   └─ smartchip_202650000040 ← 기록 사이트

event_info_mappings (이 evt를 가리키는 문서들)
├─ gorunning_1019
│  └─ infoName: "2026 글로컬 건양대학교 K-국방 마라톤"
└─ naversports_m2026040401
   └─ infoName: "논산 K-국방 마라톤"
```

**해석**:
- 2개 대회 정보 소스에서 동일 대회 확인
- 2개 기록 사이트에서 기록 수집
- → 4개 소스로 교차 검증된 "진실"

---

## 5. 구현 고려사항

### 5.1 미래 대회 처리

**문제**: discovered-events에는 있지만 race_events 없는 미래 대회

**해결**: **얇은 race_events 스텁** 생성 (섹션 4.1 참조)
- `sourceMappings` 빈 배열로 시작
- 향후 스크랩 시 `sourceMappings` 추가
- 허브 모델 유지

---

### 5.2 날짜 검증 규칙

**제약**: race_events.eventDate와 event_info_mappings.infoDate의 차이가 **7일 이상**이면:
- 자동 매칭 거부
- 수동 매핑 시 스크립트에서 경고 출력 (실행은 허용)
- **Phase 1 범위**: 스크립트 검증 + 경고만 (UI 블로킹 없음)

**이유**: 같은 대회가 날짜가 크게 다를 경우, 오매칭일 가능성 높음

---

### 5.3 (infoSource, infoSourceId) 유일성

**강제 방법**:
- Firestore 복합 유니크 인덱스 생성: `(infoSource, infoSourceId)`
- Cloud Functions에서 중복 체크 후 생성

**검증**:
```javascript
const snap = await db.collection("event_info_mappings")
  .where("infoSource", "==", infoSource)
  .where("infoSourceId", "==", infoSourceId)
  .where("status", "==", "active")
  .get();

if (!snap.empty) {
  throw new Error(`이미 매핑된 (${infoSource}, ${infoSourceId})`);
}

// 새 문서 생성 (auto-ID)
const ref = db.collection("event_info_mappings").doc();
await ref.set({ infoSource, infoSourceId, ... });
```

---

### 5.4 저신뢰 매핑 워크플로우

**자동 매칭 시**:
- `confidence < 0.8`: `mappedBy: "auto_suggested"`, `confirmedBy: null`, `status: "active"`
- ops 화면에 "확인 필요" 큐로 표시
- 운영자 액션:
  - ✅ 승인: `confirmedBy: "operator"` 업데이트
  - ❌ 거부: `status: "rejected"` 업데이트 (문서 삭제하지 않음, 감사 추적용)

---

### 5.5 UI 변경 범위

**ops.html 수정**:
1. 고러닝 이벤트 행에 `canonicalEventId` 표시
   - 링크: `races.html?highlight={canonicalEventId}`로 이동
2. 매칭 상태 표시:
   - ✅ `mapped`: 매핑 + sourceMappings 있음
   - ⏳ `mapped_pending`: 매핑 있지만 sourceMappings 비어있음
   - ⚠️ `mapped_with_jobs`: 매핑 + 별도 scrape_jobs 존재 (검토 필요)
   - ✅ `scraped`: scrape_jobs에 있음 (기존)
   - 🔍 `discovered`: discovered-events에 있음 (기존)
   - ❓ `not_matched`: 없음 (기존)
3. "확인 필요" 탭 추가 (자동 제안 매핑 목록)

**races.html 수정** (Phase 1 포함):
- 쿼리 파라미터 `highlight` 처리 추가
- URL 예: `races.html?highlight=evt_2026-04-04_k-defense`
- 해당 canonicalEventId 카드로 스크롤 + 시각적 강조 (예: 테두리, 배경색)

---

## 6. 단계적 구현 전략

### Phase 1: MVP (초기 16개 매핑)
- [ ] `event_info_mappings` 컬렉션 생성 + 인덱스 설정
- [ ] 16개 수동 매핑 스크립트 작성 (섹션 4.1)
- [ ] `ops-gorunning-events` API 수정 (섹션 4.2)
- [ ] ops.html UI 업데이트 (매핑 상태 표시)
- [ ] **races.html 쿼리 파라미터 처리** (`?highlight=canonicalEventId`)

### Phase 2: 자동 매칭
- [ ] 날짜+이름 유사도 로직 개선
- [ ] 저신뢰 매핑 큐 UI (확인 필요 탭)
- [ ] 운영자 승인/거부 API

### Phase 3: 두 번째 소스 추가
- [ ] 네이버스포츠 또는 다른 정보 소스 크롤러
- [ ] 교차 검증 로직 (2개 이상 소스 → 신뢰도 ↑)

---

## 7. 데이터 사전 업데이트

### event_info_mappings (컬렉션)

| 필드 | 타입 | 설명 |
|------|------|------|
| `infoSource` | string | 대회 정보 소스 ("gorunning", "naversports", ...) |
| `infoSourceId` | string | 소스의 안정적 식별자 (고러닝: URL slug) |
| `infoName` | string | 소스에서 제공한 대회명 (원본) |
| `infoDate` | string | "YYYY-MM-DD" |
| `infoUrl` | string | 필수: 소스 페이지 URL |
| `infoLocation` | string? | 선택: 지역 |
| `infoDistance` | string? | 선택: 거리 (예: "풀,하프,10K") |
| `canonicalEventId` | string | race_events 문서 ID |
| `mappedBy` | "manual" \| "auto_suggested" | 매핑 방식 |
| `confirmedBy` | "operator" \| null | 자동 제안 확인 여부 |
| `status` | "active" \| "rejected" | 활성/거부 상태 |
| `confidence` | number? | 0.0~1.0, 자동 매칭 유사도 |
| `createdAt` | string | ISO timestamp |
| `updatedAt` | string | ISO timestamp |

**제약**:
- 문서 ID: Firestore auto-ID (자동 생성)
- `(infoSource, infoSourceId, status="active")` 복합 유니크 인덱스
- `(infoSource, infoSourceId)` → 최대 하나의 active `canonicalEventId`
- `canonicalEventId` → 여러 매핑 가능 (다대일)

---

## 8. 검증 체크리스트

- [ ] 16개 수동 매핑이 모두 정상 투입되는가?
- [ ] race_events 스텁이 정상 생성되는가? (sourceMappings 빈 배열)
- [ ] ops-gorunning-events API가 canonicalEventId를 반환하는가?
- [ ] 날짜 검증 (±7일) 규칙이 작동하는가?
- [ ] (infoSource, infoSourceId) 중복 생성이 차단되는가?
- [ ] 자동 매칭 저신뢰 큐가 표시되는가?

---

## 9. 참고

- 기존 구조: `_docs/knowledge/data-dictionary.md`
- 고러닝 매칭 조사: `_docs/investigations/2026-04-04-ops-urgent-issues.md`
- 수동 매핑 데이터: `gorunning-mappings-2026-04-04.json` (레포 루트에 배치 예정)
- 현재 고러닝 크롤러: `functions/lib/scraper.js` (crawlGorunningEvents)
