# 춘백 홈화면 로드 성능 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 춘백 SPA(`/chunbaek/`) 홈(today) 뷰 초기 로드 체감 시간 감소

**Architecture:**
옵션 1 — 정적 자산 최적화: JS `defer`, CSS `@import` 체인 제거, Google Fonts 비동기 로드로 파싱·렌더 블로킹 제거. 옵션 2 — 클라이언트 stale-while-revalidate 캐시: `sessionStorage`에 `my-profile` + `today-slot` 응답을 저장해 재방문/새로고침 시 즉시 화면을 그리고 백그라운드에서 갱신. `my-profile` 중복 호출(ensureSession + loadToday)도 제거.

**Tech Stack:** Vanilla JS, Firebase Hosting, sessionStorage

---

## 변경 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `chunbaek/index.html` | `defer`, fonts 비동기, tokens.css 분리 `<link>` |
| `chunbaek/css/chunbaek.css` | `@import tokens.css` 제거 |
| `chunbaek/js/app.js` | 캐시 헬퍼, `renderTodayData()` 추출, `loadToday()` SWR 패턴, `my-profile` 중복 제거 |

---

## Task 1: 정적 자산 최적화

**Files:**
- Modify: `chunbaek/index.html`
- Modify: `chunbaek/css/chunbaek.css`

- [ ] **Step 1: `chunbaek/css/chunbaek.css` 첫 줄 `@import url("./tokens.css")` 제거**

- [ ] **Step 2: `chunbaek/index.html` head 수정**

  ```html
  <!-- 기존 -->
  <link href="https://fonts.googleapis.com/css2?..." rel="stylesheet" />
  <link rel="stylesheet" href="css/chunbaek.css" />

  <!-- 변경 후 -->
  <!-- tokens.css를 직접 <link>로 먼저 로드 (chunbaek.css의 @import 체인 제거) -->
  <link rel="stylesheet" href="css/tokens.css" />
  <link rel="stylesheet" href="css/chunbaek.css" />
  <!-- Google Fonts 비동기 로드 (렌더 블로킹 해제) -->
  <link rel="preload" as="style"
        href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+KR:wght@400;600;700;800&display=swap"
        onload="this.onload=null;this.rel='stylesheet'" />
  <noscript>
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+KR:wght@400;600;700;800&display=swap" rel="stylesheet" />
  </noscript>
  ```

- [ ] **Step 3: `<script>` 태그에 `defer` 추가**

  ```html
  <!-- 기존 -->
  <script src="js/api.js"></script>
  <script src="js/app.js"></script>

  <!-- 변경 후 -->
  <script src="js/api.js" defer></script>
  <script src="js/app.js" defer></script>
  ```

- [ ] **Step 4: 커밋**

  ```bash
  git add chunbaek/index.html chunbaek/css/chunbaek.css
  git commit -m "perf(chunbaek): defer JS, remove CSS @import chain, async Google Fonts"
  ```

---

## Task 2: my-profile 중복 호출 제거

**Files:**
- Modify: `chunbaek/js/app.js` (loadToday 함수)

배경: `navigateFromHash()` → `ensureSession()` → `my-profile` 호출 후 `state.profile` 채움.
이후 `showView("today")` → `loadToday()` → `my-profile` 재호출. 중복 1회 제거.

- [ ] **Step 1: `loadToday()` 561~563행 수정**

  ```js
  // 기존
  const [prof, slotRes] = await Promise.all([
    apiGet("my-profile", {}, true),
    apiGet("today-slot", {}, true),
  ]);

  // 변경 후 — state.profile이 있으면 재사용
  const profilePromise = state.profile
    ? Promise.resolve(state.profile)
    : apiGet("my-profile", {}, true);
  const [prof, slotRes] = await Promise.all([
    profilePromise,
    apiGet("today-slot", {}, true),
  ]);
  ```

- [ ] **Step 2: 커밋**

  ```bash
  git add chunbaek/js/app.js
  git commit -m "perf(chunbaek): skip my-profile re-fetch when state.profile already set"
  ```

---

## Task 3: sessionStorage stale-while-revalidate 캐시

**Files:**
- Modify: `chunbaek/js/app.js`

전략:
- `loadToday()` 진입 시 sessionStorage 캐시 확인 → 있으면 즉시 렌더
- 백그라운드에서 API 호출 → 완료 시 화면 갱신 + 캐시 갱신
- 출석 완료(`onAttend`) 후 today 캐시 무효화 (fresh fetch 강제)
- 캐시 TTL: profile = 60분, today-slot = 세션 내 유지 (탭 닫으면 소멸)

- [ ] **Step 1: 캐시 헬퍼 상수·함수 추가 (app.js IIFE 최상단)**

  ```js
  const CACHE_KEYS = { profile: "cb_profile", today: "cb_today" };

  function readCache(key) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const { data, savedAt, date } = JSON.parse(raw);
      // today 캐시는 날짜가 바뀌면 무효
      if (key === CACHE_KEYS.today) {
        const todayKst = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
        if (date !== todayKst) return null;
      }
      // profile 캐시는 1시간 TTL
      if (key === CACHE_KEYS.profile && Date.now() - savedAt > 60 * 60 * 1000) return null;
      return data;
    } catch { return null; }
  }

  function writeCache(key, data) {
    try {
      const todayKst = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
      sessionStorage.setItem(key, JSON.stringify({ data, savedAt: Date.now(), date: todayKst }));
    } catch {}
  }

  function clearTodayCache() {
    try { sessionStorage.removeItem(CACHE_KEYS.today); } catch {}
  }
  ```

- [ ] **Step 2: `loadToday()` 내 렌더링 로직을 `renderTodayData(prof, slotRes)` 함수로 추출**

  `loadToday()` 함수 내 try 블록의 `state.profile = prof;` 이후 로직 전체를
  `function renderTodayData(prof, slotRes)` 함수로 분리한다.
  (기존 반환값 없는 void 함수)

- [ ] **Step 3: `loadToday()`를 SWR 패턴으로 재작성**

  ```js
  async function loadToday() {
    // 1. 캐시가 있으면 즉시 렌더 (API 기다리지 않음)
    const cachedProfile = readCache(CACHE_KEYS.profile);
    const cachedToday   = readCache(CACHE_KEYS.today);
    const hasCache = !!(cachedProfile && cachedToday);
    if (hasCache) {
      state.profile = cachedProfile;
      renderTodayData(cachedProfile, cachedToday);
    }

    // 2. 최신 데이터 fetch (my-profile은 state에 있으면 재사용)
    try {
      const profilePromise = state.profile
        ? Promise.resolve(state.profile)
        : apiGet("my-profile", {}, true);
      const [prof, slotRes] = await Promise.all([
        profilePromise,
        apiGet("today-slot", {}, true),
      ]);
      state.profile = prof;
      writeCache(CACHE_KEYS.profile, prof);
      writeCache(CACHE_KEYS.today, slotRes);
      renderTodayData(prof, slotRes);
    } catch (e) {
      console.error("[chunbaek] loadToday failed", e);
      if (!hasCache) {
        setTodayPanels({ beforeSeason: false, afterSeason: false, active: true, programOff: false });
        paintTodaySlot(null);
        if (PREVIEW_MODE) renderTodayPreview();
        else showToast(e.message, true);
      }
    }
  }
  ```

- [ ] **Step 4: `onAttend()` 내 `loadToday()` 호출 직전에 `clearTodayCache()` 추가**

  ```js
  // onAttend() 내 try 블록
  showToast(`${dayNum}일차 출석 완료`);
  clearTodayCache();   // ← 추가
  await loadToday();
  ```

- [ ] **Step 5: 커밋**

  ```bash
  git add chunbaek/js/app.js
  git commit -m "perf(chunbaek): stale-while-revalidate cache for today view (sessionStorage)"
  ```

---

## Task 4: PR 생성 및 코드 리뷰 요청

- [ ] `git push -u origin cursor/chunbaek-perf-9d51`
- [ ] PR 생성
- [ ] requesting-code-review 스킬로 리뷰 요청
