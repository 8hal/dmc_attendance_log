# 대회 홈 종목 먼저 · 배번 키패드 저장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `event-home.html` 프로필 섹션(`#profileCard`)의 배번 입력을 종목 선택 → 배번 입력 두 단계로 나누고, 배번 단계에서 모바일 키패드 확인 키(또는 Enter)로 `update-bib`가 저장되게 한다.

**Architecture:** `EventHomeAction.resolveProfileCard`가 참가자 데이터·intent만으로 `bibStage`("distance" | "bib")와 그 단계 전용 문구를 계산한다(순수 함수, 서버 진실 기준). `event-home.html`은 그 `bibStage`를 사용자가 방금 고른 칩(`selectedDistance`, 아직 저장 전)으로만 로컬 오버라이드해서 실제 화면 단계를 정하고, `#profileBibForm`을 `<form>`으로 바꿔 키패드 확인/Enter가 `submit` 한 경로로만 `submitUpdateBib`를 부른다.

**Tech Stack:** 순수 JS(`assets/event-home-action.js`, UMD 모듈), 바닐라 DOM(`event-home.html`), CSS(`assets/event-member-shell.css`), `node --test` 단위 테스트.

**참조 스펙:** `_docs/superpowers/specs/2026-08-30-mobile-bib-keypad-save-design.md`

**브랜치:** 이 저장소는 클라우드 에이전트 브랜치(`cursor/mobile-bib-keypad-save-design-b8d9`)로 이미 격리되어 있다. `using-git-worktrees`는 이번에는 별도로 쓰지 않는다.

---

## File Structure

| 파일 | 역할 |
|------|------|
| `assets/event-home-action.js` | `resolveProfileCard`에 `bibStage` + 단계별 문구 계산 추가. 순수 함수, DOM 없음. |
| `event-home.html` | `#profileBibForm` 마크업을 `<form>` + 종목칩(항상 보임) + 배번그룹(`#profileBibNumberGroup`, 조건부 숨김)으로 재구성. `renderProfileCard`의 `bib` 분기, 칩 클릭 핸들러, form submit 핸들러, `submitUpdateBib` 방어 분기 수정. |
| `assets/event-member-shell.css` | `.profile-prompt-question` 규칙 추가(1단계 질문 스타일). |
| `scripts/test/event-home-action.test.js` | 기존 `bib` 상태 프롬프트 단정을 새 문구/`bibStage`로 갱신, `bibStagePrompt` 단위 테스트 추가. |
| `scripts/test/event-home-bib-stage.test.js` (신규) | 마크업(form/enterkeyhint/그룹), CSS, `renderProfileCard`/칩클릭/submit 핸들러 관련 정적 단정. |
| `package.json` | `test:event-home` 스크립트에 신규 테스트 파일 추가. |

---

### Task 1: `EventHomeAction`에 `bibStage`와 단계별 문구 추가

**Files:**
- Modify: `assets/event-home-action.js`
- Test: `scripts/test/event-home-action.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/test/event-home-action.test.js`에서 아래 두 테스트를 교체한다(기존 문구가 바뀌므로).

```js
  it("no bib, no distance → bib state, distance stage", () => {
    const p = resolveProfileCard({
      participant: { bib: "", distance: "" },
      confirmMode: "none",
      isGuest: false,
    });
    assert.equal(p.state, "bib");
    assert.equal(p.bibStage, "distance");
    assert.match(p.prompt, /이번 대회에 어느 종목에 출전하나요\?/);
  });

  it("bib without distance → bib state, distance stage (legacy record)", () => {
    const p = resolveProfileCard({
      participant: { bib: "4821", distance: "" },
      confirmMode: "none",
    });
    assert.equal(p.state, "bib");
    assert.equal(p.bibStage, "distance");
    assert.match(p.prompt, /이번 대회에 어느 종목에 출전하나요\?/);
  });
```

`아니에요 → bib edit, not manual` 테스트에는 아래 두 줄을 추가한다(기존 단정 아래에):

```js
    assert.equal(p.bibStage, "bib");
    assert.match(p.prompt, /기록 자동 수집을 위해 배번을 입력해 주세요\./);
```

새 테스트를 파일 끝(마지막 `describe` 블록 앞)에 추가한다:

```js
describe("bibStagePrompt", () => {
  it("distance stage asks which category", () => {
    assert.match(
      EventHomeAction.bibStagePrompt("distance"),
      /이번 대회에 어느 종목에 출전하나요\?/
    );
  });

  it("bib stage asks for bib number", () => {
    assert.match(
      EventHomeAction.bibStagePrompt("bib"),
      /기록 자동 수집을 위해 배번을 입력해 주세요\./
    );
  });

  it("unknown stage falls back to bib prompt", () => {
    assert.equal(
      EventHomeAction.bibStagePrompt("nope"),
      EventHomeAction.bibStagePrompt("bib")
    );
  });
});
```

이 새 `describe` 블록이 `EventHomeAction`을 이름으로 참조하려면 파일 상단 require를 모듈 객체째로 받아야 한다. 현재는 구조분해로 개별 함수만 가져온다:

```js
const {
  resolveProfileCard,
  resolveBusCard,
  PROFILE_DISTANCES,
  pickNicknames,
  busRouteTitle,
} = require(path.join(__dirname, "../../assets/event-home-action.js"));
```

이 줄 바로 아래에 모듈 전체도 별도 이름으로 추가로 require한다(구조분해된 개별 바인딩은 그대로 두어 기존 테스트가 깨지지 않게 한다):

```js
const EventHomeAction = require(path.join(
  __dirname,
  "../../assets/event-home-action.js"
));
```

- [ ] **Step 2: 실패 확인**

Run: `node --test scripts/test/event-home-action.test.js`
Expected: FAIL — `bibStage` is `undefined`, `bibStagePrompt`가 존재하지 않음, 옛 프롬프트 문구가 더는 없음.

- [ ] **Step 3: 최소 구현**

`assets/event-home-action.js`에서 `PROFILE_DISTANCES` 선언 바로 다음에 추가:

```js
  const BIB_STAGE_PROMPTS = Object.freeze({
    distance: "이번 대회에 어느 종목에 출전하나요?",
    bib: "기록 자동 수집을 위해 배번을 입력해 주세요.",
  });

  function bibStagePrompt(stage) {
    return BIB_STAGE_PROMPTS[stage] || BIB_STAGE_PROMPTS.bib;
  }

  function resolveBibStage(distance) {
    return PROFILE_DISTANCES.indexOf(distance) >= 0 ? "bib" : "distance";
  }
```

`emptyCardExtras()`의 반환 객체에 `bibStage: null,`을 추가한다(다른 상태들의 기본값, `bib` 분기에서만 실제 값으로 덮어씀):

```js
  function emptyCardExtras() {
    return {
      showManual: false,
      showPb: false,
      largeBib: false,
      ctaLabel: null,
      ctaHref: null,
      secondaryHref: null,
      bibStage: null,
    };
  }
```

`intent === "reject"` 분기를 교체:

```js
    if (intent === "reject") {
      const rejectDistance = participant ? trimField(participant.distance) : "";
      const rejectStage = resolveBibStage(rejectDistance);
      return Object.assign(emptyCardExtras(), {
        state: "bib",
        bibStage: rejectStage,
        prompt: bibStagePrompt(rejectStage),
        showManual: false,
      });
    }
```

배번/종목 누락 분기를 교체:

```js
    const bib = participant ? trimField(participant.bib) : "";
    const distance = participant ? trimField(participant.distance) : "";
    const bibStage = resolveBibStage(distance);
    if (!bib || bibStage === "distance") {
      return Object.assign(emptyCardExtras(), {
        state: "bib",
        bibStage: bibStage,
        prompt: bibStagePrompt(bibStage),
      });
    }
```

파일 맨 아래 `return { ... }`에 `bibStagePrompt`를 추가:

```js
  return {
    resolveProfileCard,
    resolveBusCard,
    pickNicknames,
    PROFILE_DISTANCES,
    pageHref,
    busRouteTitle,
    bibStagePrompt,
  };
```

- [ ] **Step 4: 통과 확인**

Run: `node --test scripts/test/event-home-action.test.js`
Expected: PASS, 전부 초록.

- [ ] **Step 5: 커밋**

```bash
git add assets/event-home-action.js scripts/test/event-home-action.test.js
git commit -m "feat(event-home): resolveProfileCard가 bibStage와 단계별 문구를 반환"
```

---

### Task 2: `#profileBibForm` 마크업을 `<form>` + 종목칩/배번그룹으로 재구성

**Files:**
- Modify: `event-home.html`
- Test: `scripts/test/event-home-bib-stage.test.js` (신규)

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/test/event-home-bib-stage.test.js`를 새로 만든다:

```js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "../..", rel), "utf8");
}

function extractFn(html, name) {
  const start = html.indexOf("function " + name + "(");
  assert.ok(start >= 0, "missing function " + name);
  const next = html.indexOf("\n    function ", start + 1);
  return html.slice(start, next > 0 ? next : html.length);
}

describe("event-home bib form markup", () => {
  const html = read("event-home.html");

  it("profileBibForm is a form; chips always inside; bib number is a separate group", () => {
    assert.match(html, /<form[^>]*id="profileBibForm"[^>]*>/);
    const formStart = html.indexOf('id="profileBibForm"');
    const formEnd = html.indexOf("</form>", formStart);
    const form = html.slice(formStart, formEnd);
    assert.match(form, /id="profileDistChips"/);
    assert.match(form, /id="profileBibNumberGroup"/);
    const groupStart = form.indexOf('id="profileBibNumberGroup"');
    assert.ok(
      form.indexOf('id="profileDistChips"') < groupStart,
      "dist chips markup should come before the bib number group"
    );
  });

  it("bib input uses numeric keypad with a done-style enter key", () => {
    assert.match(
      html,
      /id="profileBib"[^>]*inputmode="numeric"[^>]*enterkeyhint="done"/
    );
    assert.doesNotMatch(html, /id="profileBib"[^>]*type="number"/);
  });

  it("chip and save buttons stay type=button so they cannot submit the form", () => {
    const groupStart = html.indexOf('id="profileBibNumberGroup"');
    const groupEnd = html.indexOf("</div>", html.indexOf("</div>", groupStart) + 1);
    const group = html.slice(groupStart, groupEnd);
    assert.match(group, /id="profileBibSave"[^>]*type="button"|type="button"[^>]*id="profileBibSave"/);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test scripts/test/event-home-bib-stage.test.js`
Expected: FAIL — `<form ... id="profileBibForm">`가 없고(지금은 `<div>`), `profileBibNumberGroup`도 없고, `enterkeyhint`도 없음.

- [ ] **Step 3: 마크업 교체**

`event-home.html`에서 (현재 195~200행 부근):

```html
        <div id="profileBibForm" class="hidden">
          <label class="profile-label" for="profileBib">배번</label>
          <input id="profileBib" class="profile-input" inputmode="numeric" autocomplete="off" />
          <div class="dist-chips" id="profileDistChips"></div>
          <button type="button" class="today-cta" id="profileBibSave">저장</button>
        </div>
```

를

```html
        <form id="profileBibForm" class="hidden">
          <div class="dist-chips" id="profileDistChips"></div>
          <div id="profileBibNumberGroup" class="hidden">
            <label class="profile-label" for="profileBib">배번</label>
            <input id="profileBib" class="profile-input" inputmode="numeric" enterkeyhint="done" autocomplete="off" />
            <button type="button" class="today-cta" id="profileBibSave">저장</button>
          </div>
        </form>
```

로 바꾼다.

이 시점에서 아직 JS 쪽 상수(`profileBibNumberGroup`)를 추가하지 않았고 `renderProfileCard`도 옛 분기 그대로라 화면에서는 배번 입력칸이 항상 안 보이게 될 수 있다(Task 4에서 고친다). 이 Task는 마크업 구조만 잠그는 단계이므로 정상이다.

- [ ] **Step 4: 통과 확인**

Run: `node --test scripts/test/event-home-bib-stage.test.js`
Expected: PASS.

Run: `node --test scripts/test/event-home-pick.test.js scripts/test/event-home-bib-face.test.js scripts/test/event-home-done-record.test.js`
Expected: PASS (마크업 변경이 기존 id·클래스는 그대로 유지하는지 확인).

- [ ] **Step 5: 커밋**

```bash
git add event-home.html scripts/test/event-home-bib-stage.test.js
git commit -m "feat(event-home): profileBibForm을 form + 배번 그룹 구조로 재구성"
```

---

### Task 3: `.profile-prompt-question` CSS 추가

**Files:**
- Modify: `assets/event-member-shell.css`
- Test: `scripts/test/event-home-bib-stage.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

Task 2의 테스트 파일에 아래 `describe`를 추가한다:

```js
describe("event-home bib stage prompt style", () => {
  const css = read("assets/event-member-shell.css");

  it("profile-prompt-question is a bigger bold question style", () => {
    const block = css.match(/\.profile-prompt-question\s*\{[^}]+\}/);
    assert.ok(block, ".profile-prompt-question rule missing");
    assert.match(block[0], /font-size:\s*(1[89]|[2-9][0-9])px/);
    assert.match(block[0], /font-weight:\s*(700|800|900|bold)/);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test scripts/test/event-home-bib-stage.test.js`
Expected: FAIL — `.profile-prompt-question` 규칙이 없음.

- [ ] **Step 3: CSS 추가**

`assets/event-member-shell.css`에서 아래 블록(현재 260~263행 부근) 바로 다음에 추가:

```css
.profile-card .today-desc,
.bus-card .today-desc {
  margin-bottom: 12px;
}

.profile-prompt-question {
  font-size: 18px;
  font-weight: 700;
  color: var(--dmc-color-text, #0f172a);
}
```

(`.profile-prompt-question`이 `.today-desc`보다 파일에서 뒤에 오므로, 동일한 클래스 선택자 특이도에서 font-size/font-weight/color가 이 규칙으로 덮인다.)

- [ ] **Step 4: 통과 확인**

Run: `node --test scripts/test/event-home-bib-stage.test.js`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add assets/event-member-shell.css scripts/test/event-home-bib-stage.test.js
git commit -m "feat(event-home): 배번 1단계 질문 문구용 profile-prompt-question 스타일 추가"
```

---

### Task 4: JS 참조·상태 변수 추가, `renderProfileCard`의 `bib` 분기 재작성

**Files:**
- Modify: `event-home.html`
- Test: `scripts/test/event-home-bib-stage.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

Task 2/3 테스트 파일에 아래 `describe`를 추가한다:

```js
describe("event-home renderProfileCard bib stage branch", () => {
  const html = read("event-home.html");

  it("bib branch toggles the number group and question style by resolved stage", () => {
    const fn = extractFn(html, "renderProfileCard");
    const bibIdx = fn.indexOf('if (card.state === "bib")');
    assert.ok(bibIdx >= 0, "bib branch missing");
    const block = fn.slice(bibIdx);
    assert.match(block, /EventHomeAction\.bibStagePrompt\(/);
    assert.match(block, /profileBibNumberGroup\.classList\.toggle\(["']hidden["']/);
    assert.match(block, /profile-prompt-question/);
    assert.match(block, /card\.bibStage/);
    assert.match(block, /selectedDistance/);
  });

  it("bib branch only autofocuses when a pending focus flag says so", () => {
    const fn = extractFn(html, "renderProfileCard");
    const bibIdx = fn.indexOf('if (card.state === "bib")');
    const block = fn.slice(bibIdx, bibIdx + 900);
    assert.match(block, /bibStageFocusPending/);
    assert.match(block, /profileBib\.focus\(\)/);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test scripts/test/event-home-bib-stage.test.js`
Expected: FAIL — `renderProfileCard`가 여전히 옛 3줄짜리 `bib` 분기.

- [ ] **Step 3: 구현**

새 DOM 참조 상수를 `const profileDistChips = document.getElementById("profileDistChips");` 다음 줄에 추가:

```js
    const profileDistChips = document.getElementById("profileDistChips");
    const profileBibNumberGroup = document.getElementById("profileBibNumberGroup");
    const profileBibSave = document.getElementById("profileBibSave");
```

(가운뎃 줄이 신규. `profileBibSave` 줄은 이미 있으므로 그 위에 삽입한다.)

상태 변수 선언부(`let selectedDistance = "";` 근처)에 추가:

```js
    let selectedDistance = "";
    let bibStageFocusPending = false;
```

`renderProfileCard` 상단, `prevProfileState`를 덮어쓰기 **전에** `enteringBib`를 계산한다. 현재:

```js
      const enteringPending = card.state === "pending" && prevProfileState !== "pending";
      prevProfileState = card.state;

      hideProfileSections();
      profilePrompt.textContent = card.prompt || "";
      profilePrompt.classList.toggle("hidden", !card.prompt);
```

를

```js
      const enteringPending = card.state === "pending" && prevProfileState !== "pending";
      const enteringBib = card.state === "bib" && prevProfileState !== "bib";
      prevProfileState = card.state;

      hideProfileSections();
      profilePrompt.textContent = card.prompt || "";
      profilePrompt.classList.toggle("hidden", !card.prompt);
      profilePrompt.classList.remove("profile-prompt-question");
```

로 바꾼다.

`if (card.state === "bib")` 분기(현재):

```js
      if (card.state === "bib") {
        if (!profileBib.value) fillBibDraft(participant);
        renderDistanceChips();
        profileBibForm.classList.remove("hidden");
        return;
      }
```

를

```js
      if (card.state === "bib") {
        if (enteringBib && !profileBib.value) fillBibDraft(participant);
        const stage =
          card.bibStage === "distance" && selectedDistance ? "bib" : card.bibStage;
        renderDistanceChips();
        profileBibForm.classList.remove("hidden");
        profilePrompt.textContent = EventHomeAction.bibStagePrompt(stage);
        profilePrompt.classList.toggle("profile-prompt-question", stage === "distance");
        profileBibNumberGroup.classList.toggle("hidden", stage !== "bib");
        if (stage === "bib" && bibStageFocusPending) profileBib.focus();
        bibStageFocusPending = false;
        return;
      }
```

로 바꾼다.

- [ ] **Step 4: 통과 확인**

Run: `node --test scripts/test/event-home-bib-stage.test.js scripts/test/event-home-action.test.js scripts/test/event-home-pick.test.js scripts/test/event-home-done-record.test.js`
Expected: 전부 PASS. (`event-home-done-record.test.js`는 `profilePrompt.classList.add("hidden")|toggle("hidden")`을 confirmed 분기에서 찾는 테스트라 영향 없어야 한다. `event-home-pick.test.js`의 `resetProfileDraft` 관련 테스트도 그대로 통과해야 한다.)

- [ ] **Step 5: 커밋**

```bash
git add event-home.html scripts/test/event-home-bib-stage.test.js
git commit -m "feat(event-home): renderProfileCard가 bibStage로 종목/배번 단계를 나눠 그림"
```

---

### Task 5: 종목 칩 클릭 시 단계 전환 + 포커스 트리거

**Files:**
- Modify: `event-home.html`
- Test: `scripts/test/event-home-bib-stage.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

테스트 파일에 추가:

```js
describe("event-home distance chip click advances to bib stage", () => {
  const html = read("event-home.html");

  it("chip click sets selectedDistance, re-renders the profile card, and arms focus only from hidden group", () => {
    const fn = extractFn(html, "renderDistanceChips");
    assert.match(fn, /selectedDistance\s*=\s*dist/);
    assert.match(fn, /profileBibNumberGroup\.classList\.contains\(["']hidden["']\)/);
    assert.match(fn, /bibStageFocusPending\s*=/);
    assert.match(fn, /renderProfileCard\(activeIdentity\)/);
    assert.doesNotMatch(fn, /renderDistanceChips\(\);\s*\}\);/, "chip click must not just re-render chips in place");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test scripts/test/event-home-bib-stage.test.js`
Expected: FAIL — 지금 칩 클릭은 `selectedDistance = dist; renderDistanceChips();`만 함.

- [ ] **Step 3: 구현**

`renderDistanceChips` 안의 클릭 핸들러(현재):

```js
        btn.addEventListener("click", function () {
          selectedDistance = dist;
          renderDistanceChips();
        });
```

를

```js
        btn.addEventListener("click", function () {
          const wasHidden = profileBibNumberGroup.classList.contains("hidden");
          selectedDistance = dist;
          bibStageFocusPending = wasHidden;
          renderProfileCard(activeIdentity);
        });
```

로 바꾼다.

- [ ] **Step 4: 통과 확인**

Run: `node --test scripts/test/event-home-bib-stage.test.js`
Expected: PASS.

Run: `node --test scripts/test/event-home-action.test.js scripts/test/event-home-pick.test.js scripts/test/event-home-manual-time-hms.test.js scripts/test/event-home-manual-pb-row.test.js scripts/test/event-home-manual-dn-row.test.js scripts/test/event-home-bib-face.test.js scripts/test/event-home-done-record.test.js scripts/test/event-home-badges.test.js scripts/test/event-home-bus-refresh.test.js`
Expected: 전부 PASS (회귀 없음 확인).

- [ ] **Step 5: 커밋**

```bash
git add event-home.html scripts/test/event-home-bib-stage.test.js
git commit -m "feat(event-home): 종목 칩 클릭이 배번 단계로 전환하고 첫 진입 시 포커스"
```

---

### Task 6: 폼 submit(키패드 확인/Enter) → `submitUpdateBib` 단일 경로

**Files:**
- Modify: `event-home.html`
- Test: `scripts/test/event-home-bib-stage.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

테스트 파일에 추가:

```js
describe("event-home bib form submit is the single keypad-confirm save path", () => {
  const html = read("event-home.html");

  it("profileBibForm submit prevents default, skips while IME composing, and calls submitUpdateBib once", () => {
    const submitIdx = html.indexOf('profileBibForm.addEventListener("submit"');
    assert.ok(submitIdx >= 0, "missing profileBibForm submit listener");
    const block = html.slice(submitIdx, submitIdx + 400);
    assert.match(block, /preventDefault\(\)/);
    assert.match(block, /bibComposing/);
    assert.match(block, /submitUpdateBib\(activeIdentity\)/);
  });

  it("does not attach a second Enter/keydown listener on profileBib for saving", () => {
    const bibListeners = html.match(/profileBib\.addEventListener\(["']keydown["']|profileBib\.addEventListener\(["']keypress["']/g);
    assert.equal(bibListeners, null, "profileBib must not have its own keydown/keypress submit listener");
  });

  it("profileBib tracks IME composing state for the submit guard", () => {
    const compIdx = html.indexOf("bibComposing");
    assert.ok(compIdx >= 0);
    assert.match(html, /profileBib\.addEventListener\(["']compositionstart["']/);
    assert.match(html, /profileBib\.addEventListener\(["']compositionend["']/);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test scripts/test/event-home-bib-stage.test.js`
Expected: FAIL — `profileBibForm`에 `submit` 리스너가 아직 없음, `bibComposing`도 없음.

- [ ] **Step 3: 구현**

상태 변수 선언부에 `bibStageFocusPending` 바로 아래 추가:

```js
    let bibStageFocusPending = false;
    let bibComposing = false;
```

`bindImeInput(profileBib, function (value) { bibDraft = value; });` 바로 다음에 추가:

```js
    bindImeInput(profileBib, function (value) {
      bibDraft = value;
    });

    profileBib.addEventListener("compositionstart", function () {
      bibComposing = true;
    });
    profileBib.addEventListener("compositionend", function () {
      bibComposing = false;
    });
```

기존 `profileBibSave.addEventListener("click", ...)` 바로 다음(1287~1289행 부근)에 추가:

```js
    profileBibSave.addEventListener("click", function () {
      submitUpdateBib(activeIdentity);
    });
    profileBibForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (bibComposing) return;
      submitUpdateBib(activeIdentity);
    });
```

- [ ] **Step 4: 통과 확인**

Run: `node --test scripts/test/event-home-bib-stage.test.js`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add event-home.html scripts/test/event-home-bib-stage.test.js
git commit -m "feat(event-home): 배번 폼 submit을 키패드 확인/Enter 저장 경로로 연결"
```

---

### Task 7: `submitUpdateBib` — 종목 없이 저장 시도하면 1단계로 되돌림

**Files:**
- Modify: `event-home.html`
- Test: `scripts/test/event-home-bib-stage.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

테스트 파일에 추가:

```js
describe("event-home submitUpdateBib falls back to the distance stage when distance is missing", () => {
  const html = read("event-home.html");

  it("re-renders the profile card when distance is missing so the UI matches reality", () => {
    const fn = extractFn(html, "submitUpdateBib");
    const guardIdx = fn.search(/if\s*\(!bib\s*\|\|\s*!distance\)/);
    assert.ok(guardIdx >= 0, "missing bib/distance guard");
    const guardBlock = fn.slice(guardIdx, guardIdx + 250);
    assert.match(guardBlock, /showToast\(/);
    assert.match(guardBlock, /renderProfileCard\(identity\)/);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test scripts/test/event-home-bib-stage.test.js`
Expected: FAIL — 지금 가드는 토스트 후 그냥 `return`.

- [ ] **Step 3: 구현**

`submitUpdateBib`의 가드(현재):

```js
      const bib = String(profileBib.value || bibDraft || "").trim();
      const distance = selectedDistance;
      if (!bib || !distance) {
        showToast("배번과 종목을 넣어 주세요.", true);
        return;
      }
```

를

```js
      const bib = String(profileBib.value || bibDraft || "").trim();
      const distance = selectedDistance;
      if (!bib || !distance) {
        showToast("배번과 종목을 넣어 주세요.", true);
        if (!distance) renderProfileCard(identity);
        return;
      }
```

로 바꾼다.

- [ ] **Step 4: 통과 확인**

Run: `node --test scripts/test/event-home-bib-stage.test.js`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add event-home.html scripts/test/event-home-bib-stage.test.js
git commit -m "feat(event-home): 종목 없이 저장 시도하면 배번 단계에서 종목 단계로 되돌림"
```

---

### Task 8: 테스트 스크립트 등록 + 전체 회귀 실행

**Files:**
- Modify: `package.json`

- [ ] **Step 1: `test:event-home` 스크립트에 신규 파일 추가**

`package.json`의 `test:event-home` 목록 끝에 `scripts/test/event-home-bib-stage.test.js`를 추가한다(현재 목록 마지막 항목은 `scripts/test/update-bib-distance.test.js`).

- [ ] **Step 2: 전체 event-home 스위트 실행**

Run: `npm run test:event-home`
Expected: 모든 테스트 PASS (기존 파일들 + `event-home-bib-stage.test.js`).

- [ ] **Step 3: 관련 룰 규칙 확인 — `update-bib` API는 손대지 않았는지 재확인**

Run: `git diff --stat main -- functions/index.js`
Expected: 출력 없음 (백엔드 무변경, 스펙의 "API 변경 없음"과 일치). 이 브랜치 위에서 직접 작업하므로 `main`(이 플랜 작업 시작 전 베이스) 대비로 비교해야 신호가 나온다. 같은 브랜치 자기 자신과 비교하면 항상 출력이 없다.

- [ ] **Step 4: 커밋**

```bash
git add package.json
git commit -m "test(event-home): event-home-bib-stage 테스트를 test:event-home 스위트에 등록"
```

- [ ] **Step 5: 전체 회귀(선택, 시간 허용 시) — pre-deploy-test**

이 태스크는 배포가 아니라 로컬 회귀 확인이다. Firestore 에뮬레이터·JDK·`functions/node_modules`가 준비되어 있으면:

Run: `bash scripts/pre-deploy-test.sh`
Expected: `✅ 전체 통과 — 배포 가능`

준비가 안 되어 있으면 이 스텝은 건너뛰고 `npm run test:event-home` 결과로 충분하다. **배포는 사용자가 명시적으로 요청할 때만 진행한다.**

---

## 완료 후 확인 체크리스트 (스펙 검증 항목 매핑)

- [ ] 종목 없으면 배번 칸·`저장`이 DOM에서 안 보인다 → Task 2/4 (`profileBibNumberGroup` hidden)
- [ ] 칩 클릭 후 배번 칸이 보이고, 그 클릭으로 포커스가 간다 → Task 5
- [ ] 종목+배번 있는 상태에서 Enter → `submitUpdateBib` 한 번 → Task 6
- [ ] 배번 있고 종목 없이 Enter → 저장 호출 없음, 토스트, 1단계로 되돌림 → Task 7
- [ ] 1단계 문구는 항상 "이번 대회에 어느 종목에 출전하나요?" → Task 1
- [ ] 1단계 프롬프트가 질문 스타일(18px 이상, 굵게) → Task 3
- [ ] `inputmode="numeric"`, `enterkeyhint="done"` → Task 2
- [ ] form submit이 페이지를 리로드하지 않음(`preventDefault`) → Task 6
- [ ] `#profileBibSave` 클릭 저장 유지 → Task 6 (기존 리스너 유지 확인)
