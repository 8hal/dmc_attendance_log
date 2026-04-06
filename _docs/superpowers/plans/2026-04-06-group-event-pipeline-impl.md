# 단체 대회 파이프라인 구현 계획서

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단체 대회 참가자 사전 등록 → 자동 스크랩 → 갭 탐지 → 기록 확정 파이프라인 구현

**Architecture:**
- `race_events` 컬렉션에 단체 대회 필드 추가 (isGroupEvent, participants, sourceInfo)
- 신규 `group-events` API 액션 6개 (기존 `race` Cloud Function에 추가)
- 신규 `groupEventAutoScrape` Cloud Scheduler (15:00 KST, timeZone: "Asia/Seoul")
- 신규 `group.html` 페이지, `ops.html` 인증·소스매핑 추가

**Tech Stack:** Firebase Cloud Functions (Node.js 24), Firestore, HTML/JS (vanilla)

**PRD:** `_docs/superpowers/specs/2026-04-06-group-event-pipeline-prd.md`
**목업:** `mockup-group-event.html`

---

## 사전 파악 사항 (코드 리뷰 결과)

| 항목 | 현황 |
|---|---|
| `verify-admin` | 이미 `DMC_OWNER_PW` 처리 코드 있음. `.env`에 값만 추가하면 됨 |
| `scrape` 액션 | 이미 `memberRealNames[]` 지원 → 그룹 스크랩 재사용 가능 |
| `confirm` 액션 | 변경 없음. group.html에서 직접 호출 |
| `ops.html` | 인증 없음. 로그인 화면 추가 필요 |
| `memberId` | Firestore doc.id = memberId. `race_results`엔 없으므로 갭 탐지는 realName 기반 |
| 갭 탐지 | `scrape_jobs.results[].status` ("auto"/"ambiguous") + realName 비교로 처리 |
| 기존 스케줄러 | `weeklyDiscoverAndScrape`: 토/일 15:00 UTC. 새 스케줄러와 충돌 없음 |

---

## 파일 변경 목록

| 파일 | 변경 유형 |
|---|---|
| `functions/.env` | 수정: `DMC_OWNER_PW` 추가 |
| `functions/index.js` | 수정: `group-events` 액션 6개 + `groupEventAutoScrape` 스케줄러 |
| `ops.html` | 수정: 로그인 화면 + 단체 대회 소스매핑 섹션 |
| `group.html` | 신규: 단체 대회 관리 페이지 |
| `_docs/knowledge/data-dictionary.md` | 수정: race_events 스키마 업데이트 |
| `firestore.indexes.json` | 수정: `isGroupEvent + eventDate` 복합 인덱스 추가 |

---

## Task 1: ops.html 오너 인증

**Files:**
- Modify: `functions/.env`
- Modify: `ops.html`

### 1-1. `.env`에 `DMC_OWNER_PW` 추가

- [ ] `functions/.env` 파일에 `DMC_OWNER_PW=<오너전용비밀번호>` 추가
  - `DMC_ADMIN_PW`와 다른 값으로 설정
  - 서버 재시작 필요 없음 (Cloud Functions는 배포 시 환경변수 로드)

### 1-2. `verify-admin` 동작 확인

`functions/index.js:1966-1977`에 이미 구현됨:
```javascript
if (ownerPw && pw === ownerPw) return res.json({ ok: true, role: "owner" });
if (pw === adminPw)            return res.json({ ok: true, role: "operator" });
```
코드 변경 불필요. `.env` 추가만으로 활성화됨.

### 1-3. `ops.html` 로그인 화면 추가

- [ ] `ops.html` 최상단에 로그인 오버레이 추가 (report.html 패턴 참고)

```html
<!-- ops.html body 시작 직후 추가 -->
<div id="authOverlay" style="...">
  <div class="auth-card">
    <h2>운영 콘솔</h2>
    <p style="font-size:13px;color:#64748B;">오너 전용 페이지입니다.</p>
    <input id="authPw" type="password" placeholder="비밀번호" />
    <button onclick="tryAuth()">확인</button>
    <div id="authError" style="display:none;color:#DC2626;font-size:12px;">
      비밀번호가 올바르지 않습니다.
    </div>
  </div>
</div>
```

- [ ] `ops.html` script에 인증 로직 추가

```javascript
const OPS_AUTH_KEY = "dmc_ops_owner_verified";

async function tryAuth() {
  const pw = document.getElementById("authPw").value;
  const res = await fetch(`${apiBase()}?action=verify-admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pw }),
  });
  const data = await res.json();
  if (data.ok && data.role === "owner") {
    sessionStorage.setItem(OPS_AUTH_KEY, pw); // ownerPw 보관 (이후 API 호출에 사용)
    document.getElementById("authOverlay").style.display = "none";
    initOps();
  } else {
    document.getElementById("authError").style.display = "block";
  }
}

function getOwnerPw() {
  return sessionStorage.getItem(OPS_AUTH_KEY) || "";
}
```

> **주의:** sessionStorage에 ownerPw 저장 (탭 닫으면 소멸). 이후 오너 전용 API 호출 시 `ownerPw: getOwnerPw()`를 body에 포함.

- [ ] 페이지 로드 시 세션 확인, 없으면 오버레이 표시

```javascript
window.addEventListener("DOMContentLoaded", () => {
  if (!sessionStorage.getItem(OPS_AUTH_KEY)) {
    document.getElementById("authOverlay").style.display = "flex";
  } else {
    initOps();
  }
});
```

- [ ] 로컬 에뮬레이터에서 ops.html 접속, 오너 비밀번호 입력 후 진입 확인

**커밋:**
```bash
git add functions/.env ops.html
git commit -m "feat(ops): 오너 전용 비밀번호 인증 추가"
```

---

## Task 2: Firestore `race_events` 스키마 확장

**Files:**
- Modify: `functions/index.js` (API 추가 전 스키마 정의)
- Modify: `_docs/knowledge/data-dictionary.md`

### 2-1. `race_events` 추가 필드 정의

단체 대회로 승격된 `race_events` 문서에 아래 필드 추가:

```javascript
{
  // 기존 필드 유지
  // ...

  // 신규 필드
  isGroupEvent: true,                        // 단체 대회 여부
  participants: [                            // 참가자 목록
    { memberId: "abc123", realName: "홍길동", nickname: "길동이" }
  ],
  groupSource: null,                         // 기록 소스 (오너 입력)
  // groupSource 예: { source: "smartchip", sourceId: "202650000099" }
  groupScrapeStatus: "pending",             // "pending" | "running" | "done" | "failed"
  groupScrapeJobId: null,                   // 스크랩 완료 후 scrape_jobs ID
  groupScrapeTriggeredAt: null,             // 스크랩 트리거 시각 (ISO KST)
  promotedAt: "2026-03-01T10:00:00+09:00", // 승격 시각
}
```

- [ ] `_docs/knowledge/data-dictionary.md`에 위 스키마 추가

---

## Task 3: `group-events` API 구현

**Files:**
- Modify: `functions/index.js` — `race` Cloud Function 내부에 추가

`functions/index.js`의 `if (action === "fix-phantom-jobs" ...` 블록 앞에 아래 블록 추가.

### 3-1. GET — 단체 대회 목록 조회

```javascript
if (action === "group-events" && req.method === "GET") {
  // 1. race_events 중 isGroupEvent=true 조회
  const groupSnap = await db.collection("race_events")
    .where("isGroupEvent", "==", true)
    .get();
  const groupEvents = [];
  groupSnap.forEach(doc => groupEvents.push({ id: doc.id, ...doc.data() }));

  // 2. 고러닝 목록 (캐시 재사용)
  const cacheDoc = await db.collection("ops_meta").doc("last_gorunning_crawl").get();
  const gorunningEvents = cacheDoc.exists ? (cacheDoc.data().events || []) : [];

  // 3. 이미 단체 대회로 등록된 것 제외한 고러닝 목록
  const promotedGorunningIds = new Set(groupEvents.map(e => e.gorunningId).filter(Boolean));
  const availableGorunning = gorunningEvents.filter(e => !promotedGorunningIds.has(e.id));

  return res.json({ ok: true, groupEvents, availableGorunning });
}
```

- [ ] 구현 후 `curl` 로컬 테스트:
  ```bash
  curl "http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race?action=group-events"
  ```
  Expected: `{ ok: true, groupEvents: [], availableGorunning: [...] }`

### 3-2. POST promote — 단체 대회 승격

```javascript
if (action === "group-events" && req.method === "POST" && req.body.subAction === "promote") {
  const { gorunningId, eventName, eventDate } = req.body;
  if (!gorunningId || !eventName || !eventDate) {
    return res.status(400).json({ ok: false, error: "gorunningId, eventName, eventDate required" });
  }

  // canonicalEventId 생성 (기존 유틸 사용)
  const { makeCanonicalEventId } = require("./lib/canonicalEventId");
  const canonicalEventId = makeCanonicalEventId(eventDate, eventName);
  const ref = db.collection("race_events").doc(canonicalEventId);

  await ref.set({
    eventName, eventDate,
    isGroupEvent: true,
    participants: [],
    groupSource: null,
    groupScrapeStatus: "pending",
    groupScrapeJobId: null,
    groupScrapeTriggeredAt: null,
    gorunningId,
    promotedAt: new Date().toISOString(),
  }, { merge: true });

  return res.json({ ok: true, canonicalEventId });
}
```

- [ ] 테스트:
  ```bash
  curl -X POST "http://127.0.0.1:5001/.../race?action=group-events" \
    -H "Content-Type: application/json" \
    -d '{"subAction":"promote","gorunningId":"gr_001","eventName":"2026 서울국제마라톤","eventDate":"2026-03-22"}'
  ```
  Expected: `{ ok: true, canonicalEventId: "evt_2026-03-22_2026-seoul..." }`

### 3-3. POST participants — 참가자 저장

```javascript
if (action === "group-events" && req.method === "POST" && req.body.subAction === "participants") {
  const { canonicalEventId, participants } = req.body;
  // participants: [{ memberId, realName, nickname }]
  if (!canonicalEventId || !Array.isArray(participants)) {
    return res.status(400).json({ ok: false, error: "canonicalEventId and participants[] required" });
  }

  // memberId 유효성 검증
  const memberIds = participants.map(p => p.memberId);
  const memberDocs = await Promise.all(memberIds.map(id => db.collection("members").doc(id).get()));
  const invalid = memberIds.filter((id, i) => !memberDocs[i].exists);
  if (invalid.length > 0) {
    return res.status(400).json({ ok: false, error: `유효하지 않은 memberId: ${invalid.join(", ")}` });
  }

  await db.collection("race_events").doc(canonicalEventId).update({ participants });
  return res.json({ ok: true });
}
```

- [ ] 테스트:
  ```bash
  curl -X POST "..." -d '{"subAction":"participants","canonicalEventId":"evt_...","participants":[{"memberId":"abc","realName":"홍길동","nickname":"길동이"}]}'
  ```
  Expected: `{ ok: true }`

### 3-4. POST source — 기록 소스 매핑 (오너 전용)

```javascript
if (action === "group-events" && req.method === "POST" && req.body.subAction === "source") {
  const { ownerPw, canonicalEventId, source, sourceId } = req.body;

  // 오너 검증
  const expectedOwnerPw = process.env.DMC_OWNER_PW;
  if (!expectedOwnerPw || ownerPw !== expectedOwnerPw) {
    return res.status(403).json({ ok: false, error: "오너 권한 필요" });
  }
  if (!canonicalEventId || !source || !sourceId) {
    return res.status(400).json({ ok: false, error: "canonicalEventId, source, sourceId required" });
  }

  await db.collection("race_events").doc(canonicalEventId).update({
    groupSource: { source, sourceId },
  });
  return res.json({ ok: true });
}
```

- [ ] 테스트 (올바른 ownerPw):
  ```bash
  curl -X POST "..." -d '{"subAction":"source","ownerPw":"<ownerPw>","canonicalEventId":"evt_...","source":"smartchip","sourceId":"202650000099"}'
  ```
  Expected: `{ ok: true }`
- [ ] 테스트 (잘못된 ownerPw):
  Expected: `{ ok: false, error: "오너 권한 필요" }` (403)

### 3-5. POST scrape — 수동 스크랩 트리거 (오너 전용)

기존 `scrape` 액션을 내부적으로 호출하는 헬퍼 함수로 분리.

```javascript
if (action === "group-events" && req.method === "POST" && req.body.subAction === "scrape") {
  const { ownerPw, canonicalEventId } = req.body;

  // 오너 검증
  const expectedOwnerPw = process.env.DMC_OWNER_PW;
  if (!expectedOwnerPw || ownerPw !== expectedOwnerPw) {
    return res.status(403).json({ ok: false, error: "오너 권한 필요" });
  }

  const eventDoc = await db.collection("race_events").doc(canonicalEventId).get();
  if (!eventDoc.exists) return res.status(404).json({ ok: false, error: "대회 없음" });

  const event = eventDoc.data();
  if (!event.groupSource) return res.status(400).json({ ok: false, error: "기록 소스 미입력" });
  if (!event.participants || event.participants.length === 0) {
    return res.status(400).json({ ok: false, error: "참가자 미등록" });
  }

  const { source, sourceId } = event.groupSource;
  const memberRealNames = event.participants.map(p => p.realName);

  // 기존 scrape 액션 로직 재사용을 위해 내부 호출
  // scrape 액션의 핵심 로직을 별도 함수로 분리한 후 여기서 호출
  // (Task 3-5 구현 시 scrape 액션 리팩토링 포함)
  await db.collection("race_events").doc(canonicalEventId).update({
    groupScrapeStatus: "running",
    groupScrapeTriggeredAt: new Date().toISOString(),
  });

  // 비동기로 스크랩 실행 (응답 먼저 반환)
  triggerGroupScrape({ canonicalEventId, source, sourceId, memberRealNames, event, db, scraper })
    .catch(err => console.error("[group-events scrape]", err));

  return res.json({ ok: true, message: "스크랩 시작됨" });
}
```

- [ ] `triggerGroupScrape` 헬퍼 함수 구현 (scrape 액션 내부 로직 추출)
  - 헬퍼 완료 시 `race_events` 업데이트 필수 (갭 탐지가 이 ID를 사용함):
    ```javascript
    async function triggerGroupScrape({ canonicalEventId, source, sourceId, memberRealNames, db, scraper }) {
      try {
        // 기존 scrape 액션 핵심 로직 실행 (scrape_jobs 문서 생성 포함)
        const jobId = await runGroupScrapeLogic({ source, sourceId, memberRealNames, db, scraper });

        // 완료 후 race_events 업데이트 — 갭 탐지의 groupScrapeJobId 의존
        await db.collection("race_events").doc(canonicalEventId).update({
          groupScrapeJobId: jobId,
          groupScrapeStatus: "done",
        });
      } catch (err) {
        await db.collection("race_events").doc(canonicalEventId).update({
          groupScrapeStatus: "failed",
        });
        throw err;
      }
    }
    ```
- [ ] 테스트: 소스 매핑된 대회에서 스크랩 트리거 후 `scrape_jobs`에 잡 생성 확인
- [ ] 테스트: 스크랩 완료 후 `race_events.groupScrapeJobId` 및 `groupScrapeStatus: "done"` 업데이트 확인

### 3-6. GET gap — 갭 탐지 결과 조회

```javascript
if (action === "group-events" && req.method === "GET" && req.query.subAction === "gap") {
  const { canonicalEventId } = req.query;
  if (!canonicalEventId) return res.status(400).json({ ok: false, error: "canonicalEventId required" });

  const eventDoc = await db.collection("race_events").doc(canonicalEventId).get();
  if (!eventDoc.exists) return res.status(404).json({ ok: false, error: "대회 없음" });

  const event = eventDoc.data();
  const participants = event.participants || [];

  if (!event.groupScrapeJobId) {
    return res.json({ ok: true, status: "not_scraped", participants, results: [] });
  }

  // scrape_jobs에서 결과 가져오기
  const jobDoc = await db.collection("scrape_jobs").doc(event.groupScrapeJobId).get();
  const scrapeResults = jobDoc.exists ? (jobDoc.data().results || []) : [];

  // 갭 탐지: participants[].realName vs scrapeResults[].memberRealName
  // 동명이인 대비: realName 기준으로 배열 groupBy (Map은 동명이인 마지막 값만 남김)
  const resultsByName = scrapeResults.reduce((acc, r) => {
    (acc[r.memberRealName] = acc[r.memberRealName] || []).push(r);
    return acc;
  }, {});

  const gap = participants.map(p => {
    const matches = resultsByName[p.realName] || [];
    if (matches.length === 0) {
      return { ...p, gapStatus: "missing", result: null };
    }
    // 동명이인: 같은 이름 결과가 2개 이상이면 ambiguous (후보 최대 3개)
    if (matches.length > 1 || matches[0].status === "ambiguous") {
      return { ...p, gapStatus: "ambiguous", candidates: matches.slice(0, 3) };
    }
    return { ...p, gapStatus: "ok", result: matches[0] };
  });

  return res.json({ ok: true, status: "scraped", gap });
}
```

- [ ] 테스트: 스크랩 완료 대회에서 갭 조회
  Expected: `{ ok: true, status: "scraped", gap: [{..., gapStatus: "ok"|"ambiguous"|"missing"}] }`

**커밋:**
```bash
git add functions/index.js _docs/knowledge/data-dictionary.md
git commit -m "feat(api): group-events API 구현 (6개 액션)"
```

---

## Task 4: Cloud Scheduler — `groupEventAutoScrape`

**Files:**
- Modify: `functions/index.js`

`weeklyDiscoverAndScrape` 블록 다음에 추가.

```javascript
exports.groupEventAutoScrape = onSchedule(
  { schedule: "0 15 * * *", timeZone: "Asia/Seoul", region: "asia-northeast3" },
  async () => {
    // KST 오늘 날짜 (YYYY-MM-DD)
    const todayKst = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

    // 오늘 단체 대회 중 소스 매핑됐으나 아직 스크랩 안 된 것
    const snap = await db.collection("race_events")
      .where("isGroupEvent", "==", true)
      .where("eventDate", "==", todayKst)
      .get();

    for (const doc of snap.docs) {
      const event = doc.data();
      if (!event.groupSource) {
        console.log(`[groupEventAutoScrape] 소스 미입력 건너뜀: ${doc.id}`);
        continue;
      }
      if (event.groupScrapeStatus === "done" || event.groupScrapeStatus === "running") {
        console.log(`[groupEventAutoScrape] 이미 스크랩됨 건너뜀: ${doc.id}`);
        continue;
      }
      if (!event.participants || event.participants.length === 0) {
        console.log(`[groupEventAutoScrape] 참가자 없음 건너뜀: ${doc.id}`);
        continue;
      }

      console.log(`[groupEventAutoScrape] 스크랩 시작: ${doc.id}`);
      await triggerGroupScrape({
        canonicalEventId: doc.id,
        source: event.groupSource.source,
        sourceId: event.groupSource.sourceId,
        memberRealNames: event.participants.map(p => p.realName),
        event,
        db,
        scraper,
      }).catch(err => console.error(`[groupEventAutoScrape] 오류 ${doc.id}:`, err));
    }
  }
);
```

- [ ] 로컬 테스트: `testWeekendCheck` 패턴으로 HTTP 트리거 테스트 엔드포인트 추가
  ```javascript
  exports.testGroupScrape = onRequest(async (req, res) => {
    // groupEventAutoScrape 로직 동일하게 실행
  });
  ```
- [ ] 테스트: 오늘 날짜로 단체 대회 생성 후 트리거 확인

**커밋:**
```bash
git add functions/index.js
git commit -m "feat(scheduler): groupEventAutoScrape 추가 (15:00 KST, timeZone Asia/Seoul)"
```

---

## Task 4-b: Firestore 복합 인덱스 추가

**Files:**
- Modify: `firestore.indexes.json`

`groupEventAutoScrape` 스케줄러와 GET group-events 필터가 `isGroupEvent + eventDate` 두 필드를 동시에 조회함. Firestore는 복합 쿼리에 인덱스를 요구함.

```json
{
  "indexes": [
    {
      "collectionGroup": "race_events",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "isGroupEvent", "order": "ASCENDING" },
        { "fieldPath": "eventDate", "order": "ASCENDING" }
      ]
    }
  ]
}
```

- [ ] `firestore.indexes.json`에 위 인덱스 추가 (기존 인덱스 유지하며 append)
- [ ] `firebase deploy --only firestore:indexes` 로 인덱스 배포 (빌드 시간 수 분 소요)

**커밋:**
```bash
git add firestore.indexes.json
git commit -m "feat(firestore): race_events isGroupEvent+eventDate 복합 인덱스 추가"
```

---

## Task 5: `ops.html` 단체 대회 소스매핑 섹션

**Files:**
- Modify: `ops.html`

### 5-1. 소스 미매핑 경고 배너

`ops.html` 기존 섹션 상단에 추가:

```javascript
async function checkGroupEventAlerts() {
  const res = await fetch(`${apiBase()}?action=group-events`);
  const data = await res.json();
  if (!data.ok) return;

  // 오늘 또는 내일 대회 중 소스 미매핑
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

  const alerts = data.groupEvents.filter(e =>
    (e.eventDate === today || e.eventDate === tomorrow) && !e.groupSource
  );
  if (alerts.length > 0) {
    // 배너 표시: "⚠️ 오늘/내일 단체 대회 N건 소스 미입력"
    renderGroupAlert(alerts);
  }
}
```

### 5-2. 단체 대회 소스매핑 섹션

```html
<section id="groupEventsSection">
  <h2>단체 대회 기록 소스 관리</h2>
  <div id="groupEventsList"></div>
</section>
```

```javascript
function renderGroupEventSource(event) {
  // 각 단체 대회 카드: 이름, 날짜, 소스 입력 필드, 저장+즉시스크랩 버튼
}

async function saveGroupSource(canonicalEventId, source, sourceId) {
  const res = await fetch(`${apiBase()}?action=group-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subAction: "source",
      ownerPw: getOwnerPw(),       // Task 1에서 구현한 함수
      canonicalEventId,
      source,
      sourceId,
    }),
  });
  // 저장 성공 시 즉시 스크랩 트리거
  if (res.ok) {
    try {
      await triggerGroupScrapeFromOps(canonicalEventId);
    } catch (e) {
      // 소스 저장은 성공했지만 스크랩 트리거 실패 — UI에 명확히 표시
      showToast("소스 저장 완료. 스크랩 트리거 실패 — 다시 시도하거나 자동 스케줄러(15:00)를 기다리세요.", "warning");
    }
  }
}
```

- [ ] 에뮬레이터에서 ops.html 접속, 로그인 후 단체 대회 목록 표시 확인
- [ ] 소스 입력 후 저장 → Firestore `race_events` 업데이트 확인
- [ ] 즉시 스크랩 트리거 → `scrape_jobs` 생성 확인

**커밋:**
```bash
git add ops.html
git commit -m "feat(ops): 단체 대회 소스매핑 섹션 추가"
```

---

## Task 6: `group.html` 신규 페이지

**Files:**
- Create: `group.html`

목업(`mockup-group-event.html`) 기반으로 실제 API 연동.

### 6-1. 페이지 구조

```
group.html
├── 인증 오버레이 (운영자 비밀번호, report.html 패턴 동일)
├── 페이지 헤더 (← 기록 관리 링크)
├── 단체 대회 목록 (isGroupEvent=true)
│   ├── 참가자 선택 UI
│   ├── 기록 소스 상태 표시 (읽기 전용)
│   └── 갭 탐지 결과 (스크랩 후)
└── 고러닝 예정 대회 목록 (단체 대회 등록 버튼)
```

### 6-2. 주요 API 호출

```javascript
// 페이지 로드
GET  ?action=group-events                          → 단체 대회 + 고러닝 목록

// 단체 대회 등록
POST ?action=group-events  { subAction: "promote", gorunningId, eventName, eventDate }

// 참가자 저장
POST ?action=group-events  { subAction: "participants", canonicalEventId, participants }

// 참가자 선택 모달 — 회원 목록
GET  ?action=all-members                           → 기존 API 재사용

// 갭 탐지 결과
GET  ?action=group-events&subAction=gap&canonicalEventId=...

// 기록 확정 (동명이인 선택 포함)
POST ?action=confirm       { jobId, results, confirmSource: "operator", canonicalEventId }
```

### 6-3. 갭 탐지 결과 렌더링

```javascript
function renderGapResult(gap) {
  return gap.map(p => {
    if (p.gapStatus === "ok") {
      return `✅ ${p.nickname} — ${p.result.finishTime} (${p.result.rank}위)`;
    }
    if (p.gapStatus === "ambiguous") {
      // 후보 최대 3개 라디오 버튼 표시
      return renderAmbiguousCandidates(p);
    }
    if (p.gapStatus === "missing") {
      return `🔴 ${p.nickname} — 기록 없음 [재스크랩 | DNS | DNF]`;
    }
  });
}
```

### 6-4. DNS/DNF 처리

🔴 항목에서 DNS/DNF 선택 시 `race_results`에 저장.

**사전 확인 필요 (구현 전):** 기존 `confirm` 액션이 `dnStatus` 필드를 지원하는지 `functions/index.js` 의 confirm 처리 코드 확인.
- 지원 안 하면 → `confirm` 액션에 `dnStatus` 처리 로직 추가 (결과를 `race_results`에 `{ finishTime: null, status: "dns" | "dnf" }` 로 저장)
- 새 API는 불필요. 기존 `confirm` 확장으로 처리.

```javascript
async function markDnsDnf(participant, status /* "dns" | "dnf" */, canonicalEventId) {
  // confirm API의 results에 dnStatus 포함
  // functions/index.js confirm 액션에서 dnStatus → race_results.status 로 저장
  await fetch(`${apiBase()}?action=confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jobId: groupScrapeJobId,
      results: [{ memberRealName: participant.realName, finishTime: null, dnStatus: status }],
      confirmSource: "operator",
      canonicalEventId,
    }),
  });
}
```

- [ ] `functions/index.js` confirm 액션에서 `dnStatus` 필드 처리 여부 확인
- [ ] 미지원 시 confirm 액션 확장: `result.dnStatus` 있으면 `race_results.status = result.dnStatus` 로 저장

- [ ] 에뮬레이터에서 group.html 전체 흐름 수동 테스트:
  1. 로그인
  2. 단체 대회 등록
  3. 참가자 선택 (3명 이상)
  4. (ops.html에서 소스 입력 후 스크랩)
  5. 갭 탐지 결과 확인
  6. 일괄 확정

**커밋:**
```bash
git add group.html
git commit -m "feat: group.html 단체 대회 관리 페이지 추가"
```

---

## Task 7: 통합 테스트 및 배포

- [ ] `pre-deploy-test.sh` 실행 → 전체 통과 확인
- [ ] Firestore 백업
- [ ] `firebase deploy --only functions`
- [ ] `firebase deploy --only hosting`
- [ ] 프로덕션에서 ops.html 오너 로그인 확인
- [ ] 프로덕션에서 group.html 단체 대회 등록 흐름 확인
- [ ] 버전 태그: `v0.11.0`

---

## 주요 의존성 순서

```
Task 1 (ops.html 인증)
  └→ Task 5 (ops.html 소스매핑)  ← Task 3 (API) 필요
       └→ Task 4 (스케줄러)      ← triggerGroupScrape 헬퍼 필요
            └→ Task 4-b (인덱스) ← Task 4와 병렬 가능

Task 2 (스키마 정의)
  └→ Task 3 (API 구현)
       └→ Task 6 (group.html)    ← Task 3 완료 후 시작

Task 7 (배포)                    ← 모든 Task 완료 후
                                   ※ 인덱스 배포는 functions+hosting 배포 전에 선행
```
