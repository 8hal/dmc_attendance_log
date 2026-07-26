# 안드로이드 뒤로 가기 — 하단 팝업 닫기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 안드로이드 뒤로 가기 버튼(또는 브라우저 뒤로 가기)으로 춘백방 하단 팝업 4개(훈련 상세, 팀원 프로필, 예외 요청, 라이트박스)가 순서대로 닫히도록 한다.

**Architecture:** History API의 `pushState` / `popstate`를 이용한 중앙 모달 스택. 팝업이 열릴 때 히스토리 항목을 추가하고, `popstate` 이벤트에서 스택 최상단 닫기 함수를 실행한다. X 버튼 등 직접 닫기 시에는 스택에서 함수를 제거하고 히스토리 항목도 정리한다.

**Tech Stack:** Vanilla JS, History API (pushState / popstate), 수정 파일 1개 (`chunbaek/js/app.js`)

---

## Task 1: 모달 스택 유틸 추가

**Files:**
- Modify: `chunbaek/js/app.js` — IIFE 내부 상단에 유틸 삽입

아래 코드를 `app.js` 내부 스코프(IIFE 안)에서 기존 상태 변수 선언부 바로 아래에 추가한다.
삽입 위치: `const state = { ... }` 블록 직후, 첫 번째 함수 선언 이전.

- [ ] **Step 1: 삽입 위치 확인**

  `app.js`에서 `const state =` 또는 `let state =` 선언부를 Grep으로 찾아 줄 번호를 확인한다.

- [ ] **Step 2: 유틸 코드 삽입**

  확인한 위치 바로 아래에 다음 블록을 추가한다:

  ```javascript
  // ── 모달 스택 (안드로이드 뒤로 가기 지원) ──
  const _modalStack = [];
  let _skipNextPopstate = false;

  function _modalPush(closeFn) {
    history.pushState({ modal: true }, "");
    _modalStack.push(closeFn);
  }

  function _modalRemoveFromStack(closeFn) {
    const idx = _modalStack.lastIndexOf(closeFn);
    if (idx >= 0) {
      _modalStack.splice(idx, 1);
      _skipNextPopstate = true;
      history.back();
    }
  }

  window.addEventListener("popstate", () => {
    if (_skipNextPopstate) {
      _skipNextPopstate = false;
      return;
    }
    if (_modalStack.length > 0) {
      _modalStack.pop()();
    }
  });
  ```

- [ ] **Step 3: 커밋**

  ```bash
  git add chunbaek/js/app.js
  git commit -m "feat(chunbaek): 모달 스택 유틸 추가 (History API 뒤로가기 기반)"
  ```

---

## Task 2: 훈련 상세 팝업 연동

**Files:**
- Modify: `chunbaek/js/app.js:openTrainingModal`, `closeTrainingModal`

- [ ] **Step 1: `openTrainingModal` 마지막 줄(`hidden = false`) 바로 다음에 한 줄 추가**

  기존:
  ```javascript
  document.getElementById("timeline-modal").hidden = false;
  ```

  변경 후:
  ```javascript
  document.getElementById("timeline-modal").hidden = false;
  _modalPush(closeTrainingModal);
  ```

- [ ] **Step 2: `closeTrainingModal` 첫 줄에 한 줄 추가**

  기존:
  ```javascript
  function closeTrainingModal() {
    clearTimelinePhotoPicker();
  ```

  변경 후:
  ```javascript
  function closeTrainingModal() {
    _modalRemoveFromStack(closeTrainingModal);
    clearTimelinePhotoPicker();
  ```

- [ ] **Step 3: 커밋**

  ```bash
  git add chunbaek/js/app.js
  git commit -m "feat(chunbaek): 훈련 상세 팝업 뒤로가기 버튼 지원"
  ```

---

## Task 3: 팀원 프로필 팝업 연동

**Files:**
- Modify: `chunbaek/js/app.js:openTeamProfileModal`, `closeTeamProfileModal`

- [ ] **Step 1: `openTeamProfileModal` 내에서 `modal.hidden = false` 줄 확인**

  Grep으로 `openTeamProfileModal` 함수 내 `hidden = false` 줄을 찾는다.

- [ ] **Step 2: `hidden = false` 줄 바로 다음에 `_modalPush(closeTeamProfileModal)` 추가**

  예시:
  ```javascript
  modal.hidden = false;
  _modalPush(closeTeamProfileModal);
  ```

- [ ] **Step 3: `closeTeamProfileModal` 첫 줄에 `_modalRemoveFromStack(closeTeamProfileModal)` 추가**

  기존:
  ```javascript
  function closeTeamProfileModal() {
    const modal = document.getElementById("team-profile-modal");
  ```

  변경 후:
  ```javascript
  function closeTeamProfileModal() {
    _modalRemoveFromStack(closeTeamProfileModal);
    const modal = document.getElementById("team-profile-modal");
  ```

- [ ] **Step 4: 커밋**

  ```bash
  git add chunbaek/js/app.js
  git commit -m "feat(chunbaek): 팀원 프로필 팝업 뒤로가기 버튼 지원"
  ```

---

## Task 4: 출석 예외 요청 팝업 연동

**Files:**
- Modify: `chunbaek/js/app.js:openExceptionRequestModal`, `closeExceptionRequestModal`

- [ ] **Step 1: `openExceptionRequestModal` 내에서 `modal.hidden = false` 줄 확인**

- [ ] **Step 2: `modal.hidden = false` 줄 바로 다음에 `_modalPush(closeExceptionRequestModal)` 추가**

  ```javascript
  modal.hidden = false;
  _modalPush(closeExceptionRequestModal);
  ```

- [ ] **Step 3: `closeExceptionRequestModal` 첫 줄에 `_modalRemoveFromStack(closeExceptionRequestModal)` 추가**

  기존:
  ```javascript
  function closeExceptionRequestModal() {
    state.exceptionPreviewLoadId += 1;
  ```

  변경 후:
  ```javascript
  function closeExceptionRequestModal() {
    _modalRemoveFromStack(closeExceptionRequestModal);
    state.exceptionPreviewLoadId += 1;
  ```

- [ ] **Step 4: 커밋**

  ```bash
  git add chunbaek/js/app.js
  git commit -m "feat(chunbaek): 예외 요청 팝업 뒤로가기 버튼 지원"
  ```

---

## Task 5: 사진 라이트박스 연동

**Files:**
- Modify: `chunbaek/js/app.js:openLightbox`, `closeLightbox`

- [ ] **Step 1: `openLightbox` 내에서 `lb.hidden = false` 줄 확인**

- [ ] **Step 2: `lb.hidden = false` 줄 바로 다음에 `_modalPush(closeLightbox)` 추가**

  ```javascript
  lb.hidden = false;
  _modalPush(closeLightbox);
  ```

- [ ] **Step 3: `closeLightbox` 첫 줄에 `_modalRemoveFromStack(closeLightbox)` 추가**

  기존:
  ```javascript
  function closeLightbox() {
    document.getElementById("photo-lightbox").hidden = true;
  ```

  변경 후:
  ```javascript
  function closeLightbox() {
    _modalRemoveFromStack(closeLightbox);
    document.getElementById("photo-lightbox").hidden = true;
  ```

- [ ] **Step 4: 커밋**

  ```bash
  git add chunbaek/js/app.js
  git commit -m "feat(chunbaek): 사진 라이트박스 뒤로가기 버튼 지원"
  ```

---

## Task 6: 수동 검증

에뮬레이터에서 직접 확인한다.

- [ ] **Step 1: 에뮬레이터 시작**

  ```bash
  firebase emulators:start --only functions,hosting,firestore,storage --project dmc-attendance
  ```

- [ ] **Step 2: 시드 데이터 주입 (새 터미널)**

  ```bash
  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-emulator-members-2026-03-31.js
  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-emulator-chunbaek.js
  ```

- [ ] **Step 3: 각 팝업 시나리오 수동 테스트**

  `http://localhost:5000` 접속 후 아래 시나리오를 순서대로 확인:

  | 번호 | 시나리오 | 기대 결과 |
  |---|---|---|
  | 1 | 훈련 상세 열기 → 브라우저 뒤로(Alt+←) | 훈련 상세 닫힘, 앱 유지 |
  | 2 | 훈련 상세 열기 → X 버튼 → 뒤로 가기 | X로 즉시 닫힘, 뒤로 가기는 앱 이동 |
  | 3 | 팀원 프로필 열기 → 뒤로 가기 | 프로필 닫힘 |
  | 4 | 팀원 프로필 → 사진 라이트박스 → 뒤로 가기 | 라이트박스만 닫힘, 프로필 유지 |
  | 5 | 시나리오 4 후 뒤로 가기 한 번 더 | 프로필 닫힘 |
  | 6 | 예외 요청 팝업 → 뒤로 가기 | 예외 요청 팝업 닫힘 |
  | 7 | 훈련 상세 → 출석하기 버튼 클릭 (출석 완료) | `closeTrainingModal()` 자동 호출 경로도 히스토리 정상 정리, 뒤로 가기 없어도 됨 |

- [ ] **Step 4: pre-deploy-test 전체 통과 확인**

  별도 터미널에서:
  ```bash
  bash scripts/pre-deploy-test.sh
  ```
  Expected: `✅ 전체 통과 — 배포 가능`

- [ ] **Step 5: 이상 없으면 최종 커밋**

  ```bash
  git add chunbaek/js/app.js
  git commit -m "chore(chunbaek): 뒤로가기 팝업 닫기 수동 검증 완료"
  ```

  (수동 검증 단계에서 추가 수정이 없었다면 이 커밋은 생략)
