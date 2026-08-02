# 단체 대회 버스 탑승 체크 Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단체 대회(`race_events`)에 버스 탑승 명단·가는/오는 체크·총무 현황을 붙여, 새벽 현장에서 QR/링크로 셀프 탑승하고 총무가 미탑승·지인을 휴대폰으로 처리할 수 있게 한다.

**Architecture:** 순수 로직은 `functions/lib/bus-boarding.js`에 두고 TDD로 고정한다. HTTP는 `exports.race`의 `action=bus-boarding` (+ `subAction`)으로 추가하며, 총무 변경은 `verifyAdminPassword`로 서버 검증한다. roster 갱신은 Firestore 트랜잭션. FE는 `boarding.html`(공개) / `boarding-admin.html`(admin) 전용 페이지 + `group-detail.html`에 허브 카드 골격만 추가한다. 배번·결과 보드는 버스 enable과 무관하게 허브에 링크한다.

**Tech Stack:** Cloud Functions (`functions/index.js`, `functions/lib/bus-boarding.js`), Firestore `race_events`, Hosting static HTML, Node `node:test`, emulator QA script

**Spec:** `_docs/superpowers/specs/2026-08-02-group-event-day-ux-design.md` (Phase 1)

**범위 밖 (이 계획):** `group-detail` 전면 FE 리팩터(Phase 2), 공개 결과 보드(Phase 3), 중식, 네이버 폼 API, `onSnapshot`

**열린 결정 고정 (이 계획):**
1. API: `GET/POST /api/race?action=bus-boarding&subAction=…` (별도 action — `group-events`에 섞지 않음)
2. CSV 헤더 별칭: `닉네임|nickname`, `이름|실명|name|realName`, `버스 탑승 여부|탑승|rideType`, `비고|note`
3. 닉네임 매칭: `update-bib`와 동일 — **trim 후 exact `===`** (대소문자/공백 정규화 추가 금지)
4. rideType 설문 문구 매핑:
   - `왕복` → `roundtrip`
   - `동탄->철원(편도)` / `동탄→철원` 포함 편도 → `outbound_only` (대회지 이름은 유연 매칭: `->`/`→` 앞이 출발지로 보이면 outbound)
   - `철원->동탄(편도)` / `→동탄` 편도 → `return_only`
   - `개별 이동` → skip (excluded)
   - 매핑 실패 행 → import 에러 리포트

---

## 파일 맵

| 파일 | 역할 |
|------|------|
| `_docs/justification/2026-08-02-bus-boarding-api-justification.md` | 신규 API 필요성 (new-api-validation) |
| `functions/lib/bus-boarding.js` | rideType·legs·import merge·public strip·roster 헬퍼 |
| `scripts/test/bus-boarding.test.js` | 순수 로직 단위 테스트 |
| `functions/index.js` | `action=bus-boarding` 라우팅, 트랜잭션, admin 검증 |
| `boarding.html` | 참가자 셀프 탑승 (공개) |
| `boarding-admin.html` | 총무 현황·import·명단·QR |
| `group-detail.html` | 허브 카드: 버스 / 배번 / 결과(준비 중) |
| `scripts/qa-bus-boarding.sh` | 에뮬 API 시나리오 |
| `scripts/seed-emulator-bus-boarding.js` | QA용 race_events + members 시드 |
| `_docs/knowledge/data-dictionary.md` | `busBoarding` 필드 기록 |

---

## 선행: 문서 읽기 (구현자)

구현 시작 전 필수:

```
☐ _docs/development/api-patterns.md
☐ _docs/development/naming-conventions.md
☐ _docs/development/common-mistakes.md
☐ _docs/superpowers/specs/2026-08-02-group-event-day-ux-design.md §4–10, §12.1
```

유사 API 참고: `update-bib` (`functions/index.js` ~3579), `verifyAdminPassword` (~3875), `my-bib.html`.

---

### Task 0: 신규 API 정당화 문서

**Files:**
- Create: `_docs/justification/2026-08-02-bus-boarding-api-justification.md`

- [ ] **Step 1: 유사 API 전역 검색 결과 기록**

검색 키워드(최소): `bus`, `boarding`, `update-bib`, `action=group-events`, `verify-admin`, `self-board`.  
기존에 탑승 체크 API 없음 · 공개 쓰기 최근접은 `update-bib` · admin 패턴은 `verifyAdminPassword` / `ownerPw` 임을 문서에 적는다.

- [ ] **Step 2: justification 작성**

필수 섹션: 기존 API 목록, 신규 `bus-boarding` 용도, `update-bib`/`group-events`로 대체 불가 이유(지인 로스터·구간 체크·admin 서버 검증), 결정.

- [ ] **Step 3: 사용자에게 한 줄 승인 확인**

채팅에 요약 후 “API `action=bus-boarding` 추가 승인?” — **승인 전에 Task 3(BE 핸들러)로 가지 말 것.** (Task 1–2 순수 로직·테스트는 승인 전에도 가능)

- [ ] **Step 4: Commit**

```bash
git add _docs/justification/2026-08-02-bus-boarding-api-justification.md
git commit -m "docs: bus-boarding API 추가 정당화"
```

---

### Task 1: 순수 로직 단위 테스트 (TDD Red)

**Files:**
- Create: `scripts/test/bus-boarding.test.js`
- Create: `functions/lib/bus-boarding.js` (스텁 export만 — 테스트가 실패하게)

- [ ] **Step 1: 실패하는 테스트 작성**

```js
"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  rideTypeToLegRequired,
  parseRideTypeLabel,
  mergeRosterImport,
  toPublicRoster,
  findRosterIndexByNickname,
  applySelfBoard,
  applyAdminBoard,
  emptyBusBoarding,
} = require(path.join(__dirname, "../../functions/lib/bus-boarding.js"));

describe("rideTypeToLegRequired", () => {
  it("roundtrip → both required", () => {
    assert.deepEqual(rideTypeToLegRequired("roundtrip"), {
      outbound: true,
      return: true,
    });
  });
  it("outbound_only", () => {
    assert.deepEqual(rideTypeToLegRequired("outbound_only"), {
      outbound: true,
      return: false,
    });
  });
  it("return_only", () => {
    assert.deepEqual(rideTypeToLegRequired("return_only"), {
      outbound: false,
      return: true,
    });
  });
});

describe("parseRideTypeLabel", () => {
  it("왕복", () => assert.equal(parseRideTypeLabel("왕복"), "roundtrip"));
  it("동탄->철원(편도)", () =>
    assert.equal(parseRideTypeLabel("동탄->철원(편도)"), "outbound_only"));
  it("철원->동탄(편도)", () =>
    assert.equal(parseRideTypeLabel("철원->동탄(편도)"), "return_only"));
  it("개별 이동", () => assert.equal(parseRideTypeLabel("개별 이동"), "excluded"));
});

describe("mergeRosterImport", () => {
  it("keeps boarded when nickname matches", () => {
    const existing = [
      {
        rosterId: "r1",
        nickname: "라우펜더만",
        realName: "이원기",
        rideType: "roundtrip",
        isGuest: false,
        memberId: "m1",
        note: "old",
        legs: {
          outbound: { required: true, boarded: true, boardedAt: "t", boardedBy: "self" },
          return: { required: true, boarded: false, boardedAt: null, boardedBy: null },
        },
      },
    ];
    const { roster, report } = mergeRosterImport(existing, [
      { nickname: "라우펜더만", realName: "이원기", rideTypeLabel: "왕복", note: "new note" },
    ], { memberIdByNickname: new Map([["라우펜더만", "m1"]]) });
    assert.equal(roster.length, 1);
    assert.equal(roster[0].legs.outbound.boarded, true);
    assert.equal(roster[0].note, "new note");
    assert.equal(report.merged, 1);
  });

  it("does not delete rows missing from CSV", () => {
    const existing = [
      {
        rosterId: "keep",
        nickname: "기존",
        realName: "김기존",
        rideType: "roundtrip",
        isGuest: true,
        memberId: null,
        note: null,
        legs: {
          outbound: { required: true, boarded: false, boardedAt: null, boardedBy: null },
          return: { required: true, boarded: false, boardedAt: null, boardedBy: null },
        },
      },
    ];
    const { roster } = mergeRosterImport(existing, [
      { nickname: "신규", realName: "박신규", rideTypeLabel: "왕복", note: null },
    ], { memberIdByNickname: new Map() });
    assert.equal(roster.length, 2);
    assert.ok(roster.some((r) => r.nickname === "기존"));
  });

  it("skips 개별 이동", () => {
    const { roster, report } = mergeRosterImport([], [
      { nickname: "혼자", realName: "김혼자", rideTypeLabel: "개별 이동", note: null },
    ], { memberIdByNickname: new Map() });
    assert.equal(roster.length, 0);
    assert.equal(report.excluded, 1);
  });

  it("duplicate nicknames in one CSV → errors, no silent last-wins", () => {
    const { roster, report } = mergeRosterImport([], [
      { nickname: "동일", realName: "김일", rideTypeLabel: "왕복", note: null },
      { nickname: "동일", realName: "김이", rideTypeLabel: "왕복", note: null },
    ], { memberIdByNickname: new Map() });
    assert.equal(roster.length, 0);
    assert.ok(report.errors.length >= 1);
    assert.equal(report.added || 0, 0);
  });

  it("unmapped rideTypeLabel → errors", () => {
    const { roster, report } = mergeRosterImport([], [
      { nickname: "괴상", realName: "이괴상", rideTypeLabel: "헬기이동", note: null },
    ], { memberIdByNickname: new Map() });
    assert.equal(roster.length, 0);
    assert.ok(report.errors.some((e) => /헬기|rideType|매핑/i.test(String(e.reason || e))));
  });
});

describe("toPublicRoster", () => {
  it("strips note", () => {
    const pub = toPublicRoster([
      { nickname: "a", note: "secret", legs: {} },
    ]);
    assert.equal(pub[0].note, undefined);
    assert.ok(!("note" in pub[0]) || pub[0].note == null);
  });
});

describe("applySelfBoard", () => {
  it("idempotent when already boarded", () => {
    const row = {
      nickname: "a",
      legs: {
        outbound: { required: true, boarded: true, boardedAt: "t", boardedBy: "self" },
        return: { required: true, boarded: false, boardedAt: null, boardedBy: null },
      },
    };
    const r = applySelfBoard(row, "outbound", "2026-08-02T00:00:00.000Z");
    assert.equal(r.ok, true);
    assert.equal(r.already, true);
  });
  it("rejects when not required", () => {
    const row = {
      nickname: "a",
      legs: {
        outbound: { required: false, boarded: false, boardedAt: null, boardedBy: null },
        return: { required: true, boarded: false, boardedAt: null, boardedBy: null },
      },
    };
    const r = applySelfBoard(row, "outbound", "2026-08-02T00:00:00.000Z");
    assert.equal(r.ok, false);
  });
});
```

- [ ] **Step 2: 스텁 모듈 생성 후 테스트 실패 확인**

`functions/lib/bus-boarding.js`에 함수를 `throw new Error("not implemented")` 또는 빈 구현으로 export.

```bash
cd /workspace && node --test scripts/test/bus-boarding.test.js
```

Expected: FAIL

- [ ] **Step 3: Commit 테스트+스텁**

```bash
git add scripts/test/bus-boarding.test.js functions/lib/bus-boarding.js
git commit -m "test: bus-boarding 순수 로직 Red"
```

---

### Task 2: 순수 로직 구현 (TDD Green)

**Files:**
- Modify: `functions/lib/bus-boarding.js`

- [ ] **Step 1: 스펙대로 헬퍼 구현**

필수 export:
- `emptyBusBoarding({ legs })` → `{ enabled: false, legs, importMeta, roster: [] }`
- `rideTypeToLegRequired(rideType)`
- `parseRideTypeLabel(label)` → enum | `"excluded"` | `null`
- `buildRosterEntry({ nickname, realName, rideType, note, memberId, rosterId? })`
- `mergeRosterImport(existing, rows, { memberIdByNickname })` → `{ roster, report: { merged, added, excluded, errors[] } }`  
  - **동일 배치 CSV 내 닉네임 중복**: 해당 닉네임 행 전부 적용하지 않고 `errors`에 넣는다 (자동 last-wins 금지). 기존 roster에 이미 있는 닉네임과의 머지는 허용(스펙: 닉네임 키 머지).  
  - `parseRideTypeLabel` → `null` 행도 `errors` (excluded와 구분).
- `toPublicRoster(roster)` — `note` 제거
- `findRosterIndexByNickname(roster, nickname)` — `nickname.trim()` exact
- `applySelfBoard(row, leg, isoNow)` / `applyAdminBoard(row, leg, boarded, isoNow)`
- `assertEnabled(busBoarding)` → boolean
- `summarizeLeg(roster, leg)` → `{ required, boarded }`

닉네임 키: `String(nickname).trim()` — `update-bib`와 같이 저장·비교.

`rosterId`: 없으면 `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` (또는 crypto.randomUUID).

- [ ] **Step 2: 테스트 통과**

```bash
cd /workspace && node --test scripts/test/bus-boarding.test.js
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add functions/lib/bus-boarding.js scripts/test/bus-boarding.test.js
git commit -m "feat: bus-boarding 순수 로직 (rideType·import merge)"
```

---

### Task 3: BE — `settings` + `status`

**Files:**
- Modify: `functions/index.js` (`exports.race` 핸들러 내부)
- Require: `./lib/bus-boarding` (또는 `path` join 패턴은 기존 lib require 방식 따를 것)

**사전:** Task 0 사용자 승인 완료.

- [ ] **Step 1: 라우팅 뼈대**

`action === "bus-boarding"` 블록 추가.

```js
// 의사코드 — 실제 배치는 exports.race try 블록 안, group-events 인근
if (action === "bus-boarding") {
  const sub = (req.query.subAction || req.body?.subAction || "").trim();
  // dispatch...
}
```

- [ ] **Step 2: GET `status`**

쿼리: `eventId` 필수.  
바디/쿼리 `pw` 있으면 `verifyAdminPassword` — 성공 시 admin 뷰(`note` 포함), 실패 시 401(pw를 보냈는데 틀린 경우). pw 없으면 public (`toPublicRoster`).

`busBoarding` 없으면:

```json
{ "ok": true, "enabled": false, "legs": ["outbound", "return"], "roster": [], "eventName": "..." }
```

있으면 `enabled`, `legs`, `roster`, `importMeta`, `summary: { outbound, return }`.

- [ ] **Step 3: POST `settings`**

바디: `{ pw, eventId, enabled, legs? }`. admin 필수.  
트랜잭션으로 `busBoarding` 없으면 `emptyBusBoarding` 후 `enabled`/`legs` 설정.  
기존 roster는 유지.

- [ ] **Step 4: enabled=false 가드 문서화 주석**

`import` / `admin-board` / `roster-*` / `self-board` 는 `enabled === true` 아니면 403 `{ error: "bus boarding not enabled" }`.  
`settings`·admin `status`는 허용.

- [ ] **Step 5: 에뮬 수동 스모크 (또는 Task 7 QA에 포함)**

- [ ] **Step 6: Commit**

```bash
git add functions/index.js
git commit -m "feat(api): bus-boarding settings·status"
```

---

### Task 4: BE — `self-board` (트랜잭션)

**Files:**
- Modify: `functions/index.js`
- Modify: `functions/lib/bus-boarding.js` (필요 시)

- [ ] **Step 1: POST `self-board`**

바디: `{ eventId, nickname, leg }` (`leg` ∈ `outbound|return`).  
공개. `enabled` 검사 → 닉네임 trim → roster 인덱스 → `applySelfBoard` → 트랜잭션으로 `busBoarding.roster` 전체 write.

```js
await db.runTransaction(async (tx) => {
  const ref = db.collection("race_events").doc(eventId);
  const snap = await tx.get(ref);
  // ... mutate busBoarding.roster[i]
  tx.update(ref, { busBoarding });
});
```

이미 boarded → `{ ok: true, already: true }`.  
not required / unknown nick → 4xx.

- [ ] **Step 2: Commit**

```bash
git add functions/index.js functions/lib/bus-boarding.js
git commit -m "feat(api): bus-boarding self-board (transaction)"
```

---

### Task 5: BE — admin-board · roster-upsert · roster-remove

**Files:**
- Modify: `functions/index.js`

- [ ] **Step 1: POST `admin-board`**

`{ pw, eventId, rosterId, leg, boarded: boolean }` — admin + enabled + **Firestore 트랜잭션** (roster 배열 RMW).

- [ ] **Step 2: POST `roster-upsert`**

`{ pw, eventId, rosterId?, nickname, realName, rideType, note?, isGuest? }`  
신규면 `buildRosterEntry` + members 닉네임 조회(`members`에서 nickname 매칭 — 기존 participants 저장 방식 참고).  
`rideType` 변경 시 `required` 재계산하되 **기존 boarded 유지**.  
**반드시 트랜잭션**으로 `busBoarding.roster` 갱신 (스펙 §12.1 — admin 동시 편집 lost update 방지).

- [ ] **Step 3: POST `roster-remove`**

`{ pw, eventId, rosterId }` — enabled 필요 + **트랜잭션**.

- [ ] **Step 4: Commit**

```bash
git add functions/index.js
git commit -m "feat(api): bus-boarding admin roster mutations"
```

---

### Task 6: BE — CSV `import`

**Files:**
- Modify: `functions/index.js` (또는 lib에 `parseCsvRows` — 파싱은 FE에서 rows JSON을 보내도 됨)

**권장:** FE가 CSV를 파싱해 `rows: [{ nickname, realName, rideTypeLabel, note }]` 로 POST. 서버는 `mergeRosterImport`만 수행 (Node에 CSV 파서 의존성 추가 금지).

- [ ] **Step 1: POST `import`**

`{ pw, eventId, rows, sourceLabel? }` — admin + enabled.  
`memberIdByNickname`: 해당 이벤트 전 `members` 스냅(또는 nickname in 배치)으로 Map 구성.  
머지 후 `importMeta` 갱신. 트랜잭션.

응답: `{ ok, report, summary }`.

- [ ] **Step 2: Commit**

```bash
git add functions/index.js
git commit -m "feat(api): bus-boarding CSV row import (merge)"
```

---

### Task 7: QA 시드 + 스크립트

**Files:**
- Create: `scripts/seed-emulator-bus-boarding.js`
- Create: `scripts/qa-bus-boarding.sh`

- [ ] **Step 1: 시드**

`FIRESTORE_EMULATOR_HOST` 필수.  
`race_events/evt_bus_qa` 단체 대회 1건(participants 최소), members 닉네임 2명.

- [ ] **Step 2: QA 스크립트가 커버할 스펙 §10**

1. settings enable  
2. import 왕복+편도+개별(제외) + CSV 내 닉네임 중복은 errors  
3. self-board outbound  
4. roundtrip return self-board 성공  
5. return_only가 outbound self-board 거부  
6. admin-board toggle  
7. roster-upsert 지인 → 그 닉네임 self-board 성공  
8. import 머지 시 boarded 유지  
9. public status에 note 없음 / admin status에 note 있음  
10. pw 없이 admin-board → 401  
11. enabled false → self-board 403; roster는 유지; settings로 재활성화 후 동일 roster·boarded 확인  

Admin pw: `dmc2008` (에뮬 기본).

API base: `http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race`

- [ ] **Step 3: 에뮬에서 실행**

```bash
# 에뮬 떠 있는 상태에서
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-emulator-bus-boarding.js
bash scripts/qa-bus-boarding.sh
```

Expected: 전부 PASS

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-emulator-bus-boarding.js scripts/qa-bus-boarding.sh
git commit -m "test: bus-boarding 에뮬 QA 스크립트"
```

---

### Task 8: FE — `boarding.html` (참가자)

**Files:**
- Create: `boarding.html`

패턴: `my-bib.html` (apiBase, eventId 쿼리, 닉네임 목록, localStorage).

- [ ] **Step 1: 페이지 골격**

- `?eventId=` 필수  
- GET `bus-boarding&subAction=status` (public)  
- `enabled !== true` → “아직 열리지 않음”  
- 구간 탭: 가는(outbound) / 오는(return) — 기본 outbound  
- 닉네임 검색 목록: `nickname` + `realName`, 지인 뱃지(`isGuest`)  
- 해당 구간 `required`인 행만 선택·체크 가능  
- ‘탑승 완료’ → POST `self-board`  
- 성공/이미완료 UI  
- 헤더/푸터: `my-bib.html?eventId=` 링크 **항상**. 결과 보드 링크는 Phase 3까지 넣지 않거나 ‘준비 중’ 텍스트만  
- `localStorage` 키: `dmc_boarding_nickname` (+ 선택적으로 attendance/bib 키와 동일 닉 읽기)

- [ ] **Step 2: apiBase**

기존 페이지와 동일:

```js
function apiBase() {
  const h = location.hostname;
  if (h === "localhost" || h === "127.0.0.1") {
    return "http://127.0.0.1:5001/dmc-attendance/asia-northeast3/race";
  }
  return "/api/race";
}
```

(`my-bib.html` / `group-detail.html` 실제 구현을 복사해 맞출 것 — 위는 스케치.)

- [ ] **Step 3: 에뮬+시드로 수동 확인**

- [ ] **Step 4: Commit**

```bash
git add boarding.html
git commit -m "feat: boarding.html 참가자 버스 탑승 체크"
```

---

### Task 9: FE — `boarding-admin.html` (총무)

**Files:**
- Create: `boarding-admin.html`

패턴: `group.html` / `attendance-admin.html`의 `verify-admin` + `sessionStorage`.

- [ ] **Step 1: 비밀번호 게이트**

POST `action=verify-admin` `{ pw }` → `sessionStorage`에 플래그/role.  
이후 API 호출마다 body에 `pw` 포함(서버 검증). 세션에 pw를 둘지 입력 유지할지는 **기존 attendance-admin 패턴을 그대로 복제**.

- [ ] **Step 2: enabled 패널**

`enabled !== true` → ‘버스 탑승 시작’ 버튼 → POST `settings { enabled: true }`.  
그 전에는 import/대리체크 UI disabled.

- [ ] **Step 3: 현황 UI**

- 구간 탭, `탑승 n / 필요 m`, 미탑승 행 강조  
- 행: 닉네임, 실명, 지인, rideType, boarded 토글, 비고 편집  
- CSV 파일 input → 클라이언트 파싱 → POST `import`  
  - 헤더 별칭: `닉네임|nickname`, `이름|실명|name|realName`, `버스 탑승 여부|탑승|rideType`, `비고|note` (계획 상단 고정값)  
  - 중식 열은 무시  
- 명단 추가 폼 (지인)  
- 참가자 링크 복사 + QR: 브라우저 QR 라이브러리 없이 **링크 복사 + 간단한 QR API 또는 외부 이미지 URL**  
  - 권장: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=` + encodeURIComponent(절대 URL)  
  - 또는 npm 없이 canvas 최소 구현 — **외부 의존 최소화면 링크 복사 우선, QR은 img URL**

폴링: 3–5초마다 GET status (admin).

- [ ] **Step 4: Commit**

```bash
git add boarding-admin.html
git commit -m "feat: boarding-admin.html 총무 버스 탑승 현황"
```

---

### Task 10: `group-detail.html` 허브 카드 골격

**Files:**
- Modify: `group-detail.html`

- [ ] **Step 1: 통계 요약 아래(또는 헤더 아래) 허브 섹션 추가**

```html
<section class="section" id="dayHubSection">
  <h2 class="section-title">당일 · 운영 바로가기</h2>
  <div class="hub-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;">
    <a class="hub-card" id="hubBus" href="#">버스 탑승</a>
    <a class="hub-card" id="hubBib" href="#">배번 입력</a>
    <div class="hub-card hub-card-disabled" id="hubResults">결과 보드 · 준비 중</div>
  </div>
</section>
```

- [ ] **Step 2: 링크 설정 (JS, eventId 로드 후)**

- `hubBib.href = my-bib.html?eventId=...` — **버스 상태 무관 항상**  
- `hubBus.href = boarding-admin.html?eventId=...` — 항상 (총무용)  
- 선택: 참가자용 boarding 링크를 카드 하위에 표시  
- GET bus status(public ok)로 `enabled`면 뱃지 “운영 중 · n/m” 표시. 실패/없음이어도 **배번 카드는 유지**

스타일은 기존 CSS 변수에 맞춰 최소 추가. 전면 리팩터 금지(Phase 2).

- [ ] **Step 3: Commit**

```bash
git add group-detail.html
git commit -m "feat: group-detail 당일 허브 카드 (버스·배번)"
```

---

### Task 11: data-dictionary + 검증

**Files:**
- Modify: `_docs/knowledge/data-dictionary.md`
- Run: unit test + QA

- [ ] **Step 1: `race_events.busBoarding` 스키마 요약 추가**

- [ ] **Step 2: 단위 테스트**

```bash
cd /workspace && node --test scripts/test/bus-boarding.test.js
```

Expected: PASS

- [ ] **Step 3: QA (에뮬)**

```bash
bash scripts/qa-bus-boarding.sh
```

Expected: PASS

- [ ] **Step 4: 스펙 §10 시나리오 체크리스트 수동 확인**

특히: 버스 off여도 group-detail 배번 카드 보임.

- [ ] **Step 5: Commit**

```bash
git add _docs/knowledge/data-dictionary.md
git commit -m "docs: busBoarding 데이터 사전 반영"
```

---

## 구현 중 주의 (회귀)

- `update-bib` / `group-events` 기존 동작 변경 금지.
- `participants` 배열에 지인 넣지 말 것.
- 공개 GET에 `note` 노출 금지.
- `firebase deploy` 실행 금지 — 사용자만.

---

## Phase 1 완료 정의

- [ ] Task 0–11 체크 완료
- [ ] `node --test scripts/test/bus-boarding.test.js` PASS
- [ ] `qa-bus-boarding.sh` PASS
- [ ] 철원형 수동: enable → CSV → 셀프체크 → 총무 미탑승·지인
- [ ] 버스 없는 대회: 허브에서 배번만 사용 가능

이후: Phase 2 계획(`group-detail` FE 리팩터·공개 상호 네비) / Phase 3 결과 보드 — 별도 계획 문서.
