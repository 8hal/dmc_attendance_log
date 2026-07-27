# 춘백 100일 훈련 가이드 위키 Implementation Plan

> **Superseded** by `docs/superpowers/plans/2026-07-27-chunbaek-training-guide-v2.md`. Do not implement from this doc.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카톡 공유·발췌독이 가능한 `/chunbaek/guide/` 정적 멀티페이지 위키(허브+7주제, 이전/목차/다음)를 추가하고, 춘백 앱 나 탭에서 허브로 링크한다.

**Architecture:** 호스팅만 쓰는 정적 HTML. 네비 순서 SSOT는 `guide-nav.js` 배열 + DOM 주입. 스타일은 `tokens.css` + `guide.css`. 본문은 MJ 일지·handoff 초안을 재서술한 생동감 위키 문체이며, 수준별 페이스/거리 처방표는 넣지 않는다. Cloud Functions·Firestore 변경 없음.

**Tech Stack:** Vanilla HTML/CSS/JS (`chunbaek/guide/`), `node:test`, 기존 춘백 카카오 안내 패턴

**Spec:** `docs/superpowers/specs/2026-07-27-chunbaek-training-guide-wiki-design.md`

**구현 전 필독:**
- `_docs/design/chunbaek-kakao-guide-page.md`
- `_docs/design/chunbaek-design-tokens.md`
- `chunbaek/exception-guide.html` (헤더·카카오 배너·CTA 기준)
- 원고 원천: 세션 첨부 handoff ZIP (`/tmp/marathon-guide-handoff/...` 또는 동등 경로). 없으면 사용자에게 경로를 확인한 뒤 진행.

**확정 기본값 (스펙 §9):**
- 위키 → 앱 CTA: `/chunbaek/#/today`
- SW guide 캐시: **미포함**
- 온보딩 `#/guide` ≠ 위키 `/chunbaek/guide/` (나 탭 링크는 후자만)

**콘텐츠 품질 게이트 (모든 원고 태스크 공통):**
- [ ] 페이스·km **처방표** 없음
- [ ] MJ 극단 훈련량·통증 속 강행을 **권장**으로 쓰지 않음
- [ ] 구간 포인트는 2~4줄, `data-band="sub3|single|330"`
- [ ] 「사례이지 따라 하기 표가 아님」이 허브 또는 해당 글에 드러남
- [ ] 의료 단정 표현 없음

---

## File map

| File | Responsibility |
|------|----------------|
| `chunbaek/guide/guide-nav.js` | 페이지 순서 SSOT + prev/next/toc DOM 주입 + `module.exports` (테스트용) |
| `scripts/test/chunbaek-guide-nav.test.js` | 네비 resolve·순서 단위 테스트 |
| `chunbaek/guide/guide.css` | 위키 본문·네비·구간 포인트·사례 상자 |
| `chunbaek/guide/index.html` | 허브 |
| `chunbaek/guide/week.html` | 주제 1 주간 |
| `chunbaek/guide/long-run.html` | 주제 2 장거리 |
| `chunbaek/guide/quality.html` | 주제 3 품질주 |
| `chunbaek/guide/summer.html` | 주제 4 여름 |
| `chunbaek/guide/pain.html` | 주제 5 통증 |
| `chunbaek/guide/missed.html` | 주제 6 놓친 날 |
| `chunbaek/guide/taper-race.html` | 주제 7 테이퍼·대회 |
| `scripts/test/chunbaek-guide-pages.test.js` | 파일 존재·필수 마크업·네비 훅 스모크 |
| `chunbaek/index.html` | 나 탭에 훈련 가이드 링크 |
| `chunbaek/css/chunbaek.css` | 나 탭 가이드 링크 스타일(최소) |

**비범위:** Functions, Firestore, SW 캐시, PDF/DOCX 생성, CMS, 검색.

---

### Task 1: `guide-nav.js` 순수 로직 (TDD)

**Files:**
- Create: `chunbaek/guide/guide-nav.js`
- Create: `scripts/test/chunbaek-guide-nav.test.js`

- [ ] **Step 1: Write the failing test**

```js
// scripts/test/chunbaek-guide-nav.test.js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  GUIDE_PAGES,
  resolveGuideNav,
} = require(path.join(__dirname, "../../chunbaek/guide/guide-nav.js"));

describe("chunbaek guide-nav", () => {
  it("lists hub + 7 topics in fixed order", () => {
    assert.equal(GUIDE_PAGES.length, 8);
    assert.deepEqual(
      GUIDE_PAGES.map((p) => p.file),
      [
        "index.html",
        "week.html",
        "long-run.html",
        "quality.html",
        "summer.html",
        "pain.html",
        "missed.html",
        "taper-race.html",
      ],
    );
  });

  it("resolves first topic prev to hub and next to long-run", () => {
    const nav = resolveGuideNav("week.html");
    assert.equal(nav.positionLabel, "1 / 7");
    assert.equal(nav.prev.href, "index.html");
    assert.equal(nav.prev.label, "목차");
    assert.equal(nav.next.href, "long-run.html");
    assert.equal(nav.tocHref, "index.html");
  });

  it("resolves last topic with next null", () => {
    const nav = resolveGuideNav("taper-race.html");
    assert.equal(nav.positionLabel, "7 / 7");
    assert.equal(nav.prev.href, "missed.html");
    assert.equal(nav.next, null);
  });

  it("resolves hub without position and next to week", () => {
    const nav = resolveGuideNav("index.html");
    assert.equal(nav.isHub, true);
    assert.equal(nav.positionLabel, null);
    assert.equal(nav.prev, null);
    assert.equal(nav.next.href, "week.html");
  });

  it("throws on unknown file", () => {
    assert.throws(() => resolveGuideNav("nope.html"), /unknown guide page/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test scripts/test/chunbaek-guide-nav.test.js
```

Expected: FAIL (module not found or exports missing)

- [ ] **Step 3: Write minimal implementation**

```js
// chunbaek/guide/guide-nav.js
"use strict";

const GUIDE_PAGES = [
  { file: "index.html", title: "읽는 법 · 세 구간", isHub: true },
  { file: "week.html", title: "우리 주가 돌아가는 방식" },
  { file: "long-run.html", title: "장거리" },
  { file: "quality.html", title: "품질주" },
  { file: "summer.html", title: "여름철" },
  { file: "pain.html", title: "통증·피로" },
  { file: "missed.html", title: "놓친 날·실패한 날" },
  { file: "taper-race.html", title: "마지막 구간·대회 주" },
];

function resolveGuideNav(currentFile) {
  const idx = GUIDE_PAGES.findIndex((p) => p.file === currentFile);
  if (idx < 0) throw new Error(`unknown guide page: ${currentFile}`);
  const cur = GUIDE_PAGES[idx];
  const topicIndex = cur.isHub ? null : idx; // 1..7 when not hub (idx matches)
  const topicTotal = GUIDE_PAGES.length - 1;

  if (cur.isHub) {
    return {
      isHub: true,
      positionLabel: null,
      prev: null,
      next: { href: GUIDE_PAGES[1].file, label: GUIDE_PAGES[1].title },
      tocHref: "index.html",
      page: cur,
    };
  }

  const prevPage = GUIDE_PAGES[idx - 1];
  const nextPage = GUIDE_PAGES[idx + 1] || null;
  return {
    isHub: false,
    positionLabel: `${idx} / ${topicTotal}`,
    prev: {
      href: prevPage.file,
      label: prevPage.isHub ? "목차" : prevPage.title,
    },
    next: nextPage
      ? { href: nextPage.file, label: nextPage.title }
      : null,
    tocHref: "index.html",
    page: cur,
  };
}

function applyGuideNav(doc = document) {
  const file = (doc.body && doc.body.dataset.guidePage) || "";
  const nav = resolveGuideNav(file);
  const pos = doc.querySelector("[data-guide-position]");
  if (pos) pos.textContent = nav.positionLabel || "";

  const bind = (sel, link) => {
    const el = doc.querySelector(sel);
    if (!el) return;
    if (!link) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.setAttribute("href", link.href);
    const label = el.querySelector("[data-guide-nav-label]");
    if (label) label.textContent = link.label;
  };

  bind("[data-guide-prev]", nav.prev);
  bind("[data-guide-next]", nav.next);
  const toc = doc.querySelector("[data-guide-toc]");
  if (toc) toc.setAttribute("href", nav.tocHref);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { GUIDE_PAGES, resolveGuideNav, applyGuideNav };
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    if (document.body && document.body.dataset.guidePage) applyGuideNav();
  });
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
node --test scripts/test/chunbaek-guide-nav.test.js
```

- [ ] **Step 5: Commit**

```bash
git add chunbaek/guide/guide-nav.js scripts/test/chunbaek-guide-nav.test.js
git commit -m "feat(chunbaek): guide-nav 순서 SSOT와 단위 테스트"
```

---

### Task 2: `guide.css` + 공통 HTML 셸

**Files:**
- Create: `chunbaek/guide/guide.css`
- Create: `chunbaek/guide/_shell-notes.md` — **만들지 말 것.** 셸은 각 HTML에 인라인 복제하지 말고, 아래 템플릿을 각 파일에 적용.

- [ ] **Step 1: Create `guide.css`**

**필수:** `exception-guide.html` 인라인 `<style>`의 `.page` / `.header` / `.header-eyebrow` / `.kakao-banner`(`.visible`) / `.section`(본문에 쓸 경우) / `.btn` / `.btn-primary` / `.cta` / `.foot`를 **그대로 이식**한 뒤, 아래 위키 전용 규칙을 추가한다. 요지 블록만 두고 공통 스타일을 빼먹으면 안 된다.

마크업 훅은 스펙의 `.guide-nav__*` 이름 대신 **본 플랜의 `data-guide-*` + `.guide-topnav` / `.guide-bottomnav`** 를 SSOT로 한다.

```css
/* chunbaek/guide/guide.css — 위키 추가분 (공통은 exception-guide에서 이식) */
.guide-topnav { display:flex; justify-content:space-between; align-items:center; margin:12px 16px 0; font-size:13px; }
.guide-topnav a { color: var(--brand-orange); font-weight:700; text-decoration:none; }
.guide-prose h2 { font-size:16px; font-weight:800; margin:0 0 10px; }
.guide-prose p { font-size:14px; line-height:1.65; margin:0 0 12px; }
.guide-story {
  background: var(--surface-muted);
  border-radius: 12px;
  padding: 14px 16px;
  margin: 0 0 14px;
  font-size: 14px;
  line-height: 1.6;
}
.guide-story-label { font-size:12px; font-weight:800; color: var(--text-secondary); margin:0 0 6px; }
.band-notes { display:flex; flex-direction:column; gap:10px; margin-top:8px; }
.band-note { background: var(--surface-muted); border-radius:12px; padding:12px 14px; }
.band-note__label { font-size:12px; font-weight:800; color: var(--brand-orange); margin:0 0 4px; }
.band-note p { margin:0; font-size:13px; line-height:1.55; }
.guide-bottomnav {
  display:grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 8px;
  align-items:center;
  margin: 20px 16px 0;
}
.guide-bottomnav a {
  font-size:13px; font-weight:700; color: var(--brand-orange); text-decoration:none;
}
.guide-bottomnav [data-guide-prev] { justify-self:start; }
.guide-bottomnav [data-guide-toc] { justify-self:center; color: var(--text-secondary); }
.guide-bottomnav [data-guide-next] { justify-self:end; text-align:right; }
.toc-card {
  display:block; text-decoration:none; color:inherit;
  background: var(--surface-muted); border-radius:12px; padding:12px 14px; margin:0 0 8px;
}
.toc-card strong { display:block; font-size:14px; font-weight:800; }
.toc-card span { font-size:12px; color: var(--text-secondary); }
```

경로: HTML에서 `href="../css/tokens.css"` + `href="guide.css"`.

- [ ] **Step 2: Create all 8 HTML files with shell only (placeholder body)**

각 파일 공통 골격 (상대 경로·`data-guide-page`만 파일별로 다름):

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#ff3214" />
  <meta name="description" content="춘백 S3 100일 훈련 가이드 — {제목}" />
  <title>{제목} — 춘백 S3 훈련 가이드</title>
  <link rel="stylesheet" href="../css/tokens.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="guide.css" />
</head>
<body data-guide-page="{file}">
  <div class="page">
    <header class="header">...</header>
    <!-- topic pages only: -->
    <div class="guide-topnav">
      <a data-guide-toc href="index.html">목차</a>
      <span data-guide-position></span>
    </div>
    <div class="kakao-banner" id="kakao-banner">...</div>
    <main class="guide-prose">
      <!-- Task 3~ 에서 채움. 지금은 <p class="muted">초안 작성 중</p> -->
    </main>
    <!-- topic pages: bottom nav -->
    <nav class="guide-bottomnav" aria-label="가이드 이동">
      <a data-guide-prev href="#"><span data-guide-nav-label></span></a>
      <a data-guide-toc href="index.html">목차</a>
      <a data-guide-next href="#"><span data-guide-nav-label></span></a>
    </nav>
    <div class="cta">
      <a class="btn btn-primary" href="/chunbaek/#/today">춘백 앱으로</a>
    </div>
    <p class="foot">동마클 · 춘백 S3</p>
  </div>
  <script src="guide-nav.js" defer></script>
  <script>
    if (/KAKAOTALK/i.test(navigator.userAgent || "")) {
      document.getElementById("kakao-banner").classList.add("visible");
    }
  </script>
</body>
</html>
```

허브(`index.html`): `guide-topnav`·`guide-bottomnav`의 prev 생략 가능. `data-guide-next`로 「첫 글 읽기」 CTA 대체해도 됨 — 하단은 `data-guide-next` + 목차 불필요 시 숨김.

- [ ] **Step 3: Write pages smoke test (fail until markers exist)**

```js
// scripts/test/chunbaek-guide-pages.test.js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "../../chunbaek/guide");
const { GUIDE_PAGES } = require(path.join(DIR, "guide-nav.js"));

describe("chunbaek guide pages", () => {
  for (const page of GUIDE_PAGES) {
    it(`${page.file} exists with guide hooks`, () => {
      const html = fs.readFileSync(path.join(DIR, page.file), "utf8");
      assert.match(html, new RegExp(`data-guide-page="${page.file}"`));
      assert.match(html, /guide-nav\.js/);
      assert.match(html, /tokens\.css/);
      assert.match(html, /guide\.css/);
      assert.match(html, /kakao-banner/);
      assert.match(html, /\/chunbaek\/#\/today/);
      if (!page.isHub) {
        assert.match(html, /data-guide-prev/);
        assert.match(html, /data-guide-next/);
        assert.match(html, /data-guide-toc/);
        assert.match(html, /data-guide-position/);
      }
    });
  }
});
```

```bash
node --test scripts/test/chunbaek-guide-pages.test.js
```

Expected: PASS after shells exist

- [ ] **Step 4: Commit**

```bash
git add chunbaek/guide/ scripts/test/chunbaek-guide-pages.test.js
git commit -m "feat(chunbaek): 훈련 가이드 위키 셸·CSS·페이지 스모크"
```

---

### Task 3: 허브 `index.html` 원고

**Files:**
- Modify: `chunbaek/guide/index.html`

**필수 섹션:**
1. 헤더: 「100일 훈련 가이드」 / 보조: 같은 일정, 다른 렌즈
2. 현실 전제 1단락 (요일 고정 · 팀은 페이스·해석)
3. 사례 주의 한 줄 (따라 하기 표 아님)
4. 세 구간: 서브3 / 싱글 / 330+첫풀 — 희망기록이 아니라 지금 목표 구간으로 읽기
5. 목차 카드 7개 (`GUIDE_PAGES` 제목·한 줄 요약, `toc-card`)
6. CTA: 첫 글(`week.html`) + 앱(`#/today`)

**한 줄 요약 초안 (목차 카드):**
| 파일 | 요약 |
|------|------|
| week | 요일이 정하는 훈련, 우리가 정하는 해석 |
| long-run | 길게 가는 날, 버티기와 줄이기의 감각 |
| quality | 빠른 날 — 몸이 말하게 두기 |
| summer | 더위 앞에서 페이스보다 생존 |
| pain | 아플 때 줄이는 말과 멈추는 말 |
| missed | 빠지면 끝? 다음 주를 다시 짠다 |
| taper-race | 줄이고, 목표를 나누고, 당일 전환 |

- [ ] **Step 1: Write hub copy into `index.html`**
- [ ] **Step 2: Manual check** — 모바일 폭(~390px)에서 헤더·목차·CTA 한 화면 흐름
- [ ] **Step 3: 콘텐츠 품질 게이트 체크**
- [ ] **Step 4: Commit** — `feat(chunbaek): 훈련 가이드 허브 원고`

---

### Task 4: `week.html` 원고 (구간 포인트 약)

**소스:** handoff 5장·실제 춘백 슬롯 개념. **처방표 금지.**

**구조:**
1. 리드: 「이번 주도 화·목·토가 같은 이유로 짜여 있다」류
2. 본문: 같은 목적(회복/품질/장거리 등)을 팀이 다른 감각으로 소화
3. `.band-notes` 약하게 3칸 또는 한 블록에 세 문장
4. `.guide-story` 선택(있으면 MJ의 「계획이 있어도 몸이 무거우면 줄였다」 짧은 장면)

- [ ] Write → 품질 게이트 → Commit `feat(chunbaek): 가이드 주간 루틴 글`

---

### Task 5: `long-run.html` 원고 (구간 포인트 강)

**소스:** handoff 7장 + 일지 장거리·DNF/성공 장면.

**구조:**
1. 리드: 장거리 날의 구체 장면
2. `.guide-story`: MJ 장거리/대회에서 **줄이거나 걸었던** 판단 (강행 미권장)
3. 본문: 회복·보급·다음날을 위한 해석
4. `.band-notes` **강** — 서브3 / 싱글 / 330+ 각각 2~4줄 (숫자 표 없이 「무엇을 지키면 되는지」)

- [ ] Write → 품질 게이트 → Commit `feat(chunbaek): 가이드 장거리 글`

---

### Task 6: `quality.html` 원고 (구간 포인트 강)

**소스:** handoff 6장 + 일지 인터벌 중단·빌드업 전환.

**구조:**
1. 리드: 빠른 날의 구체 장면
2. `.guide-story`: 세트 중단→빌드업 전환 등 **줄인** 판단
3. 본문: 「세트를 못 채운 날」= 데이터가 됨
4. `.band-notes` **강**

- [ ] Write → 품질 게이트 → Commit `feat(chunbaek): 가이드 품질주 글`

---

### Task 7: `summer.html` 원고 (약~중)

**소스:** handoff 8장 + 일지 여름 구간. RPE·대화 가능 여부 우선.

**구조:**
1. 리드: 더위 속 훈련 장면
2. 본문: 페이스보다 생존·수면·수분
3. `.band-notes` 약~중 (합쳐도 됨)
4. `.guide-story` 선택

- [ ] Write → 품질 게이트 → Commit `feat(chunbaek): 가이드 여름철 글`

---

### Task 8: `pain.html` 원고 (약~중)

**소스:** handoff 9장 + 일지 햄스트링·내전근. **진단 단정 금지.**

**구조:**
1. 리드: 통증이 말을 거는 장면
2. 본문: 줄이는 기준 / 멈추고 상담하는 기준 (단정 진단 X)
3. `.band-notes` 약~중
4. `.guide-story` 선택

- [ ] Write → 품질 게이트 → Commit `feat(chunbaek): 가이드 통증·피로 글`

---

### Task 9: `missed.html` 원고 (약)

**소스:** handoff 10장. 결손 → 다음 주 재설계.

**구조:**
1. 리드: 빠진 날의 감정→판단으로 전환
2. 본문: 몰아 메우지 않기, 다음 주 다시 짜기
3. `.band-notes` 약
4. `.guide-story` 선택

- [ ] Write → 품질 게이트 → Commit `feat(chunbaek): 가이드 놓친 날 글`

---

### Task 10: `taper-race.html` 원고 (강)

**소스:** handoff 14–15장 + 일지 인천 싱글·제마 장면. A/B/C·당일 전환.

**구조:**
1. 리드: 대회 주·당일 장면
2. `.guide-story`: A/B/C 전환·마지막 업힐 등 (강행 미권장, 판단 서사)
3. 본문: 테이퍼는 강도 짧게·거리 줄이기 감각
4. `.band-notes` **강**

- [ ] Write → 품질 게이트 → Commit `feat(chunbaek): 가이드 테이퍼·대회 글`

---

### Task 11: 페이지 스모크에 본문 마커 강화

**Files:**
- Modify: `scripts/test/chunbaek-guide-pages.test.js`

- [ ] **Step 1: Extend tests**

허브가 아닌 각 파일:
- `band-notes` 또는 `band-note` 최소 1
- `guide-prose` 내 실문단 존재 (`초안 작성 중` 문자열 **없을** 것)

**`guide-story` assert (확정):**
- **필수:** `long-run.html`, `quality.html`, `taper-race.html`
- **비필수(테스트에 넣지 않음):** `week.html`, `summer.html`, `pain.html`, `missed.html`, 허브

허브:
- `toc-card` 7개
- `세 구간` 또는 `서브3` 문구 포함

```bash
node --test scripts/test/chunbaek-guide-pages.test.js scripts/test/chunbaek-guide-nav.test.js
```

Expected: PASS

- [ ] **Step 2: Commit** — `test(chunbaek): 가이드 원고 마커 스모크 강화`

---

### Task 12: 앱 나 탭 → 가이드 링크

**Files:**
- Modify: `chunbaek/index.html` (`#view-me`, 프로필/`btn-edit-profile` 근처)
- Modify: `chunbaek/css/chunbaek.css` (필요 시)

- [ ] **Step 1: Add markup**

`#view-me` 안, `btn-edit-profile` 아래(예외 섹션 위):

```html
<p class="me-guide-link-wrap">
  <a class="me-guide-link" href="/chunbaek/guide/">100일 훈련 가이드</a>
</p>
```

**금지:** `href="/chunbaek/#/guide"` (온보딩 출석 규칙 화면)

- [ ] **Step 2: Minimal CSS**

```css
.me-guide-link-wrap { margin: 12px 0 16px; }
.me-guide-link {
  color: var(--brand-orange);
  font-weight: 700;
  font-size: 14px;
  text-decoration: none;
}
.me-guide-link:hover { text-decoration: underline; }
```

- [ ] **Step 3: Assert in smoke or small test**

`scripts/test/chunbaek-guide-pages.test.js`에:

```js
it("me tab links to static guide hub not onboarding hash", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "../../chunbaek/index.html"),
    "utf8",
  );
  assert.match(html, /href="\/chunbaek\/guide\/"/);
  assert.doesNotMatch(
    html,
    /me-guide-link[^>]*href="\/chunbaek\/#\/guide"/,
  );
});
```

- [ ] **Step 4: Commit** — `feat(chunbaek): 나 탭에 훈련 가이드 링크`

---

### Task 13: 로컬 육안·회귀 스모크

- [ ] **Step 1: Unit tests**

```bash
node --test scripts/test/chunbaek-guide-nav.test.js scripts/test/chunbaek-guide-pages.test.js
```

Expected: 전부 PASS

- [ ] **Step 2: Static preview (optional hosting)**

```bash
# 이미 에뮬이 있으면
# http://localhost:5000/chunbaek/guide/
# 각 글에서 이전/다음/목차 클릭, 카카오 UA는 DevTools로 흉내
```

체크:
- [ ] 1→…→7 다음 연속, 7에서 다음 숨김
- [ ] 허브 목차 카드 → 각 글
- [ ] CTA → `/chunbaek/#/today`
- [ ] 나 탭 링크 → 허브
- [ ] 처방표·완주형/향상형 표 없음

- [ ] **Step 3: Final commit if fixes** — `fix(chunbaek): 가이드 위키 네비·카피 다듬기`

---

## Self-review (플랜 작성자)

| Spec 요구 | Task |
|-----------|------|
| `/chunbaek/guide/` 허브+7 | 2–10 |
| 이전/목차/다음 + JS SSOT | 1, 2 |
| 유연한 B · 생동감 · 처방 금지 | 3–10 게이트 |
| 앱 나 탭 링크, `#/guide` 혼동 금지 | 12 |
| Functions/SW/PDF 제외 | 준수 |
| 테스트 | 1, 2, 11, 12, 13 |

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-27-chunbaek-training-guide-wiki.md`.

구현 시 **handoff ZIP/일지 경로**를 먼저 확인하고, Task 1부터 순서대로 진행한다.
