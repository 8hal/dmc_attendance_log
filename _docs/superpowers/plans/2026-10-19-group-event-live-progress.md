# 단체 대회 풀코스 실시간 진행 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 풀코스 여러 명의 추정 위치를 조 출발·목표 완주(칩 구간이 있으면 그 이후)로 계산해, 닉 없이 코스·순위·상세로 보여 준다.

**Architecture:** 순수 함수는 `functions/lib/cheer-progress.js`와 `assets/cheer-course.js`. HTTP는 기존 `group-events` subAction만. 화면은 `event-cheer.html`(보기), `event-bib.html`(쓰기), `my-bib.html` 리다이렉트, 총무 배번 패널의 조 편집.

**Tech Stack:** Node 테스트(`node --test`), Firebase Functions, 정적 HTML.

**Spec:** `_docs/superpowers/specs/2026-10-12-group-event-live-progress-design.md`

---

### Task 1: 위치 계산 라이브러리

**Files:**
- Create: `functions/lib/cheer-progress.js`
- Test: `scripts/test/cheer-progress.test.js`

- [x] 출발 전·목표만·칩 이후·완주 클램프·split 라벨·보드 필터(실명 없음)·풀코스 `update-bib` 검증·조 `startAt` 날짜 검사를 실패하는 테스트로 쓴 뒤 구현한다.

### Task 2: 지그재그 좌표

**Files:**
- Create: `assets/cheer-course.js`
- Test: `scripts/test/cheer-course.test.js`

- [x] 0/5/30/38/42.195 줄·방향, 0.4 km 묶음을 테스트한 뒤 구현한다.

### Task 3: API

**Files:**
- Modify: `functions/index.js` (`update-bib`, `waves`, `cheer-board`, `cheer-runner`)
- Modify: `functions/lib/scraper.js` (`splits`를 잡 결과에 유지)

- [x] 핸들러는 라이브러리만 호출한다. `cheer-board`는 `eventId`만. 실명 키를 응답에 넣지 않는다.

### Task 4: 화면

**Files:**
- Create: `event-cheer.html`, `event-bib.html`
- Modify: `my-bib.html` (쿼리 유지 리다이렉트), `event-home.html`, `event-roster.html`, `assets/event-member-tabs.js`, `assets/event-home-action.js`, `event-admin.html`
- Modify: 깨지는 홈·배번 단위 테스트

- [x] 홈 배번 저장은 `event-bib.html`로만 보낸다. `?tab=cheer`는 응원 페이지로 바꾼다. 응원 탭은 30초 폴링, 백그라운드에서는 멈춘다.

### Task 5: 문서

**Files:**
- Modify: `_docs/knowledge/data-dictionary.md`
- Create: `_docs/justification/2026-10-19-cheer-progress-justification.md`

- [x] `waves`, `waveId`, `goalFinishSec`와 subAction 필요 이유를 적는다.
