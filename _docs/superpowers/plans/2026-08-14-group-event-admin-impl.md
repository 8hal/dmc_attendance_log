# 단체 대회 운영 홈 · 참가자 컨펌 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 철원 베타용 총무 한 페이지(`event-admin`)와 배번 스크랩 → 참가자 컨펌 → `race_results` 흐름을 만든다.

**Architecture:** 기존 `bus-boarding` · `group-events` API를 UI로 묶고, 스크랩은 **배번 있는 participants만** 대상으로 바꾼다. `race_results` 쓰기는 총무 bulk-confirm이 아니라 **참가자 self-confirm**. 버스 Phase 1이 main에 없으면 선행 머지/이식한다.

**Tech Stack:** Firebase Hosting(static HTML), Cloud Functions (`functions/index.js`), Firestore, `node --test` (`scripts/test/`)

**Spec:** `_docs/superpowers/specs/2026-08-13-group-event-admin-design.md`

**목업(이 브랜치):** `event-admin-mockup.html` (총무 + 참가자 컨펌 화면)

---

## 계획에서 고정한 열린 결정 (§9)

| # | 결정 |
|---|------|
| 1 | 참가자 컨펌 CTA: **홈 배너 우선** (명단·결과 ‘나’ 행은 가능하면 동일 상태 표시) |
| 2 | API: `group-events` **subAction** `self-confirm` + 대기 조회 `my-pending-result` (정당화 문서 후 승인) |
| 3 | Job: `scrape_jobs.results[]`에 `bib` 필수, 매칭 키=배번. 컨펌 여부는 `race_results` 존재로 판단 |
| 4 | 대기 기록 읽기: `GET group-events&subAction=my-pending-result&eventId=&nickname=` (본인 bib로 job 결과 조회) |

---

## File structure

| File | Responsibility |
|------|----------------|
| `event-admin-mockup.html` | 정적 목업 (총무 섹션 + 참가자 컨펌) — 구현 전 합의용 |
| `event-admin.html` | 총무 운영 홈 (실구현) |
| `event-home.html` / 배너 영역 | 참가자 「내 기록 컨펌」 CTA (member-home 브랜치와 통합) |
| `functions/index.js` | scrape bib 필터, `my-pending-result`, `self-confirm` |
| `functions/lib/group-scrape-bib.js` (신규) | 배번 대상 선정·결과 매칭 순수 함수 (TDD) |
| `functions/lib/self-confirm.js` (신규) | self-confirm 행 조립·덮어쓰기 키 (TDD) |
| `functions/lib/scraper.js` | `searchMember`/`scrapeEvent`에 **bib-first** 조회 (철원 베타: smartchip 필수, 타 소스는 bib 파라미터 있으면 사용) |
| `scripts/test/group-scrape-bib.test.js` | 단위 테스트 |
| `scripts/test/self-confirm.test.js` | 단위 테스트 |
| `_docs/justification/2026-08-14-self-confirm-bib-scrape-justification.md` | 신규 API 정당화 |
| `scripts/seed-emulator-event-admin.js` | 에뮬 시드 |
| `scripts/qa-event-admin.sh` | 수동 QA 체크리스트 실행 보조 |

**선행 의존 (다른 브랜치):**
- `boarding.html`, `boarding-admin.html`, `functions/lib/bus-boarding.js` → `cursor/group-event-day-boarding-design-4524`
- `event-home.html` 등 → `cursor/group-event-member-home-4524`

---

### Task 0: 선행 브랜치 가용성

**Files:** (git / merge only)

- [ ] **Step 1:** `main`에 `bus-boarding` API·페이지가 있는지 확인

```bash
git show origin/main:functions/lib/bus-boarding.js 2>/dev/null | head -1 || echo MISSING
git show origin/main:boarding-admin.html 2>/dev/null | head -1 || echo MISSING
```

Expected: 없으면 `MISSING`

- [ ] **Step 2:** 없으면 boarding Phase 1을 이 작업 브랜치에 머지하거나 cherry-pick (별도 PR 가능). **버스 없이 event-admin 버스 섹션은 스텁만** 두지 말 것 — 스펙상 필수.

- [ ] **Step 3:** member-home(`event-home.html`)도 없으면 컨펌 CTA는 `event-home` 이식 또는 `my-bib.html` 인접 최소 페이지로 계획 Task 6에서 처리. Commit message에 선택 기록.

- [ ] **Step 4: Commit** (머지 커밋만 해당 시)

```bash
git commit -m "chore: bring bus-boarding (Phase 1) for event-admin"
```

---

### Task 1: 목업 HTML (합의용)

**Files:**
- Create: `event-admin-mockup.html` *(브랜치에 초안 포함 — 리뷰 후 수정)*

- [ ] **Step 1:** 총무 화면: 로그인 후 ①준비 ②버스 ③배번 ④스크랩 섹션 + 통계 요약 — **초안 완료**
- [ ] **Step 2:** 참가자 화면(폰 프레임): 홈 배너 「내 기록 확인 · 컨펌」 / 컨펌 후 상태 — **초안 완료**
- [ ] **Step 3:** TOC로 화면 점프 가능하게 — **초안 완료**
- [ ] **Step 4:** 정적 서버로 확인 · 피드백 반영

```bash
python3 -m http.server 5000 --bind 0.0.0.0
# open /event-admin-mockup.html
```

- [ ] **Step 5: Commit** (초안이 이미 커밋되어 있으면 피드백 수정분만)
---

### Task 2: 신규 API 정당화 + 승인 게이트

**Files:**
- Create: `_docs/justification/2026-08-14-self-confirm-bib-scrape-justification.md`

- [ ] **Step 1:** 기존 API 전역 검색 결과 문서화 (`scrape`, `bulk-confirm`, `confirm-one`, `update-bib`, `confirm`)

```bash
rg -n "subAction === \"scrape\"|bulk-confirm|confirm-one|update-bib|self-confirm" functions/index.js
```

- [ ] **Step 2:** 왜 bulk-confirm/confirm-one으로 대체 불가한지 (참가자 UX, 배번 키, 갭 제거) 작성
- [ ] **Step 3:** 제안 subAction: `scrape`(동작 변경: bib 필터), `my-pending-result`, `self-confirm`
- [ ] **Step 4:** 사용자 승인 대기 (구현 Task 3+ 금지 until 승인)
- [ ] **Step 5: Commit** 정당화 문서

```bash
git add _docs/justification/2026-08-14-self-confirm-bib-scrape-justification.md
git commit -m "docs: self-confirm·bib scrape API 정당화"
```

---

### Task 3: 배번 스크랩 대상 선정 (TDD · 순수 함수)

**Files:**
- Create: `functions/lib/group-scrape-bib.js`
- Create: `scripts/test/group-scrape-bib.test.js`
- Modify: `package.json` (test script 추가 권장)

- [ ] **Step 1: Write failing tests**

```js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { pickBibScrapeTargets, matchResultByBib } = require("../../functions/lib/group-scrape-bib.js");

describe("pickBibScrapeTargets", () => {
  it("배번 있는 participant만 반환", () => {
    const out = pickBibScrapeTargets([
      { nickname: "A", realName: "김A", bib: "4821", distance: "half" },
      { nickname: "B", realName: "김B", bib: "", distance: "half" },
      { nickname: "C", realName: "김C", distance: "full" },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].bib, "4821");
  });
});

describe("matchResultByBib", () => {
  it("bib 문자열로 매칭", () => {
    const r = matchResultByBib([{ bib: "4821", netTime: "1:42:00" }], "4821");
    assert.equal(r.netTime, "1:42:00");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
node --test scripts/test/group-scrape-bib.test.js
```

- [ ] **Step 3: Implement** `functions/lib/group-scrape-bib.js` (trim bib, 빈 문자열 제외)

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add functions/lib/group-scrape-bib.js scripts/test/group-scrape-bib.test.js package.json
git commit -m "feat: 배번 스크랩 대상 선정 헬퍼"
```

---

### Task 4: `triggerGroupScrape` / `scrape` / scraper bib-first

**Files:**
- Modify: `functions/index.js` (`triggerGroupScrape`, `subAction === "scrape"`)
- Modify: `functions/lib/scraper.js` (`searchMember`, `scrapeEvent`)
- Test: Task 3 단위 + Task 8 QA

**철원 베타 계약 (smartchip 우선):**
- `scrapeEvent` members 항목: `{ realName, nickname, gender, distance, bib }`
- 조회 키: **`m.bib`가 있으면 bib로 `searchMember`/`nameorbibno`** (smartchip은 이미 bib 재검색 경로 존재 — `nameorbibno`에 bib 전달). 이름-only fallback **금지**
- job `results[]`에 요청한 `bib`를 항상 보존 (매칭·self-confirm용)
- 타 소스(ohmyrace 등): 기존 bib 파라미터가 있으면 사용, 없으면 해당 소스는 베타 비지원으로 400/스킵(계획 주석)

- [ ] **Step 1:** `scrape` 핸들러에서 `pickBibScrapeTargets(event.participants)` 사용. 대상 0명이면 400 `"배번 등록 참가자 없음"`
- [ ] **Step 2:** `scrapeEvent` 루프를 `m.bib || m.realName`이 아니라 **bib 필수**로 변경 (`!m.bib`면 해당 멤버 skip — targets 단계에서 이미 걸러짐)
- [ ] **Step 3:** smartchip `searchMember`/`return_data` 호출에 bib 문자열 전달; results에 `bib: m.bib` 기록
- [ ] **Step 4:** `triggerGroupScrape`의 “members 실명 필수” 검증을 bib 경로에서 완화 (participant.realName은 race_results용으로 유지). 주석 1줄
- [ ] **Step 5: Commit**

```bash
git add functions/index.js functions/lib/scraper.js
git commit -m "feat: group scrape는 배번 조회·대상만"
```

---

### Task 5: self-confirm · my-pending-result (TDD)

**Files:**
- Create: `functions/lib/self-confirm.js`
- Create: `scripts/test/self-confirm.test.js`
- Modify: `functions/index.js`

**Pending 응답 스키마 (고정):**

```js
// GET my-pending-result?eventId=&nickname=
// 1) 이미 확정:
{ ok: true, state: "confirmed", result: { /* race_results fields */ } }
// 2) 스크랩 대기:
{ ok: true, state: "pending", result: {
  bib, netTime, gunTime, distance, overallRank, gender, memberRealName, memberNickname
} }
// 3) 배번 없음 / job 없음 / bib 결과 없음:
{ ok: true, state: "none", result: null }
```

**race_results 키 (confirm-one과 동일):**
- docId = `${safeName}_${safeDist}_${safeDate}` where safeName←realName, safeDist←normalizeRaceDistance(distance)
- self-confirm 재호출 시 **그 docId만** delete/set (event 전체 bulk delete 금지)
- row 필수: `canonicalEventId`, `memberRealName`, `memberNickname`, `distance`, `netTime`, `bib`, `status: "confirmed"`, `confirmSource: "participant"`, `confirmedAt`, `jobId`, `eventName`, `eventDate`, `source`, `sourceId`

- [ ] **Step 1: Failing tests**

```js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildSelfConfirmDocId,
  buildSelfConfirmRow,
  assertBibOwnsPending,
} = require("../../functions/lib/self-confirm.js");

describe("self-confirm", () => {
  it("docId는 realName_distance_date", () => {
    const id = buildSelfConfirmDocId({
      realName: "김테스트",
      distance: "half",
      eventDate: "2026-04-12",
    });
    assert.match(id, /김테스트/);
    assert.match(id, /2026-04-12/);
  });

  it("bib 불일치면 throw", () => {
    assert.throws(() => assertBibOwnsPending(
      { bib: "4821" },
      { bib: "9999" },
    ));
  });

  it("row status confirmed + confirmSource participant", () => {
    const row = buildSelfConfirmRow({
      event: { eventName: "철원", eventDate: "2026-04-12", groupSource: { source: "smartchip", sourceId: "x" }, groupScrapeJobId: "job1" },
      participant: { realName: "김테스트", nickname: "게살볶음밥", distance: "half", bib: "4821" },
      pending: { bib: "4821", netTime: "1:42:18", gunTime: "", overallRank: 10, gender: "M" },
    });
    assert.equal(row.status, "confirmed");
    assert.equal(row.confirmSource, "participant");
    assert.equal(row.bib, "4821");
    assert.equal(row.netTime, "1:42:18");
  });
});
```

- [ ] **Step 2: Implement lib → PASS**

- [ ] **Step 3:** `GET my-pending-result` — 위 스키마 `state` 삼항 구현

- [ ] **Step 4:** `POST self-confirm` — `{ eventId, nickname }` (update-bib과 동일: 닉이 participants에 있고 bib 있음). pending bib 행 → 해당 docId만 upsert

- [ ] **Step 5: Commit**

```bash
git add functions/lib/self-confirm.js scripts/test/self-confirm.test.js functions/index.js
git commit -m "feat: 참가자 self-confirm·pending 조회 API"
```

---

### Task 6: `event-admin.html` FE

**Files:**
- Create: `event-admin.html`
- Reference UX: `event-admin-mockup.html`, auth pattern: `ops.html` / `group.html`

- [ ] **Step 1:** `verify-admin` 후 세션 유지 (`sessionStorage`). **스크랩·source는 `ops.html`과 같이 `ownerPw`(DMC_OWNER_PW)** 필요 — 로그인 시 owner 역할 확인, 아니면 스크랩 버튼 비활성+안내
- [ ] **Step 1b:** ① 준비에 `groupSource` 설정 UI 포함 (미설정 시 scrape 400 방지) — `group-events` `source`
- [ ] **Step 2:** ① 준비 — bus `settings` on/off, CSV import, QR/링크 (회원 `event-home` / `boarding`)
- [ ] **Step 3:** ② 버스 — 스펙 §4.2 필수: 가는/오는 탭 · 탑승/미탑승 카운트 · 대리 체크·취소 · 지인 추가·제외 · 비고(총무만). `boarding-admin`에서 이식
- [ ] **Step 4:** ③ 배번 — detail participants 카운트·미입력 목록
- [ ] **Step 5:** ④ 스크랩 — 버튼, status poll (`groupScrapeStatus`), pending/confirmed 요약 (detail + results count)
- [ ] **Step 6: Commit**
```bash
git add event-admin.html
git commit -m "feat: event-admin 총무 운영 홈"
```

---

### Task 7: 회원 앱 컨펌 CTA

**Files:**
- Modify: `event-home.html` (또는 Task 0에서 정한 진입점)
- Optional: 명단·결과 ‘나’ 행 동일 상태

- [ ] **Step 1:** 프로필 닉으로 `my-pending-result` 호출
- [ ] **Step 2:** pending 있으면 배너 CTA 「내 기록 확인 · 컨펌」 → 기록 표시 → 확인 시 `self-confirm`
- [ ] **Step 3:** confirmed면 배너에 기록·완료 표시 (갭 UI 없음)
- [ ] **Step 4: Commit**

```bash
git add event-home.html
git commit -m "feat: 회원 홈 참가자 기록 컨펌"
```

---

### Task 8: 시드 · QA · 문서

**Files:**
- Create: `scripts/seed-emulator-event-admin.js`
- Create: `scripts/qa-event-admin.sh`
- Modify: `_docs/knowledge/data-dictionary.md` (self-confirm / bib scrape 한 절)
- Modify: `_docs/superpowers/specs/2026-08-13-group-event-admin-design.md` 상태를 「계획 완료」

- [ ] **Step 1:** 시드 — 배번 있는/없는 participant, bus roster, groupSource
- [ ] **Step 2:** QA 스크립트 — scrape 대상 수, 무배번 제외, self-confirm 후 race_results 1건
- [ ] **Step 3:** `bash scripts/pre-deploy-test.sh` 회귀 (실패 시 관련만 수정)
- [ ] **Step 4: Commit**

```bash
git add scripts/seed-emulator-event-admin.js scripts/qa-event-admin.sh _docs/knowledge/data-dictionary.md _docs/superpowers/specs/2026-08-13-group-event-admin-design.md
git commit -m "test: event-admin 시드·QA·사전 문서"
```

---

## 수동 테스트 (철원 베타 시나리오)

1. event-admin 로그인 → 탑승 ON → CSV → 대리 체크  
2. 회원: 배번 입력  
3. 총무: 스크랩 (배번 N명만)  
4. 회원: 홈에서 기록 컨펌 → races/대회기록에 표시  
5. 배번 없는 닉은 스크랩·컨펌 CTA 없음  

---

## Out of scope (계획에 넣지 않음)

시간 자동 개폐, 갭 UI, 총무 bulk-confirm 주경로, 중식, 구 페이지 강제 폐기
