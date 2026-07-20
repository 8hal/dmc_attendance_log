# 춘백 S3 출석 예외 상신·승인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원이 「나」탭에서 출석 예외를 상신하고, 운영진이 어드민에서 승인/반려하며, 승인 시 기존 `exception` 슬롯 규칙을 일괄 적용하고, 회원이 조기 복귀로 오늘 이후 예외를 즉시 해제할 수 있게 한다.

**Architecture:** 비즈니스 규칙(날짜 검증·슬롯 선별·적용/스킵 미리보기)은 순수 함수 `functions/lib/chunbaek-exception-requests.js`에 둔다. Firestore 쓰기는 기존 `chunbaek_attendance` merge 패턴을 따르되 **예외 필드만** 갱신하는 헬퍼로 `note`/`photo`를 보존한다. 신규 컬렉션 `chunbaek_exception_requests`는 상신·승인 감사용. API 6개는 `chunbaek-handlers.js`(회원) + `chunbaek-admin.js`(운영)에 추가한다.

**Tech Stack:** Cloud Functions (`functions/lib/chunbaek-*.js`), Firestore, Vanilla JS (`chunbaek/`), `node --test`, `scripts/verify-chunbaek-emulator.js`

**Spec:** `_docs/superpowers/specs/2026-07-20-chunbaek-exception-request-design.md`

**구현 전 필독:** `_docs/development/api-patterns.md`, `_docs/development/naming-conventions.md`, `_docs/development/common-mistakes.md`

**정책 확정 (스펙 §10 미결 → 구현 기본값):**
- 베타(0주차) 슬롯도 예외 상신·적용 **허용** (`!isProgramOff` 훈련일이면 대상)
- 조기 복귀 감사: **슬롯 필드만** (`updatedBy: memberId`, `exceptionNote` 비움). `chunbaek_exception_events`는 후속

**14일 규칙 (스펙 §5.1과 UI 정합):**
- 검증: `(endDate - startDate) > 14` 일 때만 400 (달력 일수 차이, inclusive 아님)
- 예: `2026-07-20` ~ `2026-08-03` → 차이 14 → **허용** (포함 15일)
- 예: `2026-07-20` ~ `2026-08-04` → 차이 15 → **거부**
- UI `end` max = `start + 14일` (위와 동일)

---

## File map

| File | Responsibility |
|------|----------------|
| `_docs/justification/2026-07-20-chunbaek-exception-requests-justification.md` | 신규 API 6개 필요성 (new-api-validation) |
| `functions/lib/chunbaek-exception-requests.js` | 날짜 검증, 구간 슬롯 선별, 적용/스킵 미리보기, self-clear 대상 선별 |
| `scripts/test/chunbaek-exception-requests.test.js` | 순수 함수 단위 테스트 |
| `functions/lib/chunbaek-handlers.js` | 회원 API 4개 + 라우팅 |
| `functions/lib/chunbaek-admin.js` | 운영 API 2개 + 라우팅 |
| `firestore.rules` | `chunbaek_exception_requests` read-only 규칙 |
| `firestore.indexes.json` | `chunbaek_exception_requests` 복합 인덱스 |
| `chunbaek/index.html` | `#view-me` 예외 섹션 + 요청 모달 마크업 |
| `chunbaek/js/app.js` | 나 탭 렌더·모달·조기 복귀 확인 |
| `chunbaek/js/api.js` | API 클라이언트 + mock |
| `chunbaek/admin.html` | 예외 요청 패널 마크업 |
| `chunbaek/js/admin.js` | pending 목록·승인/반려 |
| `chunbaek/css/chunbaek.css` | 나 탭 예외 섹션·모달 스타일 |
| `chunbaek/css/admin.css` | 예외 요청 패널 스타일 |
| `scripts/verify-chunbaek-emulator.js` | 예외 상신→승인→self-clear 통합 smoke |

---

### Task 0: 신규 API Justification + 사용자 승인 (구현 차단 게이트)

**Files:**
- Create: `_docs/justification/2026-07-20-chunbaek-exception-requests-justification.md`

- [ ] **Step 1: 기존 API 전역 검색**

```bash
rg "exception" functions/lib/chunbaek-handlers.js functions/lib/chunbaek-admin.js
rg "admin-set-attendance" chunbaek/
rg "action.*chunbaek|chunbaek.*action" functions/
```

체크리스트:
- `admin-set-attendance`: 운영 수동 슬롯 예외 (단건)
- `save-attendance`: exception 슬롯 403 차단
- 회원이 기간 예외를 **요청·조회·조기해제**할 API 없음 확인

- [ ] **Step 2: Justification 문서 작성**

`_docs/justification/2026-07-20-chunbaek-exception-requests-justification.md`:

```markdown
# 춘백 exception-requests API 추가 필요성

## 기존 API
| API | 용도 | 회원 기간 예외 |
|-----|------|----------------|
| admin-set-attendance | 운영 단건 슬롯 예외 | 운영만 |
| save-attendance | 출석 저장 | exception 슬롯 403 |

## 신규 API (5개)
| action | 용도 |
|--------|------|
| request-exception | 회원 예외 상신 |
| my-exception-requests | 내 상신 목록 |
| self-clear-future-exceptions | 조기 복귀(즉시) |
| admin-list-exception-requests | 운영 대기 목록 |
| admin-review-exception-request | 승인/반려 |

> 1차 비범위: cancel-exception-request (회원 pending 취소) — 운영 반려로 대체

## 기존 API로 대체 불가
- admin-set-attendance 반복: 원자성·감사·pending 1건 규칙 없음
- save-attendance: exception 설정 불가(403)

## 결정
- ✅ 추가 필요 (스펙 2026-07-20 승인됨 — cancel 제외)
```

- [ ] **Step 3: 사용자에게 승인 요청 후 응답 대기**

구현 코딩은 **사용자 승인 후** Task 1부터 진행. (스펙 승인과 별도로 new-api-validation 절차)

- [ ] **Step 4: Commit**

```bash
git add _docs/justification/2026-07-20-chunbaek-exception-requests-justification.md
git commit -m "docs: 춘백 예외 상신 API justification"
```

---

### Task 1: 순수 함수 — 날짜 검증·슬롯 선별 (TDD)

**Files:**
- Create: `functions/lib/chunbaek-exception-requests.js`
- Create: `scripts/test/chunbaek-exception-requests.test.js`

- [ ] **Step 1: Write failing tests**

`scripts/test/chunbaek-exception-requests.test.js`:

```js
"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  validateExceptionRequestInput,
  trainingSlotsInDateRange,
  previewExceptionApplication,
  slotsEligibleForSelfClear,
  formatRequestExceptionNote,
  EXCEPTION_REASON_MAX,
  EXCEPTION_MAX_SPAN_DAYS,
  EXCEPTION_LOOKBACK_DAYS,
} = require(path.join(__dirname, "../../functions/lib/chunbaek-exception-requests.js"));

const slots = [
  { id: "901", dayIndex: 901, date: "2026-07-13", week: 0, isProgramOff: false },
  { id: "902", dayIndex: 902, date: "2026-07-14", week: 0, isProgramOff: false },
  { id: "1", dayIndex: 1, date: "2026-07-20", week: 1, isProgramOff: false },
  { id: "2", dayIndex: 2, date: "2026-07-21", week: 1, isProgramOff: true },
  { id: "3", dayIndex: 3, date: "2026-07-22", week: 1, isProgramOff: false },
];

describe("validateExceptionRequestInput", () => {
  const today = "2026-07-20";
  const seasonEnd = "2026-10-27";

  it("accepts valid 7-day lookback request", () => {
    const r = validateExceptionRequestInput({
      reason: "발목 부상",
      startDate: "2026-07-14",
      endDate: "2026-07-18",
      todayKst: today,
      seasonEndDate: seasonEnd,
    });
    assert.equal(r.ok, true);
  });

  it("rejects start before rolling 7-day window", () => {
    const r = validateExceptionRequestInput({
      reason: "휴가",
      startDate: "2026-07-12",
      endDate: "2026-07-15",
      todayKst: today,
      seasonEndDate: seasonEnd,
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /lookback/i);
  });

  it("rejects span over 14 calendar days", () => {
    const r = validateExceptionRequestInput({
      reason: "휴가",
      startDate: "2026-07-20",
      endDate: "2026-08-04", // diff 15
      todayKst: today,
      seasonEndDate: seasonEnd,
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /14/);
  });

  it("allows exactly 14 calendar day span", () => {
    const r = validateExceptionRequestInput({
      reason: "휴가",
      startDate: "2026-07-20",
      endDate: "2026-08-03", // diff 14
      todayKst: today,
      seasonEndDate: seasonEnd,
    });
    assert.equal(r.ok, true);
  });

  it("rejects empty reason", () => {
    const r = validateExceptionRequestInput({
      reason: "  ",
      startDate: "2026-07-20",
      endDate: "2026-07-22",
      todayKst: today,
      seasonEndDate: seasonEnd,
    });
    assert.equal(r.ok, false);
  });
});

describe("trainingSlotsInDateRange", () => {
  it("includes beta and season training days, skips program off", () => {
    const list = trainingSlotsInDateRange({
      slots,
      config: {},
      startDate: "2026-07-13",
      endDate: "2026-07-22",
    });
    assert.deepEqual(
      list.map((s) => s.dayIndex),
      [901, 902, 1, 3],
    );
  });
});

describe("previewExceptionApplication", () => {
  it("skips attended slots, lists applicable", () => {
    const attendanceMap = {
      901: { slotId: 901, attended: true, exception: false },
      902: { slotId: 902, attended: false, exception: false },
    };
    const preview = previewExceptionApplication({
      slots,
      attendanceMap,
      config: {},
      startDate: "2026-07-13",
      endDate: "2026-07-14",
    });
    assert.deepEqual(preview.skippedSlotIds, [901]);
    assert.deepEqual(preview.applicableSlotIds, [902]);
  });

  it("no-op for already exception slots", () => {
    const attendanceMap = {
      902: { slotId: 902, attended: false, exception: true },
    };
    const preview = previewExceptionApplication({
      slots,
      attendanceMap,
      config: {},
      startDate: "2026-07-14",
      endDate: "2026-07-14",
    });
    assert.deepEqual(preview.applicableSlotIds, []);
    assert.deepEqual(preview.skippedSlotIds, []);
  });
});

describe("slotsEligibleForSelfClear", () => {
  it("returns today+ future exception training slots only", () => {
    const attendanceMap = {
      901: { slotId: 901, attended: false, exception: true },
      1: { slotId: 1, attended: false, exception: true },
      3: { slotId: 3, attended: false, exception: true },
    };
    const list = slotsEligibleForSelfClear({
      slots,
      attendanceMap,
      config: {},
      todayKst: "2026-07-20",
    });
    assert.deepEqual(list.map((s) => s.dayIndex), [1, 3]);
  });
});

describe("formatRequestExceptionNote", () => {
  it("prefixes reason for audit", () => {
    assert.equal(formatRequestExceptionNote("발목"), "[상신] 발목");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
node --test scripts/test/chunbaek-exception-requests.test.js
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement minimal module**

`functions/lib/chunbaek-exception-requests.js` 핵심:

```js
const { addDaysIso, getAttendance, getSlotKey, resolveSlotDate } = require("./chunbaek-stats");

const EXCEPTION_REASON_MAX = 200;
const EXCEPTION_MAX_SPAN_DAYS = 14;
const EXCEPTION_LOOKBACK_DAYS = 7; // today 포함 7일 → today-6

function parseIsoDate(s) {
  const v = String(s || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function calendarDayDiff(startDate, endDate) {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000);
}

function validateExceptionRequestInput(opts) {
  const reason = String(opts.reason || "").trim();
  const startDate = parseIsoDate(opts.startDate);
  const endDate = parseIsoDate(opts.endDate);
  const todayKst = parseIsoDate(opts.todayKst);
  const seasonEndDate = parseIsoDate(opts.seasonEndDate);
  if (!reason || reason.length > EXCEPTION_REASON_MAX) {
    return { ok: false, error: "reason required (1-200 chars)" };
  }
  if (!startDate || !endDate || startDate > endDate) {
    return { ok: false, error: "invalid date range" };
  }
  if (!todayKst) return { ok: false, error: "invalid today" };
  const minStart = addDaysIso(todayKst, -(EXCEPTION_LOOKBACK_DAYS - 1));
  if (startDate < minStart) {
    return { ok: false, error: "startDate outside 7-day lookback" };
  }
  if (calendarDayDiff(startDate, endDate) > EXCEPTION_MAX_SPAN_DAYS) {
    return { ok: false, error: "max span is 14 days" };
  }
  if (seasonEndDate && endDate > seasonEndDate) {
    return { ok: false, error: "endDate after season end" };
  }
  return { ok: true, startDate, endDate, reason };
}

function slotDateResolved(slot, config, slots) {
  return resolveSlotDate(slot, config, slots, "");
}

function trainingSlotsInDateRange({ slots, config, startDate, endDate }) {
  return (slots || [])
    .filter((slot) => !slot.isProgramOff)
    .filter((slot) => {
      const d = slotDateResolved(slot, config, slots);
      return d && d >= startDate && d <= endDate;
    })
    .sort((a, b) => {
      const da = slotDateResolved(a, config, slots);
      const db = slotDateResolved(b, config, slots);
      return da.localeCompare(db) || (a.dayIndex ?? 0) - (b.dayIndex ?? 0);
    });
}

function previewExceptionApplication({ slots, attendanceMap, config, startDate, endDate }) {
  const applicableSlotIds = [];
  const skippedSlotIds = [];
  for (const slot of trainingSlotsInDateRange({ slots, config, startDate, endDate })) {
    const att = getAttendance(attendanceMap, slot);
    if (att?.attended) {
      skippedSlotIds.push(slot.dayIndex ?? Number(slot.id));
      continue;
    }
    if (att?.exception) continue;
    applicableSlotIds.push(slot.dayIndex ?? Number(slot.id));
  }
  return { applicableSlotIds, skippedSlotIds };
}

function slotsEligibleForSelfClear({ slots, attendanceMap, config, todayKst }) {
  return (slots || [])
    .filter((slot) => !slot.isProgramOff)
    .filter((slot) => {
      const d = slotDateResolved(slot, config, slots);
      return d && d >= todayKst;
    })
    .filter((slot) => {
      const att = getAttendance(attendanceMap, slot);
      return !!att?.exception;
    });
}

function formatRequestExceptionNote(reason) {
  return `[상신] ${String(reason).trim()}`.slice(0, 200);
}

module.exports = {
  EXCEPTION_REASON_MAX,
  EXCEPTION_MAX_SPAN_DAYS,
  EXCEPTION_LOOKBACK_DAYS,
  validateExceptionRequestInput,
  trainingSlotsInDateRange,
  previewExceptionApplication,
  slotsEligibleForSelfClear,
  formatRequestExceptionNote,
  getSlotKey, // re-export for handlers
};
```

- [ ] **Step 4: Run test — expect PASS**

```bash
node --test scripts/test/chunbaek-exception-requests.test.js
```

- [ ] **Step 5: Commit**

```bash
git add functions/lib/chunbaek-exception-requests.js scripts/test/chunbaek-exception-requests.test.js
git commit -m "feat(chunbaek): exception request pure helpers + tests"
```

---

### Task 2: 슬롯 예외 필드 merge 헬퍼 + 회원 API

**Files:**
- Modify: `functions/lib/chunbaek-exception-requests.js`
- Modify: `functions/lib/chunbaek-handlers.js`
- Modify: `scripts/test/chunbaek-exception-requests.test.js` (선택: `buildSlotExceptionPatch` 테스트)

- [ ] **Step 1: Add `buildSlotExceptionPatch` helper (테스트 optional)**

`note`/`photoUrl`/`photoUrls`를 건드리지 않는 patch 객체:

```js
function buildSlotExceptionPatch({ memberId, slot, exception, exceptionNote, updatedBy }) {
  const slotId = slot.dayIndex ?? Number(slot.id);
  const patch = {
    memberId,
    slotId,
    exception: !!exception,
    exceptionNote: exception ? String(exceptionNote || "").slice(0, 200) : "",
    updatedBy,
    updatedAt: FieldValue.serverTimestamp(), // handlers에서 주입
  };
  if (exception) patch.attended = false;
  return patch;
}
```

> `FieldValue`는 handlers 층에서 merge — pure 함수는 `{ attended: false }`만 반환하고 timestamp는 handler가 추가.

순수 버전:

```js
function buildSlotExceptionPatch({ memberId, slot, exception, exceptionNote, updatedBy }) {
  const slotId = slot.dayIndex ?? Number(slot.id);
  const patch = {
    memberId,
    slotId,
    exception: !!exception,
    exceptionNote: exception ? String(exceptionNote || "").slice(0, 200) : "",
    updatedBy,
  };
  if (exception) patch.attended = false;
  return patch;
}
```

- [ ] **Step 2: Implement member handlers in `chunbaek-handlers.js`**

추가 import:

```js
const {
  validateExceptionRequestInput,
  previewExceptionApplication,
  slotsEligibleForSelfClear,
  formatRequestExceptionNote,
  trainingSlotsInDateRange,
  buildSlotExceptionPatch,
} = require("./chunbaek-exception-requests");
```

**`handleRequestException`** (POST):
1. `requireMember`
2. body: `reason`, `startDate`, `endDate`, optional `dryRun: true`
3. `loadSeasonConfig`, `loadAllSlots`, `loadMemberAttendance`, `seasonBounds` → `seasonEndDate`
4. `validateExceptionRequestInput` → 400
5. `previewExceptionApplication` 계산
6. **`dryRun: true`이면** Firestore 쓰기 없이 `res.json({ ok: true, preview })` 반환 (모달 미리보기용)
7. Firestore query: `chunbaek_exception_requests` where `memberId==` & `status==pending` limit 1 → 있으면 400
8. doc 생성 (`updatedAt`/`createdAt` 모두 `serverTimestamp()`)

```js
const requestId = crypto.randomUUID();
await db.collection("chunbaek_exception_requests").doc(requestId).set({
  seasonId: CHUNBAEK_SEASON_ID,
  type: "exception",
  memberId: auth.memberId,
  nickname: auth.data.nickname || "",
  reason,
  startDate,
  endDate,
  status: "pending",
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: "",
  appliedSlotIds: [],
  skippedSlotIds: [],
});
```

9. `res.json({ ok: true, requestId, preview })`

**`handleMyExceptionRequests`** (GET): 본인 최근 20건, `createdAt` desc (인덱스 필요 — Task 2b)

> **비범위:** `cancel-exception-request` — 구현하지 않음. pending은 운영 반려만.

**`handleSelfClearFutureExceptions`** (POST):
1. `requireMember`, `loadAllSlots`, `loadMemberAttendance`
2. `slotsEligibleForSelfClear` → 빈 배열이면 400 `no future exceptions`
3. 각 슬롯 `chunbaek_attendance` doc `{ merge: true }` with `exception:false`, `exceptionNote:""`, `updatedBy: memberId`
4. `res.json({ ok: true, clearedSlotIds: [...] })`

라우팅 (`handleChunbaekRequest`):

```js
if (action === "request-exception") return handleRequestException(req, res, db);
if (action === "my-exception-requests") return handleMyExceptionRequests(req, res, db);
if (action === "self-clear-future-exceptions") return handleSelfClearFutureExceptions(req, res, db);
```

- [ ] **Step 3: Update `firestore.rules`**

```javascript
match /chunbaek_exception_requests/{docId} {
  allow read: if false;
  allow write: if false;
}
```

(Functions Admin SDK만 쓰기 — 다른 chunbaek 컬렉션과 동일)

- [ ] **Step 4: Manual smoke with emulator** (Task 5 통합 테스트 전 빠른 확인)

에뮬 띄운 뒤 curl 또는 node one-liner로 `request-exception` 401/400 경로 확인.

- [ ] **Step 5: Commit**

```bash
git add functions/lib/chunbaek-exception-requests.js functions/lib/chunbaek-handlers.js firestore.rules
git commit -m "feat(chunbaek): member exception request APIs"
```

---

### Task 2b: Firestore 복합 인덱스

**Files:**
- Modify: `firestore.indexes.json`

- [ ] **Step 1: Add indexes**

```json
{
  "collectionGroup": "chunbaek_exception_requests",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "memberId", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "chunbaek_exception_requests",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "type", "order": "ASCENDING" },
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "chunbaek_exception_requests",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "memberId", "order": "ASCENDING" },
    { "fieldPath": "status", "order": "ASCENDING" }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add firestore.indexes.json
git commit -m "chore(firestore): chunbaek_exception_requests indexes"
```

---

### Task 3: 운영 API — 목록·승인/반려

**Files:**
- Modify: `functions/lib/chunbaek-admin.js`
- Modify: `functions/lib/chunbaek-exception-requests.js` (필요 시 `applyApprovedExceptionRequest` 헬퍼)

- [ ] **Step 1: `handleAdminListExceptionRequests`** (GET)

Query params: `status` (default `pending`), `limit` (max 50)

```js
let q = db.collection("chunbaek_exception_requests")
  .where("type", "==", "exception")
  .orderBy("createdAt", "desc")
  .limit(limit);
if (status) q = q.where("status", "==", status);
```

각 row에 `preview` 계산(승인 전 미리보기): `previewExceptionApplication` 호출.

- [ ] **Step 2: `handleAdminReviewExceptionRequest`** (POST)

Body: `requestId`, `decision` (`approve`|`reject`), `reviewNote` (optional)

1. doc load → 없으면 404
2. `status !== pending` → **400** (스펙: 이미 확정 재리뷰 거부)
3. reject: `status: rejected`, `reviewedBy: "admin"`, `reviewedAt`, `reviewNote`, **`updatedAt`**
4. approve:
   - `previewExceptionApplication` 재계산
   - 각 `applicableSlotId`에 대해 slot 찾기 → `buildSlotExceptionPatch({ exception:true, exceptionNote: formatRequestExceptionNote(doc.reason), updatedBy:"admin" })` + `FieldValue.serverTimestamp()` → `chunbaek_attendance` merge
   - doc update: `status: approved`, `appliedSlotIds`, `skippedSlotIds`, `reviewedBy`, `reviewedAt`, **`updatedAt`**

**중요:** `admin-set-attendance`와 동일하게 `attended: false` when exception. 이미 출석한 날은 preview에서 skipped이므로 write 안 함.

- [ ] **Step 3: Wire `handleAdminRequest`**

```js
if (action === "admin-list-exception-requests") {
  return handleAdminListExceptionRequests(req, res, db);
}
if (action === "admin-review-exception-request") {
  return handleAdminReviewExceptionRequest(req, res, db);
}
```

- [ ] **Step 4: Commit**

```bash
git add functions/lib/chunbaek-admin.js functions/lib/chunbaek-exception-requests.js
git commit -m "feat(chunbaek): admin exception request review APIs"
```

---

### Task 4: 에뮬 통합 테스트

**Files:**
- Modify: `scripts/verify-chunbaek-emulator.js`

- [ ] **Step 1: Add exception flow smoke at end of IIFE**

```js
// --- exception requests ---
const reqExc = await apiPost("request-exception", {
  reason: "에뮬 부상 테스트",
  startDate: today,
  endDate: addDays(today, 2), // helper: local addDays iso
}, token);
assert.equal(reqExc.status, 200, reqExc.data?.error);
assert.ok(reqExc.data.requestId);

const dup = await apiPost("request-exception", {
  reason: "중복",
  startDate: today,
  endDate: today,
}, token);
assert.equal(dup.status, 400);

const pendingList = await apiGet("admin-list-exception-requests", {
  adminPw: ADMIN_PW,
  status: "pending",
});
assert.equal(pendingList.status, 200);
assert.ok(pendingList.data.requests.some((r) => r.requestId === reqExc.data.requestId));

const approved = await apiPost("admin-review-exception-request", {
  requestId: reqExc.data.requestId,
  decision: "approve",
  reviewNote: "확인",
}, null, ADMIN_PW); // adminPost 패턴에 맞게 조정
assert.equal(approved.status, 200);

const myReqs = await apiGet("my-exception-requests", { token });
assert.equal(myReqs.data.requests[0].status, "approved");

const cleared = await apiPost("self-clear-future-exceptions", {}, token);
assert.equal(cleared.status, 200);
assert.ok(Array.isArray(cleared.data.clearedSlotIds));
```

`apiPost`에 adminPw 지원이 없으면 `adminPost` 헬퍼 추가.

- [ ] **Step 2: Run via emulators:exec** (또는 기존 pre-deploy 파이프라인)

```bash
bash scripts/pre-deploy-test.sh
```

또는 춘백만:

```bash
firebase emulators:exec --only functions,firestore "node scripts/verify-chunbaek-emulator.js"
```

(시드 선행 필요 — `scripts/seed-emulator-chunbaek.js` 패턴 따름)

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-chunbaek-emulator.js
git commit -m "test(chunbaek): exception request emulator smoke"
```

---

### Task 5: 회원 UI — 「나」탭

**Files:**
- Modify: `chunbaek/index.html`
- Modify: `chunbaek/js/app.js`
- Modify: `chunbaek/js/api.js`
- Modify: `chunbaek/css/chunbaek.css`

- [ ] **Step 1: HTML — `#view-me` 확장**

`#btn-edit-profile` 아래:

```html
<section class="me-exception-section" id="me-exception-section" hidden>
  <h3 class="section-subtitle">출석 예외</h3>
  <p class="hint">부상·휴가 등은 기간을 상신하면 운영 승인 후 예외 처리됩니다.</p>
  <div class="me-exception-actions">
    <button type="button" class="btn btn-outline" id="btn-request-exception">예외 요청</button>
    <button type="button" class="btn btn-ghost" id="btn-early-return" hidden>조기 복귀</button>
  </div>
  <ul class="me-exception-list" id="me-exception-list"></ul>
</section>

<div class="timeline-modal-backdrop" id="exception-request-modal" role="dialog" aria-modal="true" hidden>
  <div class="timeline-modal-card">
    <div class="timeline-modal-header">
      <div class="timeline-modal-header-text">
        <h3 class="timeline-modal-title">출석 예외 요청</h3>
      </div>
      <button type="button" class="timeline-modal-close-btn" id="exception-request-close" aria-label="닫기">×</button>
    </div>
    <label class="field-label" for="exception-reason">사유</label>
    <textarea class="input" id="exception-reason" rows="3" maxlength="200" placeholder="부상, 휴가, 출장 등"></textarea>
    <label class="field-label" for="exception-start">시작일</label>
    <input type="date" class="input" id="exception-start" />
    <label class="field-label" for="exception-end">종료일</label>
    <input type="date" class="input" id="exception-end" />
    <p class="hint" id="exception-preview" aria-live="polite"></p>
    <div class="timeline-modal-btns">
      <button type="button" class="btn btn-primary" id="exception-request-submit">상신하기</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: `api.js` — 4개 메서드 + mock**

```js
async function requestException(body) {
  return apiPost("request-exception", body);
}
async function fetchMyExceptionRequests() {
  return apiGet("my-exception-requests");
}
async function selfClearFutureExceptions() {
  return apiPost("self-clear-future-exceptions", {});
}
```

Mock (`useMock()`): in-memory `MOCK.exceptionRequests` 배열, pending 1건 제한 시뮬.

- [ ] **Step 3: `app.js` — load/render/이벤트**

함수 추가:
- `loadMeExceptionPanel()` — `fetchMyExceptionRequests()` + 타임라인/오늘 슬롯에서 future exception 여부로 `#btn-early-return` 표시
- `openExceptionRequestModal()` — date min/max: `today-6`, `end` max = `start + 14일`
- `refreshExceptionPreview()` — `#exception-start`/`#exception-end` `change` 시 `requestException({ ..., dryRun: true })` 호출 → `#exception-preview`에 `적용 예정 ${applicable}일 · 출석 유지 ${skipped}일` (서버 `preview` 사용, 추정치 금지)
- `submitExceptionRequest()` — `dryRun` 없이 POST, `isProcessing` 가드
- `onEarlyReturn()` — `confirm("오늘 이후 예외 N일을 해제하고 다시 출석할까요?")` → `selfClearFutureExceptions()`
- 내 요청 목록: 상태 표시만 (취소 버튼 없음). pending이면 「운영 확인 대기」 안내.

`renderMe()` 마지막에 `loadMeExceptionPanel()` 호출.  
`profileComplete` 아닐 때 섹션 `hidden`.

Mock (`useMock()`): `requestException`의 `dryRun`도 지원 — `MOCK.slots`·출석 맵으로 클라이언트 preview 시뮬 또는 고정 `{ applicable: 2, skipped: 1 }`.

- [ ] **Step 4: CSS — 최소 스타일**

`.me-exception-section`, `.me-exception-list`, `.me-exception-actions` — 기존 `profile-dl`·`section-subtitle` 톤 유지.

- [ ] **Step 5: Manual check**

`http://localhost:5000/chunbaek/?preview=1` 또는 에뮬에서 나 탭 확인.

- [ ] **Step 6: Commit**

```bash
git add chunbaek/index.html chunbaek/js/app.js chunbaek/js/api.js chunbaek/css/chunbaek.css
git commit -m "feat(chunbaek): me tab exception request UI"
```

---

### Task 6: 운영 UI — 예외 요청 패널

**Files:**
- Modify: `chunbaek/admin.html`
- Modify: `chunbaek/js/admin.js`
- Modify: `chunbaek/css/admin.css`

- [ ] **Step 1: Sidebar + panel HTML**

`admin-sidebar`에:

```html
<button type="button" class="admin-nav-btn" data-panel="exceptions">
  예외 요청 <span class="admin-nav-badge" id="exceptions-pending-badge" hidden></span>
</button>
```

`admin-main`에 `#panel-exceptions`:
- pending 목록 테이블 (닉네임, 기간, 사유, 적용/스킵 preview)
- 행 클릭 → 상세 모달 → 승인 / 반려 (`reviewNote` textarea)

- [ ] **Step 2: `admin.js`**

- `refreshExceptionRequests()` — `admin-list-exception-requests?status=pending`
- badge: `requests.length` 표시
- `reviewExceptionRequest(id, decision)` — `admin-review-exception-request`
- `switchPanel("exceptions")` 시 refresh
- `init()` 시 badge만 prefetch (그리드 로드와 병렬 가능)

Preview 모달에 `적용 예정 N일 · 출석 유지 M일` 표시.

**Preview 모드 (`?preview=1`):** `admin-list-exception-requests` mock — pending 1~2건 샘플 + approve/reject 토스트만 (실제 슬롯 write 없음).

- [ ] **Step 3: CSS**

기존 `admin-panel`, `admin-table` 패턴 재사용.

- [ ] **Step 4: Commit**

```bash
git add chunbaek/admin.html chunbaek/js/admin.js chunbaek/css/admin.css
git commit -m "feat(chunbaek): admin exception requests panel"
```

---

### Task 7: 가이드 문구 + 최종 검증

**Files:**
- Modify: `chunbaek/index.html` (`#view-guide`)
- Modify: `scripts/verify-chunbaek-stats.js` (선택 — export 변경 없으면 생략)

- [ ] **Step 1: 가이드 문구 변경**

`#view-guide` ③번 항목:

```html
<span>부상·출장·경조사는 <strong>[나]</strong> 탭에서 <strong>출석 예외 요청</strong>을 해 주세요. 운영 승인 후 예외 처리됩니다.</span>
```

- [ ] **Step 2: Run all tests**

```bash
node --test scripts/test/chunbaek-exception-requests.test.js
bash scripts/pre-deploy-test.sh
```

Expected: 전체 통과

- [ ] **Step 3: Commit**

```bash
git add chunbaek/index.html
git commit -m "chore(chunbaek): guide points to me tab exception request"
```

---

## 배포 메모 (이 계획 실행 범위 밖)

- 배포 목표·성공 기준은 스펙 §7·§8 참조
- AI는 `firebase deploy` 직접 실행 금지 — `.cursor/skills/firebase-deploy/SKILL.md`
- Functions + Hosting(춘백) 배포 순서: functions → hosting

---

## 실행 순서 요약

```
Task 0 (justification 승인) → Task 1 (pure) → Task 2 (member API) → Task 2b (indexes)
→ Task 3 (admin API) → Task 4 (emulator test) → Task 5 (me UI) → Task 6 (admin UI) → Task 7 (guide + verify)
```
