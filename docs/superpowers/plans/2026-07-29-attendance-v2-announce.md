# 출석부 v2 전환 공지 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 춘백 가이드와 비슷한 짧은 안내 HTML을 DMC 블루 테마로 추가해, 8월 출석부 v2 전환을 공유할 수 있게 한다.

**Architecture:** Hosting 루트에 정적 `attendance-v2-announce.html` + `assets/attendance-v2-announce.css`. 레이아웃은 `chunbaek/guide` 패턴(헤더 밴드·섹션 카드·카카오 배너)을 따르고, 색만 `assets/design-tokens.css`의 DMC 블루를 쓴다. 서버/API 변경 없음.

**Tech Stack:** 정적 HTML/CSS, Noto Sans KR(가이드와 동일), Hosting public `.`

**Spec:** `docs/superpowers/specs/2026-07-29-attendance-v2-announce-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `attendance-v2-announce.html` | 공지 카피·구조·카카오 배너 스크립트·CTA |
| `assets/attendance-v2-announce.css` | 블루 테마 페이지 스타일 |
| `scripts/pre-deploy-test-runner.sh` | Hosting assert (페이지 존재 + 핵심 문구) |
| `docs/superpowers/specs/2026-07-29-attendance-v2-announce-design.md` | 이미 작성된 스펙 (수정 시만) |

---

### Task 1: CSS — 블루 테마 셸

**Files:**
- Create: `assets/attendance-v2-announce.css`

- [ ] **Step 1: 스타일 파일 작성**

`chunbaek/guide/guide.css`의 `.page` / `.header` / `.kakao-banner` / `.section` / `.btn` 패턴을 축소 복제하되, 헤더·CTA는 DMC 블루를 쓴다.

```css
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--dmc-slate-2, #f8fafc);
  color: var(--dmc-slate-11, #0f172a);
  font-family: "Noto Sans KR", var(--dmc-font-family, system-ui, sans-serif);
  min-height: 100dvh;
  line-height: 1.5;
}
.page { max-width: 480px; margin: 0 auto; padding: 0 0 48px; }

.header {
  background: var(--dmc-blue-9, #2563eb);
  color: #fff;
  padding: 28px 20px 32px;
}
.header-eyebrow {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  opacity: 0.9;
}
.header h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
  line-height: 1.25;
}
.header p {
  margin: 10px 0 0;
  font-size: 14px;
  opacity: 0.92;
}

.kakao-banner {
  display: none;
  margin: 16px 16px 0;
  background: #fef3c7;
  border: 1.5px solid #f59e0b;
  border-radius: 12px;
  padding: 14px 16px;
}
.kakao-banner.visible { display: block; }
.kakao-banner-title {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 800;
  color: #92400e;
}
.kakao-banner-body {
  margin: 0;
  font-size: 13px;
  color: #78350f;
}

.section {
  margin: 20px 16px 0;
  background: #fff;
  border: 1px solid var(--dmc-slate-4, #e2e8f0);
  border-radius: 16px;
  padding: 18px 16px;
}
.section h2 {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 800;
}
.section p, .section li {
  font-size: 14px;
  color: var(--dmc-slate-11, #0f172a);
}
.section p { margin: 0 0 10px; }
.section p:last-child { margin-bottom: 0; }
.section ul {
  margin: 0;
  padding-left: 1.2em;
}
.section li { margin: 0 0 6px; }
.section li:last-child { margin-bottom: 0; }
.section .note {
  margin-top: 10px;
  font-size: 13px;
  color: var(--dmc-slate-7, #64748b);
}

.cta-wrap {
  margin: 24px 16px 0;
}
.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 48px;
  border: none;
  border-radius: 12px;
  background: var(--dmc-blue-9, #2563eb);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  text-decoration: none;
  font-family: inherit;
}
.btn:hover { background: var(--dmc-blue-10, #1d4ed8); }

.footer {
  margin: 24px 16px 0;
  font-size: 12px;
  color: var(--dmc-slate-7, #64748b);
  text-align: center;
}
```

- [ ] **Step 2: 커밋**

```bash
git add assets/attendance-v2-announce.css
git commit -m "style: 출석부 v2 공지 페이지 블루 테마 CSS"
```

---

### Task 2: HTML — 공지 본문

**Files:**
- Create: `attendance-v2-announce.html`
- Spec copy: `docs/superpowers/specs/2026-07-29-attendance-v2-announce-design.md` §확정 카피

- [ ] **Step 1: HTML 작성**

필수:
- `assets/design-tokens.css` + `assets/attendance-v2-announce.css` 링크
- Noto Sans KR (가이드와 동일 Google Fonts)
- `theme-color` = `#2563EB`
- 카카오 배너 + UA 스크립트 (`/KAKAOTALK/i`)
- 섹션: 머리말 + 변경 1~6 (스펙 카피 그대로; **취소는 3번에만**, 키오스크는 5번 한 줄)
- CTA `href="attendance-v2.html"`
- `index-legacy.html` URL을 본문에 직접 쓰지 않음

골격:

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#2563EB" />
  <meta name="description" content="동마클 출석부 v2 — 8월부터 기본 사용 안내" />
  <title>출석부 v2 안내 — 동마클</title>
  <link rel="icon" href="assets/dmc_logo.png" />
  <link rel="stylesheet" href="assets/design-tokens.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="assets/attendance-v2-announce.css" />
</head>
<body>
  <div class="page">
    <header class="header">
      <p class="header-eyebrow">동마클 출석</p>
      <h1>출석부 v2 안내</h1>
      <p>베타를 마치고, 8월부터 새 출석부를 기본으로 사용합니다.</p>
    </header>

    <div class="kakao-banner" id="kakao-banner">
      <p class="kakao-banner-title">카카오톡 안에서 보시는 경우</p>
      <p class="kakao-banner-body">오른쪽 아래 <strong>⋯</strong> → <strong>다른 브라우저로 열기</strong>를 누르면 더 편합니다.</p>
    </div>

    <main>
      <section class="section" id="intro">
        <h2>무엇이 바뀌나요?</h2>
        <p>베타를 마치고, <strong>8월부터 동마클 출석부는 새 버전(v2)을 기본으로 사용</strong>합니다. 기존 QR·메인 주소도 새 출석으로 연결됩니다.</p>
      </section>

      <section class="section" id="change-1">
        <h2>1. 출석 방식이 바뀝니다</h2>
        <ul>
          <li>예전: 닉네임 입력 + 팀 선택</li>
          <li>이제: <strong>명단에서 본인만 고르고 「출석 체크」 한 번</strong></li>
          <li>한 번 선택하면 기기에 저장되어, 다음에 바로 출석할 수 있습니다</li>
        </ul>
      </section>

      <section class="section" id="change-2">
        <h2>2. 앱처럼 한 화면에서 다 됩니다</h2>
        <ul>
          <li><strong>오늘</strong> — 출석 체크 · 오늘 명단 · 훈련 공지</li>
          <li><strong>내 출석</strong> — 월간 달력·통계 (기본이 달력 뷰)</li>
          <li><strong>팀 출석</strong> — 팀원 정모(화·목·토) 출석 한눈에</li>
          <li><strong>더보기</strong> — 프로필·이용 안내·키오스크 등</li>
        </ul>
      </section>

      <section class="section" id="change-3">
        <h2>3. 내 출석이 보기 쉬워집니다</h2>
        <ul>
          <li>달력에서 출석 날짜를 바로 확인</li>
          <li>이번 달 횟수·출석률·연속 출석 요약</li>
          <li>잘못 체크했을 때 <strong>목록에서 오늘 출석만 취소</strong>할 수 있습니다</li>
        </ul>
      </section>

      <section class="section" id="change-4">
        <h2>4. 팀 출석이 추가됩니다</h2>
        <ul>
          <li>팀별로 누가 정모에 왔는지 도트로 확인</li>
          <li>회원 이름을 누르면 그 사람의 달력·요약을 볼 수 있습니다</li>
        </ul>
        <p class="note">※ 팀 출석은 조회용이며, 여기서 출석 체크하지는 않습니다.</p>
      </section>

      <section class="section" id="change-5">
        <h2>5. 키오스크(공용 기기)도 있습니다</h2>
        <ul>
          <li>더보기에서 키오스크 모드로 전환할 수 있습니다</li>
        </ul>
      </section>

      <section class="section" id="change-6">
        <h2>6. 예전 화면은 백업으로만</h2>
        <ul>
          <li>문제가 있으면 예전 입력형 출석으로 되돌릴 수 있습니다 (운영진 안내)</li>
        </ul>
      </section>

      <div class="cta-wrap">
        <a class="btn" href="attendance-v2.html">새 출석 열기</a>
      </div>
      <p class="footer">문의는 동마클 운영진에게 해주세요.</p>
    </main>
  </div>
  <script>
    if (/KAKAOTALK/i.test(navigator.userAgent || "")) {
      document.getElementById("kakao-banner").classList.add("visible");
    }
  </script>
</body>
</html>
```

- [ ] **Step 2: 로컬 스모크 (에뮬이 떠 있으면)**

```bash
# 에뮬 Hosting이 없으면 파일 존재만 확인
test -f attendance-v2-announce.html && test -f assets/attendance-v2-announce.css
# 에뮬 중이면:
# curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/attendance-v2-announce.html
# Expected: 200
```

- [ ] **Step 3: 커밋**

```bash
git add attendance-v2-announce.html
git commit -m "feat(attendance): 출석부 v2 전환 공지 페이지"
```

---

### Task 3: pre-deploy assert

**Files:**
- Modify: `scripts/pre-deploy-test-runner.sh` (호스팅 테스트 블록, `attendance-v2.html` assert 근처)

- [ ] **Step 1: assert 추가**

```bash
curl -s "$HOST/attendance-v2-announce.html" > "$TMP_DIR/attendance-v2-announce.html"
assert_contains "announce: 제목" "출석부 v2" "$TMP_DIR/attendance-v2-announce.html"
assert_contains "announce: 오늘 출석 취소" "오늘 출석만 취소" "$TMP_DIR/attendance-v2-announce.html"
assert_contains "announce: CTA" "attendance-v2.html" "$TMP_DIR/attendance-v2-announce.html"
curl -s "$HOST/assets/attendance-v2-announce.css" > "$TMP_DIR/attendance-v2-announce.css"
assert_contains "announce.css: 블루 헤더" "#2563eb" "$TMP_DIR/attendance-v2-announce.css"
```

레거시 URL이 공지에 없는지 확인(선택):

```bash
if ! grep -qi 'index-legacy' "$TMP_DIR/attendance-v2-announce.html" 2>/dev/null; then
  PASS=$((PASS+1))
  RESULTS+=("${GREEN}✓${NC} announce: index-legacy 미노출")
else
  FAIL=$((FAIL+1))
  RESULTS+=("${RED}✗${NC} announce: index-legacy가 본문에 있음")
fi
```

- [ ] **Step 2: 테스트 실행**

```bash
bash scripts/pre-deploy-test.sh
```

Expected: 전체 통과 (기존 + 신규 assert)

- [ ] **Step 3: 커밋**

```bash
git add scripts/pre-deploy-test-runner.sh
git commit -m "test: 출석부 v2 공지 페이지 hosting assert"
```

---

### Task 4: 푸시 · PR

**Files:** (없음 — git/GitHub만)

- [ ] **Step 1: 푸시**

```bash
git push -u origin cursor/attendance-v2-announce-cf91
```

- [ ] **Step 2: Draft PR → `main`**

제목: `feat(attendance): 출석부 v2 전환 공지 페이지`  
본문: 스펙 링크, URL `attendance-v2-announce.html`, hosting-only 배포 안내, pre-deploy 결과.

- [ ] **Step 3: (배포는 사용자)** AI는 `firebase deploy` 실행 금지. 안내만:

```bash
firebase deploy --only hosting
```

---

## Done when

- [ ] 공지 HTML이 블루 헤더로 모바일에서 읽힘
- [ ] 카피 = 스펙 (취소=3번만, 키오스크=간단)
- [ ] pre-deploy 통과
- [ ] Draft PR 존재
