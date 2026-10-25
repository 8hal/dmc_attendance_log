# 춘백 S3 시즌 마감 개인 성과 페이지 및 OCR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 춘백 시즌3 참가자가 자신의 100일 출석 성과(출석 일수·출석률·주간 3점 달성 주차 수)를 확인하고, 가장 기록이 좋은 대회 1개의 최종 결과(완주 기록 / DNF / DNS)를 기록증 사진 OCR 자동 인식과 함께 등록·비교할 수 있는 개인 성과 페이지(`#view-report`)를 구현한다.

**Architecture:**
1. 백엔드: 신규 API 엔드포인트 추가 없이 기존 `computeMemberStats`(`functions/lib/chunbaek-stats.js`)에 시즌 누적 훈련일·예외일·주간 달성 집계를 추가하고, `functions/lib/chunbaek-handlers.js`의 `my-profile`, `update-profile`, `team-summary`에 `seasonResult` 파싱·검증·Storage 사진 저장·직렬화를 확장한다.
2. OCR 모듈: `chunbaek/js/ocr.js`를 UMD(Node.js 테스트 및 브라우저 `window.ChunbaekOcr` 공용)로 작성하여 마라톤 시간 추출 파서(`parseMarathonTimesFromText`)와 `Tesseract.js` 기반 이미지 전처리/OCR 어댑터(`extractRaceRecord`)를 분리한다. 추후 서버 Vision AI(2번 안)로 교체 가능하도록 인터페이스를 고정한다.
3. 프론트엔드: `chunbaek/index.html`, `chunbaek/js/app.js`, `chunbaek/js/api.js`, `chunbaek/css/chunbaek.css`에 `#view-report` 뷰, 대회 기록 업로드 & OCR 폼, 홈 시즌 마감 배너, `[나]` 탭 진입 버튼, `season-end` 프리뷰 시나리오를 구현한다.

**Tech Stack:** Node.js 22 (`node:test`), Firebase Cloud Functions (Firestore, Storage), Vanilla JS SPA, HTML5 Canvas, Tesseract.js v5 (CDN lazy load)

---

### Task 1: 출석 성과 통계(`computeMemberStats`) 확장 (TDD)

**Files:**
- Modify: `functions/lib/chunbaek-stats.js`
- Modify: `functions/lib/chunbaek-handlers.js` (`emptyStats`)
- Test: `scripts/test/chunbaek-season-report.test.js`

- [ ] **Step 1: 실패하는 단위 테스트 작성 (`scripts/test/chunbaek-season-report.test.js`)**
  - `computeMemberStats`가 `seasonTrainingDays`, `seasonDenom`, `seasonExceptionCount`, `seasonWeeksCount`, `seasonWeeksMetCount`, `seasonWeekSummaries`를 정확히 계산하는지 검증하는 테스트 작성.
- [ ] **Step 2: 테스트 실패 확인**
  - Run: `node --test scripts/test/chunbaek-season-report.test.js`
- [ ] **Step 3: `computeMemberStats` 및 `emptyStats` 구현**
  - `statsSlots` 순회 시 `seasonTrainingDays`, `seasonExceptionCount`, `seasonDenom` 집계
  - 본시즌 주차(`week >= 1`, 해당 주의 시작일이 `todayDate` 이하인 주차)별 `computeWeekStatsFull`을 계산해 `seasonWeeksCount`, `seasonWeeksMetCount`, `seasonWeekSummaries` 반환
- [ ] **Step 4: 테스트 통과 확인**
  - Run: `node --test scripts/test/chunbaek-season-report.test.js`

---

### Task 2: 대회 결과(`seasonResult`) 파싱·저장·직렬화 백엔드 확장 (TDD)

**Files:**
- Modify: `functions/lib/chunbaek-handlers.js`
- Test: `scripts/test/chunbaek-season-report.test.js`

- [ ] **Step 1: 실패하는 단위 테스트 추가 (`scripts/test/chunbaek-season-report.test.js`)**
  - `parseSeasonResult`: `finisher`(netTimeSec 필수, 7200~28800초), `dnf`/`dns`(netTimeSec null 처리), 잘못된 status/race 거부 검증
  - `handleUpdateProfile`:
    1. 기존 프로필 전체 수정 시 기존 `seasonResult`가 유지되는지 검증
    2. `seasonResult`만 단독으로 전달했을 때 기존 프로필(`goalMarathonNetTime` 등)을 유지하면서 `chunbaekS3.seasonResult`가 저장되고 `my-profile` 응답에 직렬화되어 반환되는지 검증
    3. `team-summary` 응답에 각 멤버의 `seasonResult` 요약이 포함되는지 검증
- [ ] **Step 2: 테스트 실패 확인**
  - Run: `node --test scripts/test/chunbaek-season-report.test.js`
- [ ] **Step 3: `functions/lib/chunbaek-handlers.js` 구현**
  - `parseSeasonResult(raw, fallbackRace)` 및 `serializeSeasonResult(sr)` 구현
  - `handleUpdateProfile`에서 `body.seasonResult` 단독 업데이트 또는 프로필+`seasonResult` 동시 업데이트 지원 (이미지 Base64 포함 시 Storage 업로드 지원)
  - `memberProfilePayload` 및 `handleTeamSummary`에 `seasonResult` 포함
- [ ] **Step 4: 테스트 통과 확인**
  - Run: `node --test scripts/test/chunbaek-season-report.test.js`

---

### Task 3: 기록증 OCR 모듈(`chunbaek/js/ocr.js`) 및 성능 테스트 구현 (TDD)

**Files:**
- Create: `chunbaek/js/ocr.js`
- Test: `scripts/test/chunbaek-season-report.test.js`

- [ ] **Step 1: OCR 시간 추출 파서 및 어댑터 단위 테스트 추가 (`scripts/test/chunbaek-season-report.test.js`)**
  - 스마트칩(`NET TIME 03:45:12`, `GUN TIME 03:48:01`), 마라존/오마이레이스(`기록 4시간 12분 05초`), 가민/스트라바(`3:58:44`), 구분자 변형(`04.25.48`), 범위 밖 시간(`00:45:12` 10K 구간 등 제외)에서 `bestMatch`와 `candidates`가 정확히 추출되는지 검증
  - 커스텀 OCR 엔진 주입(또는 Vision AI 어댑터 교체) 시 `extractRaceRecord`가 `elapsedMs`, `bestMatch`, `candidates`를 반환하는지 검증
- [ ] **Step 2: 테스트 실패 확인**
  - Run: `node --test scripts/test/chunbaek-season-report.test.js`
- [ ] **Step 3: `chunbaek/js/ocr.js` 구현**
  - `parseMarathonTimesFromText(text)` 구현 (NET/완주 키워드 가중치 부여, `2:00:00`~`7:59:59` 필터, 중복 제거)
  - Canvas 이미지 전처리(`preprocessImageForOcr`: 리사이즈 + 그레이스케일 대비 보정) 및 `Tesseract.js` CDN lazy loader + `extractRaceRecord(file, options)` 구현
- [ ] **Step 4: 테스트 통과 확인**
  - Run: `node --test scripts/test/chunbaek-season-report.test.js`

---

### Task 4: 개인 성과 요약 뷰(`#view-report`) 및 프론트엔드 연동 (TDD)

**Files:**
- Modify: `chunbaek/index.html`
- Modify: `chunbaek/css/chunbaek.css`
- Modify: `chunbaek/js/api.js`
- Modify: `chunbaek/js/app.js`
- Test: `scripts/test/chunbaek-season-report.test.js`

- [ ] **Step 1: 마크업 및 렌더 구조 검증 테스트 추가 (`scripts/test/chunbaek-season-report.test.js`)**
  - `chunbaek/index.html`에 `#view-report`, 홈 마감 배너(`#season-report-banner`), `[나]` 탭 리포트 이동 버튼(`#btn-open-report`), OCR 파일 입력 및 결과 폼 요소, `ocr.js` 스크립트 태그가 존재하는지 검증
- [ ] **Step 2: 테스트 실패 확인**
  - Run: `node --test scripts/test/chunbaek-season-report.test.js`
- [ ] **Step 3: 프론트엔드 구현**
  - `chunbaek/index.html`: `#view-report` 섹션, 홈 마감 배너, `[나]` 탭 리포트 버튼, 데모 네비게이션 옵션(`report`, `season-end` 시나리오) 추가
  - `chunbaek/js/api.js`: `MOCK.profile` 및 `PREVIEW_SCENARIOS["season-end"]` 추가, `mockPost("update-profile")`에서 `seasonResult` 업데이트 지원
  - `chunbaek/js/app.js`:
    - `VIEWS.report = "view-report"` 등록 및 `#/report` 라우팅 지원
    -个人 성과 카드 렌더링(배지, 목표 vs 최종 기록 비교, PB 단축 시간, 출석 일수·출석률·주간 달성 주차 수·주차별 미니 보드)
    - 대회 결과 입력/수정 폼(완주/DNF/DNS 전환, 기록증 사진 첨부 시 자동 OCR 실행 + 소요 시간 ms 표시 + 후보 시간 칩 선택 + Canvas 샘플 기록증으로 OCR 성능 즉시 테스트 버튼 제공)
  - `chunbaek/css/chunbaek.css`: 개인 성과 페이지 카드, 배지, OCR 상태 바, 시간 후보 칩, 주간 달성 그리드 스타일 추가
- [ ] **Step 4: 테스트 통과 확인**
  - Run: `node --test scripts/test/chunbaek-season-report.test.js`

---

### Task 5: 전체 테스트 스위트 검증, 코드 리뷰 및 PR 업데이트

**Files:**
- Modify: `/opt/cursor/artifacts/code-tour-author-handoff.md`

- [ ] **Step 1: 전체 단위 테스트 실행**
  - Run: `node --test scripts/test/chunbaek-*.test.js`
  - Run: `npm run test:members-sync`
- [ ] **Step 2: 코드 리뷰 서브에이전트 실행 및 이슈 점검**
- [ ] **Step 3: 변경사항 커밋, 푸시 및 PR 업데이트**
