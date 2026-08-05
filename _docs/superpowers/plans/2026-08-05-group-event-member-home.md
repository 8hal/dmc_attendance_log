# 단체 대회 회원 홈 (`event-home`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원용 `event-home.html`과 짧은 `event-list.html`, 출석 더보기 진입, 출석 프로필 기반 사전 닉을 제공해 단톡/카페 한 링크로 버스·배번으로 들어가게 한다.

**Architecture:** 순수 로직(다가오는 대회 필터, 사전 닉 해석, 버스/배번 뱃지)은 `assets/` **UMD** 모듈로 두고 `node --test`로 TDD한다(브라우저 `<script>` + Node `require`). FE는 `event-home.html` / `event-list.html`이 기존 `group-events&subAction=detail`과 (있으면) `bus-boarding&subAction=status`를 읽고 런처만 연결한다. **신규 HTTP API는 만들지 않는다** — 목록은 기존 GET `action=group-events`의 `groupEvents`를 클라이언트에서 `eventDate >= today(KST)`로 필터하고 UI에는 id·이름·날짜만 쓴다. 버스 Phase 1이 없으면 버스 런처만 숨긴다.

**Tech Stack:** Firebase Hosting static HTML/JS, Cloud Functions `exports.race` (기존 read만), Firestore `race_events`, `node:test`, 출석 `localStorage` 프로필.

**Spec:** `_docs/superpowers/specs/2026-08-05-group-event-member-home-design.md`

**Base / 의존:**
- 권장: 버스 Phase 1 브랜치(`cursor/group-event-day-boarding-design-4524`) 머지 후, 또는 그 브랜치 위에 작업.
- `main`만으로도 배번·홈·목록·더보기는 동작해야 한다(버스 런처 숨김). `@.cursor/skills/test-driven-development/SKILL.md` 순수 로직 태스크에 적용.

---

## File structure

| Path | Responsibility |
|------|----------------|
| `assets/event-member-profile.js` | 출석/legacy localStorage에서 닉·memberId 읽기, 명단 매칭 |
| `assets/event-upcoming.js` | KST today, upcoming `isGroupEvent` 필터·정렬 |
| `assets/event-home-badges.js` | 버스/배번 런처 뱃지 상태 문자열 |
| `scripts/test/event-member-profile.test.js` | 프로필 헬퍼 테스트 |
| `scripts/test/event-upcoming.test.js` | 다가오는 대회 필터 테스트 |
| `scripts/test/event-home-badges.test.js` | 뱃지 테스트 |
| `event-home.html` | 회원 홈 UI (요약·런처·접이식 일정) |
| `event-list.html` | 더보기용 0/2+ 후보 목록·빈 상태 |
| `attendance-v2.html` | 더보기 「단체 대회」 링크 → `event-list.html` |
| `my-bib.html` | 사전 닉에 `dmc_attendance_v2_profile` 우선 반영 |
| `boarding.html` | (Phase 1 있을 때만) 동일 프로필 우선순위 정렬 |
| `_docs/knowledge/data-dictionary.md` | `dayTimeline` 필드 한 줄 |
| `package.json` | 테스트 스크립트에 신규 test 파일 추가 |

**비범위 파일:** `group-detail.html`, `boarding-admin.html`, 신규 `action=*`, 결과 보드 본구현, 타임라인 편집 UI.

**목록 API 결정 (YAGNI):** 신규 `public list` API 없음. 기존 목록 응답의 `availableGorunning`·풀 필드는 회원 UI에서 무시. 나중에 페이로드 최소화가 필요하면 별도 justification.

**Browser + Node 모듈 패턴 (필수):** Task 1–3의 `assets/*.js`는 `assets/attendance-shell-router.js`와 같은 **UMD**로 작성한다. 브라우저에서 bare `module.exports` 금지.

```javascript
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.EventUpcoming = factory(); // 파일별 글로벌명
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // ... functions ...
  return { kstTodayYmd, filterUpcomingGroupEvents };
});
```

글로벌명: `EventUpcoming` / `EventMemberProfile` / `EventHomeBadges`.

**API_BASE:** `my-bib.html`과 동일 패턴을 복사한다 (`hostname === 'localhost' | '127.0.0.1'` → 에뮬 `.../race`). 호출은 항상 `` `${API_BASE}?action=...` `` (앞에 `/race`를 또 붙이지 않음).

---

### Task 1: `event-upcoming` 순수 로직 (TDD)

**Files:**
- Create: `assets/event-upcoming.js`
- Create: `scripts/test/event-upcoming.test.js`
- Modify: `package.json` (test script entry)

- [ ] **Step 1: Write the failing tests**

```javascript
// scripts/test/event-upcoming.test.js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  kstTodayYmd,
  filterUpcomingGroupEvents,
} = require(path.join(__dirname, "../../assets/event-upcoming.js"));

describe("event-upcoming", () => {
  it("kstTodayYmd returns YYYY-MM-DD for a fixed Instant", () => {
    // 2026-08-05 15:00 UTC = 2026-08-06 00:00 KST
    assert.equal(kstTodayYmd(new Date("2026-08-05T15:00:00.000Z")), "2026-08-06");
  });

  it("filterUpcomingGroupEvents keeps eventDate >= today and sorts ascending", () => {
    const rows = [
      { id: "past", isGroupEvent: true, eventDate: "2026-08-01", eventName: "P" },
      { id: "b", isGroupEvent: true, eventDate: "2026-08-10", primaryName: "B" },
      { id: "a", isGroupEvent: true, eventDate: "2026-08-05", eventName: "A" },
      { id: "ng", isGroupEvent: false, eventDate: "2026-08-20", eventName: "X" },
    ];
    const out = filterUpcomingGroupEvents(rows, "2026-08-05");
    assert.deepEqual(
      out.map((e) => e.id),
      ["a", "b"]
    );
  });

  it("filterUpcomingGroupEvents defaults today via kstTodayYmd when omitted", () => {
    const today = kstTodayYmd();
    const out = filterUpcomingGroupEvents([
      { id: "t", isGroupEvent: true, eventDate: today, eventName: "T" },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, "t");
  });

  it("filterUpcomingGroupEvents maps displayName from eventName || primaryName", () => {
    const out = filterUpcomingGroupEvents(
      [{ id: "1", isGroupEvent: true, eventDate: "2026-08-05", primaryName: "OnlyPrimary" }],
      "2026-08-05"
    );
    assert.equal(out[0].displayName, "OnlyPrimary");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
node --test scripts/test/event-upcoming.test.js
```

Expected: FAIL (module missing)

- [ ] **Step 3: Implement `assets/event-upcoming.js` (UMD — see File structure)**

Factory 내부에 `kstTodayYmd` / `filterUpcomingGroupEvents`를 두고 `return { kstTodayYmd, filterUpcomingGroupEvents }`. 글로벌 `root.EventUpcoming`. 테스트는 기존처럼 `require(...)`로 named export 사용.

`filterUpcomingGroupEvents(groupEvents, todayYmd)`: 두 번째 인자가 없으면 `todayYmd = kstTodayYmd()` 로 기본값. 호출부는 `filterUpcomingGroupEvents(data.groupEvents)` 만으로 충분.

`kstTodayYmd(now)` 구현 예 (KST 달력일):

```javascript
function kstTodayYmd(now) {
  return (now || new Date()).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
node --test scripts/test/event-upcoming.test.js
```

- [ ] **Step 5: Wire package.json script (optional dedicated or append to an existing test:* )**

Add under `scripts` e.g. `"test:event-home": "node --test scripts/test/event-upcoming.test.js scripts/test/event-member-profile.test.js scripts/test/event-home-badges.test.js"` (profile/badges files added in later tasks — add files as they exist, or create empty stubs only via subsequent tasks).

For this commit, only include `event-upcoming.test.js` in the script; extend in Tasks 2–3.

```bash
git add assets/event-upcoming.js scripts/test/event-upcoming.test.js package.json
git commit -m "feat: upcoming group-event filter helper (KST)"
```

---

### Task 2: `event-member-profile` 순수 로직 (TDD)

**Files:**
- Create: `assets/event-member-profile.js`
- Create: `scripts/test/event-member-profile.test.js`
- Modify: `package.json` (`test:event-home`에 테스트 추가)

- [ ] **Step 1: Write failing tests**

스펙 우선순위: `dmc_attendance_v2_profile` → `marathon_att_nickname` → boarding/bib 키.

```javascript
// scripts/test/event-member-profile.test.js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  readSavedIdentity,
  matchInList,
} = require(path.join(__dirname, "../../assets/event-member-profile.js"));

function storage(map) {
  return {
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null;
    },
  };
}

describe("event-member-profile", () => {
  it("prefers dmc_attendance_v2_profile nickname and memberId", () => {
    const id = readSavedIdentity(
      storage({
        dmc_attendance_v2_profile: JSON.stringify({
          nickname: "알파",
          memberId: "m1",
          team: "T1",
        }),
        marathon_att_nickname: "베타",
      })
    );
    assert.deepEqual(id, { nickname: "알파", memberId: "m1" });
  });

  it("falls back to marathon_att_nickname", () => {
    const id = readSavedIdentity(storage({ marathon_att_nickname: "베타" }));
    assert.equal(id.nickname, "베타");
    assert.equal(id.memberId, null);
  });

  it("falls back to boarding then bib keys", () => {
    const id = readSavedIdentity(
      storage({ dmc_boarding_nickname: "감마", dmc_bib_nickname: "델타" })
    );
    assert.equal(id.nickname, "감마");
  });

  it("matchInList matches memberId then nickname (case-insensitive)", () => {
    const list = [
      { nickname: "알파", memberId: "m1" },
      { nickname: "게스트", memberId: null },
    ];
    assert.equal(matchInList(list, { nickname: "x", memberId: "m1" }).nickname, "알파");
    assert.equal(matchInList(list, { nickname: "게스트", memberId: null }).nickname, "게스트");
    assert.equal(matchInList(list, { nickname: "없음", memberId: null }), null);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
node --test scripts/test/event-member-profile.test.js
```

- [ ] **Step 3: Implement `assets/event-member-profile.js` (UMD, `root.EventMemberProfile`)**

상수: `LS_PROFILE=dmc_attendance_v2_profile`, `LS_ATT=marathon_att_nickname`, `LS_BOARDING=dmc_boarding_nickname`, `LS_BIB=dmc_bib_nickname`.

`readSavedIdentity(ls)`: 프로필 JSON → 없으면 ATT → BOARDING → BIB.  
`matchInList(list, identity)`: memberId 우선, 없으면 nickname 대소문자 무시.  
`syncNicknames(ls, nickname)`: ATT·BOARDING·BIB에 동일 닉 기록.  
return에 상수+함수 포함.

- [ ] **Step 4: Run — expect PASS**

```bash
node --test scripts/test/event-member-profile.test.js
```

- [ ] **Step 5: Commit**

```bash
git add assets/event-member-profile.js scripts/test/event-member-profile.test.js package.json
git commit -m "feat: shared event member identity from attendance profile"
```

---

### Task 3: `event-home-badges` 순수 로직 (TDD)

**Files:**
- Create: `assets/event-home-badges.js`
- Create: `scripts/test/event-home-badges.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests**

```javascript
// scripts/test/event-home-badges.test.js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  busLauncherVisible,
  busBadgeLabel,
  bibBadgeLabel,
  resultsLauncherState,
} = require(path.join(__dirname, "../../assets/event-home-badges.js"));

describe("event-home-badges", () => {
  it("hides bus when missing or disabled", () => {
    assert.equal(busLauncherVisible(null), false);
    assert.equal(busLauncherVisible({ enabled: false }), false);
    assert.equal(busLauncherVisible({ enabled: true }), true);
  });

  it("bus badge: next required unboarded → 미탑승; all done → 완료", () => {
    const row = {
      legs: {
        outbound: { required: true, boarded: true },
        return: { required: true, boarded: false },
      },
    };
    assert.equal(busBadgeLabel(row), "미탑승");
    row.legs.return.boarded = true;
    assert.equal(busBadgeLabel(row), "완료");
  });

  it("bib badge from participant.bib", () => {
    assert.equal(bibBadgeLabel({ bib: "123" }), "입력됨");
    assert.equal(bibBadgeLabel({ bib: "" }), "미입력");
    assert.equal(bibBadgeLabel(null), null);
  });

  it("results launcher disabled until board exists flag true", () => {
    assert.deepEqual(resultsLauncherState(false), { enabled: false, label: "준비 중" });
    assert.deepEqual(resultsLauncherState(true), { enabled: true, label: null });
  });
});
```

- [ ] **Step 2: Run — FAIL**

```bash
node --test scripts/test/event-home-badges.test.js
```

- [ ] **Step 3: Implement `assets/event-home-badges.js` (UMD, `root.EventHomeBadges`)**

- `busLauncherVisible(busBoarding)` → `enabled === true`만 true  
- `busBadgeLabel(row)` → outbound→return 순, 첫 required&&!boarded면 `"미탑승"`, 필수 구간 모두 boarded면 `"완료"`  
- `bibBadgeLabel(participant)` → bib 있으면 `"입력됨"`, 매칭 행 있으면 빈 bib `"미입력"`, 없으면 `null`  
- `resultsLauncherState(boardReady)` → `{ enabled, label }` (`false`일 때 label `"준비 중"`)

- [ ] **Step 4: PASS + commit**

```bash
node --test scripts/test/event-home-badges.test.js
# update package.json test:event-home to include all three
git add assets/event-home-badges.js scripts/test/event-home-badges.test.js package.json
git commit -m "feat: event-home launcher badge helpers"
```

---

### Task 4: `event-list.html` (회원용 짧은 목록)

**Files:**
- Create: `event-list.html`
- Reference patterns: `my-bib.html` (`API_BASE` / `IS_LOCAL`), `assets/event-upcoming.js`

- [ ] **Step 1: Create page**

모바일 단일 컬럼. 동작:
1. `my-bib.html`과 **동일한 `API_BASE` 정의** 복사 (`api-patterns.md`).
2. `EventUpcoming.filterUpcomingGroupEvents(data.groupEvents)` — today 생략 시 헬퍼가 `kstTodayYmd()` 사용.
3. 0건: “예정된 단체 대회가 없어요” + `attendance-v2.html` 링크
4. 1건: `location.replace("event-home.html?eventId=" + encodeURIComponent(id))` (목록 깜빡임 최소화 — 로딩 중 메시지)
5. 2+건: 이름·날짜 행 리스트 → `event-home.html?eventId=`

`<script src="assets/event-upcoming.js"></script>` 후 글로벌 사용 (UMD는 Task 1에서 완료).

목록 fetch:

```javascript
const res = await fetch(`${API_BASE}?action=group-events`);
const data = await res.json();
if (!data.ok) throw new Error(data.error || "목록을 불러오지 못했어요");
const upcoming = EventUpcoming.filterUpcomingGroupEvents(data.groupEvents);
```

실패 시 인라인 “다시 시도” 버튼(재호출). `availableGorunning`·participants/gap 등 **렌더 금지**.

- [ ] **Step 2: Manual smoke (emulator or production-read against emulator)**

```bash
# emulator running with seed group events preferred
# open http://localhost:5000/event-list.html
```

Expected: 0/1/2+ 분기 중 시드에 맞는 동작.

- [ ] **Step 3: Commit**

```bash
git add event-list.html assets/event-upcoming.js
git commit -m "feat: member event-list for upcoming group events"
```

---

### Task 5: `event-home.html` 회원 홈

**Files:**
- Create: `event-home.html`
- Use: `assets/event-member-profile.js`, `assets/event-home-badges.js`
- Read: `my-bib.html` for API_BASE / detail fetch pattern

- [ ] **Step 1: Scaffold HTML/CSS**

구조:
- `#error` 숨김 기본
- `#summary`: 제목, 날짜·location, 선택 닉 칩
- `#launchers`: 버스 / 배번 / 결과 버튼
- `#timeline`: `<details>` 기본 닫힘, 제목 “당일 일정”
- footer: `attendance-v2.html` 링크

모바일 first. 기존 `assets/design-tokens.css`를 출석과 맞출 수 있으면 링크하고, 없으면 `my-bib` 수준 최소 CSS.

- [ ] **Step 2: Load detail**

```javascript
const eventId = new URLSearchParams(location.search).get("eventId");
if (!eventId) {
  showError("대회를 찾을 수 없어요");
} else {
  try {
    const res = await fetch(
      `${API_BASE}?action=group-events&subAction=detail&eventId=${encodeURIComponent(eventId)}`
    );
    const data = await res.json();
    if (!data.ok || !data.event) {
      showError("대회를 찾을 수 없어요");
    } else if (data.event.isGroupEvent !== true) {
      // missing isGroupEvent ≡ 비단체 (data-dictionary) — 동일 에러
      showError("대회를 찾을 수 없어요");
    } else {
      renderHome(data.event);
    }
  } catch (err) {
    showRetry("다시 시도"); // 스펙 §8 — 가능하면 배번 href는 유지
  }
}
```

배번 런처: 항상 `href="my-bib.html?eventId=" + encodeURIComponent(eventId)` (로드 성공 전에도 eventId만 있으면 설정 가능).

렌더: `eventName || primaryName`, `eventDate`, `location`.

- [ ] **Step 3: Identity chip + badges**

```javascript
const identity = window.EventMemberProfile.readSavedIdentity(localStorage);
const participant = window.EventMemberProfile.matchInList(event.participants || [], identity);
// bib badge from participant
```

버스:
1. `busLauncherVisible(event.busBoarding)`가 false면 버스 버튼 `hidden`
2. true면 `boarding.html?eventId=` 링크. 가능하면 status 호출:

```javascript
// graceful: try/catch — 404/network/ok:false → 뱃지 없이 링크만 또는 런처 유지
fetch(`${API_BASE}?action=bus-boarding&subAction=status&eventId=...`)
```

공개 status 응답 형태는 버스 Phase 1 코드 기준. roster가 없거나(비활성) note 스트립된 목록에서 `matchInList`로 내 행을 찾아 `busBadgeLabel`. Phase 1 없으면 catch → 버스 숨김이 이미 enabled 없으므로 OK; enabled인데 boarding 파일 없으면 링크 404 — **링크 존재 여부는 선택적으로 HEAD/가정:** `event.busBoarding.enabled`만 보고 링크하며, boarding 미배포 시 운영이 Phase 1 먼저 배포한다고 문서화.

결과: `resultsLauncherState(false)` → disabled + “준비 중” (상수 `RESULTS_BOARD_READY = false`).

- [ ] **Step 4: Timeline**

```javascript
const tl = Array.isArray(event.dayTimeline) ? event.dayTimeline : [];
if (!tl.length) timelineSection.hidden = true;
else render rows time + label inside <details>
```

- [ ] **Step 5: Manual check + commit**

```bash
git add event-home.html assets/*.js
git commit -m "feat: event-home member hub with launchers and timeline"
```

---

### Task 6: 출석 더보기 진입

**Files:**
- Modify: `attendance-v2.html` (더보기 리스트에 링크 추가)

- [ ] **Step 1: Add more-item after「내 기록」**

```html
<a class="more-item" href="event-list.html">
  <span class="more-icon" aria-hidden="true">🚌</span>
  <span class="more-text">
    <strong>단체 대회</strong>
    <span>버스 · 배번 · 당일 안내</span>
  </span>
  <span class="more-chevron" aria-hidden="true">›</span>
</a>
```

(아이콘은 출석 셸 톤에 맞게 조정 가능. 이모지 과다 지양 시 기존 more-icon 패턴의 문자 아이콘 사용.)

- [ ] **Step 2: Commit**

```bash
git add attendance-v2.html
git commit -m "feat: attendance more tab link to group event list"
```

---

### Task 7: `my-bib.html` 사전 닉 정렬

**Files:**
- Modify: `my-bib.html` (saved nickname lookup ~505)

- [ ] **Step 1: Prefer shared helper**

Script tag: `<script src="assets/event-member-profile.js"></script>`  
Replace saved nickname block with:

```javascript
const identity = window.EventMemberProfile.readSavedIdentity(localStorage);
const savedNickname = identity.nickname;
// then existing find in participants — or matchInList(participants, identity)
```

성공 저장 시 `EventMemberProfile.syncNicknames(localStorage, participant.nickname)` 호출(기존 setItem 대체 가능).

- [ ] **Step 2: Manual — set `dmc_attendance_v2_profile` in DevTools, open my-bib, expect preselect**

- [ ] **Step 3: Commit**

```bash
git add my-bib.html
git commit -m "fix: my-bib prefers attendance v2 profile nickname"
```

---

### Task 8: `boarding.html` 사전 닉 정렬 (Phase 1 있을 때만)

**Files:**
- Modify: `boarding.html` (버스 브랜치에 존재)

- [ ] **Step 1: If `boarding.html` missing on branch — skip with commit note in PR**

Otherwise same as Task 7: load `event-member-profile.js`, `readSavedIdentity` 우선, `syncNicknames` on success.

- [ ] **Step 2: Commit**

```bash
git add boarding.html
git commit -m "fix: boarding prefers attendance v2 profile nickname"
```

---

### Task 9: data-dictionary + 시드 메모

**Files:**
- Modify: `_docs/knowledge/data-dictionary.md` (`race_events` 절에 `dayTimeline` 추가)
- Optional Create: `scripts/seed-emulator-event-home.js` — 최소 `race_events` 1건 + `dayTimeline` 샘플 (에뮬 전용, `FIRESTORE_EMULATOR_HOST` 가드). 기존 seed 패턴 복사.

- [ ] **Step 1: Dictionary entry**

```markdown
| `dayTimeline` | `{ time: string, label: string }[]` (optional) | 회원 홈 접이식 당일 일정. 없으면 섹션 숨김 |
```

- [ ] **Step 2: Seed script (optional but recommended for QA)**

- [ ] **Step 3: Commit**

```bash
git add _docs/knowledge/data-dictionary.md scripts/seed-emulator-event-home.js
git commit -m "docs: race_events.dayTimeline + event-home emulator seed"
```

---

### Task 10: 통합 검증

- [ ] **Step 1: Unit tests**

```bash
npm run test:event-home
```

Expected: all PASS

- [ ] **Step 2: Emulator smoke checklist**

1. Seed upcoming group event (± dayTimeline, ± busBoarding)
2. `event-list.html` → 1건이면 home으로 redirect
3. `event-home.html?eventId=` — 요약·배번 런처·일정 접힘·결과 준비 중
4. 버스 enabled면 런처 보임 / 없으면 숨김
5. 출석 더보기 → 단체 대회
6. DevTools로 `dmc_attendance_v2_profile` 설정 후 my-bib 사전 선택

- [ ] **Step 3: Final commit if fixes needed; push; update PR**

---

## Self-review (author)

| Spec item | Task |
|-----------|------|
| event-home 전용 | T5 |
| 접이식 dayTimeline | T5, T9 |
| 사전 닉 | T2, T7, T8 |
| 더보기 0/1/2+ | T1, T4, T6 |
| 버스 degrade | T3, T5 |
| 결과 준비 중 | T3, T5 |
| 신규 API 없음 | 전 태스크 |
| 운영 FE 미수정 | 준수 |

---

## Execution handoff

Plan complete after reviewer approval. Implement via subagent-driven-development or executing-plans.
