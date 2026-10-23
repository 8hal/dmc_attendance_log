# 춘백 [팀] 시즌 결과 명단 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `[팀]` 탭에서 주간 점과 출석 요약을 빼고, 시즌 결과 명단(등록/완주 요약 + 아바타 + 기록 한 줄)으로 바꾼다.

**Architecture:** 순수 함수는 `chunbaek/js/team-season.js`에 둔다 (`ocr.js`와 같이 Node/브라우저 양쪽). `app.js`의 `paintTeam` / `sortTeamMembersForDisplay` / `openTeamProfileModal` / `bindTeamListEvents`만 이 모듈을 쓴다. 신규 HTTP action 없음. `GET team-summary`의 `members[].seasonResult`만 읽는다.

**Tech Stack:** 정적 HTML/CSS/JS, `node:test`, 기존 `team-summary` API.

**Spec:** `docs/superpowers/specs/2026-10-23-chunbaek-team-season-board-design.md`

---

## File map

- Create: `chunbaek/js/team-season.js` — `teamRowSecondLine`, `teamProfileResultLine`, `teamResultCounts`, `teamNicknameInitial`, `sortTeamMembersForDisplay`
- Create: `scripts/test/chunbaek-team-season-board.test.js` — 문장·집계·정렬·마크업 계약
- Modify: `chunbaek/index.html` — `시즌 최종 결과` 캡션, `js/team-season.js` 로드
- Modify: `chunbaek/js/app.js` — `paintTeam`, 모달, 클릭 위임
- Modify: `chunbaek/css/chunbaek.css` — 48px 아바타 행, 점 칸 제거
- Modify: `chunbaek/js/api.js` — MOCK에 DNS 1명, 미등록 1명

---

### Task 1: 순수 함수 테스트 (RED)

**Files:**
- Create: `scripts/test/chunbaek-team-season-board.test.js`
- Create: `chunbaek/js/team-season.js` (구현은 Task 2)

- [x] **Step 1: Write the failing test**

`require("../../chunbaek/js/team-season.js")`로 아래를 잠근다.

1. `teamRowSecondLine` — spec §3 표 (미등록 / finisher / 목표+PB / DNF / DNS)
2. `teamProfileResultLine` — 미등록은 `아직 없음`, 있으면 리스트와 같음
3. `teamResultCounts` — `{ total, registered, finishers }`
4. `sortTeamMembersForDisplay(members, meId)` — 나 → 완주 빠른 순 → DNF → DNS → 미등록 가나다
5. `teamNicknameInitial` — 첫 글자

- [x] **Step 2: Run test to verify it fails**

```bash
node --test scripts/test/chunbaek-team-season-board.test.js
```

Expected: FAIL (모듈 없음 또는 함수 없음)

- [x] **Step 3: Implement `chunbaek/js/team-season.js`**
- [x] **Step 4: Run tests — PASS**
- [x] **Step 5: Commit** `test+feat(chunbaek): add team season result helpers`

---

### Task 2: 팀 탭 화면 (RED then GREEN)

**Files:**
- Modify: `chunbaek/index.html`, `chunbaek/js/app.js`, `chunbaek/css/chunbaek.css`, `chunbaek/js/api.js`
- Test: same test file — 소스/마크업 assert

- [x] **Step 1: Failing markup tests**

- `#view-team`에 `시즌 최종 결과`
- `app.js`에 `결과 등록`, `완주`, `team-row-photo`, `시즌 최종 결과`, `ChunbaekTeamSeason`
- `이번 주 3점` / 리스트의 `week-progress` / 모달 `이번 주` 없음
- `index.html`에 `js/team-season.js`
- MOCK에 `status: "dns"` 멤버와 `seasonResult: null` 멤버

- [x] **Step 2: Run — FAIL**
- [x] **Step 3: Wire UI**

`paintTeam`: 상단 등록/완주, 행은 `48px` 아바타 + `team-row-main`. 점 없음.  
`bindTeamListEvents`: `data-photo-url` 있으면 라이트박스, 아니면 모달.  
`openTeamProfileModal`: 시즌 최종 결과 맨 위, `이번 주` 삭제.  
CSS: `.team-row` = `48px 1fr`.

- [x] **Step 4: Run both chunbaek test files — PASS**
- [x] **Step 5: Commit** `feat(chunbaek): turn Team tab into a season result roster`

---

### Task 3: 검증

```bash
node --test scripts/test/chunbaek-season-report.test.js scripts/test/chunbaek-team-season-board.test.js
```
