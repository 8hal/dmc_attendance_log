# DMC 출석 앱 셸 리뉴얼 — Implementation Plan (Shell-1 + 목업 게이트)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 춘백식 앱 셸(brand-bar + 4탭)을 `attendance-v2`에 올려, 오늘 체크인·더보기(키오스크)·상단 races 진입이 가능한 Shell-1을 배포 가능하게 만든다.

**Architecture:** Approach A — 기존 `attendance-v2.html`/`attendance-v2.js`를 셸로 래핑. 해시 라우팅(`#today` `#my-attendance` `#team-attendance` `#more`). 인라인 CSS를 `assets/attendance-shell.css`로 추출. 키오스크는 `?mode=kiosk` 시 셸 숨김(현행 UI 유지).

**Tech Stack:** Vanilla JS, HTML, CSS (`assets/design-tokens.css`), Firebase Hosting. Backend 변경 없음 (Shell-1).

**Spec:** `_docs/superpowers/specs/2026-07-17-attendance-shell-redesign-design.md`

**디자인 게이트 (필수):** Task 0(목업) 완료 → **사용자 디자인 컨펌** 후에만 Task 1~ 코드 착수.

**본 계획 범위:** 목업 + Shell-1만. Shell-2(내 출석)·Shell-3(팀 출석+API)·Shell-4(index 컷오버)는 별도 계획.

---

## File Structure

| 파일 | 책임 |
|------|------|
| `attendance-v2-shell-mockup.html` | **Create** — 정적 목업 (오늘/내출석/팀/더보기 + 키오스크 진입 미리보기). 데이터 하드코딩 |
| `assets/design-tokens.css` | **Modify** — shell/tab/attend 시맨틱 토큰 소량 추가 |
| `assets/attendance-shell.css` | **Create** — `.app`, brand-bar, tab-bar, stub 뷰, more 리스트 |
| `attendance-v2.html` | **Modify** — 셸 마크업, 인라인 CSS 제거(셸 부분)·링크, 베타 배너 제거/축소 |
| `attendance-v2.js` | **Modify** — hash 라우터, 탭 전환, more→키오스크, brand-bar→races, stub 탭 |
| `scripts/pre-deploy-test.sh` 또는 관련 TC | **Modify (필요 시)** — v2 URL/셸 스모크 추가 |

**건드리지 않음 (Shell-1):** `functions/index.js`, `chunbaek/`, `races.html`, `my.html`, `index.html` (리다이렉트 금지).

---

## Task 0: 정적 셸 목업 (디자인 컨펌용)

**Files:**
- Create: `attendance-v2-shell-mockup.html`
- Reference: `chunbaek/index.html` (brand-bar/tab-bar), `assets/design-tokens.css`, `_docs/superpowers/specs/2026-07-17-attendance-shell-redesign-design.md` §3–§5

- [ ] **Step 1: 목업 HTML 골격 작성**

`attendance-v2-shell-mockup.html`에 다음을 포함한다.

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>출석 셸 목업 — DMC</title>
  <link rel="stylesheet" href="assets/design-tokens.css" />
  <style>
    /* 목업 전용: .app max-width 480px, brand-bar, tab-bar, .view, stub */
    /* DMC blue 액센트. 춘백 구조만 차용 — 오렌지 금지 */
  </style>
</head>
<body>
  <div class="app">
    <header class="brand-bar">
      <img src="assets/dmc_logo.png" alt="" width="28" height="28" />
      <span class="brand-bar-title">동마클 출석</span>
      <a class="brand-bar-races" href="races.html">대회 기록</a>
    </header>
    <main class="main">
      <!-- #today: 대시보드 CTA 더미 -->
      <!-- #my-attendance: 달력/통계 더미 또는 "준비 중" -->
      <!-- #team-attendance: 팀 필터 + 멤버 행 더미 -->
      <!-- #more: 프로필 / 내 기록 / 키오스크 / 안내 -->
    </main>
    <nav class="tab-bar">
      <button type="button" class="tab-btn active" data-tab="today">오늘</button>
      <button type="button" class="tab-btn" data-tab="my-attendance">내 출석</button>
      <button type="button" class="tab-btn" data-tab="team-attendance">팀 출석</button>
      <button type="button" class="tab-btn" data-tab="more">더보기</button>
    </nav>
  </div>
  <script>
    // hash 또는 data-tab 클릭으로 .view 표시만 (API 없음)
  </script>
</body>
</html>
```

목업에 **반드시** 보여줄 화면:
1. 오늘 — 원클릭 CTA + 이번 달 요약 스니펫 (더미 숫자)
2. 내 출석 — 월 헤더 + 요약 카드 스케치 (Shell-1 스텁이면 "준비 중" 카드도 OK, 최종 UI 예시는 더미 달력이 낫다)
3. 팀 출석 — 팀 칩(내 팀 / 전체) + 멤버 리스트 더미
4. 더보기 — 프로필 카드, 내 기록, **키오스크 모드**, 이용 안내
5. brand-bar 우측 **대회 기록**

- [ ] **Step 2: 로컬에서 목업 확인**

Run:

```bash
# Hosting 에뮬 또는 단순 파일 서버
cd /workspace && python3 -m http.server 8765
# 브라우저: http://127.0.0.1:8765/attendance-v2-shell-mockup.html
```

Expected: 4탭 전환, 상단 races 링크, 더보기 키오스크 항목 보임. 모바일 폭(~390px)에서도 탭 잘림 없음.

- [ ] **Step 3: 커밋**

```bash
git add attendance-v2-shell-mockup.html
git commit -m "docs(mockup): 출석 앱 셸 정적 목업 (디자인 컨펌용)"
```

- [ ] **Step 4: ⛔ 사용자 디자인 컨펌 대기**

사용자에게 목업 URL/스크린샷을 보여주고 승인을 받는다.  
**승인 전 Task 1 이후 금지.**

피드백 반영 시 목업만 수정·재커밋 후 재승인.

---

## Task 1: 셸 CSS 토큰 + `attendance-shell.css`

**Files:**
- Modify: `assets/design-tokens.css`
- Create: `assets/attendance-shell.css`

- [ ] **Step 1: 토큰 추가 (design-tokens.css 하단)**

```css
  /* Attendance shell (2026-07-17) */
  --dmc-shell-max: 480px;
  --dmc-brand-bar-h: 52px;
  --dmc-tab-bar-h: 56px;
  --dmc-surface-muted: var(--dmc-slate-2);
  --dmc-attend-fg: var(--dmc-green-11);
  --dmc-attend-bg: var(--dmc-green-2);
```

(기존 `--dmc-*` 이름과 충돌 없이 추가. 춘백 `--brand-orange` 복사 금지.)

- [ ] **Step 2: `assets/attendance-shell.css` 작성**

춘백 `chunbaek/css/chunbaek.css`의 `.app` / `.brand-bar` / `.tab-bar` 레이아웃만 참고해 DMC 토큰으로 구현.

필수 셀렉터:
- `.app` — max-width `--dmc-shell-max`, min-height 100dvh, flex column
- `.brand-bar` — sticky top, `padding-top: env(safe-area-inset-top)`, logo + title + `.brand-bar-races`
- `.main` — flex 1, overflow auto, padding-bottom for tab-bar
- `.tab-bar` — sticky bottom, `padding-bottom: env(safe-area-inset-bottom)`, 4 equal buttons, active 상태 primary border/color
- `.view` / `.view.active` — display none/block
- `.stub-card` — "준비 중" 플레이스홀더
- `.kiosk-top-bar` — flex row: 타이틀 + `#btn-exit-kiosk` (기존 헤더가 column이면 row로 조정)
- [ ] **Step 3: 커밋**

```bash
git add assets/design-tokens.css assets/attendance-shell.css
git commit -m "feat(attendance): 앱 셸 CSS·토큰 추가"
```

---

## Task 2: `attendance-v2.html` 셸 마크업 적용

**Files:**
- Modify: `attendance-v2.html`

- [ ] **Step 1: head에 shell CSS 링크**

```html
<link rel="stylesheet" href="assets/design-tokens.css?v=20260717-shell" />
<link rel="stylesheet" href="assets/attendance-shell.css?v=20260717" />
```

인라인 `<style>`에서 **셸/레이아웃과 중복되는 규칙**은 제거하되, 기존 카드·키오스크·모달 규칙은 당분간 인라인 유지 가능 (점진 이전).

- [ ] **Step 2: body를 `.app` 셸로 감싸기 — `.wrap` 마이그레이션 규칙**

**레이아웃 규칙 (필수, 깨지면 안 됨):**

1. **개인 모드:** 기존 `.wrap`을 **삭제하지 않는다.** `#view-today` 안에서 `.wrap`을 유지한다.
   - 구조: `.app > .brand-bar + .main > #view-today > .wrap > (기존 검색/대시보드/성공)`
   - `.main`이 스크롤 컨테이너, `.wrap`의 max-width/padding은 기존 인라인 CSS 유지
2. **키오스크 모드:** `#viewKiosk`는 **`.app` 밖**에 두고, **body 직속 `.wrap`으로 한 번 감싼다** (현재 인라인 `body.kiosk-mode .wrap`이 min-height·max-width·flex column을 제공하고 `.kiosk-view { flex: 1 }`가 이에 의존함).
   - 구조: `body > .app#app-shell` + `body > .wrap#kioskWrap > #viewKiosk`
   - 개인 모드: `#kioskWrap`은 CSS/JS로 숨김 (`hidden` 또는 `display:none`). **개인용 `.wrap`은 `#view-today` 안에만**
   - 키오스크 모드: `body.kiosk-mode` + `.app { display:none }` + `#kioskWrap` 표시. **기존 `body.kiosk-mode .wrap` 규칙을 그대로 재사용** (셀렉터 재작성 불필요)
   - 대안(비권장): `#kioskWrap` 없이 `#viewKiosk`만 두고 CSS를 `#viewKiosk`로 이식 — 누락 시 현장 레이아웃 회귀
3. **모달:** `#sessionRosterModal`, 팀/게스트 모달 등은 오늘과 같이 **`body` 직속 형제**로 유지 (`.app` / `#view-today` 안으로 넣지 말 것).
4. **금지:** 개인 `.wrap`과 키오스크 `.wrap`을 하나로 합치지 말 것.

```html
<body>
  <div class="app" id="app-shell">
    <header class="brand-bar" id="brand-bar">
      <button type="button" class="brand-bar-home" id="brandBarHome" aria-label="오늘">
        <img src="assets/dmc_logo.png" alt="" width="28" height="28" />
        <span class="brand-bar-title">동마클 출석</span>
      </button>
      <a class="brand-bar-races" href="races.html">대회 기록</a>
    </header>
    <main class="main">
      <section id="view-today" class="view active">
        <div class="wrap">
          <!-- 기존 viewSearch / viewDashboard / viewSuccess 그대로 -->
        </div>
      </section>
      <section id="view-my-attendance" class="view" hidden>
        <div class="stub-card">내 출석 — 준비 중</div>
      </section>
      <section id="view-team-attendance" class="view" hidden>
        <div class="stub-card">팀 출석 — 준비 중</div>
      </section>
      <section id="view-more" class="view" hidden>
        <!-- 프로필 + #btn-edit-profile / my.html / #btn-kiosk-mode / 안내 -->
      </section>
    </main>
    <nav class="tab-bar" id="tab-bar">...</nav>
  </div>

  <!-- 키오스크 전용 wrap — 기존 body.kiosk-mode .wrap CSS 유지 -->
  <!-- 숨김: class "hidden"(display:none !important) 쓰지 말 것 — kiosk-mode flex와 충돌 -->
  <div class="wrap" id="kioskWrap" hidden>
    <section id="viewKiosk" class="kiosk-view" aria-label="현장 출석부">
      <header class="kiosk-top-bar">
        <!-- 기존 타이틀 + #btn-exit-kiosk (flex row) -->
      </header>
      <!-- 기존 키오스크 패널들 -->
    </section>
  </div>

  <!-- 모달들: body 직속 (기존 위치 유지) -->
  <script src="attendance-v2.js"></script>
</body>
```

**오늘 탭의 «현장 출석 모드» 링크 (`#openKioskModeLink` 등):** Shell-1에서는 **유지**. 더보기에도 동일 진입.

- [ ] **Step 3: 오픈 베타 배너 제거 또는 1줄로 축소**

스펙: Shell-1에서 "디자인 리뉴얼 중" 류 베타 배너 제거. 필요하면 more 안내로만.

- [ ] **Step 4: 브라우저에서 마크업만 확인 (JS 라우터 전)**

Expected: 셸·탭 버튼 보임. 오늘 영역에 기존 체크인 UI 잔존.

- [ ] **Step 5: 커밋**

```bash
git add attendance-v2.html
git commit -m "feat(attendance): v2 HTML에 앱 셸·4탭·더보기 마크업"
```

---

## Task 3: hash 라우터 + 탭·더보기·키오스크 진입

**Files:**
- Modify: `attendance-v2.js`

- [ ] **Step 1: 라우터 헬퍼 추가**

```javascript
const SHELL_TABS = ["today", "my-attendance", "team-attendance", "more"];

function parseShellHash() {
  const h = (location.hash || "#today").replace(/^#/, "");
  return SHELL_TABS.includes(h) ? h : "today";
}

function showShellTab(tabId) {
  SHELL_TABS.forEach((id) => {
    const el = document.getElementById("view-" + id);
    if (el) {
      const on = id === tabId;
      el.classList.toggle("active", on);
      el.hidden = !on;
    }
    const btn = document.querySelector('.tab-btn[data-tab="' + id + '"]');
    if (btn) btn.classList.toggle("active", id === tabId);
  });
  if (location.hash !== "#" + tabId) {
    history.replaceState(null, "", "#" + tabId);
  }
}
```

키오스크 모드(`body.kiosk-mode` 또는 URL `mode=kiosk`)에서는 `showShellTab` 호출을 건너뛰고 탭/brand-bar를 숨긴다 (CSS + early return).

**`#kioskWrap` 표시 토글 (필수 — `hidden` 속성 사용):**

기존 `openKioskView` / `showView` / kiosk init 경로에서:

```javascript
const kioskWrap = document.getElementById("kioskWrap");
const appShell = document.getElementById("app-shell");

function setKioskShellVisible(isKiosk) {
  document.body.classList.toggle("kiosk-mode", isKiosk);
  if (kioskWrap) kioskWrap.hidden = !isKiosk;
  // .app은 CSS body.kiosk-mode .app { display:none } 로 숨김
  // classList "hidden"(display:none !important)를 #kioskWrap에 쓰지 말 것
}
```

`?mode=kiosk` 진입 시 `setKioskShellVisible(true)`, 개인 모드 init 시 `setKioskShellVisible(false)`.

- [ ] **Step 2: 이벤트 바인딩 + 키오스크 종료 컨트롤 (신규)**

**진입**
- `#tab-bar` click → `data-tab` → `showShellTab`
- `hashchange` → `showShellTab(parseShellHash())`
- `#brandBarHome` → `#today`
- `#btn-kiosk-mode` (더보기) → confirm 후 키오스크 URL로 이동

confirm 문구 (스펙 §4.4):

> 공용 기기에서 사용합니다. 개인 프로필이 숨겨집니다.

```javascript
document.getElementById("btn-kiosk-mode").addEventListener("click", () => {
  if (!confirm("공용 기기에서 사용합니다. 개인 프로필이 숨겨집니다.")) return;
  const u = new URL(location.href);
  u.searchParams.set("mode", "kiosk");
  u.hash = "";
  location.href = u.toString();
});
```

**종료 (Shell-1에서 반드시 추가 — 현재 코드에 개인 모드 복귀 링크 없음)**

blocker2에서 `kioskPersonalLink`(«개인 출석»)는 제거된 상태다. **그 패턴을 부활시키지 말 것.**

대신 키오스크 화면에 **운영자용 종료**만 추가:

| 항목 | 값 |
|------|-----|
| 위치 | `#viewKiosk` 헤더(`.kiosk-top-bar`) 우측 |
| 요소 id | `#btn-exit-kiosk` |
| 라벨 | `키오스크 종료` — **"개인 출석" 문구 금지** |
| 동작 | confirm → `mode` 제거 → `attendance-v2.html#more` |

```javascript
document.getElementById("btn-exit-kiosk").addEventListener("click", exitKioskToMore);

function exitKioskToMore() {
  if (!confirm("키오스크를 종료하고 개인 화면으로 돌아갈까요?")) return;
  const u = new URL(location.href);
  u.searchParams.delete("mode");
  u.hash = "more";
  location.href = u.pathname + u.search + u.hash;
}
```
- [ ] **Step 2b: 더보기 «프로필 수정»**

`#btn-edit-profile` → 기존 팀 변경 모달 / 검색(프로필 재선택) 플로우를 호출한다. 새 화면을 만들지 말고 `attendance-v2.js`에 이미 있는 openTeamModal / 검색 뷰 진입 함수를 재사용.
- [ ] **Step 3: init에서 셸 초기화**

기존 `DOMContentLoaded` / init / `showView` / `openKioskView` 경로에 연결:

```javascript
function isKioskMode() {
  return new URLSearchParams(location.search).get("mode") === "kiosk";
}

// init 끝:
if (isKioskMode()) {
  setKioskShellVisible(true);
  // 기존 openKioskView() / 키오스크 부트스트랩 호출
} else {
  setKioskShellVisible(false);
  showShellTab(parseShellHash());
}

// openKioskView / showView("kiosk") 안에서도 setKioskShellVisible(true) 호출
```
- [ ] **Step 4: 수동 스모크**

1. `#today` — 기존 검색/대시보드/출석 동작
2. `#my-attendance` / `#team-attendance` — stub
3. `#more` — my.html 링크, 키오스크 진입
4. `?mode=kiosk` — `.app` 숨김, 기존 키오스크 플로우, **키오스크 종료 → `#more`**
5. 상단 대회 기록 → races.html
6. 더보기 프로필 수정 → 기존 팀/검색 플로우

- [ ] **Step 5: 커밋**

```bash
git add attendance-v2.js
git commit -m "feat(attendance): 셸 hash 라우터·더보기 키오스크 진입"
```

---

## Task 4: 회귀 검증 + pre-deploy

**Files:**
- Test: `bash scripts/pre-deploy-test.sh`
- Modify (필요 시): 스크립트 내 attendance-v2 스모크

- [ ] **Step 1: 유닛/기존 테스트**

```bash
cd /workspace && npm run test:members-sync
```

Expected: PASS (Shell-1과 무관하면 그대로).

- [ ] **Step 2: pre-deploy-test**

```bash
bash scripts/pre-deploy-test.sh
```

Expected: `✅ 전체 통과 — 배포 가능`

실패 시: Hosting이 `attendance-v2.html`을 깨뜨린 경우 마크업/JS 수정. **firebase deploy 실행 금지.**

- [ ] **Step 3: 수동 체크리스트 기록**

`_docs/testing/` 또는 PR 본문에:

- [ ] 오늘 체크인 (프로필 있음/없음)
- [ ] 더보기 → 키오스크 → 종료 → `#more`
- [ ] races 링크
- [ ] stub 탭 2개
- [ ] 모바일 폭 탭 바

- [ ] **Step 4: 커밋 (테스트 보강 시)**

```bash
git add -A
git commit -m "test(attendance): Shell-1 셸 스모크·회귀 검증"
```

---

## Task 5: PR 정리 · Shell-1 완료 선언

- [ ] **Step 1: 스펙 상태 갱신**

`_docs/superpowers/specs/2026-07-17-attendance-shell-redesign-design.md`에 Shell-1 구현 완료 노트(날짜) 추가.

- [ ] **Step 2: 후속 계획 링크**

PR/스펙에 명시:

| 다음 | 내용 |
|------|------|
| Shell-2 plan | `#my-attendance` — history/stats UI |
| Shell-3 plan | `#team-attendance` — 정모=`TUE|THU|SAT`, API justification |
| Shell-4 | index 리다이렉트 + 운영진 공지 |

- [ ] **Step 3: 최종 커밋·푸시**

```bash
git push -u origin HEAD
```

---

## Out of Scope (이 계획에서 하지 않음)

- `team-month-attendance` API / justification
- `history.html` / `index.html` 리다이렉트
- races·my UI 리뉴얼
- display 폰트
- 출석 취소/수정

---

## Execution note

디자인 컨펌(Task 0 Step 4) 전에는 **구현 Task 1+를 실행하지 않는다.**  
목업 피드백으로 스펙 IA가 바뀌면 스펙을 먼저 수정한 뒤 본 계획을 갱신한다.
