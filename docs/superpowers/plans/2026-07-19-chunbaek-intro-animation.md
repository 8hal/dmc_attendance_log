# 춘백 S3 인트로 애니메이션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2026-07-20 KST 당일 첫 방문 시 `chunbaek/index.html`에 풀스크린 인트로 애니메이션을 표시한다 — "춘백방 S3" 타이핑 → S3의 "3"만 남아 중앙으로 이동·확대 → 카운트다운 3→2→1 → "START!" → 탭으로 dismiss.

**Architecture:** `chunbaek/css/intro.css`(레이아웃+keyframes), `chunbaek/js/intro.js`(날짜체크+IIFE+타이밍시퀀스)를 신규 생성하고, `chunbaek/index.html`에 link/script 2줄 추가. 앱 본체 코드는 변경하지 않아 시즌 종료 후 2파일 삭제+2줄 제거로 완전 제거 가능.

**Tech Stack:** Vanilla JS (ES2020), CSS3 keyframes/transform, localStorage, no external deps

**Spec:** `docs/superpowers/specs/2026-07-18-chunbaek-intro-animation-design.md`

---

## 파일 구조

| 파일 | 역할 |
|------|------|
| `chunbaek/css/intro.css` | 신규: overlay 레이아웃, 타이핑 컨테이너, 카운트다운, START!, "탭해서 시작", keyframes, prefers-reduced-motion |
| `chunbaek/js/intro.js` | 신규: IIFE, 날짜+localStorage 체크, DOM 동적 생성, 타이핑 시퀀스, S3→3 분리 애니메이션, 카운트다운, 핸들러 등록 |
| `chunbaek/index.html` | 수정: `<link>` 1줄, `<script defer>` 1줄 추가 |

---

## Task 1: intro.css — overlay 기본 구조

**Files:**
- Create: `chunbaek/css/intro.css`

- [ ] **Step 1: `intro.css` 파일 생성 — overlay 레이아웃**

```css
/* chunbaek/css/intro.css */

/* ── 1. Overlay ── */
.intro-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: var(--brand-orange, #ff3214);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.intro-overlay.visible {
  opacity: 1;
}
.intro-overlay.dismissing {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.4s ease;
}

/* ── 2. 타이핑 텍스트 ── */
.intro-typing-wrap {
  text-align: center;
  line-height: 1.1;
}
.intro-title {
  font-family: var(--font-display, 'Bebas Neue', sans-serif);
  font-size: clamp(60px, 18vw, 160px);
  color: var(--brand-cyan, #70d1f4);
  margin: 0;
  min-height: 1.1em;
}
.intro-subtitle {
  font-family: var(--font-display, 'Bebas Neue', sans-serif);
  font-size: clamp(24px, 6vw, 56px);
  color: #ffffff;
  margin: 0.2em 0 0;
  min-height: 1.1em;
}
.intro-typing-wrap.fading {
  animation: introFadeOut 0.5s ease forwards;
}

/* ── 3. S3의 "3" — 분리 후 중앙 이동 ── */
.cnt-3 {
  display: inline-block;
  transform-origin: center;
  /* 타이핑 파트: 부모 색 상속 */
  color: inherit;
}
.cnt-3.expanding {
  /* JS가 position:fixed + 좌표 계산 후 translate로 중앙 이동 */
  position: fixed;
  color: #ffffff;
  font-family: var(--font-display, 'Bebas Neue', sans-serif);
  font-size: clamp(60px, 18vw, 160px);
  animation: cnt3Expand 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
@keyframes cnt3Expand {
  from { transform: translate(-50%, -50%) scale(1); }
  to   { transform: translate(-50%, -50%) scale(6); opacity: 1; }
}
.cnt-3.expanded {
  /* 완전히 커진 상태 유지 (0.2s) */
  position: fixed;
  color: #ffffff;
  font-family: var(--font-display, 'Bebas Neue', sans-serif);
  font-size: clamp(60px, 18vw, 160px);
  transform: translate(-50%, -50%) scale(6);
}
.cnt-3.exit {
  position: fixed;
  color: #ffffff;
  font-family: var(--font-display, 'Bebas Neue', sans-serif);
  font-size: clamp(60px, 18vw, 160px);
  animation: cntExit 0.4s ease forwards;
}

/* ── 4. 카운트다운 숫자 ── */
.intro-count {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: var(--font-display, 'Bebas Neue', sans-serif);
  font-size: clamp(120px, 40vw, 360px);
  color: #ffffff;
  line-height: 1;
  pointer-events: none;
  opacity: 0;
}
.intro-count.enter {
  animation: cntEnter 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
.intro-count.exit {
  animation: cntExit 0.4s ease forwards;
}

@keyframes cntEnter {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1.0); }
}
@keyframes cntExit {
  from { opacity: 1; transform: translate(-50%, -50%) scale(1.0); }
  to   { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
}

/* ── 5. START! ── */
.intro-start {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: var(--font-display, 'Bebas Neue', sans-serif);
  font-size: clamp(60px, 18vw, 160px);
  color: var(--brand-cyan, #70d1f4);
  text-align: center;
  line-height: 1;
  opacity: 0;
  pointer-events: none;
  white-space: nowrap;
}
.intro-start.visible {
  animation: startFadeIn 0.3s ease forwards, startPulse 0.6s ease 0.3s infinite;
}
@keyframes startFadeIn {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1.0); }
}
@keyframes startPulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1.0); }
  50%       { transform: translate(-50%, -50%) scale(1.05); }
}

/* ── 6. "탭해서 시작" ── */
.intro-hint {
  position: absolute;
  bottom: 10vh;
  left: 0;
  right: 0;
  text-align: center;
  font-family: var(--font-body, 'Noto Sans KR', sans-serif);
  font-size: 16px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.8);
  opacity: 0;
  transition: opacity 0.4s ease;
  pointer-events: none;
}
.intro-hint.visible {
  opacity: 1;
}

/* ── 7. prefers-reduced-motion ── */
@media (prefers-reduced-motion: reduce) {
  .intro-overlay * {
    animation-duration: 0.001ms !important;
    animation-delay: 0s !important;
    transition-duration: 0.001ms !important;
  }
}

/* ── 8. FadeOut helper ── */
@keyframes introFadeOut {
  from { opacity: 1; }
  to   { opacity: 0; pointer-events: none; }
}
```

- [ ] **Step 2: 커밋**

```bash
git add chunbaek/css/intro.css
git commit -m "feat(intro): intro.css — overlay 레이아웃 및 keyframes"
```

---

## Task 2: intro.js — 날짜 체크 + DOM 생성

**Files:**
- Create: `chunbaek/js/intro.js`

- [ ] **Step 1: IIFE 뼈대 + 날짜/localStorage 체크**

```js
// chunbaek/js/intro.js
(function runIntro() {
  /* ── 날짜·localStorage 체크 ── */
  const TARGET = '2026-07-20';
  const FLAG   = `chunbaek-intro-seen-${TARGET}`;

  const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  if (kstDate !== TARGET) return;

  try {
    if (localStorage.getItem(FLAG)) return;
    localStorage.setItem(FLAG, '1');
  } catch {
    return; // 개인정보 모드 등 — skip
  }

  /* ── DOM 구성 ── */
  const overlay = buildOverlay();
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  // Tab 포커스 트랩 (overlay 삽입 즉시)
  const trapTab = (e) => { if (e.key === 'Tab') e.preventDefault(); };
  document.addEventListener('keydown', trapTab);

  overlay.focus();

  /* ── reduced-motion 분기 ── */
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) {
    showStartState(overlay);
    activateHandler(overlay, trapTab);
    return;
  }

  /* ── 일반 흐름 ── */
  runTimeline(overlay, trapTab);
})();
```

- [ ] **Step 2: `buildOverlay()` — overlay DOM 동적 생성**

```js
function buildOverlay() {
  const el = document.createElement('div');
  el.className = 'intro-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', '춘백 S3 시즌 시작 인트로');
  el.setAttribute('tabindex', '-1');

  el.innerHTML = `
    <div class="intro-typing-wrap">
      <p class="intro-title" id="intro-title-line"></p>
      <p class="intro-subtitle" id="intro-subtitle-line"></p>
    </div>
    <div class="intro-count" aria-hidden="true" id="intro-count"></div>
    <p class="intro-start" id="intro-start">START!</p>
    <p class="intro-hint" aria-live="polite" id="intro-hint">탭해서 시작</p>
  `;

  // overlay fade-in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('visible'));
  });

  return el;
}
```

- [ ] **Step 3: 커밋**

```bash
git add chunbaek/js/intro.js
git commit -m "feat(intro): intro.js — IIFE 뼈대, 날짜 체크, buildOverlay"
```

---

## Task 3: intro.js — 타이핑 시퀀스

**Files:**
- Modify: `chunbaek/js/intro.js` (함수 추가)

- [ ] **Step 1: `typeText()` 유틸 함수**

```js
/**
 * container 요소에 text를 한 글자씩 타이핑한다.
 * lastCharSpan: 마지막 글자를 감쌀 span 요소 (선택) — S3의 "3" 분리에 사용
 * @returns Promise (완료 시 resolve)
 */
function typeText(container, text, charDelay, lastCharSpan) {
  return new Promise((resolve) => {
    let i = 0;
    const interval = setInterval(() => {
      const char = text[i];
      i++;
      const isLast = i === text.length;

      if (isLast && lastCharSpan) {
        lastCharSpan.textContent = char;
        container.appendChild(lastCharSpan);
      } else {
        container.appendChild(document.createTextNode(char));
      }

      if (isLast) {
        clearInterval(interval);
        resolve();
      }
    }, charDelay);
  });
}
```

- [ ] **Step 2: `runTypingPhase()` — 타이핑 + S3 분리 진입까지**

타이밍 기준 (스펙 §4):
- `[0.3s]` "춘백방 S" 타이핑 시작 (5글자 × 120ms = 600ms)
- "3" 마지막으로 등장 → `[1.02s]` 완료
- `[1.1s]` "지금 시작합니다." 타이핑 시작 (9글자 × 100ms = 900ms)
- `[2.0s]` 완료, 0.8s 유지
- `[2.8s]` 페이드 아웃 시작

```js
async function runTypingPhase(overlay) {
  const titleEl    = overlay.querySelector('#intro-title-line');
  const subtitleEl = overlay.querySelector('#intro-subtitle-line');

  // cnt-3 span (S3의 "3")
  const cnt3 = document.createElement('span');
  cnt3.className = 'cnt-3';

  await delay(300); // [0.0s→0.3s] overlay fade-in 여유

  // "춘백방 S" 타이핑 (마지막 글자는 cnt3 span)
  await typeText(titleEl, '춘백방 S3', 120, cnt3);
  // → titleEl 내용: "춘백방 S" + <span class="cnt-3">3</span>

  await delay(80); // [1.02s→1.1s] 여유

  // "지금 시작합니다." 타이핑
  await typeText(subtitleEl, '지금 시작합니다.', 100);

  await delay(800); // [2.0s→2.8s] 유지

  // 페이드 아웃: cnt-3 제외하고 나머지
  return separateAndExpand(overlay, cnt3);
}
```

- [ ] **Step 3: `delay()` 헬퍼**

```js
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 4: 커밋**

```bash
git add chunbaek/js/intro.js
git commit -m "feat(intro): intro.js — 타이핑 시퀀스 (typeText, runTypingPhase)"
```

---

## Task 4: intro.js — S3→3 분리 + 카운트다운 + START!

**Files:**
- Modify: `chunbaek/js/intro.js` (함수 추가)

- [ ] **Step 1: `separateAndExpand()` — "3"만 남기고 중앙 확대**

```js
async function separateAndExpand(overlay, cnt3El) {
  const typingWrap = overlay.querySelector('.intro-typing-wrap');

  // cnt3El의 현재 화면 좌표 저장 (부모 fade-out 전)
  const rect = cnt3El.getBoundingClientRect();
  const startX = rect.left + rect.width / 2;
  const startY = rect.top  + rect.height / 2;

  // 타이핑 wrap 페이드 아웃 (cnt3는 제외 — 곧 fixed로 뽑아낼 것)
  cnt3El.style.opacity = '0'; // 일시적으로 숨김 (포지션 교체 중)
  typingWrap.classList.add('fading');

  await delay(100); // 레이아웃 정착 여유

  // cnt3를 fixed로 전환, 기존 좌표에 배치
  cnt3El.style.removeProperty('opacity');
  cnt3El.style.position = 'fixed';
  cnt3El.style.left = `${startX}px`;
  cnt3El.style.top  = `${startY}px`;
  cnt3El.style.color = '#ffffff';
  document.body.appendChild(cnt3El); // overlay 바깥으로 이동 (z-index 확보)
  cnt3El.classList.add('expanding');

  await delay(700); // expand 애니메이션 완료 [3.3s→4.0s]

  cnt3El.classList.replace('expanding', 'expanded');
  await delay(200); // [4.0s→4.2s] 유지

  cnt3El.classList.replace('expanded', 'exit');
  await delay(400); // [4.2s→4.6s] 퇴장

  cnt3El.remove();
}
```

> **구현 노트:** `cnt3El.style.left/top`은 `translate(-50%,-50%)`과 함께 사용해야 중앙 정렬된다. CSS `.cnt-3.expanding` keyframe의 `translate(-50%,-50%)`이 이를 담당한다.

- [ ] **Step 2: `runCountdown()` — 2→1**

```js
async function runCountdown(overlay) {
  const countEl = overlay.querySelector('#intro-count');

  for (const num of ['2', '1']) {
    countEl.textContent = num;
    countEl.classList.remove('exit');
    countEl.classList.add('enter');
    await delay(400); // enter 완료

    countEl.classList.replace('enter', 'exit');
    await delay(400); // exit 완료
  }
}
```

- [ ] **Step 3: `showStartState()` + `activateHandler()`**

```js
function showStartState(overlay) {
  const startEl = overlay.querySelector('#intro-start');
  // 타이핑·카운트 영역 숨김
  const typingWrap = overlay.querySelector('.intro-typing-wrap');
  if (typingWrap) typingWrap.style.display = 'none';
  const countEl = overlay.querySelector('#intro-count');
  if (countEl) countEl.style.display = 'none';
  // START! 즉시 표시
  startEl.classList.add('visible');
}

function activateHandler(overlay, trapTab) {
  const hintEl = overlay.querySelector('#intro-hint');
  hintEl.classList.add('visible');

  const previousFocus = document.activeElement;

  function dismiss() {
    overlay.classList.add('dismissing');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', trapTab);

    overlay.addEventListener('transitionend', () => {
      overlay.remove();
      // body에 직접 붙인 cnt3도 혹시 남아있으면 제거
      document.querySelectorAll('.cnt-3').forEach(el => el.remove());
      previousFocus?.focus();
    }, { once: true });
  }

  overlay.addEventListener('click', dismiss, { once: true });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape' || e.key === 'Enter') {
      document.removeEventListener('keydown', onKey);
      dismiss();
    }
  });
}
```

- [ ] **Step 4: `runTimeline()` — 전체 시퀀스 연결**

```js
async function runTimeline(overlay, trapTab) {
  await runTypingPhase(overlay);         // 타이핑 + S3→3 확대
  await runCountdown(overlay);           // 2 → 1
  showStartState(overlay);              // START! 표시
  await delay(600);                     // pulse 시작 여유
  activateHandler(overlay, trapTab);    // 클릭 핸들러 활성화
}
```

- [ ] **Step 5: 커밋**

```bash
git add chunbaek/js/intro.js
git commit -m "feat(intro): intro.js — S3→3 확대, 카운트다운, START!, 핸들러"
```

---

## Task 5: index.html — link/script 추가

**Files:**
- Modify: `chunbaek/index.html`

- [ ] **Step 1: `<link>` 태그 추가**

`chunbaek/index.html`의 `<link rel="stylesheet" href="css/chunbaek.css" />` 바로 다음 줄에 추가:

```html
<link rel="stylesheet" href="css/intro.css" />
```

- [ ] **Step 2: `<script>` 태그 추가**

`</body>` 닫는 태그 바로 앞에 추가:

```html
<script src="js/intro.js" defer></script>
```

- [ ] **Step 3: 커밋**

```bash
git add chunbaek/index.html
git commit -m "feat(intro): index.html에 intro.css/js 연결"
```

---

## Task 6: 수동 검증

- [ ] **Step 1: localStorage 날짜 강제 우회 — 브라우저 콘솔에서 테스트**

에뮬레이터 없이 빠른 검증을 위해 `intro.js` 내 `TARGET` 값을 오늘 날짜로 임시 변경하거나, 브라우저 콘솔에서:

```js
// 테스트용: intro.js의 날짜 체크를 우회하려면
// intro.js의 TARGET 상수를 현재 KST 날짜로 임시 변경 후 저장
// 또는 에뮬레이터로 시스템 날짜 제어
localStorage.removeItem('chunbaek-intro-seen-2026-07-20');
location.reload();
```

- [ ] **Step 2: 시나리오 체크리스트**

| 시나리오 | 확인 방법 | 기대 결과 |
|----------|-----------|-----------|
| 정상 재생 | TARGET = 오늘 날짜, localStorage 없음 | 인트로 전체 재생 |
| 재방문 skip | localStorage 플래그 있음 | 인트로 없이 앱 바로 표시 |
| "3" 연출 | 타이핑 후 | S3의 "3"이 중앙으로 이동·확대됨 |
| 카운트다운 | "3" 퇴장 후 | 2→1 순서로 등장 |
| START! + 탭 | "START!" 표시 후 탭 | overlay 사라지고 앱 표시 |
| Escape 키 | "START!" 표시 후 Esc | overlay dismiss |
| Tab 키 잠금 | 애니메이션 중 Tab | 배경 앱으로 포커스 이탈 없음 |
| reduced-motion | `prefers-reduced-motion: reduce` 설정 | 즉시 START! → 탭 dismiss |
| 날짜 불일치 | TARGET을 어제 날짜로 변경 | 인트로 재생 안 됨 |

- [ ] **Step 3: 모바일(iOS Safari) 확인**

- overlay 뒤 body 스크롤 잠금 확인
- 터치 탭으로 dismiss 확인
- 폰트 렌더링 (Bebas Neue 로드 여부)

- [ ] **Step 4: 커밋 (검증 후 TARGET 복원)**

TARGET을 테스트용으로 변경했다면 `'2026-07-20'`으로 복원 후:

```bash
git add chunbaek/js/intro.js
git commit -m "feat(intro): intro.js TARGET 날짜 복원 (2026-07-20)"
```

---

## Task 6b: 인트로 다시 보기 버튼

"오늘" 탭(`#view-today`) 하단에 당일(7/20 KST)에만 표시되는 "인트로 다시 보기" 버튼을 추가한다.
localStorage 플래그를 지우고 인트로를 재실행한다.

**Files:**
- Modify: `chunbaek/index.html` — 버튼 HTML 추가
- Modify: `chunbaek/js/intro.js` — IIFE를 named function으로 분리, 버튼 표시 로직 추가
- Modify: `chunbaek/css/intro.css` — 버튼 스타일 추가

- [ ] **Step 1: `index.html`에 버튼 추가**

`#btn-switch-user` 바로 앞에 추가 (line ~201):

```html
<button type="button" class="btn btn-ghost intro-replay-btn" id="btn-replay-intro"
        hidden style="margin-top:8px; font-size:13px; opacity:0.7">
  ▶ 인트로 다시 보기
</button>
```

`hidden` 속성으로 기본 숨김. JS가 당일에만 표시.

- [ ] **Step 2: `intro.js` — IIFE를 `startIntro()`로 분리 + 버튼 로직**

IIFE 안의 실행 로직을 `startIntro()` named function으로 추출하고, 최하단에 버튼 이벤트 연결:

```js
// intro.js 최하단에 추가
function initReplayButton() {
  const TARGET = '2026-07-20';
  const FLAG   = `chunbaek-intro-seen-${TARGET}`;

  const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  if (kstDate !== TARGET) return; // 당일이 아니면 버튼 표시 안 함

  const btn = document.getElementById('btn-replay-intro');
  if (!btn) return;

  btn.hidden = false;
  btn.addEventListener('click', () => {
    try { localStorage.removeItem(FLAG); } catch { /* ignore */ }
    startIntro(); // 인트로 재실행
  });
}

// DOMContentLoaded 이후 실행 (앱이 로드된 뒤 버튼 노출)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initReplayButton);
} else {
  initReplayButton();
}
```

`startIntro()` 는 기존 IIFE 내용 전체 (날짜 체크 포함). 버튼 클릭 시 localStorage를 먼저 지우므로 날짜 체크만 통과하면 인트로가 다시 실행된다.

- [ ] **Step 3: `intro.css`에 버튼 스타일 (선택)**

기존 `.btn.btn-ghost`를 재사용하므로 별도 CSS 불필요. 단, 텍스트 크기 조정이 필요하면:

```css
.intro-replay-btn {
  font-size: 13px;
  opacity: 0.7;
}
.intro-replay-btn:hover {
  opacity: 1;
}
```

- [ ] **Step 4: 검증**

| 시나리오 | 기대 결과 |
|----------|-----------|
| 7/20 KST, 인트로 이미 봄 | 오늘 탭 하단에 "▶ 인트로 다시 보기" 버튼 표시 |
| 버튼 클릭 | 인트로 재생 (START! 탭 후 앱 복귀) |
| 7/21 KST 이후 | 버튼 보이지 않음 |

- [ ] **Step 5: 커밋**

```bash
git add chunbaek/index.html chunbaek/js/intro.js chunbaek/css/intro.css
git commit -m "feat(intro): 오늘 탭 — 인트로 다시 보기 버튼 (7/20 당일만 표시)"
```

---

## Task 7: push + PR 생성

- [ ] **Step 1: push**

```bash
git push -u origin cursor/chunbaek-s3-intro-animation-a7b2
```

- [ ] **Step 2: PR 생성**

title: `feat: 춘백 S3 — 1주차 1일(7/20) 인트로 애니메이션`
base: `main`
draft: true

---

## 완료 기준

- [ ] `chunbaek/index.html`을 로컬에서 열고 날짜 조건 충족 시 인트로 재생됨
- [ ] S3의 "3"이 중앙으로 이동·확대되는 연출 확인
- [ ] 카운트다운 3(S3 분리)→2→1→START! 순서 확인
- [ ] 탭/Escape로 dismiss 후 앱 정상 표시
- [ ] localStorage 재방문 skip 확인
- [ ] `prefers-reduced-motion` 즉시 START! 확인
