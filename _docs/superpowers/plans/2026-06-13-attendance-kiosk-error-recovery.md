# 출석 키오스크 에러 복구·로깅 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 키오스크·출석 v2에서 POST 실패(특히 `ALREADY_CHECKED_IN`·구버전 중복) 시 **서버 명단을 재로드**해 UI와 DB를 맞추고, **출석 에러를 `event_logs`에 기록**해 베타 이후 재발을 추적할 수 있게 한다.

**Architecture:** (1) 공통 `reloadKioskRoster()`로 `status` API 결과를 `kioskState.rosterItems`에 반영 후 현재 화면 재렌더. (2) `postCheckin` 실패 시 **유사 에러 코드**면 로그 → 재로드 → `isKioskMemberDone` 재판정 → 성공 UX 또는 명확한 메시지. (3) 로깅은 **클라이언트** `race?action=log`(기존 API) + **서버** `handlePost` 오류 응답 시 `event_logs` 직접 기록(클라이언트 누락 대비). (4) 로컬 `main`에 없는 **프로덕션 키오스크 코드를 먼저 동기화**.

**Tech Stack:** Vanilla JS (`attendance-v2.js`), Firebase Functions `handlePost`, Firestore `event_logs`, 기존 `GET /attendance?action=status`.

**관련 이슈:** 베타 블로커 2 — 구 `index.html`과 v2/키오스크 동시 사용 시 중복·스테일 roster.

---

## 파일 맵

| 파일 | 책임 |
|------|------|
| `attendance-v2.js` | 키오스크 roster 재로드, 에러 분기, 클라이언트 로깅, 개인 모드 에러 정리 |
| `attendance-v2.html` | (동기화 시 변경 있을 수 있음 — 키오스크 UI·스타일) |
| `manifest.attendance-kiosk.webmanifest`, `sw.js` | 키오스크 PWA (프로덕션 동기화) |
| `functions/index.js` | `handlePost` 서버측 `event_logs` 기록 |
| `index.html` | 레거시 QR — `ALREADY_CHECKED_IN` 서버 응답 처리·status 재로드 |
| `scripts/pre-deploy-test-runner.sh` | (선택) attendance 로그 스모크 |

---

## 에러 분류 (재로드 대상)

| `error` 코드 | 재로드 | 키오스크 UX (재로드 후) |
|--------------|--------|-------------------------|
| `ALREADY_CHECKED_IN` | ✅ | `isKioskMemberDone(member)` → 「이미 출석 완료」 완료 화면; 아니면 명단 링크·짧은 안내 |
| `MEMBER_NOT_FOUND` | ✅ | 멤버 목록도 `fetchKioskMembers()` 병렬 재호출 후 그리드 재렌더 |
| 네트워크/`ok:false` 무코드 | ✅ 1회 | 재로드 후 같은 에러면 「IT 운영총무」 메시지 유지 |
| 유효성 (`nickname is required` 등) | ❌ | 입력 안내만 (재로드 불필요) |

**근거:** 구버전은 `memberId` 없이 `nicknameKey+날짜`만 저장 → 키오스크 로컬 roster에 `memberId` 없는 행이 있어 `isKioskMemberDone`이 nickname 매칭으로 동작하지만, **초기 load 실패·다른 기기 출석** 시 로컬만 stale. 재로드가 사용자가 말한 「DB 다시 로드」와 일치.

---

## 로깅 스키마 (`event_logs`)

### 이벤트명

| event | 시점 |
|-------|------|
| `attendance_checkin_error` | POST 실패 (클라이언트·서버 모두) |
| `attendance_roster_reload` | 에러 복구용 status 재조회 성공 |

### `data` 필드 (공통)

```javascript
{
  page: "attendance-kiosk" | "attendance-v2" | "attendance-legacy",
  mode: "kiosk" | "dashboard" | "search" | "guest" | "legacy",
  error: "ALREADY_CHECKED_IN",           // 서버 error 코드
  meetingDate: "2026/06/13",
  meetingType: "SAT",
  memberId: "abc123",                    // 있으면
  nickname: "닉네임",                    // 운영 추적용 (기존 my.html 피드백과 동일 수준)
  entrySource: "kiosk" | "legacy" | "v2",
  reloadTriggered: true,
  rosterCountAfter: 32                    // 재로드 후 optional
}
```

**신규 HTTP API 없음** — `race?action=log`(POST JSON) 재사용. 서버는 `handlePost` 내 `db.collection("event_logs").add` (fire-and-forget).

---

## Task 0: 프로덕션 키오스크 코드 동기화 (선행)

**Files:**
- Modify: `attendance-v2.js`, `attendance-v2.html`
- Create: `manifest.attendance-kiosk.webmanifest`, `sw.js` (프로덕션에 있으면)

- [ ] **Step 1: 프로덕션 Hosting 파일 가져오기**

```bash
curl -sS "https://dmc-attendance.web.app/attendance-v2.js" -o attendance-v2.js
curl -sS "https://dmc-attendance.web.app/attendance-v2.html" -o attendance-v2.html
curl -sS "https://dmc-attendance.web.app/manifest.attendance-kiosk.webmanifest" -o manifest.attendance-kiosk.webmanifest
curl -sS "https://dmc-attendance.web.app/sw.js" -o sw.js
```

- [ ] **Step 2: 로컬에서 키오스크 URL 열기 확인**

```bash
# 에뮬 또는 프로덕션 URL
# https://dmc-attendance.web.app/attendance-v2.html?mode=kiosk&meetingDate=2026-06-13&meetingType=SAT
```

Expected: 첫 글자/팀 선택 화면 표시.

- [ ] **Step 3: Commit**

```bash
git add attendance-v2.js attendance-v2.html manifest.attendance-kiosk.webmanifest sw.js
git commit -m "chore: 프로덕션 키오스크 출석 페이지 동기화"
```

---

## Task 1: 공통 로깅 헬퍼 (`attendance-v2.js`)

**Files:**
- Modify: `attendance-v2.js` (상단 상수·헬퍼)

- [ ] **Step 1: `RACE_LOG_API` 상수 추가**

```javascript
const RACE_LOG_API = IS_LOCAL
  ? "http://" + location.hostname + ":5001/dmc-attendance/asia-northeast3/race"
  : "https://asia-northeast3-dmc-attendance.cloudfunctions.net/race";
```

(api-patterns.md — `API_BASE`는 상수; race 엔드포인트는 attendance와 별도 URL)

- [ ] **Step 2: `logAttendanceEvent(event, data)` 구현**

```javascript
function logAttendanceEvent(event, data) {
  const mode = new URLSearchParams(location.search).get("mode") === "kiosk" ? "kiosk" : "personal";
  const payload = {
    event,
    data: {
      page: mode === "kiosk" ? "attendance-kiosk" : "attendance-v2",
      mode,
      ...data,
    },
  };
  fetch(RACE_LOG_API + "?action=log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
```

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(attendance-v2): event_logs용 logAttendanceEvent 헬퍼"
```

---

## Task 2: 키오스크 roster 재로드 (`attendance-v2.js`)

**Files:**
- Modify: `attendance-v2.js` — `reloadKioskRoster`, `handleKioskMemberCheckin`

- [ ] **Step 1: `reloadKioskRoster(reason)` 구현**

```javascript
async function reloadKioskRoster(reason) {
  const status = await fetchKioskRoster(
    kioskState.meetingDateKey,
    kioskState.meetingType
  );
  kioskState.rosterItems = Array.isArray(status.items) ? status.items : [];
  logAttendanceEvent("attendance_roster_reload", {
    reason: reason || "manual",
    meetingDate: kioskState.meetingDateKey,
    meetingType: kioskState.meetingType,
    rosterCountAfter: kioskState.rosterItems.length,
  });
  return kioskState.rosterItems;
}
```

- [ ] **Step 2: `shouldReloadRosterOnError(code)` 헬퍼**

```javascript
function shouldReloadRosterOnError(code) {
  return code === "ALREADY_CHECKED_IN" || code === "MEMBER_NOT_FOUND" || !code;
}
```

(`!code` → 네트워크/미분류 서버 오류 1회 재로드)

- [ ] **Step 3: `handleKioskMemberCheckin` 수정**

기존 `catch`를 다음 순서로 교체:

1. `logAttendanceEvent("attendance_checkin_error", { error: e.code, memberId, nickname, meetingDate, meetingType, entrySource: "kiosk" })`
2. `if (shouldReloadRosterOnError(e.code)) { await reloadKioskRoster(e.code); await fetchKioskMembers() → kioskState.members 갱신 (MEMBER_NOT_FOUND 시) }`
3. `kioskState.pendingMemberId = ""`
4. `if (isKioskMemberDone(member)) { showKioskDone(member, "이미 출석 완료"); return; }`
5. `if (e.code === "ALREADY_CHECKED_IN") { showKioskDone(member, "이미 출석 완료"); return; }` (재로드 후에도 done 판정 실패 시 — 레거시 닉네임 불일치)
6. `renderKioskCurrentMemberScreen(); setKioskMessage("출석 처리에 실패했습니다...", "error")`

**제거:** `ALREADY_CHECKED_IN` 시 `addKioskRosterItem`만 하고 재로드 생략하는 기존 낙관적 업데이트 (재로드가 SSOT).

- [ ] **Step 4: 수동 검증 (에뮬 또는 스테이징)**

1. 에뮬 Firestore에 `attendance` 문서 1건 (`nicknameKey`만, `memberId` null) 시드 — 구버전 시뮬레이션  
2. 키오스크에서 동일 닉네임 회원 탭  
Expected: 에러 없이 「이미 출석 완료」 또는 카드 `done` 상태.

- [ ] **Step 5: Commit**

```bash
git commit -am "fix(kiosk): 출석 에러 시 roster 재로드 및 ALREADY_CHECKED_IN 복구"
```

---

## Task 3: 개인 모드(v2) 에러·로깅 정리

**Files:**
- Modify: `attendance-v2.js` — `elCheckinBtn`, `guestSubmitBtn` catch 블록

- [ ] **Step 1: 대시보드 출석 catch에 로깅 + sessionCount 재조회**

`ALREADY_CHECKED_IN` 시:
- `logAttendanceEvent("attendance_checkin_error", ...)`
- `refreshSessionCountLine()` 호출 (기존 status 라인 갱신)
- 기존 명단 링크 UX 유지

- [ ] **Step 2: 게스트 출석 catch에 로깅**

`logAttendanceEvent` + 기존 alert/confirm 유지.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(attendance-v2): 개인 모드 출석 에러 event_logs 기록"
```

---

## Task 4: 레거시 `index.html` — 서버 중복 응답 처리

**Files:**
- Modify: `index.html` — `submitAttendance` catch

**문제:** 현재 서버 `ALREADY_CHECKED_IN`도 `catch`에서 「네트워크 오류」로만 표시 (line ~1060).

- [ ] **Step 1: 응답 JSON 파싱 후 분기**

```javascript
const json = await res.json();
if (!json.ok) {
  if (json.error === "ALREADY_CHECKED_IN") {
    await refreshTodayList(); // 또는 applyStatus from date
    setMsg("이미 출석된 기록이 있습니다.", "error");
    trackEvent("attendance_submit_error", { error_type: "already_checked_in_server", date_key: date });
    // race log — fetch race API (index에 RACE_LOG_URL 상수 추가)
    return;
  }
  throw new Error(json.error || "submit failed");
}
```

- [ ] **Step 2: `refreshTodayList`가 해당 `date`로 status 재조회하는지 확인**

- [ ] **Step 3: Commit**

```bash
git commit -am "fix(index): ALREADY_CHECKED_IN 시 명단 재로드 및 메시지 분리"
```

---

## Task 5: 서버 `handlePost` 에러 로깅

**Files:**
- Modify: `functions/index.js` — `handlePost` 내 `ALREADY_CHECKED_IN` 반환 직전, `catch` 블록

- [ ] **Step 1: `logAttendanceServerEvent(event, data)` 헬퍼 (functions 내부)**

```javascript
function logAttendanceServerEvent(event, data) {
  db.collection("event_logs").add({
    event,
    data: { page: "attendance-api", ...data },
    timestamp: new Date().toISOString(),
    ua: "cloud-functions",
  }).catch(() => {});
}
```

- [ ] **Step 2: `ALREADY_CHECKED_IN` 반환 전 호출**

```javascript
logAttendanceServerEvent("attendance_checkin_error", {
  error: "ALREADY_CHECKED_IN",
  nicknameKey,
  memberId,
  meetingDateKey,
  existingNickname: existingData.nickname,
});
```

- [ ] **Step 3: 에뮬 테스트**

```bash
# 두 번째 POST → event_logs에 attendance_checkin_error 1건
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(api): 출석 ALREADY_CHECKED_IN 서버 event_logs 기록"
```

---

## Task 6: 배포 전 검증

- [ ] **Step 1: `bash scripts/pre-deploy-test.sh`**

Expected: `✅ 전체 통과 — 배포 가능`

- [ ] **Step 2: 수동 시나리오 체크리스트**

| # | 시나리오 | 기대 |
|---|----------|------|
| 1 | 구 index로 출석 → 키오스크 동일인 탭 | 완료/이미 출석, 에러 토스트 없음 |
| 2 | 키오스크 두 번 탭 | 두 번째는 완료 상태 |
| 3 | 위 실패 시 `event_logs` | `attendance_checkin_error` + `attendance_roster_reload` |
| 4 | 개인 v2 대시보드 중복 | 명확 메시지, 로그 1건 |

- [ ] **Step 3: `_docs/log/2026-06-13.md`에 검증 결과 한 줄**

---

## Task 7: 배포 (사용자 실행)

AI는 `firebase deploy` 실행하지 않음.

사용자 순서:

1. `bash scripts/pre-deploy-test.sh`
2. `cd functions && node ../scripts/backup-firestore.js`
3. `firebase deploy --only functions` → `firebase deploy --only hosting`
4. 키오스크 URL로 현장 스모크
5. `git tag -a v0.14.0 -m "출석 키오스크 에러 복구·로깅"` (버전은 운영 루틴에 따름)

---

## 범위 밖 (이번 플랜)

- 블로커 1: 명단 외 사용자 UX (별도 스펙)
- `status` API의 `meetingType` 필터 (현재 날짜 전체 반환 — 키오스크는 URL로 날짜 고정, 당일 혼합 정모는 드묾)
- QR/GitHub Pages 갱신

---

## 실행 옵션

Plan complete and saved to `_docs/superpowers/plans/2026-06-13-attendance-kiosk-error-recovery.md`.

**1. Subagent-Driven** — 태스크별 서브에이전트 + 리뷰  
**2. Inline Execution** — 이 세션에서 `executing-plans`로 연속 구현

어떤 방식으로 진행할지 알려주세요.
