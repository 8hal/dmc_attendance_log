# 회원 「대회 기록」참가 전원 · 배번 · 수집 상태 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원 「대회 기록」탭이 참가자 전원에 종목·배번·기록 상태(`none` / `scraped` / `confirmed`)를 보여 주고, 미확정은 배번으로만 스크레이프 잡에 붙인다.

**Architecture:** 신규 HTTP `action`/`subAction` 없이 `public-roster`만 넓힌다. 행 조립은 `functions/lib/public-roster.js` 순수 함수. 미확정은 기존 `matchResultByBib` + `effectiveNetTimeForConfirm`를 재사용한다. 스크레이퍼·`queryBy: "name"`은 건드리지 않는다. `event-roster.html`은 그 행을 그리기만 한다.

**Tech Stack:** Firebase Functions + Firestore, static HTML, `node --test` (`npm run test:public-roster`, `npm run test:event-home`의 `event-roster-shell`), QA는 `scripts/qa-event-admin.sh`

**Spec:** `_docs/superpowers/specs/2026-08-30-event-records-roster-board-prd.md`

TDD. `@.cursor/skills/test-driven-development/SKILL.md`. 신규 API 금지. `@.cursor/rules/new-api-validation.mdc`

---

## File map

| File | Role |
|---|---|
| `functions/lib/public-roster.js` | 참가 전원 행, `bib`, `recordStatus`, 배번 스크레이프 매칭, 새 정렬 |
| `functions/lib/group-scrape-bib.js` | 그대로 `matchResultByBib`만 호출. 수정 없음 |
| `functions/lib/self-confirm.js` | 그대로 `effectiveNetTimeForConfirm`만 호출. 수정 없음 |
| `functions/index.js` | `public-roster` 핸들러만: `scrape_jobs` 조회 후 4번째 인자로 넘김 |
| `event-roster.html` | 요약·행·빈 화면·안내 |
| `scripts/test/public-roster.test.js` | 행 계약·매칭·정렬 |
| `scripts/test/event-roster-shell.test.js` | 카피·렌더 단언 |
| `scripts/qa-event-admin.sh` | `totalCount`·bib 단언 |
| `_docs/knowledge/data-dictionary.md` | `public-roster` 설명 |

**하지 않음:** 신규 `subAction`, 스크레이퍼 재작성, 자동 PB, 이 탭에서 확정/수정, 실명 공개, `event-roster.html` 파일명 변경.

---

## `buildPublicRosterRows` 계약 (Task 1·2·3 공통)

시그니처를 4번째 인자로 넓힌다. 기존 3인자 호출은 `scrapeResults = []`와 같다.

```javascript
buildPublicRosterRows(participants, confirmedByKey, normalizeDistance, scrapeResults)
```

행: `{ nickname, distance, bib, recordStatus, netTime, dnStatus, pbConfirmed, hasResult }`

상태 순서: 확정 완주/DNS/DNF → `confirmed`. 아니면 `matchResultByBib(scrapeResults, bib, p.distance)` (distance는 정규화하지 않음) → `scraped` (시각 없어도). 아니면 `none`.

`hasResult === (recordStatus === "confirmed")`. 응답 키에 `realName` 없음.

정렬 `result`: 확정 시각 오름차순 → 미확정 시각 오름차순 → 미확정(시각 없음) → 확정 DNS/DNF → `none` → 닉.

---

### Task 1: `buildPublicRosterRows` 전원·배번·상태

**Files:**
- Modify: `functions/lib/public-roster.js`
- Test: `scripts/test/public-roster.test.js`

- [ ] **Step 1: Write the failing tests**

`scripts/test/public-roster.test.js`의 `describe("buildPublicRosterRows")`를 아래처럼 교체한다. `drops unconfirmed participants`는 삭제한다. `filterPublicRosterRows` / `timeToSortSeconds` describe는 그대로 둔다. `sortPublicRosterRows` describe는 Task 2에서 바꾼다.

```javascript
const { matchResultByBib } = require("../../functions/lib/group-scrape-bib.js");

describe("buildPublicRosterRows", () => {
  it("닉 있는 참가 전원 + bib, 실명 없음", () => {
    const confirmed = new Map([
      ["김A_half", { status: "confirmed", netTime: "1:42:18", pbConfirmed: true, distance: "half" }],
    ]);
    const rows = buildPublicRosterRows(
      [
        { nickname: "게살볶음밥", realName: "김A", bib: "4821", distance: "half" },
        { nickname: "동탄치타", realName: "김B", distance: "full" },
      ],
      confirmed,
      (d) => String(d || "").trim().toLowerCase(),
      []
    );
    assert.equal(rows.length, 2);
    assert.deepEqual(Object.keys(rows[0]).sort(), [
      "bib",
      "distance",
      "dnStatus",
      "hasResult",
      "netTime",
      "nickname",
      "pbConfirmed",
      "recordStatus",
    ]);
    const a = rows.find((r) => r.nickname === "게살볶음밥");
    const b = rows.find((r) => r.nickname === "동탄치타");
    assert.equal(a.bib, "4821");
    assert.equal(a.recordStatus, "confirmed");
    assert.equal(a.hasResult, true);
    assert.equal(a.pbConfirmed, true);
    assert.equal(b.bib, "");
    assert.equal(b.recordStatus, "none");
    assert.equal(b.hasResult, false);
    assert.equal(b.netTime, null);
    assert.ok(!("realName" in a));
    assert.ok(!rows.some((r) => "realName" in r));
  });

  it("배번 없으면 이름만 같은 잡 행을 붙이지 않는다", () => {
    const rows = buildPublicRosterRows(
      [{ nickname: "동탄치타", realName: "김B", distance: "full" }],
      new Map(),
      normalizeRaceDistance,
      [{ bib: "999", realName: "김B", netTime: "3:10:00", distance: "full" }]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].recordStatus, "none");
    assert.equal(rows[0].netTime, null);
  });

  it("배번 매칭이면 scraped, 시각 없어도 scraped", () => {
    const rows = buildPublicRosterRows(
      [{ nickname: "써니형", realName: "이의선", bib: "40066", distance: "half" }],
      new Map(),
      normalizeRaceDistance,
      [{ bib: "40066", netTime: "", gunTime: "", finishTime: "", distance: "half" }]
    );
    assert.equal(rows[0].recordStatus, "scraped");
    assert.equal(rows[0].hasResult, false);
    assert.equal(rows[0].pbConfirmed, false);
    assert.equal(rows[0].netTime, null);
    assert.equal(rows[0].bib, "40066");
  });

  it("배번 매칭에 시각 있으면 scraped netTime", () => {
    const rows = buildPublicRosterRows(
      [{ nickname: "써니형", realName: "이의선", bib: "40066", distance: "half" }],
      new Map(),
      normalizeRaceDistance,
      [{ bib: "40066", netTime: "1:38:40", distance: "half" }]
    );
    assert.equal(rows[0].recordStatus, "scraped");
    assert.equal(rows[0].netTime, "1:38:40");
  });

  it("확정이 있으면 scraped보다 confirmed가 이긴다", () => {
    const confirmed = new Map([
      ["이의선_half", { status: "confirmed", netTime: "1:42:18", pbConfirmed: true, distance: "half" }],
    ]);
    const rows = buildPublicRosterRows(
      [{ nickname: "써니형", realName: "이의선", bib: "40066", distance: "half" }],
      confirmed,
      normalizeRaceDistance,
      [{ bib: "40066", netTime: "1:38:40", distance: "half" }]
    );
    assert.equal(rows[0].recordStatus, "confirmed");
    assert.equal(rows[0].netTime, "1:42:18");
    assert.equal(rows[0].pbConfirmed, true);
  });

  it("참가자 distance가 비어 있으면 확정 기록의 종목·시간으로 붙인다", () => {
    const confirmed = new Map([
      [
        "이의선_full",
        {
          status: "confirmed",
          netTime: "02:54:34",
          memberRealName: "이의선",
          bib: "40066",
          distance: "full",
        },
      ],
    ]);
    const rows = buildPublicRosterRows(
      [{ nickname: "써니형", realName: "이의선", bib: "40066", distance: "" }],
      confirmed,
      normalizeRaceDistance
    );
    assert.equal(rows[0].recordStatus, "confirmed");
    assert.equal(rows[0].distance, "full");
    assert.equal(rows[0].bib, "40066");
  });

  it("참가자 distance가 있으면 다른 종목 확정 기록에 붙이지 않는다", () => {
    const confirmed = new Map([
      [
        "이의선_full",
        {
          status: "confirmed",
          netTime: "02:54:34",
          memberRealName: "이의선",
          bib: "40066",
          distance: "full",
        },
      ],
    ]);
    const rows = buildPublicRosterRows(
      [{ nickname: "써니형", realName: "이의선", bib: "40066", distance: "half" }],
      confirmed,
      normalizeRaceDistance
    );
    assert.equal(rows[0].recordStatus, "none");
  });

  it("includes DNS case-insensitive", () => {
    const confirmed = new Map([["김C_10K", { status: "dns", distance: "10K" }]]);
    const rows = buildPublicRosterRows(
      [{ nickname: "DNS러", realName: "김C", distance: "10K" }],
      confirmed,
      normalizeRaceDistance
    );
    assert.equal(rows[0].recordStatus, "confirmed");
    assert.equal(rows[0].dnStatus, "DNS");
    assert.equal(rows[0].netTime, null);
    assert.equal(rows[0].hasResult, true);
    assert.equal(rows[0].pbConfirmed, false);
  });

  it("includes DNF from dnStatus case-insensitive", () => {
    const confirmed = new Map([["김D_half", { dnStatus: "DnF", distance: "half" }]]);
    const rows = buildPublicRosterRows(
      [{ nickname: "DNF러", realName: "김D", distance: "half" }],
      confirmed,
      normalizeRaceDistance
    );
    assert.equal(rows[0].dnStatus, "DNF");
    assert.equal(rows[0].recordStatus, "confirmed");
  });
});
```

`matchResultByBib` import는 테스트에서 직접 쓰지 않으면 빼도 된다. 구현이 `group-scrape-bib.js`를 require하면 된다.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:public-roster
```

Expected: FAIL (`recordStatus` / `bib` 없음, 또는 미확정 행이 0건).

- [ ] **Step 3: Minimal implementation**

`functions/lib/public-roster.js` 상단 주석을 「실명 제외. 배번·recordStatus 포함」으로 바꾸고, 아래를 require한다.

```javascript
const { matchResultByBib } = require("./group-scrape-bib");
const { effectiveNetTimeForConfirm } = require("./self-confirm");
```

`buildPublicRosterRows` 루프:

1. 닉 없으면 continue (지금과 같음).
2. `bib = String(p.bib || "").trim()`.
3. `confirmed = findConfirmedForParticipant(...)`.
4. 확정 완주 또는 DNS/DNF면 `recordStatus: "confirmed"`, `netTime`/`dnStatus`/`pbConfirmed`는 지금 로직. `hasResult: true`.
5. 아니면 `scrapedHit = bib ? matchResultByBib(scrapeList, bib, p.distance) : null`. 히트면 `recordStatus: "scraped"`, `netTime = effectiveNetTimeForConfirm(scrapedHit) || null` (빈 문자열은 null), `pbConfirmed: false`, `hasResult: false`.
6. 아니면 `recordStatus: "none"`, `netTime: null`, `pbConfirmed: false`, `hasResult: false`.
7. `distance`: 확정/스크레이프에 붙었고 참가자 종목이 비면 그쪽. 아니면 `norm(p.distance)`.
8. 항상 `bib` 필드.

`scrapeResults`는 4번째 인자. 배열 아니면 `[]`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:public-roster
```

Expected: Task 1 describe PASS. 기존 `sortPublicRosterRows` 테스트는 아직 구 순서라 통과할 수 있다 (DNS를 시각 뒤로 보내던 동작).

- [ ] **Step 5: Commit**

```bash
git add functions/lib/public-roster.js scripts/test/public-roster.test.js
git commit -m "feat(public-roster): 참가 전원 행에 배번과 수집/확정 상태를 넣는다"
```

---

### Task 2: `result` 정렬 버킷

**Files:**
- Modify: `functions/lib/public-roster.js` (`sortPublicRosterRows`)
- Test: `scripts/test/public-roster.test.js`

- [ ] **Step 1: Write the failing test**

기존 `기록 순: 시각 오름차순 다음 DNS/DNF 다음 닉`을 교체:

```javascript
describe("sortPublicRosterRows", () => {
  it("확정 시각 → 미확정 시각 → 미확정 무시각 → DNS/DNF → none → 닉", () => {
    const out = sortPublicRosterRows(
      [
        { nickname: "없음가", recordStatus: "none", netTime: null, dnStatus: null },
        { nickname: "가가DNS", recordStatus: "confirmed", netTime: null, dnStatus: "DNS" },
        { nickname: "느린확정", recordStatus: "confirmed", netTime: "1:50:00", dnStatus: null },
        { nickname: "빠른미확정", recordStatus: "scraped", netTime: "1:20:00", dnStatus: null },
        { nickname: "빠른확정", recordStatus: "confirmed", netTime: "1:40:00", dnStatus: null },
        { nickname: "무시각미확정", recordStatus: "scraped", netTime: null, dnStatus: null },
        { nickname: "없음나", recordStatus: "none", netTime: null, dnStatus: null },
      ],
      "result"
    );
    assert.deepEqual(
      out.map((r) => r.nickname),
      ["빠른확정", "느린확정", "빠른미확정", "무시각미확정", "가가DNS", "없음가", "없음나"]
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:public-roster
```

Expected: FAIL (미확정이 확정 시각보다 앞이거나 DNS와 섞임).

- [ ] **Step 3: Implement sort buckets**

```javascript
function resultSortBucket(row) {
  const status = String((row && row.recordStatus) || "");
  const sec = timeToSortSeconds(row && row.netTime);
  if (status === "confirmed" && !isPublicDnRow(row) && sec != null) return 0;
  if (status === "scraped" && sec != null) return 1;
  if (status === "scraped") return 2;
  if (status === "confirmed" && isPublicDnRow(row)) return 3;
  return 4;
}
```

`sortBy === "result"`일 때 bucket 비교 → 같은 bucket에서 둘 다 시각 있으면 오름차순 → 닉.

- [ ] **Step 4: Run tests**

```bash
npm run test:public-roster
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/lib/public-roster.js scripts/test/public-roster.test.js
git commit -m "feat(public-roster): 확정·미확정·없음 순으로 기록 정렬한다"
```

---

### Task 3: `public-roster` 핸들러가 잡을 읽는다

**Files:**
- Modify: `functions/index.js` (`subAction === "public-roster"` 블록, 주석 「실명·배번 제외」삭제)
- Test: 단위 테스트로 핸들러를 직접 부르지 않음. 조립 함수는 Task 1에서 커버. 이 태스크는 호출부만.

- [ ] **Step 1: 핸들러에 scrapeResults 연결**

`confirmedByKey` 만든 뒤:

```javascript
let scrapeResults = [];
const jobId = String(event.groupScrapeJobId || "").trim();
if (jobId) {
  const jobDoc = await db.collection("scrape_jobs").doc(jobId).get();
  if (jobDoc.exists) {
    const job = jobDoc.data() || {};
    scrapeResults = Array.isArray(job.results) ? job.results : [];
  }
}

let rows = buildPublicRosterRows(
  event.participants || [],
  confirmedByKey,
  normalizeRaceDistance,
  scrapeResults
);
const totalCount = rows.length;
const confirmedCount = rows.filter((r) => r.recordStatus === "confirmed").length;
const distanceSet = new Set();
rows.forEach((r) => {
  const d = normalizeRaceDistance(r.distance);
  if (d && d !== "unknown") distanceSet.add(d);
});
```

필터·정렬·응답 JSON 키는 그대로 (`eventId`, `eventName`, `eventDate`, `rows`, `distances`, `confirmedCount`, `totalCount`).

- [ ] **Step 2: Commit**

```bash
git add functions/index.js
git commit -m "feat(public-roster): 배번으로 스크레이프 잡 미확정 행을 붙인다"
```

---

### Task 4: `event-roster.html` 카피·행

**Files:**
- Modify: `event-roster.html`
- Test: `scripts/test/event-roster-shell.test.js`

- [ ] **Step 1: Write the failing shell tests**

`scripts/test/event-roster-shell.test.js`를 PRD 카피에 맞게 교체:

```javascript
it("member roster page is labeled 대회 기록", () => {
  assert.match(html, />대회 기록</);
  assert.doesNotMatch(html, /명단·결과/);
  assert.match(html, /아직 참가자가 없어요/);
  assert.match(html, /해당하는 참가자가 없어요/);
  assert.doesNotMatch(html, /아직 확정된 기록이 없어요/);
  assert.doesNotMatch(html, /해당하는 기록이 없어요/);
});

it("uses 참가 N명 · 확정 M명 summary", () => {
  assert.match(html, /참가 \$\{/);
  assert.match(html, /확정 \$\{/);
  assert.doesNotMatch(html, /기록 \$\{rosterTotalCount\}명/);
});

it("renders DNS/DNF, 미확정, 기록 수집되지 않음, 배번", () => {
  const renderRows = extractFn(html, "renderRows");
  assert.match(renderRows, /dnStatus/);
  assert.match(renderRows, /DNS/);
  assert.match(renderRows, /DNF/);
  assert.match(renderRows, /미확정/);
  assert.match(renderRows, /기록 수집되지 않음/);
  assert.match(renderRows, /배번/);
  assert.doesNotMatch(renderRows, /기록 없음/);
});

it("orders distance chips full half 10K before others and hides unknown", () => {
  assert.match(html, /ROSTER_DIST_ORDER|full.*half.*10K.*5K.*3K.*30K.*32K.*ultra/);
  const sortDist = extractFn(html, "sortRosterDistances");
  assert.match(sortDist, /unknown/);
  assert.doesNotMatch(extractFn(html, "renderChips"), /종목 미정/);
});

it("shows privacy hint without exposing real names", () => {
  assert.match(html, /실명은 공개되지 않습니다/);
  assert.match(html, /홈에서 확인하기 전까지 미확정/);
  assert.doesNotMatch(html, /배번은 공개되지 않습니다/);
  assert.doesNotMatch(html, /홈에서 확정한 기록만 모입니다/);
});
```

- [ ] **Step 2: Run to verify fail**

```bash
node --test scripts/test/event-roster-shell.test.js
```

Expected: FAIL.

- [ ] **Step 3: Update `event-roster.html`**

- 안내: `실명은 공개되지 않습니다. 수집된 기록은 홈에서 확인하기 전까지 미확정입니다.`
- `loadRoster` 요약: ``참가 ${data.totalCount}명 · 확정 ${data.confirmedCount}명``
- `rosterTotalCount`는 빈 화면 판별용으로 `totalCount` 유지.
- `renderRows` 빈 화면: 필터 없고 `rosterTotalCount === 0` → 「아직 참가자가 없어요.」만 (부제 삭제). 아니면 「해당하는 참가자가 없어요.」
- 메타: `EventMemberCopy.memberDistanceLabel(row.distance)` + ` · 배번 ${row.bib || "미입력"}`. 종목 라벨이 「종목 미정」이고 배번만 있으면 배번만 보여도 된다. 기본은 `종목 · 배번`.
- 오른쪽:
  - `dnStatus` DNS/DNF → muted `DNS`/`DNF`
  - `recordStatus === "confirmed"` && `netTime` → 큰 시각. `pbConfirmed`면 「PB」
  - `recordStatus === "scraped"` && `netTime` → 큰 시각 + 「미확정」
  - `recordStatus === "scraped"` && !`netTime` → muted 「미확정」
  - 그 외 → muted 「기록 수집되지 않음」
- `hasResult`만 보지 말 것. `recordStatus`를 본다.
- `isMe` / 「나」 / `.is-me`는 유지.

- [ ] **Step 4: Run tests**

```bash
node --test scripts/test/event-roster-shell.test.js
npm run test:public-roster
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add event-roster.html scripts/test/event-roster-shell.test.js
git commit -m "feat(event-roster): 대회 기록 탭에 배번과 미확정 상태를 보여 준다"
```

---

### Task 5: QA 스크립트 · 데이터 사전

**Files:**
- Modify: `scripts/qa-event-admin.sh`
- Modify: `_docs/knowledge/data-dictionary.md`

- [ ] **Step 1: QA 단언**

헤더 주석 `public-roster 확정 행만 (totalCount == confirmedCount)` → `public-roster 참가 전원, bib 있음, realName 없음`.

시드 `evt_event_admin_qa` 참가는 3명(`배번있음`, `배번없음`, `배번둘`). QA 5에서 self-confirm은 `배번있음` 1명.

```bash
assert_eq "6b: totalCount == 참가 전원" "3" "$(json_get "$roster" 'print(d.get("totalCount",0))')"
assert_eq "6c: confirmedCount == 1" "1" "$(json_get "$roster" 'print(d.get("confirmedCount",0))')"
```

`6d`는 `realName`만 금지. `bib`는 허용.

```python
print("realName" in keys)
```

`6e` 배번있음 `hasResult` / `recordStatus==confirmed` 유지.

시드 참가 수가 다르면 `scripts/seed-emulator-event-admin.js`를 읽고 `totalCount`를 그 수에 맞춘다. 시드 참가 명단을 바꾸지 말 것.

- [ ] **Step 2: data-dictionary**

`public-roster` 행을 「닉·종목·배번·recordStatus·기록·PB. 실명 미포함」으로 고친다.

- [ ] **Step 3: Commit**

```bash
git add scripts/qa-event-admin.sh _docs/knowledge/data-dictionary.md
git commit -m "docs: public-roster 전원·배번 계약에 QA와 사전을 맞춘다"
```

---

### Task 6: 회귀 확인

- [ ] **Step 1: 단위 테스트**

```bash
npm run test:public-roster
node --test scripts/test/event-roster-shell.test.js
npm run test:event-home
```

Expected: PASS. `scripts/test/event-boarding-shell.test.js`가 `홈에서 확정한 기록만 모입니다`를 `event-roster.html`에서 찾으면 PRD 안내 문구로 고친다. 「기록 N명」·「배번은 공개되지 않습니다」단언도 같이 고친다.

- [ ] **Step 2: pre-deploy (구현 세션에서)**

```bash
bash scripts/pre-deploy-test.sh
```

Expected: `✅ 전체 통과 — 배포 가능`. 실패 시 public-roster/hosting 단언만 고치고 스크레이프·홈 확정은 되돌리지 않는다.

- [ ] **Step 3: 최종 커밋은 실패 수정분만**

---

## 실행 메모

- 한글 IME: `event-roster.html` 검색 `compositionstart`/`end` 유지.
- `API_BASE`는 상수. `apiBase()` 호출 금지.
- `detail` API를 회원 탭에서 부르지 말 것 (실명 누수).
- `bulk-confirm` 호출 추가 금지.
