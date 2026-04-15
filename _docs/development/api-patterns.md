# API 패턴 가이드

> 이 문서는 dmc_attendance_log 프로젝트의 API 호출 패턴을 정의합니다.
> AI 에이전트는 구현 전 반드시 이 문서를 참조해야 합니다.

## API 베이스 URL

### 상수 사용
```javascript
// ✅ 정답
const API_BASE = IS_LOCAL
  ? "http://127.0.0.1:5001/dmc-attendance/asia-northeast3"
  : "https://race-nszximpvtq-du.a.run.app";

fetch(`${API_BASE}?action=group-events`);
```

```javascript
// ❌ 오답
fetch(`${apiBase()}?action=group-events`);  // apiBase는 함수가 아님!
```

**규칙:**
- `API_BASE`는 **상수**입니다 (함수 아님)
- 모든 HTML 파일에 정의되어 있음 (group.html, ops.html, my.html, report.html 등)
- `IS_LOCAL` 상수로 로컬/프로덕션 자동 전환

## API 호출 패턴

### GET 요청
```javascript
// Query string으로 파라미터 전달
const res = await fetch(`${API_BASE}?action=group-events&subAction=gap&canonicalEventId=${encodeURIComponent(id)}`);
const data = await res.json();
```

### POST 요청
```javascript
// JSON body로 파라미터 전달
const res = await fetch(`${API_BASE}?action=group-events`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    subAction: "delete",
    canonicalEventId: id,
  }),
});
const data = await res.json();
```

**규칙:**
- `action`은 **항상 query string**에
- 나머지 파라미터는:
  - GET: query string (`?action=X&param=Y`)
  - POST: JSON body

## 오류 처리

### 표준 패턴
```javascript
try {
  const res = await fetch(`${API_BASE}?action=X`);
  const data = await res.json();
  
  if (!data.ok) {
    throw new Error(data.error || "알 수 없는 오류");
  }
  
  showToast("성공 메시지");
  await loadData();  // 데이터 새로고침
} catch (err) {
  console.error("오류:", err);
  showToast(err.message || "오류 발생", true);  // true = 오류 스타일
}
```

**규칙:**
- `try/catch`로 감싸기
- `data.ok` 체크 필수
- 성공: `showToast(message)` (녹색)
- 실패: `showToast(message, true)` (빨간색)
- `console.error`로 로깅

### Toast 메시지 가이드
```javascript
// ✅ 좋은 예
showToast("대회가 삭제되었습니다");
showToast("소스 저장 완료");
showToast("확정 저장됨");

// ❌ 나쁜 예
showToast("Success");  // 너무 모호
showToast("삭제 완료. 페이지를 새로고침하세요");  // 자동 새로고침해야 함
```

## API 액션 목록

### confirm API (기존)

**용도**: report.html에서 스크랩 결과 일괄 확정

```javascript
POST ${API_BASE}?action=confirm
{
  jobId: "...",
  eventName: "...",
  eventDate: "2026-04-05",
  source: "ohmyrace",
  sourceId: "118",
  results: [{ memberRealName, memberNickname, finishTime, ... }],
  confirmSource: "operator"
}
```

**특징:**
- 재확정 시 **기존 race_results 전체 삭제 후 재저장**
- `canonicalJobId` 로직 (source + sourceId)
- batch.commit() 한 번에 처리

**참고**: `_docs/development/batch-save-pattern.md`

---

### group-events API
```javascript
// 1. 대회 등록 (promote)
POST ${API_BASE}?action=group-events
{
  subAction: "promote",
  gorunningId: "...",
  eventName: "...",
  eventDate: "2026-04-05"
}

// 2. 참가자 설정 (participants)
POST ${API_BASE}?action=group-events
{
  subAction: "participants",
  canonicalEventId: "...",
  participants: [{ memberId: "...", realName: "...", nickname: "..." }]
}

// 3. 소스 설정 (source)
POST ${API_BASE}?action=group-events
{
  subAction: "source",
  ownerPw: "...",
  canonicalEventId: "...",
  source: "ohmyrace",
  sourceId: "118"
}

// 4. 스크랩 시작 (scrape)
POST ${API_BASE}?action=group-events
{
  subAction: "scrape",
  ownerPw: "...",
  canonicalEventId: "..."
}

// 5. 갭 조회 (gap)
GET ${API_BASE}?action=group-events&subAction=gap&canonicalEventId=...

// 6. 개별 확정 (confirm-one)
POST ${API_BASE}?action=group-events
{
  subAction: "confirm-one",
  canonicalEventId: "...",
  participant: { realName, nickname, finishTime, ... },
  confirmSource: "operator"
}

// 7. 삭제 (delete)
POST ${API_BASE}?action=group-events
{
  subAction: "delete",
  canonicalEventId: "..."
}
```

### 기타 API
```javascript
// 전체 회원 목록
GET ${API_BASE}?action=all-members

// 관리자 인증
POST ${API_BASE}?action=verify-admin
{ pw: "..." }

// 고러닝 예정 대회
GET ${API_BASE}?action=ops-gorunning-events
```

## 데이터 새로고침 패턴

### 단일 데이터 로드
```javascript
async function loadGroupEvents() {
  const res = await fetch(`${API_BASE}?action=group-events`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error);
  
  renderGroupEvents(data.groupEvents, data.gapById);
}
```

### 작업 후 새로고침
```javascript
// ✅ 정답: 작업 완료 후 자동 새로고침
await deleteEvent(id);
showToast("삭제되었습니다");
await loadGroupEvents();  // 자동 새로고침

// ❌ 오답: 사용자에게 새로고침 요청
showToast("삭제되었습니다. 페이지를 새로고침하세요");
```

## 인증 패턴

### Owner 권한 필요 API
```javascript
// ops.html: sessionStorage에서 비밀번호 가져오기
const OPS_AUTH_KEY = "dmc-ops-auth";

function getOwnerPw() {
  return sessionStorage.getItem(OPS_AUTH_KEY) || "";
}

// API 호출 시
{
  subAction: "source",
  ownerPw: getOwnerPw(),
  ...
}
```

### 권한 체크
```javascript
// verify-admin API로 role 확인
const res = await fetch(`${API_BASE}?action=verify-admin`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ pw: password }),
});
const data = await res.json();

if (data.ok && data.role === "owner") {
  // Owner 전용 기능 표시
}
```

## 일반적인 실수

### 1. apiBase() 함수 호출
```javascript
// ❌ 오답
fetch(`${apiBase()}?action=X`)

// ✅ 정답
fetch(`${API_BASE}?action=X`)
```

### 2. action을 body에 포함
```javascript
// ❌ 오답
fetch(API_BASE, {
  method: "POST",
  body: JSON.stringify({ action: "group-events", subAction: "delete" })
})

// ✅ 정답
fetch(`${API_BASE}?action=group-events`, {
  method: "POST",
  body: JSON.stringify({ subAction: "delete" })
})
```

### 3. 오류 처리 생략
```javascript
// ❌ 오답
const res = await fetch(`${API_BASE}?action=X`);
const data = await res.json();
showToast("완료");  // data.ok 체크 안 함

// ✅ 정답
const res = await fetch(`${API_BASE}?action=X`);
const data = await res.json();
if (!data.ok) throw new Error(data.error || "오류");
showToast("완료");
```

### 4. 데이터 새로고침 안 함
```javascript
// ❌ 오답
await deleteEvent(id);
showToast("삭제되었습니다");
// UI가 업데이트되지 않음

// ✅ 정답
await deleteEvent(id);
showToast("삭제되었습니다");
await loadGroupEvents();  // 데이터 새로고침
```

## 체크리스트

API 호출 구현 전 확인:

- [ ] `API_BASE` 상수 사용 (함수 아님)
- [ ] `action`은 query string에
- [ ] POST는 JSON body, GET은 query string
- [ ] `try/catch`로 오류 처리
- [ ] `data.ok` 체크
- [ ] `showToast`로 사용자 피드백
- [ ] 작업 후 데이터 자동 새로고침
- [ ] Owner 권한 필요 시 `ownerPw` 전달
