# 춘백 S3 — 1주차 1일 인트로 애니메이션 디자인

**작성일:** 2026-07-18  
**대상 파일:** `chunbaek/index.html`, `chunbaek/css/intro.css`, `chunbaek/js/intro.js`  
**상태:** 승인됨

---

## 1. 개요

춘백 S3 시즌 시작일(2026년 7월 20일 KST)에 `chunbaek/index.html`을 처음 열었을 때, 앱 위에 풀스크린 인트로 애니메이션 overlay를 재생한다. 하루 한 번만 재생되며, 사용자가 "START!" 화면을 탭하면 dismiss되고 기존 앱 화면이 노출된다.

---

## 2. 요구사항

| 항목 | 내용 |
|------|------|
| 트리거 날짜 | 2026-07-20 KST |
| 재생 조건 | 하루 1회 (localStorage 플래그) |
| 적용 페이지 | `chunbaek/index.html` |
| Dismiss 방식 | "START!" 화면을 탭/클릭 |
| 외부 라이브러리 | 없음 (CSS keyframes + Vanilla JS) |
| 폰트 | Bebas Neue (이미 로드됨) |

---

## 3. 비주얼 디자인

### 색상
| 역할 | 토큰 | HEX |
|------|------|-----|
| 배경 | `--brand-orange` | `#ff3214` |
| 메인 글씨 (타이핑, START!) | `--brand-cyan` | `#70d1f4` |
| 보조 글씨 (카운트다운) | `--brand-white` | `#ffffff` |

### 폰트
- Bebas Neue (condensed display) — 전 구간 동일

### 레이아웃
- 풀스크린 fixed overlay (`position: fixed; inset: 0; z-index: 9999`)
- 콘텐츠 세로 가운데 정렬

---

## 4. 애니메이션 시퀀스 (확정 타임라인)

> **이 타임라인이 유일한 기준입니다.** 모든 JS setTimeout과 CSS delay는 아래 시각 기준으로 맞춥니다.

```
[0.0s] overlay DOM 생성 + 삽입, opacity 0 → 1 (0.3s fade-in)

── 타이핑 파트 ──
[0.3s] "춘백방 S<span class='cnt-3'>3</span>" 타이핑 시작
         Bebas Neue, 시안(#70d1f4), ~18vw
         "춘백방 S" = 5글자, 글자당 0.12s (0.6s)
         "3" = 별도 span, 같은 속도로 마지막에 등장 → 완료 1.02s
[1.1s] "지금 시작합니다." 타이핑 시작 — Bebas Neue, 흰색, ~6vw
         9글자, 글자당 0.10s → 완료 2.0s
[2.0s] 0.8s 유지

── S3 분리 파트 ──
[2.8s] "춘백방 S", "지금 시작합니다." → fade-out (0.5s)
         ".cnt-3" span은 fade-out 제외 — 그대로 유지
[3.3s] ".cnt-3" (숫자 "3") 혼자 화면에 남음
         transform: translate(-50%,-50%) + translate to center + scale(1→6), duration 0.7s
         → 화면 중앙에 거대한 흰색 "3"으로 변신
[4.0s] "3" 완전히 커짐, 0.2s 유지

── 카운트다운 파트 ──
[4.2s] "3" 퇴장: opacity 1→0, scale(1.5), 0.4s
[4.6s] 숫자 "2" 등장: scale(0.3)→scale(1.0), 0.4s
[5.0s] "2" 퇴장: 0.4s
[5.4s] 숫자 "1" 등장: 0.4s
[5.8s] "1" 퇴장: 0.4s

── 피날레 ──
[6.2s] "START!" 등장 — Bebas Neue, 시안, 화면 꽉, opacity 0→1 (0.3s)
[6.5s] "START!" 완전히 보임, pulse 애니메이션 시작
[6.6s] 클릭 핸들러 활성화 + "탭해서 시작" fade-in (0.4s)

[6.6s~] 대기: 탭/클릭 또는 Escape/Enter → overlay dismiss
```

### "S3" 분리 렌더링 방식
타이핑 JS가 "춘백방 S3" 문자열을 순서대로 한 글자씩 렌더할 때, 마지막 "3"은 일반 텍스트노드가 아닌 별도 span에 삽입:
```html
<p class="intro-title">
  춘백방 S<span class="cnt-3">3</span>
</p>
```
- `.cnt-3`: 초기 색상 시안(`#70d1f4`), 타이핑 파트에서는 주변 글자와 동일
- 분리 파트 진입 시 `color: #ffffff`로 전환 + `position: fixed`, `transform` 애니메이션으로 중앙 이동·확대

### 카운트다운 숫자 스타일
- Bebas Neue, 흰색(`#ffffff`), `font-size: 40vw` (모바일 기준 꽉 차는 크기)
- `aria-hidden="true"` (스크린 리더 낭독 제외)
- 전환: `opacity 0, scale(0.3)` → `opacity 1, scale(1.0)` → `opacity 0, scale(1.5)`

### START! 스타일
- Bebas Neue, 시안(`#70d1f4`), `font-size: 20vw`
- `@keyframes pulse`: `scale(1.0)` → `scale(1.05)` → `scale(1.0)` 반복, 0.6s 무한
- 탭 시: pulse 정지 → overlay `opacity 0` (0.4s) → `display: none`

### 클릭 핸들러 활성화 (C1 반영)
- `6.1s` 이전: 핸들러 미등록 → 탭/클릭 무시
- `6.1s` 이후: 핸들러 등록 + "탭해서 시작" 문구 fade-in
- 핸들러: 탭, 클릭, Escape 키, Enter 키 모두 dismiss 처리

### "탭해서 시작" 문구 스타일 (NM-new-2 반영)
- font: Noto Sans KR, 700, `16px` (Noto Sans KR은 `index.html`에서 이미 비동기 로드됨 — 추가 로드 불필요)
- 색상: `rgba(255,255,255,0.8)` (흰색 80% 투명도)
- 위치: overlay 하단 `bottom: 10vh`, 가로 중앙
- fade-in: `opacity 0 → 1`, duration `0.4s`
- `aria-live="polite"` 적용 (스크린 리더에 변경 고지)

### Tab 키 focus trap (NM-new-3·NI-new-2 반영)
- overlay 내 포커스 이동 가능한 인터랙티브 요소가 없음 (버튼 없음, 전체가 클릭 영역)
- **Tab `preventDefault` 리스너는 overlay 삽입(0.0s)과 동시에 등록** (dismiss와 별도)
- `6.1s` 이후 dismiss 핸들러(Escape/Enter/click)는 추가 등록 — Tab은 계속 `preventDefault`만, dismiss 아님

```
[0.0s] overlay 삽입 + overlay.focus()
       → Tab 키 keydown → preventDefault() 즉시 등록 (dismiss 없음)
[6.1s] click / Escape / Enter → dismiss 핸들러 추가 등록
       (Tab은 0.0s부터 계속 preventDefault만)
```

---

## 5. localStorage 플래그

```
키: "chunbaek-intro-seen-2026-07-20"
값: "1"
저장 시점: 인트로 재생 시작 직후 (탭 전)
```

KST 날짜 계산 (I3 반영 — try/catch 필수):
```js
const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000)
  .toISOString().slice(0, 10); // "2026-07-20"
const TARGET = "2026-07-20";
const FLAG = `chunbaek-intro-seen-${TARGET}`;

if (kstDate !== TARGET) return; // 날짜 불일치 → skip

try {
  if (localStorage.getItem(FLAG)) return; // 이미 봤음 → skip
  localStorage.setItem(FLAG, "1");
} catch {
  return; // Safari 개인정보 모드 등 접근 불가 → skip (오류 없이 통과)
}
// → 인트로 실행
```

> **localStorage 키 수명:** 날짜가 포함된 키(`…-2026-07-20`)이므로 별도 삭제 불필요. 시즌 종료 후 파일 제거 시 자연스럽게 미사용 상태가 됨.

---

## 6. 파일 구조

```
chunbaek/
├── css/
│   ├── tokens.css
│   ├── chunbaek.css
│   └── intro.css          ← 신규: overlay 레이아웃 + keyframes
├── js/
│   ├── api.js
│   ├── app.js
│   └── intro.js           ← 신규: 날짜 체크 + 시퀀싱 로직
└── index.html             ← link 1줄, script 1줄 추가
```

`index.html`에 추가할 내용:
```html
<!-- intro -->
<link rel="stylesheet" href="css/intro.css" />
<!-- ... 기존 콘텐츠 ... -->
<script src="js/intro.js" defer></script>
```

---

## 7. 시즌 종료 후 제거

**제거 대상 시점:** 2026-07-21 이후 첫 배포 시 (날짜 조건 상 21일부터 인트로가 뜨지 않지만, 코드 정리 차원에서 제거 권장)

1. `chunbaek/css/intro.css` 삭제
2. `chunbaek/js/intro.js` 삭제
3. `index.html`에서 intro 관련 `<link>`, `<script>` 태그 2줄 제거
4. localStorage 키(`chunbaek-intro-seen-2026-07-20`): 날짜가 포함된 키이므로 별도 삭제 불필요. 코드 제거 시 자연스럽게 미사용 상태가 됨.
5. 앱 본체 코드에 잔여 흔적 없음

---

## 8. 접근성 / UX 고려사항

### DOM 구조 (NM1 반영)
- overlay HTML은 `intro.js`가 동적으로 생성하여 `document.body`에 삽입한다 (`index.html`에 하드코딩 없음)

### role 및 aria 속성 (C2·M1·M2·NM2 반영)
- overlay `<div>`: `role="dialog"`, `aria-modal="true"`, `aria-label="춘백 S3 시즌 시작 인트로"`, **`tabindex="-1"`** (focus 수신을 위해 필수)
- overlay 삽입 직후: `previousFocus = document.activeElement` 저장 → `overlay.focus()` 호출
- dismiss 시: `previousFocus?.focus()` 복원
- 카운트다운 숫자(3·2·1) 요소: `aria-hidden="true"` (시각 효과 전용, 낭독 제외)

### 키보드 dismiss (C3 반영)
- Escape 키 또는 Enter 키 입력 시에도 overlay dismiss (클릭 핸들러 활성화 이후에만)

### prefers-reduced-motion (I2·NI1 반영)

**JS 처리 (intro.js — IIFE 또는 named function 내에서 실행, 최상위 스코프 아님) (NM-new-4 반영):**
```js
(function runIntro() {
  // ... 날짜·localStorage 체크 ...

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const overlay = buildOverlay(); // overlay DOM 생성·반환 (삽입은 외부에서)
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  overlay.focus();

  if (reducedMotion) {
    showStartState(overlay);   // "START!" 텍스트 즉시 렌더, pulse class 추가
    activateHandler(overlay);  // 클릭·키보드 핸들러 등록, "탭해서 시작" 표시
    return;
  }
  // 일반 흐름: setTimeout 체인 실행
  runTimeline(overlay);
})();
```

`showStartState(overlay)` 동작 정의 (NM-new-1 반영):
1. 타이핑 텍스트 영역: 숨김(display:none)
2. 카운트다운 영역: 숨김
3. "START!" 요소: 즉시 표시 (`opacity: 1`, pulse class 추가)
4. "탭해서 시작" 문구: 즉시 표시 (`opacity: 1`)

**CSS (intro.css):**
```css
@media (prefers-reduced-motion: reduce) {
  .intro-overlay * {
    animation-duration: 0.001ms !important;
    animation-delay: 0s !important;
    transition-duration: 0.001ms !important;
  }
}
```

- reduced-motion 환경: JS가 setTimeout 체인을 실행하지 않고 즉시 START! 상태로 진입
- 클릭 핸들러도 즉시 활성화 → 탭/클릭 즉시 dismiss 가능
- 사용자가 수 초 동안 빈 빨간 화면을 보는 상황 없음

### 모바일 스크롤 잠금 (I4 반영)
- overlay 표시 시: `document.body.style.overflow = 'hidden'`
- dismiss 시: `document.body.style.overflow = ''` 복원

### 탭 영역
- 전체 overlay 클릭 가능 (`cursor: pointer`)
- "탭해서 시작" 문구로 dismiss 방법 안내 (클릭 핸들러 활성화 시 fade-in)

---

## 9. 테스트 시나리오

| 시나리오 | 기대 결과 |
|----------|-----------|
| 2026-07-20 KST, localStorage 없음 | 인트로 재생 |
| 2026-07-20 KST, localStorage 플래그 있음 | 인트로 skip |
| 2026-07-19 KST (전날) | 인트로 skip |
| 2026-07-21 KST (다음날) | 인트로 skip |
| "START!" 탭 | overlay 사라지고 앱 정상 표시 |
| `prefers-reduced-motion: reduce` | 애니메이션 없이 즉시 텍스트 표시 |
