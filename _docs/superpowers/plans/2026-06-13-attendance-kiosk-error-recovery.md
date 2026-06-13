# 출석 키오스크 베타 블로커 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **리뷰:** 2026-06-13 API·디자인 v2 + 블로커 2 통합 UX v3.  
> **설계 SSOT:** `_docs/superpowers/specs/2026-06-13-attendance-kiosk-blocker2-design.md`

**Goal:** 현장 **키오스크**를 출석 채널로 고정하고 (1) **명단 외 B·C 사용자**가 기존 **게스트 API**로 출석할 FE 경로를 추가하고, (2) POST 실패·구버전 중복 시 **roster 재로드**와 **event_logs**로 복구·추적한다. **백엔드 API 변경 없음.**

**Architecture:** (1) 키오스크 홈·빈 그리드에 「명단에 없어요」→ 기존 `guestModal` (`isGuest: true`) + `showKioskDone` + `reloadKioskRoster`. (2) 정회원 탭 실패 시 `reloadKioskRoster` + `isKioskMemberDone`. (3) 로깅 B안: server/client `attendance_checkin_error`, `attendance_roster_reload`. (4) prod 키오스크·`design-tokens.css` Git 동기화 선행.

**Tech Stack:** Vanilla JS (`attendance-v2.js`), `assets/design-tokens.css`, 기존 `POST /attendance`, `race?action=log`, Functions `handlePost` event_logs.

**관련 이슈:** 베타 블로커 2 통합 — 키오스크 URL + 구 `index.html` 병행.

---

## 파일 맵

| 파일 | 책임 |
|------|------|
| `attendance-v2.js` | 키오스크 roster 재로드, 에러 분기, 클라이언트 로깅, `isKioskProcessing` |
| `attendance-v2.html` | 키오스크 UI (`--dmc-kiosk-*` 토큰) |
| `assets/design-tokens.css` | `--dmc-*` 디자인 토큰 (프로덕션 동기화) |
| `manifest.attendance-kiosk.webmanifest`, `sw.js` | 키오스크 PWA |
| `functions/index.js` | `handlePost` 서버 `event_logs` |
| `index.html` | 레거시 QR — `ALREADY_CHECKED_IN` + GA·event_logs 병행 |
| `scripts/pre-deploy-test-runner.sh` | attendance `event_logs` 스모크 assert |
| `_docs/api/http-api-actions.md` | `status` meetingType 미지원·log 예시 (문서 동기화) |

---

## API·데이터 계약 (구현 전 확인)

### `GET ?action=status`

- **명세:** `date`(YYYY/MM/DD)만 지원. `meetingType` 쿼리는 **무시** (`http-api-actions.md`, `functions/index.js`).
- **키오스크:** `fetchKioskRoster(dateKey)` — `meetingType` 인자 제거 또는 내부에서 쓰지 않음. 당일 전체 출석을 roster SSOT로 사용 (서버 dup check도 `meetingDateKey` 기준과 동일).
- **의도:** 당일 복수 정모 혼재는 드묾. meetingType별 UI 카운트는 `sessionCount` API 사용.

### `POST /attendance` body

- **문서화된 필드:** `nickname`, `team`, `meetingType`, `meetingDate`, `memberId`, `isGuest` (`http-api-actions.md` L74).
- **`entrySource`:** 클라이언트가 POST에 넣어도 **서버는 파싱·저장하지 않음**. `event_logs.data.entrySource` 전용. OpenAPI·POST 스펙 확장 시 justification 필요.

### `race?action=log`

- **URL:** `my.html`·`api-patterns.md`와 동일 — 프로덕션 `https://race-nszximpvtq-du.a.run.app` (cloudfunctions.net URL 사용 금지).
- **본문:** `{ event, data }` — `event` 필수.

---

## 에러 분류 (재로드 대상)

| `error` 코드 | 재로드 | 키오스크 UX (재로드 후) |
|--------------|--------|-------------------------|
| `ALREADY_CHECKED_IN` | ✅ | `isKioskMemberDone(member)` → 「이미 출석 완료」 완료 화면 |
| `MEMBER_NOT_FOUND` | ✅ | `fetchKioskMembers()` 후 그리드 재렌더 |
| 네트워크/`ok:false` 무코드 | ✅ 1회 | 재시도 후 실패 시 IT 안내 |
| 유효성 (`nickname is required` 등) | ❌ | 입력 안내만 |

---

## 로깅 스키마 (`event_logs`)

### 이중 로깅 정책 (리뷰 항목 #4 — **B안 채택**)

| 발생 위치 | event | 비고 |
|-----------|-------|------|
| 서버 `handlePost` 오류 응답 | `attendance_checkin_error` | `logSource: "server"` — SSOT |
| 클라이언트 catch | `attendance_checkin_error` | `logSource: "client"` |
| 클라이언트 `reloadKioskRoster` 성공 | `attendance_roster_reload` | `logSource: "client"`, `reloadTriggered: true` |

**ops 집계:** 에러율은 `logSource === "server"`만 카운트하거나, client/server 별도 대시보드.

### `data` 필드 (공통)

```javascript
{
  logSource: "client" | "server",
  page: "attendance-kiosk" | "attendance-v2" | "attendance-legacy" | "attendance-api",
  mode: "kiosk" | "dashboard" | "search" | "guest" | "legacy",  // "personal" 사용 금지
  error: "ALREADY_CHECKED_IN",
  meetingDate: "2026/06/13",   // YYYY/MM/DD (attendance API 형식)
  meetingType: "SAT",
  memberId: "abc123",
  nickname: "닉네임",
  entrySource: "kiosk" | "legacy" | "v2",  // event_logs 전용 (POST body 아님)
  reloadTriggered: true,
  rosterCountAfter: 32
}
```

### `mode` 매핑 (`logAttendanceEvent`)

| UI 상태 | `mode` |
|---------|--------|
| `?mode=kiosk` | `kiosk` |
| `#viewDashboard` 활성 | `dashboard` |
| `#viewSearch` 활성 | `search` |
| 게스트 모달 submit | `guest` |
| `index.html` | `legacy` |

---

## Task 0: 프로덕션 Hosting → Git 동기화 (선행)

**Files:**
- Modify: `attendance-v2.js`, `attendance-v2.html`
- Create: `assets/design-tokens.css`, `manifest.attendance-kiosk.webmanifest`, `sw.js`

- [ ] **Step 1: 출처 메타 기록**

```bash
curl -sI "https://dmc-attendance.web.app/attendance-v2.js" | tee /tmp/prod-v2-meta.txt
git log -1 --oneline -- attendance-v2.js attendance-v2.html 2>/dev/null || echo "no local history"
```

- [ ] **Step 2: 프로덕션 파일 fetch**

```bash
curl -sS "https://dmc-attendance.web.app/attendance-v2.js" -o attendance-v2.js
curl -sS "https://dmc-attendance.web.app/attendance-v2.html" -o attendance-v2.html
curl -sS "https://dmc-attendance.web.app/assets/design-tokens.css" -o assets/design-tokens.css
curl -sS "https://dmc-attendance.web.app/manifest.attendance-kiosk.webmanifest" -o manifest.attendance-kiosk.webmanifest
curl -sS "https://dmc-attendance.web.app/sw.js" -o sw.js
```

- [ ] **Step 3: 로컬 확인**

- 키오스크 URL에서 첫 글자/팀 화면 + **스타일 정상** (`design-tokens.css` 404 없음)
- `grep -c kiosk attendance-v2.js` > 0

- [ ] **Step 4: 단일 chore commit**

```bash
git add attendance-v2.js attendance-v2.html assets/design-tokens.css \
  manifest.attendance-kiosk.webmanifest sw.js
git commit -m "chore: 프로덕션 키오스크·design-tokens 동기화 (prod fetch $(date +%Y-%m-%d))"
```

커밋 본문에 `/tmp/prod-v2-meta.txt`의 ETag/Last-Modified 한 줄 포함.

---

## Task 1: 공통 로깅 헬퍼 (`attendance-v2.js`)

**Files:**
- Modify: `attendance-v2.js`

- [ ] **Step 1: `RACE_LOG_API` — `my.html`과 동일**

```javascript
const RACE_LOG_API = IS_LOCAL
  ? "http://" + location.hostname + ":5001/dmc-attendance/asia-northeast3/race"
  : "https://race-nszximpvtq-du.a.run.app";
```

- [ ] **Step 2: `getAttendanceLogMode()` — view 상태 반영**

```javascript
function getAttendanceLogMode() {
  if (new URLSearchParams(location.search).get("mode") === "kiosk") return "kiosk";
  if (elDash && !elDash.classList.contains("hidden")) return "dashboard";
  if (elSearch && !elSearch.classList.contains("hidden")) return "search";
  return "search";
}
```

- [ ] **Step 3: `logAttendanceEvent(event, data)`**

```javascript
function logAttendanceEvent(event, data) {
  const mode = data.mode || getAttendanceLogMode();
  const page = mode === "kiosk" ? "attendance-kiosk" : "attendance-v2";
  fetch(RACE_LOG_API + "?action=log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event,
      data: {
        logSource: "client",
        page,
        mode,
        ...data,
      },
    }),
  }).catch(() => {});
}
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(attendance-v2): logAttendanceEvent (race-nszximpvtq URL)"
```

---

## Task 2: 키오스크 roster 재로드 + 중복 탭 방지

**Files:**
- Modify: `attendance-v2.js`

- [ ] **Step 1: `fetchKioskRoster` — `meetingType` 쿼리 제거**

```javascript
async function fetchKioskRoster(meetingDateKey) {
  return fetchKioskJsonFromReadUrls(
    "?action=status&date=" + encodeURIComponent(meetingDateKey)
  );
}
```

`reloadKioskRoster` / `openKioskView` 호출부 시그니처 정리.

- [ ] **Step 2: `reloadKioskRoster(reason)`**

```javascript
async function reloadKioskRoster(reason) {
  const status = await fetchKioskRoster(kioskState.meetingDateKey);
  kioskState.rosterItems = Array.isArray(status.items) ? status.items : [];
  logAttendanceEvent("attendance_roster_reload", {
    mode: "kiosk",
    reason: reason || "manual",
    meetingDate: kioskState.meetingDateKey,
    meetingType: kioskState.meetingType,
    reloadTriggered: true,
    rosterCountAfter: kioskState.rosterItems.length,
  });
  return kioskState.rosterItems;
}
```

- [ ] **Step 3: `isKioskProcessing` 플래그** (`common-mistakes.md` #6)

```javascript
let isKioskProcessing = false;

async function handleKioskMemberCheckin(member) {
  if (isKioskProcessing || isKioskMemberDone(member)) {
    if (isKioskMemberDone(member)) showKioskDone(member, "이미 출석 완료");
    return;
  }
  isKioskProcessing = true;
  kioskState.pendingMemberId = member.id;
  renderKioskCurrentMemberScreen();
  try {
    await postCheckin({
      nickname: member.nickname,
      memberId: member.id,
      team: member.team,
      meetingType: kioskState.meetingType,
      meetingDate: kioskState.meetingDateKey,
      isGuest: false,
    });
    await reloadKioskRoster("checkin_success");
    showKioskDone(member, "출석 완료");
  } catch (e) {
    logAttendanceEvent("attendance_checkin_error", {
      mode: "kiosk",
      error: e.code || "unknown",
      memberId: member.id,
      nickname: member.nickname,
      meetingDate: kioskState.meetingDateKey,
      meetingType: kioskState.meetingType,
      entrySource: "kiosk",
    });
    if (shouldReloadRosterOnError(e.code)) {
      try {
        await reloadKioskRoster(e.code);
        if (e.code === "MEMBER_NOT_FOUND") {
          kioskState.members = await fetchKioskMembers();
        }
      } catch (_) { /* reload 실패는 아래 UX로 */ }
    }
    if (isKioskMemberDone(member)) {
      showKioskDone(member, "이미 출석 완료");
      return;
    }
    renderKioskCurrentMemberScreen();
    setKioskMessage("출석 처리에 실패했습니다. IT 운영총무에게 알려주세요.", "error");
  } finally {
    kioskState.pendingMemberId = "";
    isKioskProcessing = false;
  }
}
```

**제거:** `ALREADY_CHECKED_IN` 시 `addKioskRosterItem`만 하는 낙관적 업데이트.

- [ ] **Step 4: 수동 검증** — 구버전(`memberId` null) 시드 + 키오스크 탭 → 완료 UX.

- [ ] **Step 5: Commit**

```bash
git commit -am "fix(kiosk): roster 재로드 SSOT, isKioskProcessing, status API 정합"
```

---

## Task 2b: 키오스크 명단 외 출석 (게스트 API, FE만)

**설계:** `_docs/superpowers/specs/2026-06-13-attendance-kiosk-blocker2-design.md` §3

**Files:**
- Modify: `attendance-v2.html`, `attendance-v2.js`

**대상:** B(신규·준회원), C(명단 누락) — 동일 UI·동일 `isGuest: true` POST.

- [ ] **Step 1: HTML — 홈 CTA + 빈 그리드 힌트**

- `kioskHomePanel`에 `id="kioskGuestBtn"` 버튼: 「명단에 없어요 — 여기서 출석」
- 키오스크 모드에서 `kioskPersonalLink` **숨김** (`hidden` 또는 `display:none`)

- [ ] **Step 2: `openKioskGuestModal()`**

- `guestMeetingDate` / `guestMeetingType` ← `kioskState` (입력 필드 `hidden` + 화면에 날짜·정모 텍스트만)
- 모달 제목·안내 문구 키오스크용 (설계 §3.3)
- `guestNickname` focus

- [ ] **Step 3: `guestSubmitBtn` — 키오스크 분기**

키오스크 visible 시:

```javascript
await postCheckin({ nickname, team: "GUEST", meetingType, meetingDate, isGuest: true });
await reloadKioskRoster("guest_checkin");
elGuestModal.classList.add("hidden");
showKioskDone({ nickname }, "출석 완료"); // memberId 없음 → stats 생략
```

에러 시 Task 2와 동일: log → reload → 메시지.

- [ ] **Step 4: 멤버 그리드 빈 상태**

`elKioskMemberGrid` empty 템플릿에 `kioskGuestBtn`과 동일 동작 링크/버튼.

- [ ] **Step 5: 수동 검증**

| # | 시나리오 |
|---|----------|
| 5 | B: 명단에 없는 닉 → 게스트 출석 → `guestCount` +1, 완료 화면 |
| 6 | C: 정회원인데 그리드에 없음 → 빈 그리드 CTA → 동일 성공 |

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(kiosk): 명단 외 B·C 게스트 출석 경로 (기존 API)"
```

---

## Task 3: 개인 모드(v2) 에러·로깅

**Files:**
- Modify: `attendance-v2.js`

- [ ] **Step 1: 대시보드 `ALREADY_CHECKED_IN`**

- `logAttendanceEvent("attendance_checkin_error", { mode: "dashboard", ... })`
- `refreshSessionCountLine()` + **해당 날짜 status로 roster 갱신** (대시보드 done 표시 일관성)
- 기존 명단 링크 UX 유지

- [ ] **Step 2: 게스트 catch** — `mode: "guest"`, `entrySource: "v2"`

- [ ] **Step 3: 검색 0건 메시지** — 「현장은 키오스크 출석을 이용해 주세요」 한 줄 (설계 §4)

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(attendance-v2): 개인 모드 출석 에러 로깅·status 갱신"
```

---

## Task 4: 레거시 `index.html`

**Files:**
- Modify: `index.html`

**추적 정책:** GA `trackEvent` **유지** + `race?action=log` **병행** (`page: attendance-legacy`, `mode: legacy`).

- [ ] **Step 1: `RACE_LOG_API` 상수 추가** (Task 1과 동일 URL)

- [ ] **Step 2: `submitAttendance` — `!json.ok` 분기 (throw 전)**

```javascript
const json = await res.json();
if (!json.ok) {
  if (json.error === "ALREADY_CHECKED_IN") {
    await refreshTodayList();
    setMsg("이미 출석된 기록이 있습니다.", "error");
    trackEvent("attendance_submit_error", {
      error_type: "already_checked_in_server",
      date_key: date,
    });
    fetch(RACE_LOG_API + "?action=log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "attendance_checkin_error",
        data: {
          logSource: "client",
          page: "attendance-legacy",
          mode: "legacy",
          error: "ALREADY_CHECKED_IN",
          meetingDate: date,
          meetingType,
          nickname,
          entrySource: "legacy",
        },
      }),
    }).catch(() => {});
    setSubmitLoading(false);
    return;
  }
  throw new Error(json.error || "submit failed");
}
```

- [ ] **Step 3: Commit**

```bash
git commit -am "fix(index): ALREADY_CHECKED_IN 분기·GA+event_logs 병행"
```

---

## Task 5: 서버 `handlePost` 에러 로깅

**Files:**
- Modify: `functions/index.js`

| 조건 | 로깅 |
|------|------|
| `ALREADY_CHECKED_IN` 400 | `attendance_checkin_error` |
| `MEMBER_NOT_FOUND` 400 | `attendance_checkin_error` |
| `handlePost` catch 500 | `attendance_checkin_error`, `error: "server_exception"` |

- [ ] **Step 1: `logAttendanceServerEvent` 헬퍼**

```javascript
function logAttendanceServerEvent(event, data) {
  db.collection("event_logs").add({
    event,
    data: { logSource: "server", page: "attendance-api", ...data },
    timestamp: new Date().toISOString(),
    ua: "cloud-functions",
  }).catch(() => {});
}
```

- [ ] **Step 2: 각 오류 반환 직전 호출** — payload에 `meetingDateKey`, `meetingType`, `memberId`, `nicknameKey` 포함.

- [ ] **Step 3: 에뮬** — POST 2회 → `event_logs`에 `logSource: "server"` 1건.

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(api): handlePost 출석 오류 event_logs (server logSource)"
```

---

## Task 6: 문서·테스트

- [ ] **Step 1: `http-api-actions.md`**

- `status` 행에 «`meetingType` 쿼리 **미지원** (무시)» 주석
- `log` 행에 `attendance_checkin_error` 요청 예시 1개

- [ ] **Step 2: `pre-deploy-test-runner.sh` 스모크 (선택→권장)**

에뮬에서 attendance POST 2회 후:

```bash
resp=$(curl -s "$API?action=event-logs&limit=20")
# attendance_checkin_error with logSource server 존재 assert
```

- [ ] **Step 3: `bash scripts/pre-deploy-test.sh`** — 전체 통과

- [ ] **Step 4: 수동 체크리스트**

| # | 시나리오 | 기대 |
|---|----------|------|
| 1 | 구 index → 키오스크 동일인 | 완료 UX, 에러 없음 |
| 2 | 키오스크 연속 더블탭 | 중복 POST 없음 (`isKioskProcessing`) |
| 3 | 중복 POST | `event_logs`: server `attendance_checkin_error` 1건 + client 1건 + `attendance_roster_reload` |
| 4 | 개인 v2 대시보드 중복 | 메시지 + client log |
| 5 | 키오스크 명단 외(B) 게스트 출석 | 완료 화면, `guestCount` 반영 |
| 6 | 키오스크 그리드 빈(C) → CTA | 동일 성공 |

- [ ] **Step 5: `_docs/log/2026-06-13.md` 검증 한 줄**

- [ ] **Step 6: Commit docs**

```bash
git add _docs/api/http-api-actions.md scripts/pre-deploy-test-runner.sh
git commit -m "docs+test: 출석 status 명세·event_logs 스모크"
```

---

## Task 7: 코드 리뷰 (배포 전)

- [ ] **Step 1:** `requesting-code-review` 스킬 — default 모델, Critical/Important 수정 후 진행

---

## Task 8: 배포 (사용자 실행)

AI는 `firebase deploy` 실행하지 않음.

1. `bash scripts/pre-deploy-test.sh`
2. `cd functions && node ../scripts/backup-firestore.js`
3. `git status` 깨끗한지 확인
4. `firebase deploy --only functions` → `firebase deploy --only hosting`
5. 키오스크 URL 현장 스모크
6. `git tag -a v0.14.0 -m "출석 키오스크 에러 복구·로깅"` — **배포 전** `git tag -l 'v*' --sort=-v:refname | head -1`로 PATCH 확인 (현재 `v0.13.0`)

---

## 범위 밖

- `members` 자동 등록·게스트 행 → 정회원 마이그레이션
- `status` API `meetingType` 필터
- POST body `entrySource` 서버 저장
- QR / GitHub Pages 기본 URL 변경 (키오스크 URL은 운영 안내)

---

## 리뷰 이력

| 날짜 | 결과 |
|------|------|
| 2026-06-13 | API·디자인 리뷰 → v2 플랜 |
| 2026-06-13 | 블로커 2 통합 UX (B·C, 게스트 API, 키오스크 권장) → **v3** + 설계 스펙 |

**v3 추가:** Task 2b 키오스크 게스트 FE, 설계 문서, 체크리스트 5·6, 개인 모드 키오스크 유도 문구.

---

## 실행 옵션

1. **Subagent-Driven** — 태스크별 구현 + 리뷰  
2. **Inline Execution** — 이 세션에서 `executing-plans`로 연속 구현
