# 그룹 대회 재확정 기능 테크 스팩

**작성일**: 2026-04-20  
**작성자**: AI Assistant  
**상태**: Draft

## 1. 개요

### 목적

그룹 대회 확정 후 잘못된 기록(DNS/DNF 누락, 코스 오류 등)을 수정할 수 있는 재확정 기능 구현

### 핵심 원칙

- **SSOT (Single Source of Truth)**: `race_results`는 1명당 1개 기록만 존재
- **단순 덮어쓰기**: 재확정 시 무조건 덮어쓰기 (Last Write Wins)
- **운영자 최종 권한**: 개인이 수정한 기록도 운영자 재확정으로 덮어씀
- **기존 UI 재사용**: 스크랩 → 매칭 → 확정 플로우 활용

### 중요: 기존 구현 확인

**2개 API 모두 재확정 로직 구현되어 있음:**

1. **`confirm` API** (`functions/index.js` 라인 1827-1836)
   - 개인 스크랩 재확정
   - `jobId` 기준 기존 문서 삭제 후 재생성
   - SSOT 원칙: 무조건 덮어쓰기

2. **`bulk-confirm` API** (`functions/index.js` 라인 2954-2968)
   - 그룹 대회 재확정
   - `canonicalEventId` 기준 기존 문서 삭제 후 재생성
   - SSOT 원칙: 무조건 덮어쓰기

본 스팩은 **UI 개선** (재검토 모드, 코스 변경, PB 체크)에 집중

---

## 2. 사용자 스토리

### 시나리오 1: DNS/DNF 처리

```
운영자가 확정 후 "홍길동이 실제로는 DNS였다"는 것을 알게 됨
→ "재검토" 모드 진입 → 홍길동 행의 "⋮" 메뉴 → "DNS 처리" 선택
→ "재확정" 클릭 → 기존 기록 삭제, 새 상태로 저장
```

### 시나리오 2: 코스 변경

```
김영희가 현장에서 Full → Half로 변경했는데 Full로 확정됨
→ "재검토" 모드 진입 → 김영희 행의 "⋮" → "코스 변경" → Half 선택
→ "재확정" 클릭 → docId 변경 (김영희_full_2026-04-19 → 김영희_half_2026-04-19)
```

---

## 3. 기능 요구사항

### 3.1 프론트엔드 (group-detail.html)

#### 3.1.1 재검토 모드 진입

```javascript
// 조건: 확정된 기록 존재
async function loadEventDetail(eventId) {
  const response = await fetch(`${API_BASE}?action=group-events&subAction=detail&eventId=${eventId}`);
  const data = await response.json();
  
  currentEvent = data.event;
  
  // 확정된 기록이 있으면 재검토 버튼 표시
  if (data.hasConfirmedResults) {
    showReviewButton();
  }
}

function showReviewButton() {
  const reviewBtn = document.createElement('button');
  reviewBtn.className = 'btn btn-outline';
  reviewBtn.textContent = '🔍 확정된 기록 재검토';
  reviewBtn.onclick = enterReviewMode;
  
  document.querySelector('.event-actions').appendChild(reviewBtn);
}

// 클릭 시
async function enterReviewMode() {
  // 1. race_results에서 기존 확정 기록 로드 (이미 detail API에 포함)
  const confirmedResults = currentEvent.confirmedResults || [];
  
  // 2. gapResults 재구성
  gapResults = reconstructGapFromConfirmed(confirmedResults, currentEvent.participants);
  
  // 3. 편집 가능 상태로 UI 렌더링
  renderParticipantList(gapResults);
  
  // 4. 버튼 표시 변경
  bulkConfirmBtn.textContent = "재확정 (수정 저장)";
  bulkConfirmBtn.dataset.reviewMode = "true";
}
```

#### 3.1.2 코스 변경 UI

```html
<!-- 코스 변경 모달 -->
<div id="distanceChangeModal" class="modal-backdrop">
  <div class="modal">
    <div class="modal-header">
      <h2>코스 변경</h2>
      <button type="button" class="modal-close">×</button>
    </div>
    <div class="modal-body">
      <div class="warning-box">
        ⚠️ 코스를 변경하면 재확정 시 기존 기록이 삭제되고 새 기록으로 저장됩니다.
      </div>
      <div class="form-group">
        <label>현재 참가자</label>
        <div id="distanceChangeTarget">{닉네임} ({실명})</div>
      </div>
      <div class="form-group">
        <label>현재 코스</label>
        <div id="distanceChangeCurrent">{현재 코스}</div>
      </div>
      <div class="form-group">
        <label>변경할 코스</label>
        <select id="distanceChangeSelect">
          <option value="full">풀 마라톤 (Full)</option>
          <option value="half">하프 마라톤 (Half)</option>
          <option value="10K">10K</option>
          <option value="30K">30K</option>
          <option value="5K">5K</option>
          <option value="3K">3K</option>
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost">취소</button>
      <button type="button" class="btn btn-primary" id="distanceModalConfirm">변경</button>
    </div>
  </div>
</div>
```

#### 3.1.3 컨텍스트 메뉴 확장

```javascript
// "⋮" 메뉴에 "코스 변경" 추가
const contextMenuItems = [
  { action: 'reselect', icon: '🔄', label: '다른 기록 선택' },
  { action: 'change-distance', icon: '🏁', label: '코스 변경' }, // ← 추가
  { action: 'dns', icon: '❌', label: 'DNS 처리', danger: true },
  { action: 'dnf', icon: '⚠️', label: 'DNF 처리', danger: true },
  { action: 'manual', icon: '✏️', label: '직접 입력' },
];

// 코스 변경 핸들러
if (action === 'change-distance') {
  openDistanceChangeModal(rowId, gapResults[idx]);
}
```

**참고**: 배번 양도 기능은 별도 스팩으로 분리 예정

#### 3.1.4 재확정 플로우

```javascript
// "재확정" 버튼 클릭 시
async function handleBulkConfirm() {
  const isReviewMode = bulkConfirmBtn.dataset.reviewMode === "true";
  
  if (isReviewMode) {
    // 경고 다이얼로그
    const ok = confirm(
      '재확정하시겠습니까?\n\n' +
      '⚠️ 운영자가 확정한 기존 기록이 모두 삭제되고 현재 내용으로 저장됩니다.\n' +
      '(개인이 직접 확정한 기록은 보존됩니다)\n\n' +
      '이 작업은 되돌릴 수 없습니다.'
    );
    
    if (!ok) return;
  }
  
  // API 호출
  const response = await fetch(`${API_BASE}?action=group-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subAction: 'bulk-confirm',
      eventId: currentEventId,
      confirmSource: 'operator',
      results: gapResults.filter(g => g.gapStatus === 'ok').map(g => ({
        realName: g.realName,
        nickname: g.nickname,
        distance: g.distance, // ← 변경된 코스 반영
        finishTime: g.result?.netTime || g.manualTime || '',
        gunTime: g.result?.gunTime || '',
        bib: g.bib || '',
        overallRank: g.result?.overallRank || null,
        gender: g.gender || '',
        dnStatus: g.dnStatus || null,
      }))
    })
  });
  
  const data = await response.json();
  
  if (data.ok) {
    showToast(`✅ ${data.saved}건 저장 완료`);
    location.reload();
  } else {
    showToast(`❌ 저장 실패: ${data.error}`, true);
  }
}
```

### 3.2 백엔드 (functions/index.js)

#### 중요: 기존 구현 확인

**2개 API 모두 구현되어 있음:**

1. **`confirm` API** (개인 스크랩)
   - **2026-04-20 수정 완료**: `confirmSource` 필터 추가
   - `jobId` + `confirmSource` 기준으로 같은 source 내에서만 덮어쓰기

2. **`bulk-confirm` API** (그룹 대회)
   - **2026-04-20 수정 완료**: `confirmSource` 필터 추가
   - 본 스팩의 대상 API

#### 3.2.1 bulk-confirm API 수정 (✅ 완료, 2026-04-20)

**수정 위치**: `functions/index.js` 라인 1830, 2957

**✅ 2026-04-20 수정 완료:**

**1. confirm API (개인 스크랩)**:
```javascript
const sourceToDelete = confirmSource || "operator";
const oldResultsSnap = await db.collection("race_results")
  .where("jobId", "==", canonicalJobId)
  .where("confirmSource", "==", sourceToDelete)  // ← 추가
  .get();

console.log(`[confirm] 삭제 대상: ${oldResultsSnap.size}건 (${sourceToDelete}만)`);
```

**2. bulk-confirm API (그룹 대회)**:
```javascript
const oldResultsSnap = await db.collection("race_results")
  .where("canonicalEventId", "==", eventId)
  .where("confirmSource", "==", "operator")  // ← 추가: 개인 확정 기록 보호
  .get();

console.log(`[bulk-confirm] 삭제 대상: ${oldResultsSnap.size}건 (operator만, personal 제외)`);
```

#### 3.2.2 detail API 수정 (P1, 필수)

**추가 필요**: `hasConfirmedResults` 플래그

**수정 위치**: `functions/index.js` 라인 2935 (detail API 응답 부분)

```javascript
return res.json({
  ok: true,
  event,
  gap,
  confirmedCount,
  hasConfirmedResults: confirmedCount > 0,  // ← 추가
  stats,
});
```

---

  if (!eventId || !Array.isArray(results) || results.length === 0) {
    return res.status(400).json({ ok: false, error: "eventId and results[] required" });
  }

  const eventDoc = await db.collection("race_events").doc(eventId).get();
  if (!eventDoc.exists) {
    return res.status(404).json({ ok: false, error: "대회 없음" });
  }

  const event = eventDoc.data();
  const eventDate = event.eventDate || "";
  const eventName = event.primaryName || event.eventName || "";

  try {
    // ✅ Step 1: replaceMode 시 기존 문서 전체 삭제
    if (replaceMode) {
      console.log(`[bulk-confirm] replaceMode: 기존 기록 삭제 시작 (eventId: ${eventId})`);

```
  const oldResultsSnap = await db.collection("race_results")
    .where("canonicalEventId", "==", eventId)
    .get();
  
  console.log(`[bulk-confirm] 삭제 대상: ${oldResultsSnap.size}건`);
  
  // 500개씩 배치 삭제
  const BATCH_SIZE = 500;
  const oldDocs = oldResultsSnap.docs;
  
  for (let i = 0; i < oldDocs.length; i += BATCH_SIZE) {
    const deleteBatch = db.batch();
    oldDocs.slice(i, i + BATCH_SIZE).forEach(doc => {
      deleteBatch.delete(doc.ref);
    });
    await deleteBatch.commit();
  }
  
  console.log(`[bulk-confirm] 기존 기록 삭제 완료`);
}

// ✅ Step 2: 새 문서 생성 (기존 로직과 동일)
let saved = 0;
const errors = [];

for (let i = 0; i < results.length; i += BATCH_SIZE) {
  const batch = db.batch();
  const chunk = results.slice(i, i + BATCH_SIZE);
  
  for (const participant of chunk) {
    try {
      const { realName, nickname, distance, finishTime, dnStatus } = participant;
      
      if (!realName) {
        errors.push("realName 누락");
        continue;
      }
      
      // docId 생성 (변경된 distance 반영)
      // 코스 변경 시: 기존 docId는 위 삭제 로직에서 이미 삭제됨
      // 예: 홍길동_full_2026-04-19 (삭제) → 홍길동_half_2026-04-19 (생성)
      const safeDate = eventDate.replace(/[^0-9\-]/g, "");
      const safeName = realName.replace(/[^a-zA-Z0-9가-힣]/g, "_");
      const distNorm = normalizeRaceDistance(distance);
      const safeDist = (distNorm || "").replace(/[^a-zA-Z0-9]/g, "_");
      const docId = `${safeName}_${safeDist}_${safeDate}`;
      
      const finishTrim = String(finishTime || "").trim();
      const netEff = effectiveNetTimeForConfirm(participant);
      
      const row = {
        jobId: event.groupScrapeJobId || eventId,
        canonicalEventId: eventId,
        eventName,
        eventDate,
        source: event.groupSource?.source || "manual",
        sourceId: event.groupSource?.sourceId || "",
        memberRealName: realName,
        memberNickname: nickname || realName,
        distance: distNorm,
        netTime: netEff,
        gunTime: participant.gunTime || "",
        bib: participant.bib || "",
        overallRank: participant.overallRank || null,
        gender: participant.gender || "",
        pbConfirmed: false,
        isGuest: false,
        note: participant.note || "",
        status: dnStatus ? dnStatus.toLowerCase() : "confirmed",
        confirmedAt: new Date().toISOString(),
        confirmSource: confirmSource || "operator",
      };
      
      if (!dnStatus && finishTrim && finishTrim !== "-") {
        row.finishTime = finishTrim;
      }
      
      batch.set(db.collection("race_results").doc(docId), row);
      saved++;
    } catch (err) {
      console.error(`[bulk-confirm] 참가자 저장 실패:`, err);
      errors.push(`${participant.realName}: ${err.message}`);
    }
  }
  
  await batch.commit();
}

// ✅ Step 3: race_events 상태 업데이트
await db.collection("race_events").doc(eventId).update({
  groupScrapeStatus: "done",
  lastConfirmedAt: new Date().toISOString(),
});

console.log(`[bulk-confirm] 완료: ${saved}건 저장, ${errors.length}건 오류`);

return res.json({
  ok: true,
  saved,
  errors: errors.length > 0 ? errors : undefined,
  message: replaceMode ? `재확정 완료: ${saved}건 저장` : `확정 완료: ${saved}건 저장`,
});
```

  } catch (error) {
    console.error("[bulk-confirm] 오류:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}

```

---

## 4. 데이터 모델

### 4.1 race_results 컬렉션
```javascript
{
  // 기존 필드
  jobId: "group_evt_2026-04-19_24",
  canonicalEventId: "evt_2026-04-19_24", // 그룹 대회 식별자
  eventName: "제24회 경기마라톤대회",
  eventDate: "2026-04-19",
  source: "spct",
  sourceId: "2410019",
  memberRealName: "홍길동",
  memberNickname: "길동이",
  distance: "full", // ← 코스 변경 시 변경됨
  netTime: "03:45:23",
  gunTime: "03:45:30",
  bib: "12345",
  overallRank: 150,
  gender: "M",
  status: "confirmed", // 또는 "dns", "dnf"
  confirmedAt: "2026-04-20T10:00:00Z",
  confirmSource: "operator", // 또는 "personal" (재확정 시 "operator"만 삭제됨)
  pbConfirmed: false,
  isGuest: false,
  note: "",
  
  // 감사 로그 (선택)
  lastModified: "2026-04-21T15:30:00Z",
  modifiedBy: "operator",
}
```

### 4.2 race_events 컬렉션

```javascript
{
  // 기존 필드
  eventName: "제24회 경기마라톤대회",
  primaryName: "제24회 경기마라톤대회",
  eventDate: "2026-04-19",
  isGroupEvent: true,
  participants: [...],
  groupSource: { source: "spct", sourceId: "2410019" },
  groupScrapeStatus: "done",
  groupScrapeJobId: "...",
  
  // 추가 필드
  lastConfirmedAt: "2026-04-21T15:30:00Z", // 마지막 확정 시각
  
  // 변경 이력 (선택)
  confirmHistory: [
    {
      confirmedAt: "2026-04-20T10:00:00Z",
      confirmedBy: "operator",
      resultCount: 85,
      replaceMode: false,
    },
    {
      confirmedAt: "2026-04-21T15:30:00Z",
      confirmedBy: "operator",
      resultCount: 83,
      replaceMode: true,
      note: "DNS 2명 추가, 코스 변경 1명"
    }
  ]
}
```

---

## 5. API 명세

### 5.1 bulk-confirm (수정)

```
POST /race?action=group-events
Content-Type: application/json

Request:
{
  "subAction": "bulk-confirm",
  "eventId": "evt_2026-04-19_24",
  "confirmSource": "operator",  // 재확정 시 이 값의 기존 기록만 삭제됨
  "results": [
    {
      "realName": "홍길동",
      "nickname": "길동이",
      "distance": "half",  // ← 변경된 코스
      "finishTime": "01:45:23",
      "gunTime": "01:45:30",
      "bib": "12345",
      "overallRank": 50,
      "gender": "M",
      "dnStatus": null
    },
    // ...
  ]
}

Response (성공):
{
  "ok": true,
  "saved": 83,
  "errors": [],
  "message": "재확정 완료: 83건 저장"
}

Response (실패):
{
  "ok": false,
  "error": "eventId required"
}
```

---

## 6. UI 스크린샷 (Mock)

### 6.1 재검토 버튼

```
┌─────────────────────────────────────────────┐
│ 제24회 경기마라톤대회                        │
│ 📅 2026-04-19  ✅ 완료                      │
├─────────────────────────────────────────────┤
│ 참가자: 김철수, 이영희, 박민수 외 82명       │
│ 기록 소스: ✅ SPCT (2410019)                │
├─────────────────────────────────────────────┤
│ [🔍 확정된 기록 재검토]  [📊 기록 보기]     │ ← 버튼 추가
└─────────────────────────────────────────────┘
```

### 6.2 코스 변경 모달

```
┌─────────────────────────────────────────────┐
│ 코스 변경                               × │
├─────────────────────────────────────────────┤
│                                             │
│ ⚠️ 코스를 변경하면 재확정 시 기존 기록이    │
│    삭제되고 새 기록으로 저장됩니다.          │
│                                             │
│ 현재 참가자                                 │
│ 홍길동 (홍길동)                             │
│                                             │
│ 현재 코스                                   │
│ 풀 마라톤 (Full)                            │
│                                             │
│ 변경할 코스                                 │
│ [하프 마라톤 (Half) ▼]                     │
│                                             │
├─────────────────────────────────────────────┤
│                      [취소]  [변경]         │
└─────────────────────────────────────────────┘
```

### 6.3 재확정 경고

```
┌─────────────────────────────────────────────┐
│ 재확정하시겠습니까?                          │
│                                             │
│ ⚠️ 운영자가 확정한 기존 기록이 모두 삭제되고 │
│    현재 내용으로 저장됩니다.                │
│    (개인이 직접 확정한 기록은 보존됩니다)    │
│                                             │
│    이 작업은 되돌릴 수 없습니다.            │
│                                             │
│             [취소]  [재확정]                │
└─────────────────────────────────────────────┘
```

---

## 7. 테스트 케이스

### 7.1 재확정 기본 플로우

```
Given: 그룹 대회가 확정된 상태
When: "확정된 기록 재검토" 버튼 클릭
Then: 
  - 기존 race_results 로드
  - gapResults 재구성
  - 편집 가능한 UI 표시
  - "재확정" 버튼으로 변경
```

### 7.2 코스 변경

```
Given: 재검토 모드 진입 완료
When: 홍길동 행의 "⋮" → "코스 변경" → Half 선택 → 재확정
Then:
  - 기존 docId 삭제: "홍길동_full_2026-04-19"
  - 새 docId 생성: "홍길동_half_2026-04-19"
  - distance: "half"로 저장
```

### 7.3 DNS 처리

```
Given: 재검토 모드 진입 완료
When: 이영희 행의 "⋮" → "DNS 처리" → 재확정
Then:
  - status: "dns"
  - netTime, gunTime 비어있음
  - 기존 기록 덮어쓰기
```

### 7.4 경고 다이얼로그

```
Given: 재검토 모드에서 수정 완료
When: "재확정" 버튼 클릭
Then:
  - 확인 다이얼로그 표시
  - "취소" 클릭 시 아무 동작 없음
  - "재확정" 클릭 시 API 호출
```

### 7.5 개인 확정 기록 보존 (P0, 필수 테스트)

```
Given: 
  - 운영진이 그룹 대회 확정 (홍길동, 이영희, 박철수)
  - 홍길동이 my.html에서 자신의 기록 수정 → confirmSource: "personal"
When: 운영진이 재확정
Then:
  - 이영희, 박철수 기록 삭제 후 재생성 (confirmSource: "operator")
  - 홍길동 기록은 삭제되지 않음 (confirmSource: "personal" 보존)
  - races.html에서 홍길동은 개인 수정 내용, 이영희/박철수는 재확정 내용 표시
```

### 7.6 코스 변경으로 인한 개인 확정 기록 docId 변경

```
Given:
  - 운영진이 홍길동을 Full로 확정 → docId: "홍길동_full_2026-04-19", confirmSource: "operator"
  - 홍길동이 my.html에서 본인 기록 수정 → 같은 docId 덮어쓰기, confirmSource: "personal"
When: 운영진이 재검토 모드에서 홍길동 코스를 Half로 변경 후 재확정
Then:
  - "홍길동_full_2026-04-19" 삭제 시도 → confirmSource가 "personal"이므로 삭제 안됨
  - "홍길동_half_2026-04-19" 생성 → confirmSource: "operator"
  - 결과: 2개 문서 존재 (Full 개인확정 + Half 운영자확정)
  - 주의: 이 케이스는 수동 정리 필요 (향후 개선)
```

---

## 8. 예외 처리

### 8.1 네트워크 오류

```javascript
try {
  const response = await fetch(...);
  const data = await response.json();
  // ...
} catch (error) {
  showToast(`❌ 네트워크 오류: ${error.message}`, true);
  console.error(error);
}
```

### 8.2 API 오류

```javascript
if (!data.ok) {
  showToast(`❌ 저장 실패: ${data.error}`, true);
  return;
}
```

### 8.3 미처리 행 확인

```javascript
const unprocessed = gapResults.filter(g => 
  g.gapStatus !== 'ok' && g.gapStatus !== 'missing'
);

if (unprocessed.length > 0) {
  showToast(`⚠️ 미처리 ${unprocessed.length}명이 있습니다`, true);
  return;
}
```

---

## 9. 보안 고려사항

### 9.1 권한 검증

```javascript
// 백엔드에서 오너 권한 확인 (기존과 동일)
const expectedOwnerPw = process.env.DMC_OWNER_PW;
if (!expectedOwnerPw || ownerPw !== expectedOwnerPw) {
  return res.status(403).json({ ok: false, error: "오너 권한 필요" });
}
```

### 9.2 입력 검증

```javascript
// eventId, results 배열 필수
if (!eventId || !Array.isArray(results) || results.length === 0) {
  return res.status(400).json({ ok: false, error: "eventId and results[] required" });
}

// 각 참가자 realName 필수
if (!participant.realName) {
  errors.push("realName 누락");
  continue;
}
```

---

## 10. 성능 고려사항

### 10.1 배치 삭제

```javascript
// 500개씩 배치로 삭제 (Firestore 제한)
const BATCH_SIZE = 500;
for (let i = 0; i < oldDocs.length; i += BATCH_SIZE) {
  const deleteBatch = db.batch();
  oldDocs.slice(i, i + BATCH_SIZE).forEach(doc => {
    deleteBatch.delete(doc.ref);
  });
  await deleteBatch.commit();
}
```

### 10.2 배치 생성

```javascript
// 500개씩 배치로 생성
for (let i = 0; i < results.length; i += BATCH_SIZE) {
  const batch = db.batch();
  const chunk = results.slice(i, i + BATCH_SIZE);
  // ...
  await batch.commit();
}
```

---

## 11. 배포 계획

### 수정된 배포 계획 (팀장 리뷰 반영)

**원래 예상**: 3-4일  
**수정 후**: 0.5-1일 (백엔드 이미 구현됨, 프론트만 추가)

### Phase 1: Critical Fix (✅ 완료, 2026-04-20)

1. ✅ `confirm` API `confirmSource` 필터 추가 (15분)
  - 라인 1830: `.where("confirmSource", "==", sourceToDelete)` 추가
2. ✅ `bulk-confirm` API `confirmSource` 필터 추가 (15분)
  - 라인 2957: `.where("confirmSource", "==", "operator")` 추가
3. ✅ 삭제 로그 추가 (10분)
4. ✅ Functions 배포 완료

### Phase 2: 프론트엔드 (3-4시간, P1)

1. ✅ `detail` API에 `hasConfirmedResults` 플래그 추가 (10분)
2. ✅ "확정된 기록 재검토" 버튼 추가 (1시간)
  - 조건부 표시 로직
  - enterReviewMode 함수
3. ✅ 코스 변경 모달 UI 구현 (1.5시간)
  - HTML 추가
  - openDistanceChangeModal 함수
  - 검증 로직
4. ✅ 컨텍스트 메뉴에 "코스 변경" 추가 (30분)
5. ✅ 재확정 경고 다이얼로그 (30분)
6. ✅ 통합 테스트 (30분)
7. ✅ Hosting 배포

### Phase 3: 검증 (1시간)

1. ✅ 프로덕션 테스트
2. ✅ 실제 그룹 대회로 시나리오 테스트
  - TC 7.1: 재확정 기본 플로우
  - TC 7.2: 코스 변경
  - TC 7.3: DNS 처리
3. ✅ 버그 수정 및 재배포 (필요 시)

**총 예상 시간**: 5시간

---

## 12. 향후 개선 사항

### P2 (선택, 향후)

1. **배번 양도 기능**: 별도 스팩 작성 후 구현
2. **변경 이력 UI**: `confirmHistory` 배열 표시
3. **일괄 코스 변경**: 체크박스로 여러 참가자 선택 후 일괄 변경
4. **코스 변경 이력 뱃지**: 행에 "코스 변경됨" 표시

### P3 (장기)

1. **my.html 개선**: 그룹 대회는 입력 차단 UI
2. **Undo/Redo**: 재확정 취소 기능
3. **변경 미리보기**: 재확정 전 변경사항 Diff 표시
4. **동시성 제어**: 분산 락 구현 (현재는 운영자 1명 가정)

---

## 13. 팀장 리뷰 반영 사항

### Critical Issues 반영

- ✅ **C1**: `confirmSource` 필터 추가로 개인 확정 기록 보호
- ✅ **M1**: `replaceMode` 파라미터 제거 (이미 구현됨 확인)
- ✅ **M3**: 배번 양도 시나리오 제거 (별도 스팩으로 분리)
- ✅ **M4**: `hasConfirmedResults` 플래그 명시

### 원칙 일관성 검토 반영

- ✅ Mock UI 경고 메시지를 원칙과 일치시킴 (개인 확정 보호 명시)
- ✅ `confirmSource` 필드 설명 보강 (재확정 시 역할)
- ✅ 코스 변경 시 docId 변경 로직 주석 추가
- ✅ TC 7.5: 개인 확정 기록 보존 테스트 추가
- ✅ TC 7.6: 코스 변경으로 인한 개인 확정 기록 충돌 케이스 추가

### 배포 계획 수정

- 원래: 3-4일 → **수정: 0.5-1일**
- Phase 1 백엔드: 1일 → **30분** (한 줄 추가)
- Phase 2 프론트: 1-2일 → **3-4시간** (기존 UI 재사용)

---

## 14. 참고 자료

- [기존 bulk-confirm API](../../../functions/index.js#L2937)
- [group-detail.html](../../../group-detail.html)
- [배번 양도 기능 스팩](./2026-04-18-bib-transfer-spec.md) (예시)
- [distance 매칭 스팩](./2026-04-18-distance-matching-spec.md)

---

## 15. 변경 이력


| 날짜         | 변경 내용                             | 작성자          |
| ---------- | --------------------------------- | ------------ |
| 2026-04-20 | 초안 작성                             | AI Assistant |
| 2026-04-20 | 팀장 리뷰 반영 - Critical Issues 수정     | AI Assistant |
|            | - confirmSource 필터 추가 (개인 확정 보호)  |              |
|            | - replaceMode 파라미터 제거 (이미 구현됨)    |              |
|            | - 배번 양도 시나리오 제거 (별도 스팩)           |              |
|            | - 배포 계획 3-4일 → 0.5-1일로 단축         |              |
| 2026-04-20 | 원칙 일관성 검토 반영                      | AI Assistant |
|            | - 핵심 원칙 명확화 (confirmSource 역할 추가) |              |
|            | - Mock UI 경고 메시지 수정               |              |
|            | - API 명세 주석 보강                    |              |
|            | - 테스트 케이스 7.5, 7.6 추가 (개인 확정 보호)  |              |
|            | - 코스 변경 시 docId 변경 로직 주석 추가       |              |


