# 춘백 S3 출석 점수 제도 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 주간 목표 판정을 「출석 횟수」에서 「출석 점수(실출석 1.0 + 예외 0.5)」로 바꿔, 예외 2일+실출석 2회처럼 사전 인폼한 회원이 억울한 패널티를 받지 않게 한다.

**Architecture:** 집계 SSOT는 `functions/lib/chunbaek-stats.js`의 `computeWeekStats` / `computeWeekStatsFull`이다. API 핸들러는 `weekScore`·`weekExceptionCount`를 명시적으로 응답에 실어 주고, FE는 기존 `weekAttendCount`를 유지한 채 점수 표시·달성 판정만 바꾼다. 시즌 출석률·Firestore 스키마·예외 상신 흐름은 변경하지 않는다.

**Tech Stack:** Node `node:test`, Firebase Functions (`chunbaek-stats` / `chunbaek-handlers` / `chunbaek-admin`), Hosting (`chunbaek/`)

**Spec:** `_docs/superpowers/specs/2026-07-29-chunbaek-attendance-score-design.md`

**범위 밖:** 시즌 출석률 재정의, 예외 자동 승인, 어드민 예외 승인 시 점수 미리보기

---

## 파일 맵

| 파일 | 역할 |
|------|------|
| `scripts/test/chunbaek-attendance-score.test.js` | 출석 점수 단위 테스트 (신규) |
| `functions/lib/chunbaek-stats.js` | `computeWeekStats`, `computeWeekStatsFull`, `buildTimelineWeeks`, `weekBar`, 표시 헬퍼 |
| `functions/lib/chunbaek-handlers.js` | `emptyStats`, `my-profile`/`team-summary` 응답 |
| `functions/lib/chunbaek-admin.js` | `admin-grid` 멤버 응답에 `weekScore` 추가 |
| `chunbaek/js/app.js` | 홈·내 100일·팀·나 탭 표시, 1회성 배너, 토스트 |
| `chunbaek/js/admin.js` | 미달 필터를 `weekScore` 기준으로 변경 |
| `chunbaek/js/api.js` | MOCK에 `weekScore` / `weekExceptionCount` / 변경된 `attendSummary` |
| `chunbaek/index.html` | 온보딩 가이드 문구, 홈 배너 마크업 |
| `chunbaek/exception-guide.html` | 출석 점수 안내 섹션 |
| `scripts/test/chunbaek-exception-guide-score.test.js` | 안내 페이지 문구 스모크 (신규, 선택적으로 guide 테스트에 합쳐도 됨) |

---

## 집계 공식 (구현 SSOT)

```
// 해당 주 · isProgramOff=false · date<=today 슬롯만
exceptionCount = exception:true 인 슬롯 수   // attended 여부와 무관 (예외 우선)
attendCount    = exception:false && attended:true 인 슬롯 수
trainingCount  = 위 조건의 전체 훈련 슬롯 수

weekScore  = attendCount + exceptionCount * 0.5
maxScore   = (trainingCount - exceptionCount) * 1.0 + exceptionCount * 0.5
           = trainingCount - exceptionCount * 0.5
weekTarget = Math.min(weeklyTargetConfig, maxScore)
weekTargetMet = weekTarget > 0 && weekScore >= weekTarget
```

**표시 규칙:** `weekScore.toFixed(1)` (항상 소수 1자리).  
**weekBar:** `weekBar(Math.floor(weekScore), weekTarget)` — 칸 수는 `Math.max(1, Math.ceil(weekTarget))` 사용 (하드코딩 3 제거).

**표시 포맷 헬퍼 (`formatWeekScoreSummary`):**
```
exceptionCount > 0:
  `출석 ${attendCount}회 · 예외 ${exceptionCount}회  ${score.toFixed(1)} / ${target}점`
exceptionCount === 0:
  `출석 ${attendCount}회  ${score.toFixed(1)} / ${target}점`
```

---

### Task 1: 출석 점수 단위 테스트 (TDD Red)

**Files:**
- Create: `scripts/test/chunbaek-attendance-score.test.js`
- Modify: (아직 구현 없음 — Red 단계)

- [ ] **Step 1: 실패하는 테스트 작성**

```js
"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  computeWeekStats,
  computeWeekStatsFull,
  formatWeekScoreSummary,
  weekBar,
} = require(path.join(__dirname, "../../functions/lib/chunbaek-stats.js"));

/** 주 1, 월~일 7일 훈련 (2026-07-20=월 … 2026-07-26=일) */
function week7Slots() {
  const dates = [
    "2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23",
    "2026-07-24", "2026-07-25", "2026-07-26",
  ];
  return dates.map((date, i) => ({
    id: String(i + 1),
    dayIndex: i + 1,
    date,
    week: 1,
    isProgramOff: false,
  }));
}

function attMap(entries) {
  // entries: { [dayIndex]: { attended?, exception? } }
  const map = new Map();
  for (const [k, v] of Object.entries(entries)) {
    map.set(String(k), v);
  }
  return map;
}

describe("computeWeekStats — 출석 점수", () => {
  const slots = week7Slots();
  const today = "2026-07-26"; // 주 전체

  it("예외 0 + 출석 3 → score 3.0 달성", () => {
    const map = attMap({ 1: { attended: true }, 2: { attended: true }, 3: { attended: true } });
    const r = computeWeekStats(slots, map, 1, today, 3);
    assert.equal(r.weekAttendCount, 3);
    assert.equal(r.weekExceptionCount, 0);
    assert.equal(r.weekScore, 3);
    assert.equal(r.weekTarget, 3);
    assert.equal(r.weekTargetMet, true);
  });

  it("예외 2 + 출석 2 → score 3.0 달성 (억울 케이스 해소)", () => {
    const map = attMap({
      1: { attended: true },
      2: { attended: true },
      3: { exception: true },
      4: { exception: true },
    });
    const r = computeWeekStats(slots, map, 1, today, 3);
    assert.equal(r.weekAttendCount, 2);
    assert.equal(r.weekExceptionCount, 2);
    assert.equal(r.weekScore, 3);
    assert.equal(r.weekTargetMet, true);
  });

  it("예외 1 + 출석 2 → score 2.5 미달", () => {
    const map = attMap({
      1: { attended: true },
      2: { attended: true },
      3: { exception: true },
    });
    const r = computeWeekStats(slots, map, 1, today, 3);
    assert.equal(r.weekScore, 2.5);
    assert.equal(r.weekTargetMet, false);
  });

  it("exception+attended 동시 true → 0.5점만 (예외 우선)", () => {
    const map = attMap({
      1: { attended: true, exception: true },
      2: { attended: true },
      3: { attended: true },
    });
    const r = computeWeekStats(slots, map, 1, today, 3);
    assert.equal(r.weekAttendCount, 2);
    assert.equal(r.weekExceptionCount, 1);
    assert.equal(r.weekScore, 2.5);
  });

  it("미래 예외는 weekScore에 미포함 (date > today)", () => {
    const map = attMap({
      1: { attended: true },
      2: { attended: true },
      7: { exception: true }, // 2026-07-26, today=07-25면 미래
    });
    const r = computeWeekStats(slots, map, 1, "2026-07-25", 3);
    assert.equal(r.weekExceptionCount, 0);
    assert.equal(r.weekScore, 2);
    assert.equal(r.weekTargetMet, false);
  });

  it("훈련일 적은 주 — maxScore cap (훈련 2일·예외 0 → target 2)", () => {
    const short = [
      { id: "1", dayIndex: 1, date: "2026-07-20", week: 1, isProgramOff: false },
      { id: "2", dayIndex: 2, date: "2026-07-21", week: 1, isProgramOff: false },
      { id: "3", dayIndex: 3, date: "2026-07-22", week: 1, isProgramOff: true },
    ];
    const map = attMap({ 1: { attended: true }, 2: { attended: true } });
    const r = computeWeekStats(short, map, 1, today, 3);
    assert.equal(r.weekTarget, 2);
    assert.equal(r.weekScore, 2);
    assert.equal(r.weekTargetMet, true);
  });
});

describe("computeWeekStatsFull + formatWeekScoreSummary", () => {
  it("attendSummary에 예외 포함", () => {
    const slots = week7Slots();
    const map = attMap({
      1: { attended: true },
      2: { attended: true },
      3: { exception: true },
      4: { exception: true },
    });
    const r = computeWeekStatsFull(slots, map, 1, 3, "2026-07-26");
    assert.equal(r.weekScore, 3);
    assert.equal(r.exceptionCount, 2);
    assert.equal(r.attendCount, 2);
    assert.match(formatWeekScoreSummary(r), /출석 2회 · 예외 2회/);
    assert.match(formatWeekScoreSummary(r), /3\.0/);
  });
});

describe("weekBar", () => {
  it("소수 score는 floor 후 3칸 유지", () => {
    assert.equal(weekBar(Math.floor(2.5), 3), "██░");
    assert.equal(weekBar(3, 3), "███");
  });
});
```

- [ ] **Step 2: 테스트 실행 — Red 확인**

```bash
node --test scripts/test/chunbaek-attendance-score.test.js
```

Expected: FAIL (`weekScore` / `formatWeekScoreSummary` undefined 또는 기존 로직이 예외를 skip 해서 assertion 실패)

- [ ] **Step 3: Commit (Red)**

```bash
git add scripts/test/chunbaek-attendance-score.test.js
git commit -m "test: 춘백 출석 점수 집계 Red 테스트 추가"
```

---

### Task 2: `chunbaek-stats.js` 집계 구현 (TDD Green)

**Files:**
- Modify: `functions/lib/chunbaek-stats.js` (`computeWeekStats` ~311, `computeWeekStatsFull` ~379, `computeMemberStats` ~329, `buildTimelineWeeks` ~429, `weekBar` ~511, `module.exports`)

- [ ] **Step 1: `computeWeekStats` 교체**

```js
function computeWeekStats(slots, attendanceMap, week, today, weeklyTargetConfig) {
  let weekAttendCount = 0;
  let weekExceptionCount = 0;
  let trainingCount = 0;

  for (const slot of slots) {
    if (slot.week !== week) continue;
    if (slot.isProgramOff) continue;
    if (slot.date > today) continue;
    trainingCount += 1;
    const att = getAttendance(attendanceMap, slot);
    if (att?.exception) {
      weekExceptionCount += 1;
      continue;
    }
    if (att?.attended) weekAttendCount += 1;
  }

  const weekScore = weekAttendCount + weekExceptionCount * 0.5;
  const maxScore = trainingCount - weekExceptionCount * 0.5;
  const weekTarget = Math.min(weeklyTargetConfig, maxScore);
  const weekTargetMet = weekTarget > 0 && weekScore >= weekTarget;
  return {
    weekAttendCount,
    weekExceptionCount,
    weekScore,
    weekTarget,
    weekTargetMet,
    countableSlotsInWeek: trainingCount - weekExceptionCount, // 하위 호환(실출석 대상 슬롯)
  };
}
```

- [ ] **Step 2: `computeWeekStatsFull` — `today` 추가 + 점수**

시그니처: `computeWeekStatsFull(slots, attendanceMap, week, weeklyTargetConfig, today)`  
`today` 없으면 전 슬롯(기존 타임라인 과거 주 호환). 구현은 `computeWeekStats`와 동일 루프 후:

```js
return {
  attendCount: weekAttendCount,
  exceptionCount: weekExceptionCount,
  weekScore,
  target: weekTarget,
};
```

`buildTimelineWeeks` 호출부:

```js
const { attendCount, exceptionCount, weekScore, target } = computeWeekStatsFull(
  slots, attendanceMap, week, weeklyTargetConfig, today,
);
return {
  ...
  attendSummary: formatWeekScoreSummary({
    attendCount, exceptionCount, weekScore, target,
  }),
  weekScore,
  exceptionCount,
  attendCount,
  target,
  ...
};
```

- [ ] **Step 3: `formatWeekScoreSummary` + `weekBar` 추가/수정**

```js
function formatWeekScoreSummary({ attendCount, exceptionCount, weekScore, target }) {
  const scoreStr = Number(weekScore).toFixed(1);
  const targetStr = Number(target) === Math.floor(target)
    ? String(Math.floor(target))
    : Number(target).toFixed(1);
  if (exceptionCount > 0) {
    return `출석 ${attendCount}회 · 예외 ${exceptionCount}회  ${scoreStr} / ${targetStr}점`;
  }
  return `출석 ${attendCount}회  ${scoreStr} / ${targetStr}점`;
}

function weekBar(scoreOrCount, target = 3) {
  const slots = Math.max(1, Math.ceil(Number(target) || 3));
  const filled = Math.min(slots, Math.max(0, Math.floor(Number(scoreOrCount) || 0)));
  return `${"█".repeat(filled)}${"░".repeat(slots - filled)}`;
}
```

- [ ] **Step 4: `computeMemberStats` 반환에 추가**

```js
return {
  ...
  weekAttendCount: weekStats.weekAttendCount,
  weekExceptionCount: weekStats.weekExceptionCount,
  weekScore: weekStats.weekScore,
  weekTarget: weekStats.weekTarget,
  weekTargetMet: weekStats.weekTargetMet,
  ...
};
```

- [ ] **Step 5: `module.exports`에 `formatWeekScoreSummary` 추가**

- [ ] **Step 6: 테스트 Green 확인**

```bash
node --test scripts/test/chunbaek-attendance-score.test.js
```

Expected: PASS (전체)

- [ ] **Step 7: Commit**

```bash
git add functions/lib/chunbaek-stats.js scripts/test/chunbaek-attendance-score.test.js
git commit -m "feat: 춘백 주간 출석 점수(예외 0.5) 집계 도입"
```

---

### Task 3: API 핸들러 — `weekScore` 응답 연결

**Files:**
- Modify: `functions/lib/chunbaek-handlers.js` (`emptyStats` ~69, team-summary ~886)
- Modify: `functions/lib/chunbaek-admin.js` (`admin-grid` members push ~452)

- [ ] **Step 1: `emptyStats` 업데이트**

```js
function emptyStats() {
  return {
    seasonAttendCount: 0,
    seasonAttendRate: 0,
    seasonDayIndex: 0,
    weekAttendCount: 0,
    weekExceptionCount: 0,
    weekScore: 0,
    weekTarget: 3,
    weekTargetMet: false,
  };
}
```

- [ ] **Step 2: `team-summary` 멤버 객체**

```js
bar: weekBar(Math.floor(stats.weekScore || 0), stats.weekTarget),
week: `${Number(stats.weekScore || 0).toFixed(1)}/${stats.weekTarget}`,
weekAttendCount: stats.weekAttendCount,
weekExceptionCount: stats.weekExceptionCount || 0,
weekScore: stats.weekScore || 0,
weekTarget: stats.weekTarget,
met: stats.weekTargetMet,
```

(`my-profile`은 `computeMemberStats` 결과를 그대로 내려주면 `weekScore`·`weekExceptionCount`가 포함된다 — `stats` 객체를 필드 화이트리스트로 자르는 코드가 있으면 명시 추가.)

- [ ] **Step 3: `admin-grid` 멤버 응답**

```js
members.push({
  memberId: p.memberId,
  nickname: p.data.nickname || "",
  profileComplete,
  weekAttendCount: weekStats.weekAttendCount,
  weekExceptionCount: weekStats.weekExceptionCount,
  weekScore: weekStats.weekScore,
  weekTarget: weekStats.weekTarget,
  weekTargetMet: weekStats.weekTargetMet,
  cells,
});
```

`underTargetCount`는 이미 `!weekStats.weekTargetMet` 기반이면 **추가 변경 불필요** (집계 함수가 점수 기준으로 met를 계산).

- [ ] **Step 4: 관련 단위 테스트 회귀**

```bash
node --test scripts/test/chunbaek-attendance-score.test.js \
  scripts/test/chunbaek-exception-requests.test.js \
  scripts/test/chunbaek-member-exception-apis.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add functions/lib/chunbaek-handlers.js functions/lib/chunbaek-admin.js
git commit -m "feat: my-profile/team/admin-grid에 weekScore 응답 추가"
```

---

### Task 4: 회원 FE — 점수 표시 + 홈 배너

**Files:**
- Modify: `chunbaek/js/app.js` (홈 week-bar ~607, 출석 토스트 ~1009, 팀 ~1370·1732, 나 ~1960)
- Modify: `chunbaek/index.html` (온보딩 가이드 ~142–145, 홈 배너 마크업)
- Modify: `chunbaek/js/api.js` (MOCK stats)

- [ ] **Step 1: 공통 포맷 헬퍼를 `app.js`에 추가**

```js
function formatWeekScoreLine(s) {
  const attend = s.weekAttendCount || 0;
  const exc = s.weekExceptionCount || 0;
  const score = Number(s.weekScore != null ? s.weekScore : attend);
  const target = s.weekTarget || 3;
  const scoreStr = score.toFixed(1);
  if (exc > 0) {
    return `출석 ${attend}회 · 예외 ${exc}회  ${scoreStr} / ${target}점`;
  }
  return `출석 ${attend}회  ${scoreStr} / ${target}점`;
}

function isWeekScoreMet(s) {
  const score = Number(s.weekScore != null ? s.weekScore : s.weekAttendCount || 0);
  const target = Number(s.weekTarget || 3);
  return target > 0 && score >= target;
}
```

- [ ] **Step 2: 홈 헤더 week-bar**

```js
document.getElementById("week-bar-count").textContent = formatWeekScoreLine(s);
weekEl.classList.toggle("met", isWeekScoreMet(s));
```

동일 패턴을 출석 저장 직후 갱신 경로(~991)에도 적용.

- [ ] **Step 3: 「나」탭**

```js
<dt>이번 주</dt><dd>${formatWeekScoreLine(s)}</dd>
```

- [ ] **Step 4: 팀 탭 라벨**

- `이번 주 3회` → `이번 주 3점`
- 멤버 행은 API `week`/`met`/`bar`를 그대로 사용 (서버에서 점수 기반으로 내려옴)

- [ ] **Step 5: 출석 토스트**

```js
showToast(`${dayNum}일차 출석 완료 · ${formatWeekScoreLine(s)}`);
```

- [ ] **Step 6: 홈 1회성 배너**

`index.html` `#view-today` 상단(또는 `#today-active` 위):

```html
<div class="score-notice" id="score-notice" hidden>
  <div class="score-notice-body">
    <strong>출석 점수 제도가 도입됐습니다</strong>
    <p>예외 처리된 날이 0.5점으로 주간 목표에 반영됩니다.</p>
    <a href="/chunbaek/exception-guide.html">자세히 보기</a>
  </div>
  <button type="button" class="score-notice-close" id="score-notice-close" aria-label="닫기">✕</button>
</div>
```

`app.js`:

```js
const SCORE_NOTICE_KEY = "chunbaek_score_notice_v1";
function maybeShowScoreNotice() {
  const el = document.getElementById("score-notice");
  if (!el) return;
  if (localStorage.getItem(SCORE_NOTICE_KEY)) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
}
// close / 자세히 보기 클릭 시 localStorage.setItem(SCORE_NOTICE_KEY, "1"); el.hidden = true;
```

스타일은 기존 `saturday-notice` / 카드 톤을 재사용 (새 디자인 시스템 만들지 말 것).

- [ ] **Step 7: 온보딩 가이드 문구 (`index.html`)**

```
주 3회 이상 출석 목표
→ 주 3점 이상 출석 목표 (출석 1점 · 예외 0.5점)

주 3회 미달 시 패널티 (커피·간식)
→ 주 3점 미달 시 패널티 (커피·간식)
```

- [ ] **Step 8: MOCK (`api.js`)**

프로필/팀 MOCK에 `weekScore`, `weekExceptionCount` 추가. 타임라인 `attendSummary`를 새 포맷으로.

- [ ] **Step 9: Commit**

```bash
git add chunbaek/js/app.js chunbaek/js/api.js chunbaek/index.html
git commit -m "feat: 춘백 FE 출석 점수 표시 및 안내 배너"
```

---

### Task 5: Admin FE — 미달 필터를 점수 기준으로

**Files:**
- Modify: `chunbaek/js/admin.js` (`normalizeGridFromApi` ~160, `renderGrid` ~256, mock `viewGrid` ~208)
- Modify: `chunbaek/admin.html` (칩/필터 라벨 — 선택)

- [ ] **Step 1: `normalizeGridFromApi`**

```js
weekCount: m.weekAttendCount,
weekExceptionCount: m.weekExceptionCount || 0,
weekScore: m.weekScore != null ? m.weekScore : m.weekAttendCount,
weekTarget: m.weekTarget,
weekTargetMet: m.weekTargetMet,
```

- [ ] **Step 2: `renderGrid` 미달 판정**

```js
const score = m.weekScore != null ? Number(m.weekScore) : Number(m.weekCount ?? 0);
const target = m.weekTarget ?? 3;
const under = target > 0 && score < target;
// 셀 왼쪽 표시:
// `${score.toFixed(1)}/${target}` + (예외 있으면 작은 글씨로 예외 N)
```

- [ ] **Step 3: mock 경로**

`viewGrid` mock에서 `weekScore`를 넣고, `underTargetCount`를 `weekScore < weekTarget`으로 계산 (하드코딩 `< 3` 제거).

- [ ] **Step 4: 칩 문구 (선택)**

`주 3회 미달` → `주 3점 미달` (`admin.html` 필터 라벨·칩)

- [ ] **Step 5: Commit**

```bash
git add chunbaek/js/admin.js chunbaek/admin.html
git commit -m "feat: admin 그리드 미달 필터를 출석 점수 기준으로 변경"
```

---

### Task 6: 안내 페이지 (`exception-guide.html`)

**Files:**
- Modify: `chunbaek/exception-guide.html`
- Create or Modify: `scripts/test/chunbaek-exception-guide-score.test.js` (정적 HTML 스모크)

- [ ] **Step 1: 「출석 점수 안내」섹션 추가**

「요청 방법」과 「알아두면 좋아요」사이에:

```html
<section class="section">
  <h2>출석 점수 안내</h2>
  <p>예외 처리를 받은 날도 주간 목표에 반영됩니다.</p>
  <ul class="bullets">
    <li><strong>출석</strong> — 1점</li>
    <li><strong>예외</strong> — 0.5점</li>
    <li><strong>미출석</strong> — 0점</li>
  </ul>
  <p>주간 목표: <strong>3점 이상</strong></p>
  <ul class="bullets">
    <li>출석 2회 + 예외 2일 = 3.0점 → 달성</li>
    <li>출석 2회 + 예외 1일 = 2.5점 → 미달</li>
    <li>출석 3회 = 3.0점 → 달성</li>
  </ul>
</section>
```

- [ ] **Step 2: 스모크 테스트**

```js
const html = fs.readFileSync(path.join(__dirname, "../../chunbaek/exception-guide.html"), "utf8");
assert.match(html, /출석 점수 안내/);
assert.match(html, /0\.5점/);
assert.match(html, /3점 이상/);
```

```bash
node --test scripts/test/chunbaek-exception-guide-score.test.js
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add chunbaek/exception-guide.html scripts/test/chunbaek-exception-guide-score.test.js
git commit -m "docs(ui): 예외 안내 페이지에 출석 점수 제도 설명 추가"
```

---

### Task 7: 최종 검증

**Files:** (변경 없음 — 검증만)

- [ ] **Step 1: 단위 테스트 일괄**

```bash
node --test scripts/test/chunbaek-attendance-score.test.js \
  scripts/test/chunbaek-exception-guide-score.test.js \
  scripts/test/chunbaek-exception-requests.test.js \
  scripts/test/chunbaek-member-exception-apis.test.js \
  scripts/test/chunbaek-admin-exception-apis.test.js
```

Expected: PASS

- [ ] **Step 2: (가능하면) 에뮬 스모크**

Functions `node_modules`가 있으면:

```bash
# 에뮬 기동 후 수동:
# 1) 예외 2일 + 출석 2일 회원 → 홈 「3.0 / 3점」달성
# 2) 예외 1일 + 출석 2일 → 「2.5 / 3점」미달
# 3) 시즌 출석률 숫자가 이전과 동일 공식인지 확인
# 4) exception-guide.html 섹션 표시
# 5) 홈 배너 1회 닫기 → 새로고침 후 미표시
```

- [ ] **Step 3: 완료 전 자가 점검**

- [ ] 예외 2+출석 2 = 달성
- [ ] 예외 1+출석 2 = 미달
- [ ] 시즌 출석률 미변경
- [ ] admin 미달 필터 = `weekScore < weekTarget`
- [ ] 안내 페이지·홈 배너
- [ ] `weekAttendCount` 하위 호환 유지

- [ ] **Step 4: 최종 커밋 확인 + push**

```bash
git status
git log --oneline -8
git push -u origin HEAD
```

---

## 실행 핸드오프

Plan complete and saved to `_docs/superpowers/plans/2026-07-29-chunbaek-attendance-score-impl.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — task마다 새 서브에이전트, 태스크 사이 리뷰
2. **Inline Execution** — 이 세션에서 executing-plans로 체크포인트 실행

어느 쪽으로 진행할까요?
