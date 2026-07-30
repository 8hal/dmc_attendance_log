# 춘백 100일 훈련 가이드 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DOCX 안내서를 `/chunbaek/guide/` 단일 롱스크롤로 옮겨, 공통 표·인라인 SVG·카톡 원문 사례로 읽히게 한다 (v1 요약 위키 교체).

**Architecture:** 기존 춘백 가이드 셸(헤더·카카오 배너·CTA·tokens)을 유지한 채 `index.html` 본문만 v2 IA로 교체한다. `guide-nav.js`가 섹션 앵커 SSOT다. DOCX는 레포 밖 handoff에서 읽고, 4수준 열은 공통 표+`band-notes`로 변환한다. 다이어그램은 인라인 SVG 4개; 추가 이미지는 `figures/` 슬롯.

**Tech Stack:** 정적 HTML/CSS/JS, Node `node:test` 스모크, python-docx(추출 보조, 런타임 의존 아님), Firebase Hosting 경로 `/chunbaek/guide/`

**Spec:** `docs/superpowers/specs/2026-07-27-chunbaek-training-guide-v2-design.md`  
**DOCX (구현 전 필수):** `/tmp/marathon-guide-handoff/마라톤_100일_가이드_handoff/final/2026_마라톤_100일_수준별_훈련_가이드.docx`  
**카톡:** `/tmp/marathon-guide-handoff/마라톤_100일_가이드_handoff/source/KakaoTalk_Chat_2026-07-26-11-55-31.txt`  
없으면 사용자에게 경로 확인 후 중단.

**Supersedes:** `docs/superpowers/plans/2026-07-27-chunbaek-training-guide-wiki.md` (v1)

---

## File map

| Path | Responsibility |
|------|----------------|
| `chunbaek/guide/index.html` | 단일 페이지 본문 (intro~refs) |
| `chunbaek/guide/guide.css` | 표·콜아웃·원문·다이어그램·슬롯 스타일 |
| `chunbaek/guide/guide-nav.js` | `GUIDE_SECTIONS` + prev/next 앵커 |
| `chunbaek/guide/figures/.gitkeep` | 사용자 이미지 자리 |
| `scripts/test/chunbaek-guide-nav.test.js` | 섹션 목록·nav 해석 |
| `scripts/test/chunbaek-guide-pages.test.js` | 앵커·SVG·원문·4수준 열 금지·me 링크 |
| `scripts/dev/extract-marathon-guide-docx.py` | (보조) DOCX→JSON 덤프, 커밋 가능·런타임 미사용 |
| `chunbaek/index.html` | me 탭 `/chunbaek/guide/` 유지 (변경 없을 수 있음) |

---

## DOCX → 웹 변환 규칙 (모든 콘텐츠 태스크 공통)

1. 문체: DOCX 「이다/한다」 유지. 메타어(렌즈, SSOT, 블로그체) 금지.
2. 표: `.guide-table-wrap` > `table.guide-table`. 1×1 원칙 박스는 `.guide-callout`.
3. **4수준 열 금지:** 헤더에 `완주형|향상형|기록형|상급형`이 연속 열로 있으면 → 「공통 목적/범위」 열로 합치거나 행을 목적 단위로 재작성 + `.band-notes` (`data-band="sub3|single|330"`).
4. 수준 행표(T4,T10,T15…)도 웹에서는 **공통 체크리스트/범위** + band-notes로 바꾼다 (행 헤더에 완주형 등 나열 금지).
5. 부록 A (T58): **공통 14주 골격**(주 · 핵심 목표 · 공통 장거리 방향) + band-notes. 4수준 장거리 열 금지.
6. 일지: DOCX 윤문 사례 표를 쓰지 말고, 카톡에서 **장면을 잘라 원문**을 `.guide-story--raw`에 넣는다. 라벨 `일지 원문`. 아래 `.guide-note` 1~2문장. `<details open>`.
7. 극단·통증 강행 장면: note에 「권장 아님 / 판단 연습」 명시.

### 4수준 표 인덱스 (DOCX `doc.tables`)

| # | 처리 |
|---|------|
| T12 요일×4수준 | 공통 요일 목적 표 + `#diagram-week-framework` |
| T18 빌드업 단계×4 | 공통 단계 표 + band-notes |
| T58 14주×4 | 공통 골격 + band-notes |
| T4,T10,T15,T17,T19,T21,T25,T53 | 수준 행 → 공통화 |

### 필수 SVG id

| id | DOM |
|----|-----|
| `#diagram-100day-timeline` | `#ch-4` |
| `#diagram-week-framework` | `#ch-5` |
| `#diagram-decision-flow` | `#ch-9` 끝 (`#ch-10`은 앵커만) |
| `#diagram-race-abc` | `#ch-15` |

### 섹션 id (guide-nav SSOT)

```
intro-usage, intro-diary, toc,
ch-1 … ch-16,
app-a, app-b, app-c, checklist, refs
```

- `#toc`는 HTML 목차만. **`GUIDE_SECTIONS`에 넣지 않는다.**
- `#checklist`는 DOCX H1「대회 준비 체크리스트」이며 스펙 IA §3에 포함.
- `intro-usage`, `intro-diary`: `isIntro: true` → `positionLabel` null. **본문 카운트에서 제외** (bodyTotal = non-intro = 21).
- 본문(`ch-*`·`app-*`·`checklist`·`refs`): position `1 / 21` … `21 / 21`.

**`resolveGuideNav` 필수 동작 (v1 `GUIDE_SECTIONS[1]` 하드코딩 금지):**
1. `idx`로 현재 항목을 찾고, prev/next는 **`GUIDE_SECTIONS[idx ± 1]`** (없으면 null).
2. **예외:** 첫 본문 `ch-1`의 `prev`는 항상 `{ href: "#toc", label: "목차" }` (직전 intro로 링크하지 않음).
3. `intro-diary.next` → `#ch-1` (목차로 보내지 않음; 스크롤은 사용자가 toc를 누름).
4. `intro-usage.next` → `#intro-diary`.
5. `applyGuideNav`: `isIntro`인 섹션은 nav bind 스킵 (`id === "intro"` 단일이 아니라 `resolveGuideNav(id).isHub` 또는 섹션의 isIntro).

권장 `GUIDE_SECTIONS` (DOCX H1 제목 고정):

```js
[
  { id: "intro-usage", title: "이 가이드의 사용법", isIntro: true },
  { id: "intro-diary", title: "일지 사례를 읽는 방법", isIntro: true },
  { id: "ch-1", title: "1. 이 가이드의 대상과 목표" },
  { id: "ch-2", title: "2. 시작 전 현재 상태 진단" },
  { id: "ch-3", title: "3. 나만의 훈련 페이스 정하기" },
  { id: "ch-4", title: "4. 100일 전체 훈련 구조" },
  { id: "ch-5", title: "5. 일주일 훈련 구성법" },
  { id: "ch-6", title: "6. 핵심 훈련 사용설명서" },
  { id: "ch-7", title: "7. 장거리 훈련을 완성하는 과정" },
  { id: "ch-8", title: "8. 여름철 100일 훈련 운영법" },
  { id: "ch-9", title: "9. 통증·피로·부상에 대응하는 법" },
  { id: "ch-10", title: "10. 실패한 훈련을 다루는 방법" },
  { id: "ch-11", title: "11. 체중과 영양 관리" },
  { id: "ch-12", title: "12. 기록과 컨디션을 해석하는 법" },
  { id: "ch-13", title: "13. 중간 점검 대회의 활용" },
  { id: "ch-14", title: "14. 마지막 3주와 테이퍼링" },
  { id: "ch-15", title: "15. 레이스 전략" },
  { id: "ch-16", title: "16. 대회 후 평가와 다음 목표" },
  { id: "app-a", title: "부록 A. 수준별 14주 예시" },
  { id: "app-b", title: "부록 B. 훈련 변경 의사결정표" },
  { id: "app-c", title: "부록 C. 주간 계획표" },
  { id: "checklist", title: "대회 준비 체크리스트" },
  { id: "refs", title: "참고 자료" },
]
```

---

### Task 1: v2 스모크 테스트 먼저 교체 (TDD)

**Files:**
- Modify: `scripts/test/chunbaek-guide-nav.test.js`
- Modify: `scripts/test/chunbaek-guide-pages.test.js`

- [ ] **Step 1: nav 테스트를 v2 섹션 목록에 맞게 재작성**

필수 assert (모호함 금지):

```js
assert.equal(GUIDE_SECTIONS.length, 23); // 2 intro + 21 body
assert.equal(GUIDE_SECTIONS[0].id, "intro-usage");
assert.equal(GUIDE_SECTIONS[1].id, "intro-diary");
assert.equal(GUIDE_SECTIONS.filter((s) => !s.isIntro).length, 21);

assert.equal(resolveGuideNav("intro-usage").next.href, "#intro-diary");
assert.equal(resolveGuideNav("intro-diary").next.href, "#ch-1");
assert.equal(resolveGuideNav("intro-diary").positionLabel, null);

const ch1 = resolveGuideNav("ch-1");
assert.equal(ch1.prev.href, "#toc");
assert.equal(ch1.prev.label, "목차");
assert.equal(ch1.positionLabel, "1 / 21");
assert.equal(ch1.next.href, "#ch-2");

assert.equal(resolveGuideNav("ch-9").positionLabel, "9 / 21");
assert.equal(resolveGuideNav("refs").positionLabel, "21 / 21");
assert.equal(resolveGuideNav("refs").next, null);
```

- [ ] **Step 2: pages 테스트를 v2 스모크에 맞게 재작성**

필수:
- `#intro-usage` … `#ch-16`, `#app-a`…`#app-c`, `#checklist`, `#refs`, `#toc`
- SVG ids 4개
- `.guide-story--raw` ≥ 1 + 원문 마커 `ㅡ` (또는 카톡 특유 `ㅋㅋ`/`ㅠ`)
- 표 헤더 금지: `/<th[^>]*>\s*완주형[\s\S]*?<th[^>]*>\s*향상형[\s\S]*?<th[^>]*>\s*기록형[\s\S]*?<th[^>]*>\s*상급형/` 미매칭
- me 탭 `/chunbaek/guide/`
- 구 토픽 파일(`week.html` 등) 없음
- v1 전용 assert(`toc-card` ≥7, `GUIDE_STORY_REQUIRED` week ids) 제거

- [ ] **Step 3: 테스트 실행 → 실패 확인**

```bash
node --test scripts/test/chunbaek-guide-nav.test.js scripts/test/chunbaek-guide-pages.test.js
```

Expected: FAIL (섹션/앵커/SVG 없음)

- [ ] **Step 4: Commit**

```bash
git add scripts/test/chunbaek-guide-nav.test.js scripts/test/chunbaek-guide-pages.test.js
git commit -m "test: rewrite chunbaek guide smoke for v2 IA"
```

---

### Task 2: guide-nav.js v2 SSOT

**Files:**
- Modify: `chunbaek/guide/guide-nav.js`

- [ ] **Step 1: `GUIDE_SECTIONS`를 위 고정 목록으로 교체하고 `resolveGuideNav` 재작성**

위 「필수 동작」1–5를 그대로 구현한다. 특히:
- `next`/`prev`에 `GUIDE_SECTIONS[1]` 하드코딩 금지 → `idx ± 1`
- `ch-1.prev`만 `#toc`
- `topicTotal` / position 분모 = `GUIDE_SECTIONS.filter(s => !s.isIntro).length` (=21)
- `applyGuideNav`에서 intro 섹션 스킵 시 `id === "intro"` 비교 삭제

`GUIDE_PAGES` deprecated 맵은 유지하되 `file`은 전부 `index.html` + `id`.

- [ ] **Step 2: nav 테스트 통과 확인**

```bash
node --test scripts/test/chunbaek-guide-nav.test.js
```

Expected: PASS (pages는 아직 FAIL 가능)

- [ ] **Step 3: Commit**

```bash
git add chunbaek/guide/guide-nav.js
git commit -m "feat(guide): v2 section SSOT in guide-nav"
```

---

### Task 3: CSS 컴포넌트 + figures 슬롯

**Files:**
- Modify: `chunbaek/guide/guide.css`
- Create: `chunbaek/guide/figures/.gitkeep`

- [ ] **Step 1: 다음 클래스 스타일 추가** (기존 헤더/카카오/CTA 유지)

- `.guide-table-wrap` overflow-x auto; `-webkit-overflow-scrolling: touch`
- `.guide-table` width 100%; font-size 13px; th/td border padding
- `.guide-callout` 배경·왼쪽 accent (브랜드 오렌지 얇은 바)
- `.guide-story--raw` `white-space: pre-wrap`; 고정폭 느낌 없이 본문 폰트; 줄간격 1.45
- `.guide-note` 작은 muted + 상단 구분
- `.band-notes` / `.band-note` / `[data-band]` (기존 있으면 유지·정리)
- `.guide-diagram` SVG max-width 100%; height auto
- `.figure-slot` / `__placeholder` 점선 박스 + 안내 문구 보이게
- `.guide-prose h3` 장 소제목
- 모바일: `.page` max-width 480 유지 가능 (표는 wrap 가로 스크롤)

- [ ] **Step 2: figures/.gitkeep 추가**

- [ ] **Step 3: Commit**

```bash
git add chunbaek/guide/guide.css chunbaek/guide/figures/.gitkeep
git commit -m "style(guide): v2 table/callout/story/diagram components"
```

---

### Task 4: DOCX 추출 헬퍼 + 빈 셸 HTML

**Files:**
- Create: `scripts/dev/extract-marathon-guide-docx.py`
- Modify: `chunbaek/guide/index.html` (셸만 — 장 본문은 placeholder)

- [ ] **Step 1: 추출 스크립트**

환경변수 `GUIDE_DOCX` 기본값 = 위 DOCX 경로. 출력: stdout JSON 또는 `scripts/dev/_guide_docx_dump.json` (gitignore 권장 — **커밋하지 않음**. 스크립트만 커밋).

덤프 내용: headings 순서, paragraphs, tables(rows/cells 텍스트).

```bash
python3 scripts/dev/extract-marathon-guide-docx.py > /tmp/guide_docx_dump.json
# DOCX 없으면 non-zero + 메시지
```

- [ ] **Step 2: index.html을 v2 셸로 교체**

유지: doctype, tokens, Noto, theme-color `#ff3214`, header, kakao-banner, `data-guide-page="index.html"`, 하단 CTA `#/today`, `guide-nav.js` + kakao UA 스크립트(기존과 동일 패턴).

본문:
- `#intro-usage`, `#intro-diary` — DOCX 해당 장에서 **짧은** 사용법·해석 규칙 콜아웃만 우선 이식 (전체 장은 Task 5에서 보강)
- `#toc` — `GUIDE_SECTIONS` 본문 항목 링크 목록
- `#ch-1`…`#refs` — `<section id="…" data-guide-section="…">` + h2 + `<p class="muted">내용 이관 예정</p>` + top/bottom nav 훅 (`data-guide-prev` 등)

SVG placeholder: 네 위치에 빈 `<svg class="guide-diagram" id="diagram-…">` (또는 Task 8에서 채움 — **스모크가 id만 보면** 빈 svg로 통과 가능; Task 8에서 내용).

최소 1개 `.guide-story--raw`에 카톡에서 복사한 짧은 원문(줄에 `ㅡ` 포함) + `.guide-note` — pages 스모크용. 본격 사례는 Task 7.

figure-slot 1개 예시 (placeholder 문구 노출).

- [ ] **Step 3: pages 테스트 재실행**

```bash
node --test scripts/test/chunbaek-guide-nav.test.js scripts/test/chunbaek-guide-pages.test.js
```

Expected: PASS (앵커·SVG id·원문 마커·4수준 금지). 본문 충실도는 이후 태스크.

- [ ] **Step 4: Commit**

```bash
git add scripts/dev/extract-marathon-guide-docx.py chunbaek/guide/index.html
git commit -m "feat(guide): v2 shell with anchors and extract helper"
```

---

### Task 5: 본문 이관 — 사용법·1~4장

**Files:**
- Modify: `chunbaek/guide/index.html` (`#intro-usage` … `#ch-4`)

- [ ] **Step 1: DOCX에서 해당 단락·표를 읽어 HTML로 이식**

포함: 기본 원칙 콜아웃, 사례 해석 규칙, A/B/C 표(T3), 진단(공통화), 페이스 RPE 표(T6·T7 공통 유지), 100일 단계 표(T9) + `#diagram-100day-timeline` 내용 스케치(또는 Task 8과 병행해 id만 두고 여기선 표·문단).

T4/T10: 4수준 행 제거 → 공통 진단/단계 범위 + band-notes.

- [ ] **Step 2: 금지 패턴 grep**

```bash
rg -n '완주형|향상형|기록형|상급형' chunbaek/guide/index.html
```

표 `<th>`에 네 수준이 연속으로 있으면 수정. 본문 설명 문장은 OK.

- [ ] **Step 3: 테스트 + commit**

```bash
node --test scripts/test/chunbaek-guide-nav.test.js scripts/test/chunbaek-guide-pages.test.js
git add chunbaek/guide/index.html
git commit -m "feat(guide): migrate DOCX intro and chapters 1-4"
```

---

### Task 6: 본문 이관 — 5~10장

**Files:**
- Modify: `chunbaek/guide/index.html` (`#ch-5` … `#ch-10`)

- [ ] **Step 1: 주간·핵심훈련·장거리·여름·통증·실패 이식**

T12 → 공통 요일 목적 표. T13 놓친 훈련 표 유지. 품질/장거리 수준표 공통화.  
`#diagram-week-framework` in ch-5.  
`#diagram-decision-flow` **ch-9 끝**. ch-10은 `<a href="#diagram-decision-flow">`만.

- [ ] **Step 2: 테스트 + commit**

```bash
node --test scripts/test/chunbaek-guide-*.test.js
git add chunbaek/guide/index.html
git commit -m "feat(guide): migrate DOCX chapters 5-10"
```

---

### Task 7: 본문 이관 — 11~16·부록·참고 + 카톡 원문

**Files:**
- Modify: `chunbaek/guide/index.html`

- [ ] **Step 1: 11~16, app-a~c, checklist, refs 이식**

부록 A: 공통 14주 골격만. 부록 B 표 + decision-flow 링크. 체크리스트·참고는 DOCX 문장 유지.

`#diagram-race-abc` in ch-15.

- [ ] **Step 2: 카톡 원문 삽입 (최소 핵심 장면 6+)**

DOCX 사례 테마 ↔ 카톡 검색 키워드로 원문 블록을 잘라 붙인다. 권장 매핑:

| 테마 (DOCX) | 넣을 장 | 카톡 검색 힌트 |
|-------------|---------|----------------|
| 더위 빌드업 실패 | ch-8 또는 ch-3 | 습도, 빌드업, 중단 |
| 30→22km 변경 | ch-7 | 30km, 22 |
| 햄스트링 강행 (경계) | ch-9 | 햄스트링 — note에 권장 아님 |
| 통증 속도 경계 | ch-9 | 4:35, 대퇴 |
| 연속 실패 | ch-10 | 인터벌 2세트, 35km |
| 초반 저축 아님 | ch-15 | 맞바람, 업힐 |

각 블록:

```html
<details class="guide-story guide-story--raw" open>
  <summary>일지 원문</summary>
  <pre class="guide-story__body">…카톡 원문…</pre>
</details>
<p class="guide-note">…1~2문장…</p>
```

윤문 금지. `ㅡ` 줄 유지.

- [ ] **Step 3: 테스트 + commit**

```bash
node --test scripts/test/chunbaek-guide-*.test.js
git add chunbaek/guide/index.html
git commit -m "feat(guide): migrate ch11-16 appendices and raw Kakao quotes"
```

---

### Task 8: 인라인 SVG 4종 완성

**Files:**
- Modify: `chunbaek/guide/index.html` (해당 diagram 요소)

- [ ] **Step 1: 네 SVG에 레이블·도형 채우기**

- timeline: 5단계 (적응·기초·특이성·최고·테이퍼) 가로 흐름
- week: 화·목·토 공통 목적 박스
- decision: 통증/실패 → 줄이기/중단/복귀 (간단 flowchart)
- race-abc: A/B/C 목표 카드 3열(스택 모바일)

접근성: `<title>` 또는 `aria-label`. 색은 tokens 브랜드·중립 선. 장식 glow/보라 금지.

- [ ] **Step 2: 테스트 + commit**

```bash
node --test scripts/test/chunbaek-guide-*.test.js
git add chunbaek/guide/index.html
git commit -m "feat(guide): add four inline SVG diagrams"
```

---

### Task 9: v1 문서 superseded 표시 + 최종 검증

**Files:**
- Modify: `docs/superpowers/specs/2026-07-27-chunbaek-training-guide-wiki-design.md` (상단에 superseded 배너)
- Modify: `docs/superpowers/plans/2026-07-27-chunbaek-training-guide-wiki.md` (동일)
- Modify: `docs/superpowers/specs/2026-07-27-chunbaek-training-guide-v2-design.md` 상태 → 구현 중/완료

- [ ] **Step 1: 배너 추가**

```markdown
> **Superseded** by `…-v2-design.md` / `…-v2.md`. Do not implement from this doc.
```

- [ ] **Step 2: 전체 가이드 테스트 + 4수준 열 재확인**

```bash
node --test scripts/test/chunbaek-guide-nav.test.js scripts/test/chunbaek-guide-pages.test.js
rg -n '<th[^>]*>[[:space:]]*완주형' chunbaek/guide/index.html || true
```

- [ ] **Step 3: Hosting 에뮬에서 `/chunbaek/guide/` 로드** (에뮬 떠 있으면)

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/chunbaek/guide/
# 200 기대. 안 떠 있으면 스킵하고 테스트만으로 완료 가능.
```

- [ ] **Step 4: Commit + push**

```bash
git add docs/superpowers/specs docs/superpowers/plans chunbaek/guide scripts/test
git commit -m "docs: mark v1 guide plan superseded; finish v2 guide pass"
git push -u origin HEAD
```

---

## 완료 정의

- [ ] 스펙 IA 앵커·SVG 4·원문 사례·공통 표 규칙 충족
- [ ] `chunbaek-guide-*.test.js` PASS
- [ ] 나 탭 → `/chunbaek/guide/`
- [ ] Functions/Firestore 변경 없음
- [ ] `firebase deploy` 실행하지 않음

## 리스크

- DOCX `/tmp` 유실 → 추출 전 경로 확인
- HTML 비대화 → 단일 파일 유지(스펙). 필요 시 나중에만 분할
- 카톡 개인정보: handoff에 포함된 공개용 일지 전제. 전화번호 등 보이면 마스킹
