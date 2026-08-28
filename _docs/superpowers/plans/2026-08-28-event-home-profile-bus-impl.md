# 단체 대회 회원 홈 · 대회 기록 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원 홈을 프로필+버스 두 카드로 바꾸고, QR은 홈에서 탑승 완료하며, 탭은 `홈 | 대회 기록`(확정 행만)으로 통일한다.

**Architecture:** 순수 함수(`bus-boarding` `openLeg`, `event-home-action` 카드 상태, `public-roster` 필터, `group-scrape-session`)를 먼저 테스트하고 HTML/API는 그걸 호출만 한다. HTTP `action`/`subAction`은 추가하지 않고 기존 `bus-boarding` `settings`/`self-board`, `update-bib`, `self-confirm`, `scrape`, `public-roster`만 확장한다. 총무는 `event-admin` 비밀번호로 소스·스크랩까지 한다.

**Tech Stack:** Firebase Functions + Firestore, static HTML, `node --test` (`npm run test:event-home`, `test:event-admin`, `test:self-confirm`, `test:public-roster`), 마지막에 `bash scripts/pre-deploy-test.sh`

**Specs:** `_docs/superpowers/specs/2026-08-28-event-home-profile-bus-prd.md`, `_docs/superpowers/specs/2026-08-28-event-records-tab-prd.md`

TDD. `@.cursor/skills/test-driven-development/SKILL.md`. 신규 API 금지. `@.cursor/rules/new-api-validation.mdc`

---

## File map

| File | Role |
|---|---|
| `functions/lib/bus-boarding.js` | `readOpenLeg` / `applyOpenLeg` / `assertLegOpen` / `parseSettingsOpenLeg`. `enabled === (openLeg != null)` |
| `functions/index.js` | settings·status·self-board `openLeg`; admin-board는 스위치와 무관; scrape session start/stop; update-bib `distance`+세션 중 1명 스크랩; self-confirm PB/수동; public-roster 확정만 |
| `functions/lib/group-scrape-session.js` | 세션 상수·활성 여부·재시도 대상·15:00 원샷 게이트 |
| `functions/lib/self-confirm.js` | `pbConfirmed`, 수동 `netTime`/`dnStatus` (pending 없이) |
| `functions/lib/public-roster.js` | 미확정 제외, `dnStatus` |
| `functions/lib/raceDistance.js` | 그대로 사용. 회원 선택은 canonical minus `unknown` |
| `assets/event-home-action.js` | `resolveProfileCard` / `resolveBusCard` / `PROFILE_DISTANCES` |
| `event-home.html` | 두 카드, `&board=1` 탑승 완료 오버레이 |
| `event-admin.html` | 편 스위치 둘, QR 하나, 체크리스트, 총무 소스·스크랩, 수동 기록. `toggleBoard`는 enabled 게이트 없음 |
| `boarding-admin.html` | settings에 `openLeg`. `toggleBoard`는 enabled 게이트 없음 |
| `boarding.html` | `event-home.html?eventId=&board=1` 리다이렉트만 |
| `assets/event-member-tabs.js` | 버스 탭 제거, 라벨 대회 기록 |
| `event-roster.html` | 대회 기록 UI |
| `exports.groupEventAutoScrape` | cron을 `*/10 * * * *`로 바꾸고, 세션 재시도 + **세션 객체가 한 번도 없는** 당일만 15:00 원샷 |

**하지 않음:** 신규 HTTP `action`/`subAction`, `ops.html` 당일 작업, `event-roster.html` 파일명 변경, `unknown` 종목 저장.

---

## `settings` 바디 계약 (Task 2·3 공통 — 이 표가 SSOT)

`bus-boarding` `settings`는 `enabled` boolean 필수 검사를 **제거**한다. 열린 편은 `parseSettingsOpenLeg(body)`만 본다.

| 요청 바디 | 결과 |
|---|---|
| `{ openLeg: "outbound" }` 또는 `{ openLeg: "return" }` | `applyOpenLeg(..., leg)` → `enabled: true` |
| `{ enabled: true, openLeg: "outbound"\|"return" }` | 동일 (enabled는 무시하고 openLeg가 이김) |
| `{ openLeg: null }` 또는 `{ enabled: false }` | `applyOpenLeg(..., null)` → 양쪽 끔 |
| `{ enabled: true }` (`openLeg` 없음·무효) | **400** `{ error: "openLeg required" }` |
| `{ enabled: true, openLeg: "bogus" }` | **400** |

총무 UI(`event-admin` / `boarding-admin`)는 반드시 위 표의 **성공 행**만 보낸다. `{ enabled: true }`만 보내면 안 된다.

예: 가는 편 켜기 `postBus({ subAction: "settings", openLeg: "outbound" })`. 끄기 `postBus({ subAction: "settings", openLeg: null })`.

---

### Task 1: `openLeg` 순수 함수

**Files:**
- Modify: `functions/lib/bus-boarding.js`
- Test: `scripts/test/bus-boarding.test.js`

- [ ] **Step 1: Write the failing tests**

`scripts/test/bus-boarding.test.js` 하단에:

```javascript
const {
  readOpenLeg,
  applyOpenLeg,
  assertLegOpen,
  parseSettingsOpenLeg,
} = require(path.join(__dirname, "../../functions/lib/bus-boarding.js"));

describe("openLeg", () => {
  it("enabled true without openLeg reads as off", () => {
    assert.equal(readOpenLeg({ enabled: true, roster: [] }), null);
  });
  it("applyOpenLeg outbound sets enabled true", () => {
    const bb = applyOpenLeg({ enabled: false }, "outbound");
    assert.equal(bb.openLeg, "outbound");
    assert.equal(bb.enabled, true);
  });
  it("applyOpenLeg null clears both", () => {
    const bb = applyOpenLeg({ openLeg: "outbound", enabled: true }, null);
    assert.equal(bb.openLeg, null);
    assert.equal(bb.enabled, false);
  });
  it("turning return on replaces outbound", () => {
    const bb = applyOpenLeg({ openLeg: "outbound", enabled: true }, "return");
    assert.equal(bb.openLeg, "return");
    assert.equal(bb.enabled, true);
  });
  it("assertLegOpen only matches current leg", () => {
    const bb = { openLeg: "outbound", enabled: true };
    assert.equal(assertLegOpen(bb, "outbound"), true);
    assert.equal(assertLegOpen(bb, "return"), false);
    assert.equal(assertLegOpen({ enabled: true }, "outbound"), false);
  });
});

describe("parseSettingsOpenLeg", () => {
  it("accepts openLeg without enabled", () => {
    assert.deepEqual(parseSettingsOpenLeg({ openLeg: "outbound" }), {
      ok: true,
      openLeg: "outbound",
    });
  });
  it("accepts enabled false or openLeg null as off", () => {
    assert.deepEqual(parseSettingsOpenLeg({ enabled: false }), {
      ok: true,
      openLeg: null,
    });
    assert.deepEqual(parseSettingsOpenLeg({ openLeg: null }), {
      ok: true,
      openLeg: null,
    });
  });
  it("rejects enabled true without openLeg", () => {
    const r = parseSettingsOpenLeg({ enabled: true });
    assert.equal(r.ok, false);
    assert.match(r.error, /openLeg required/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/test/bus-boarding.test.js`

Expected: FAIL (`readOpenLeg is not a function`)

- [ ] **Step 3: Write minimal implementation**

`functions/lib/bus-boarding.js`에 추가하고 `module.exports`에 넣는다:

```javascript
function readOpenLeg(busBoarding) {
  if (!busBoarding || typeof busBoarding !== "object") return null;
  const leg = busBoarding.openLeg;
  if (leg === "outbound" || leg === "return") return leg;
  return null;
}

function applyOpenLeg(busBoarding, openLeg) {
  const bb = busBoarding && typeof busBoarding === "object"
    ? { ...busBoarding }
    : emptyBusBoarding();
  if (openLeg === "outbound" || openLeg === "return") {
    bb.openLeg = openLeg;
    bb.enabled = true;
  } else {
    bb.openLeg = null;
    bb.enabled = false;
  }
  return bb;
}

function assertLegOpen(busBoarding, leg) {
  return readOpenLeg(busBoarding) === leg;
}

function parseSettingsOpenLeg(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "openLeg required" };
  }
  if (body.enabled === false || body.openLeg === null) {
    return { ok: true, openLeg: null };
  }
  const leg = body.openLeg;
  if (leg === "outbound" || leg === "return") {
    return { ok: true, openLeg: leg };
  }
  return { ok: false, error: "openLeg required" };
}
```

`emptyBusBoarding`에 `openLeg: null`을 넣는다.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `node --test scripts/test/bus-boarding.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add functions/lib/bus-boarding.js scripts/test/bus-boarding.test.js
git commit -m "feat(bus): openLeg SSOT, 옛 enabled만 있으면 꺼짐"
```

---

### Task 2: `bus-boarding` settings / status / self-board / admin-board API

**Files:**
- Modify: `functions/index.js` (`action === "bus-boarding"` settings ~3978, status ~3891, self-board ~4053, admin-board ~4172)
- Test: `scripts/test/event-admin-prep-write.test.js`

기존 단언 `self-board and admin-board still require enabled`는 **이 Task에서 교체**한다. HTML `toggleBoard`의 `enabled !== true` 게이트는 Task 3에서 제거한다 (API와 UI를 한 번에 바꾸면 범위가 커지므로 API 먼저).

- [ ] **Step 1: Write the failing test**

`scripts/test/event-admin-prep-write.test.js` `describe("bus-boarding API gates")`에:

```javascript
it("settings uses parseSettingsOpenLeg, not enabled-boolean-only", () => {
  const src = read("functions/index.js");
  const block = subActionBlock(src, "settings");
  assert.match(block, /parseSettingsOpenLeg/);
  assert.doesNotMatch(block, /enabled \(boolean\) required/);
});
it("self-board uses assertLegOpen not only assertEnabled", () => {
  const src = read("functions/index.js");
  const block = subActionBlock(src, "self-board");
  assert.match(block, /assertLegOpen/);
  assert.doesNotMatch(block, /assertEnabled/);
});
it("admin-board does not require enabled or openLeg", () => {
  const src = read("functions/index.js");
  const block = subActionBlock(src, "admin-board");
  assert.doesNotMatch(block, /assertEnabled/);
  assert.doesNotMatch(block, /assertLegOpen/);
  assert.match(block, /ensureBusBoarding/);
});
```

기존 `it("self-board and admin-board still require enabled")`는 **삭제**.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/test/event-admin-prep-write.test.js`

Expected: FAIL (no `parseSettingsOpenLeg` in settings)

- [ ] **Step 3: Wire index.js**

- `settings`: `typeof body.enabled !== "boolean"` 블록을 지운다. `const parsed = busBoardingLib.parseSettingsOpenLeg(body); if (!parsed.ok) return res.status(400).json({ ok: false, error: parsed.error });` 후 `applyOpenLeg(bb, parsed.openLeg)` 저장.
- `status` JSON에 `openLeg: readOpenLeg(bb)`. `enabled`는 `readOpenLeg(bb) != null` (applyOpenLeg와 동기). 공개 명단 숨김은 기존처럼 `!enabled`.
- `self-board`: `assertEnabled` 대신 `assertLegOpen(bb, leg)`. 아니면 403 `bus boarding not enabled`.
- `admin-board`: `assertEnabled` 제거. `ensureBusBoarding`만. 총무는 스위치 꺼져 있어도 체크.

- [ ] **Step 4: Run tests**

Run: `node --test scripts/test/bus-boarding.test.js scripts/test/event-admin-prep-write.test.js`

Expected: PASS. `boarded toggle still requires boarding on` HTML 테스트는 아직 PASS (Task 3에서 뒤집음).

- [ ] **Step 5: Commit**

```bash
git add functions/index.js scripts/test/event-admin-prep-write.test.js
git commit -m "feat(bus): settings/status/self-board가 openLeg를 쓴다"
```

---

### Task 3: 총무 편 스위치 · QR 하나 · 소스/스크랩 잠금 해제 · 체크리스트 · admin-board UI

**Files:**
- Modify: `event-admin.html` (`toggleBoard`, QR, 스위치, `owner-writable`)
- Modify: `boarding-admin.html` (`enableBoarding` 바디, `toggleBoard`)
- Test: `scripts/test/event-admin-prep-write.test.js`
- Test: `scripts/test/group-event-entry.test.js` (`qr-img-return` 단언 교체)

- [ ] **Step 1: Failing HTML tests**

`event-admin-prep-write.test.js`:

```javascript
it("has separate outbound and return boarding toggles", () => {
  const html = read("event-admin.html");
  assert.match(html, /id="bus-toggle-outbound"/);
  assert.match(html, /id="bus-toggle-return"/);
  assert.doesNotMatch(html, /id="enable-btn"/);
  assert.doesNotMatch(html, /id="bus-toggle-btn"/);
});
it("boarded toggle works while boarding is off", () => {
  const toggleFn = extractFn(html, "toggleBoard");
  assert.doesNotMatch(toggleFn, /enabled !== true/);
});
it("event-admin settings never posts enabled true without openLeg", () => {
  const html = read("event-admin.html");
  assert.doesNotMatch(html, /function enableBoarding/);
  const setFn = extractFn(html, "setOpenLeg") + extractFn(html, "clearOpenLeg");
  assert.match(setFn, /openLeg/);
  assert.doesNotMatch(setFn, /enabled:\s*true/);
});
```

기존 `it("boarded toggle still requires boarding on")`는 **삭제**하고 위 테스트로 교체.

`boarding-admin.html`도 같은 `toggleBoard` 단언을 추가한다 (`extractFn`로). `enableBoarding`는 `openLeg: "outbound"`(또는 현재 탭)를 보낸다. `{ enabled: true, legs: [...] }`만 있으면 FAIL.

`group-event-entry.test.js`의 `event-admin folds return-bus QR`을 교체:

```javascript
it("event-admin has one participant QR without leg query", () => {
  const html = readHtml("event-admin.html");
  assert.match(html, /id="qr-img"/);
  assert.doesNotMatch(html, /id="qr-img-return"/);
  assert.doesNotMatch(html, /<details class="qr-return-details">/);
  assert.match(html, /event-home\.html/);
  assert.match(html, /board=1/);
  assert.doesNotMatch(html, /leg=return/);
  assert.doesNotMatch(html, /participantUrl\("return"\)/);
});
```

추가:

```javascript
it("source and scrape are not owner-only", () => {
  const html = read("event-admin.html");
  assert.doesNotMatch(html, /id="owner-scrape-hint"/);
  assert.doesNotMatch(html, /class="owner-writable"/);
});
it("shows day checklist", () => {
  assert.match(read("event-admin.html"), /id="ops-checklist"/);
});
```

- [ ] **Step 2: Run to fail**

Run: `npm run test:event-admin`

Expected: FAIL (`bus-toggle-outbound` 없음, `qr-img-return` 아직 있음)

- [ ] **Step 3: Implement UI**

지금 `event-admin.html`에는 `enable-btn`(버스 탑승 시작) + `bus-toggle-btn`(켜기/끄기) + `enableBoarding()`가 `{ enabled: true, legs: ["outbound", "return"] }`를 보낸다. Task 2 이후 이 바디는 400이다. **이 경로를 삭제**하고 편 스위치만 남긴다.

- `id="enable-btn"`, `id="bus-toggle-btn"`, `function enableBoarding` 삭제. `disableBoarding`는 `openLeg: null` 또는 `{ enabled: false }`만 (둘 다 허용).
- `bus-toggle-outbound` / `bus-toggle-return` → `setOpenLeg("outbound"|"return")` / `clearOpenLeg()`. 켜면 `postBus({ subAction: "settings", openLeg })` — **`enabled: true` 키를 넣지 말 것.** 같은 편을 다시 누르면 `openLeg: null`.
- QR·링크: `event-home.html?eventId={id}&board=1` 하나. `qr-img-return` details 삭제.
- `owner-writable` / `owner-scrape-hint` / `setOwnerWritableUi` 제거. 총무 로그인이면 소스·스크랩 활성 (`isOpsAdmin`은 owner|operator 이미 true).
- `#ops-checklist` 8항 (소스, 가는 켜기/끄기, 오는 켜기/끄기, 스크랩 시작/종료, 안 뜬 기록). 상태는 `openLeg`·`groupScrapeSession`으로 체크 표시. **스크랩 종료 버튼은 Task 11** (`stop: true` 백엔드와 같이).
- `event-admin.html` **and** `boarding-admin.html` `toggleBoard`: `if (enabled !== true) return;` 삭제. API는 이미 허용.
- `boarding-admin.html` `enableBoarding`: `openLeg: "outbound"` (또는 현재 탭). `{ enabled: true, legs: [...] }`만 보내면 400.

- [ ] **Step 4: Tests pass**

Run: `npm run test:event-admin`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(event-admin): 편별 탑승 스위치, QR 하나, 총무 스크랩"
```

---

### Task 4: 탭 `홈 | 대회 기록`

**Files:**
- Modify: `assets/event-member-tabs.js`
- Modify: `event-home.html`, `event-roster.html` 탭 마크업
- Test: `scripts/test/event-member-tabs.test.js` (버스 탭 테스트 삭제/교체)
- Test: `scripts/test/event-member-copy.test.js` 필요 시

- [ ] **Step 1: Replace tab tests**

```javascript
it("mounts home and roster only, roster label is 대회 기록", () => {
  const tabs = { home: fakeTab(), roster: fakeTab() };
  const bar = fakeBar(tabs);
  mount({ eventId: "evt_x", active: "home", barEl: bar });
  assert.equal(tabs.home.href, "event-home.html?eventId=evt_x");
  assert.equal(tabs.roster.href, "event-roster.html?eventId=evt_x");
});
it("does not require a bus tab", () => {
  const tabs = { home: fakeTab(), roster: fakeTab() };
  const bar = fakeBar(tabs);
  assert.doesNotThrow(() => mount({ eventId: "evt_x", active: "roster", barEl: bar }));
});
```

기존 `browse bus tab` / `QR-locked bus tab` 테스트는 **삭제**. HTML 탭 라벨 grep: `대회 기록`, 버스 탭 없음.

- [ ] **Step 2: Run fail** (버스 href 단언이 남아 있으면 그 테스트부터 지우고 새 테스트 FAIL 확인)

- [ ] **Step 3: `mount`에서 `tabs.bus` 분기를 제거.** HTML에서 버스 탭 마크업 삭제. 라벨 `대회 기록`. `boarding.html`은 Task 12에서 리다이렉트.

- [ ] **Step 4:** `npm run test:event-home`

- [ ] **Step 5: Commit** `fix(tabs): 버스 탭 제거, 대회 기록`

---

### Task 5: `public-roster` 확정·DNS/DNF만

**Files:**
- Modify: `functions/lib/public-roster.js`
- Modify: `functions/index.js` public-roster (count)
- Test: `scripts/test/public-roster.test.js`

- [ ] **Step 1: Rewrite every fixture that expects an unconfirmed `hasResult: false` row**

`scripts/test/public-roster.test.js` 첫 테스트는 지금 `rows.length === 2` 이고 키에 `dnStatus`가 없다. 미확정 행을 빼면 **length 1**, 키에 `dnStatus`가 들어간다.

`참가자 distance가 있으면 다른 종목 확정 기록에 붙이지 않는다`는 지금 `rows[0].hasResult === false`를 기대한다. 새 계약은 **행이 0건**.

`filterPublicRosterRows` / `sortPublicRosterRows` 픽스처의 `hasResult: false` 동탄치타·C는 DNS 행으로 바꾸거나 목록에서 뺀다. 기록 빠른 순: 시각 오름차순 → DNS/DNF → 닉.

`buildPublicRosterRows`가 미확정을 빼고, DNS 행을 넣도록:

```javascript
it("drops unconfirmed participants", () => {
  const confirmed = new Map([
    ["김A_half", { status: "confirmed", netTime: "1:42:18", pbConfirmed: true, distance: "half" }],
  ]);
  const rows = buildPublicRosterRows(
    [
      { nickname: "게살볶음밥", realName: "김A", distance: "half" },
      { nickname: "동탄치타", realName: "김B", distance: "full" },
    ],
    confirmed,
    normalizeRaceDistance
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nickname, "게살볶음밥");
  assert.equal(rows[0].dnStatus, null);
});

it("includes DNS case-insensitive", () => {
  const confirmed = new Map([
    ["김C_10K", { status: "dns", distance: "10K" }],
  ]);
  const rows = buildPublicRosterRows(
    [{ nickname: "DNS러", realName: "김C", distance: "10K" }],
    confirmed,
    normalizeRaceDistance
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dnStatus, "DNS");
  assert.equal(rows[0].netTime, null);
  assert.equal(rows[0].hasResult, true);
});
```

- [ ] **Step 2: Run `npm run test:public-roster` — FAIL** (length 2 vs 1)

- [ ] **Step 3: Filter in `buildPublicRosterRows`:** 확정 완주 또는 dns/dnf만 push. 행에 `dnStatus`. `sortPublicRosterRows` result: 시각 있는 행 먼저 오름차순, 그다음 DNS/DNF, 닉.

- [ ] **Step 4: Tests pass.** `index.js`의 `totalCount`를 필터 후 길이에 맞춘다. UI는 기록 N명만.

- [ ] **Step 5: Commit** `feat(roster): 공개 대회 기록은 확정·DNS/DNF만`

---

### Task 6: `event-roster.html` 카피·빈 상태

**Files:**
- Modify: `event-roster.html`
- Test: `scripts/test/event-member-copy.test.js` 또는 HTML grep 테스트 신규 `scripts/test/event-roster-shell.test.js`

- [ ] **Step 1: Failing grep**

```javascript
it("member roster page is labeled 대회 기록", () => {
  const html = read("event-roster.html");
  assert.match(html, />대회 기록</);
  assert.doesNotMatch(html, /명단·결과/);
  assert.match(html, /아직 확정된 기록이 없어요/);
  assert.match(html, /해당하는 기록이 없어요/);
});
```

- [ ] **Step 2–4:** title/h1 폴백, 요약 `기록 N명`, 빈 문구 두 가지(전체 0 vs 필터 0), 칩 순서 `full,half,10K,5K,3K,30K,32K,ultra` 중 존재하는 것만. `probeBus` 삭제.

- [ ] **Step 5: Commit** `feat(roster): 회원 화면을 대회 기록으로`

---

### Task 7: 홈 카드 상태 기계

**Files:**
- Modify: `assets/event-home-action.js`
- Test: `scripts/test/event-home-action.test.js` — `resolveNextAction` 단언을 `resolveProfileCard`/`resolveBusCard`로 교체. `pageHref("boarding"…)` 단언은 **삭제** (홈은 페이지 이동 없이 `self-board`).

`PROFILE_DISTANCES = ["full","half","10K","5K","3K","30K","32K","ultra"]`

프로필 `state`: `bib` | `wait` | `pending` | `manual` | `confirmed` | `guest`

- [ ] **Step 1: Failing tests (examples)**

```javascript
const { resolveProfileCard, resolveBusCard, PROFILE_DISTANCES } = require("...");

it("profile distances put full half 10K first", () => {
  assert.deepEqual(PROFILE_DISTANCES.slice(0, 3), ["full", "half", "10K"]);
  assert.ok(!PROFILE_DISTANCES.includes("unknown"));
});

it("no bib → profile bib", () => {
  const p = resolveProfileCard({
    participant: { bib: "", distance: "" },
    confirmMode: "none",
    isGuest: false,
  });
  assert.equal(p.state, "bib");
  assert.match(p.prompt, /배번과 종목을 넣어 주세요/);
  assert.doesNotMatch(p.prompt, /먼저/);
});

it("bib+distance no result → wait with large bib", () => {
  const p = resolveProfileCard({
    participant: { bib: "4821", distance: "half" },
    confirmMode: "none",
  });
  assert.equal(p.state, "wait");
  assert.match(p.prompt, /기록이 올라오면 여기서 확인해요/);
  assert.equal(p.showManual, true);
  assert.equal(p.largeBib, true);
});

it("pending → confirm with pb", () => {
  const p = resolveProfileCard({
    participant: { bib: "4821", distance: "half" },
    confirmMode: "pending",
  });
  assert.equal(p.state, "pending");
  assert.equal(p.showPb, true);
  assert.equal(p.showManual, true);
});

it("아니에요 → bib edit, not manual", () => {
  const p = resolveProfileCard({
    participant: { bib: "4821", distance: "half" },
    confirmMode: "pending",
    intent: "reject",
  });
  assert.equal(p.state, "bib");
  assert.equal(p.showManual, false);
});

it("직접 입력 → manual; finish has PB, DNS does not", () => {
  const finish = resolveProfileCard({
    participant: { bib: "4821", distance: "half" },
    confirmMode: "none",
    intent: "manual",
    manualKind: "finish",
  });
  assert.equal(finish.state, "manual");
  assert.equal(finish.showPb, true);
  const dns = resolveProfileCard({
    participant: { bib: "4821", distance: "half" },
    intent: "manual",
    manualKind: "dns",
  });
  assert.equal(dns.showPb, false);
});

it("confirmed → copy only, no extra CTA", () => {
  const p = resolveProfileCard({
    participant: { bib: "4821", distance: "half" },
    confirmMode: "confirmed",
  });
  assert.equal(p.state, "confirmed");
  assert.match(p.prompt, /끝\. 동마클 대회 기록에 저장됐어요/);
  assert.equal(p.ctaLabel, null);
  assert.equal(p.ctaHref, null);
  assert.equal(p.secondaryHref, null);
  assert.equal(p.showManual, false);
});

it("guest has no profile confirm", () => {
  const p = resolveProfileCard({ isGuest: true, participant: null });
  assert.equal(p.state, "guest");
  assert.match(p.prompt, /지인 탑승은 대회 기록에 남지 않아요/);
});

it("bus ready independent of missing bib", () => {
  const b = resolveBusCard({
    openLeg: "outbound",
    busRow: { rideType: "roundtrip", legs: { outbound: { required: true, boarded: false }, return: { required: true, boarded: false } } },
  });
  assert.equal(b.state, "ready");
  assert.equal(b.leg, "outbound");
});

it("outbound_only does not get return CTA", () => {
  const b = resolveBusCard({
    openLeg: "return",
    busRow: { legs: { outbound: { required: true, boarded: true }, return: { required: false, boarded: false } } },
  });
  assert.notEqual(b.state, "ready");
});

it("no roster row → ask treasurer", () => {
  const b = resolveBusCard({ openLeg: "outbound", busRow: null });
  assert.equal(b.state, "missing");
  assert.match(b.prompt, /버스 명단/);
});

it("openLeg null and outbound required → locked, not time", () => {
  const b = resolveBusCard({
    openLeg: null,
    busRow: { legs: { outbound: { required: true, boarded: false }, return: { required: true, boarded: false } } },
  });
  assert.equal(b.state, "locked");
  assert.match(b.prompt, /가는 버스 탑승 시간이 아닙니다/);
});

it("QR pick lists roster required for openLeg, including guests", () => {
  const nicks = pickNicknames({
    boardLanding: true,
    openLeg: "outbound",
    participants: [{ nickname: "기록만회원" }],
    roster: [
      { nickname: "가는지인", isGuest: true, legs: { outbound: { required: true, boarded: false } } },
      { nickname: "오는만", legs: { outbound: { required: false }, return: { required: true } } },
    ],
  });
  assert.deepEqual(nicks, ["가는지인"]);
});

it("normal pick unions participants and roster", () => {
  const nicks = pickNicknames({
    boardLanding: false,
    participants: [{ nickname: "회원A" }],
    roster: [{ nickname: "지인B", isGuest: true }],
  });
  assert.ok(nicks.includes("회원A"));
  assert.ok(nicks.includes("지인B"));
});
```

`pickNicknames`를 `event-home-action.js`에서 export. 기존 `resolveNextAction` / `all_done` / `명단·결과` / `pageHref("boarding")` / `pageHref("boardingReturn")` 테스트는 **삭제**. `pageHref("home"|"roster")`만 남기거나 `pageHref` 자체를 홈이 안 쓰면 삭제.

버스 상태 표는 스펙 7.3.

- [ ] **Step 2: Fail** `npm run test:event-home`

- [ ] **Step 3: Implement resolvers.** `resolveNextAction`은 테스트가 더 이상 import하지 않으면 삭제. `event-home.html`이 아직 `resolveNextAction`을 부르면 Task 8에서 갈아끼우기 전까지 깨지지 않게, Task 7에서는 모듈 export만 추가하고 HTML은 Task 8에서 전환해도 된다. 그 경우 Task 7 테스트는 새 함수만 import.

- [ ] **Step 4: Pass**

- [ ] **Step 5: Commit** `feat(event-home): 프로필·버스 카드 상태 기계`

---

### Task 8: `event-home.html` 두 카드 + `&board=1`

**Files:**
- Modify: `event-home.html`, `assets/event-member-shell.css`
- Test: `scripts/test/event-home-pick.test.js` — `today-cta` 단언이 깨지면 프로필/버스 CTA 셀렉터로 교체
- Test: `scripts/test/event-home-action.test.js`는 Task 7에서 이미 카드 상태 커버

**6.5 / 아니에요는 HTML에서도 막는다.** 상태 기계만 바꾸고 렌더러가 `all_done` 명단 CTA나 아니에요→수동을 열면 스펙 위반.

- [ ] **Step 1: Failing**

`scripts/test/event-home-pick.test.js`의 `it("shows return-bus secondary while confirm is pending")`는 `renderTodayCard` + `boardingReturn|secondaryHref`를 요구한다. **이 테스트를 삭제**하고 아래 grep으로 교체한다. 남기면 프로필 카드에 버스/기록 CTA가 다시 붙는다.

```javascript
it("home has profile and bus cards", () => {
  const html = read("event-home.html");
  assert.match(html, /id="profileCard"/);
  assert.match(html, /id="busCard"/);
  assert.match(html, /id="boardDoneOverlay"/);
  assert.doesNotMatch(html, /명단·결과/);
  assert.doesNotMatch(html, /function renderTodayCard/);
});
it("아니에요 does not auto-open manual", () => {
  const html = read("event-home.html");
  assert.match(html, /아니에요/);
  const reject = html.match(/아니에요[\s\S]{0,800}/)[0];
  assert.doesNotMatch(reject, /intent:\s*["']manual["']/);
  assert.match(html, /intent:\s*["']reject["']/);
});
it("confirmed profile has no roster CTA", () => {
  const html = read("event-home.html") + read("assets/event-home-action.js");
  assert.match(html, /동마클 대회 기록에 저장됐어요/);
  assert.doesNotMatch(html, /명단·결과 보기/);
  assert.doesNotMatch(html, /대회 기록 보기/);
});
it("pick list uses roster not participants-only", () => {
  const pick = extractFn(read("event-home.html"), "renderPickList");
  assert.match(pick, /pickNicknames/);
  assert.match(pick, /roster/);
});
```

- [ ] **Step 2–4:**
  - 닉 선택 후 두 카드. 지인은 프로필 자리에 한 줄.
  - **식별 목록 SSOT는 `busBoarding.roster` ∪ `participants`.** 지금 `renderPickList`는 `event.participants`만이라 지인이 고를 수 없다. `pickNicknames` 사용. `?board=1`이고 닉 없으면 열린 편 `required`인 버스 명단만.
  - 저장 닉이 지인이면 프로필 `guest`, 버스만. 회원이면 프로필+버스. `matchInList(roster)`로 `busRow`, `matchInList(participants)`로 회원 행.
  - 배번+종목 칩 (`PROFILE_DISTANCES` 순). `update-bib`에 `distance`. 배번·시각 input에 `compositionstart`/`compositionend` (한글 IME, 닉 검색과 동일).
  - wait: 배번·종목 크게, 수정 작게, 직접 입력 작게.
  - pending: 맞아요/아니에요, PB 체크(기본 꺼짐), 직접 입력. **아니에요 → `intent: "reject"` (배번 폼). `intent: "manual"` 금지.**
  - 수동: `직접 입력`만 `intent: "manual"`. 시각 또는 DNS/DNF → `self-confirm`. 완주만 PB.
  - confirmed: 문구만. CTA·링크 없음. `resolveNextAction`/`all_done`/`secondaryHref: "roster"` 호출 금지.
  - 버스 카드는 **항상** 그린다. `EventHomeBadges.busLauncherVisible` (`enabled === true`)으로 숨기지 않음. `openLeg === null`이면 `locked`.
  - 버스 탑승하기: 페이지 이동 없이 `self-board` `{ leg: openLeg }`. **이번에 성공했을 때만** `#boardDoneOverlay` 큰 「가는/오는 버스 탑승 완료」 후 ~2초 숨김. 이미 탔으면 오버레이 없이 완료 카드.
  - `?board=1`: 저장된 닉 + `openLeg` required 미탑승이면 같은 `self-board`. `?leg=` 쿼리는 무시, 편은 `openLeg`.
  - `loadBusRow`: **detail의 `event.busBoarding.roster`** (enabled 꺼져 있어도). public status 명단은 쓰지 않음.
  - 카피: 「먼저」 없음. 닉 선택 서브는 대회 기록 PRD대로 **참가자에서 본인 닉네임을 선택하세요**.

- [ ] **Step 5: Commit** `feat(event-home): 프로필·버스 카드와 QR 탑승 랜딩`

---

### Task 9: `update-bib` canonical distance만

**Files:**
- Modify: `functions/index.js` `subAction === "update-bib"` (~3805)
- Create: `functions/lib/update-bib-fields.js`
- Test: `scripts/test/update-bib-distance.test.js`

**이 Task에서는 즉시 스크랩을 넣지 않는다.** `isSessionActive`는 Task 11 파일에 있다. 1명 스크랩은 Task 11에서 같은 헬퍼로 연결한다.

```javascript
function normalizeBibDistance(distance) {
  const d = normalizeRaceDistance(distance);
  if (!d || d === "unknown" || !isCanonicalRaceDistance(d)) {
    return { ok: false, error: "canonical distance required" };
  }
  return { ok: true, distance: d };
}
```

홈은 항상 distance를 보낸다. `my-bib.html`이 distance 생략하면 **기존처럼 배번만**. body에 `distance`가 있으면 canonical만 저장, `unknown`/빈 값 400.

- [ ] TDD the helper, wire index.js, commit `feat(bib): update-bib가 canonical distance를 저장`

---

### Task 10: `self-confirm` PB · 수동 DNS/DNF/시각

**Files:**
- Modify: `functions/lib/self-confirm.js`, `functions/index.js` self-confirm
- Test: `scripts/test/self-confirm.test.js`

- [ ] **Step 1:**

```javascript
it("pbConfirmed from participant wins", () => {
  const row = buildSelfConfirmRow({
    canonicalEventId: "evt1",
    event: { eventDate: "2026-09-05", eventName: "철원" },
    participant: { realName: "김테스트", nickname: "닉", bib: "1", distance: "half", pbConfirmed: true },
    pending: { bib: "1", netTime: "1:00:00" },
  });
  assert.equal(row.pbConfirmed, true);
});

it("manual finish allows PB; DNS does not", () => {
  const finish = buildSelfConfirmRow({
    canonicalEventId: "evt1",
    event: { eventDate: "2026-09-05", eventName: "철원" },
    participant: { realName: "김테스트", nickname: "닉", bib: "1", distance: "half", netTime: "1:42:00", pbConfirmed: true },
    pending: null,
    allowManual: true,
  });
  assert.equal(finish.source, "manual");
  assert.equal(finish.pbConfirmed, true);
  const dns = buildSelfConfirmRow({
    canonicalEventId: "evt1",
    event: { eventDate: "2026-09-05", eventName: "철원" },
    participant: { realName: "김테스트", nickname: "닉", bib: "1", distance: "half", dnStatus: "DNS" },
    pending: null,
    allowManual: true,
  });
  assert.equal(dns.status, "dns");
  assert.equal(dns.pbConfirmed, false);
});
```

`buildSelfConfirmRow`는 지금 `assertBibOwnsPending`을 항상 호출한다. `allowManual`이면 pending 없이 `participant.netTime` 또는 `dnStatus`.

index.js: body `pbConfirmed`, `netTime`, `dnStatus`를 participant에 복사한 뒤 `buildSelfConfirmRow`. 지인/비참가자 403. 매칭 없으면 수동 필드가 있을 때 **기존 `groupScrapeJobId`/pending 400을 건너뛰고** upsert (스크랩이 한 번도 없어도 6.4).

- [ ] **Step 5: Commit** `feat(confirm): 회원 PB와 수동 DNS/DNF/시각`

---

### Task 11: 스크랩 세션

**Files:**
- Create: `functions/lib/group-scrape-session.js`
- Modify: `functions/index.js` scrape handler (`~3269`), `update-bib` (~3805), `exports.groupEventAutoScrape` (`~1097`, 지금 cron은 `0 15 * * *`)
- Modify: `event-admin.html` (`scrape-stop-btn`)
- Test: `scripts/test/group-scrape-session.test.js`
- `package.json` `test:group-scrape-bib` 또는 `test:event-admin`에 세션 테스트 추가

상수: `INTERVAL_MS = 10 * 60 * 1000`, `WINDOW_MS = 6 * 60 * 60 * 1000`

**세션 있음 = `groupScrapeSession.startedAt`이 있는 객체.** 종료해도 객체를 지우지 않는다. `until`만 지금으로 당긴다. 지우면 15:00 원샷이 다시 풀스크랩한다.

```javascript
function startSession(nowMs) {
  return {
    startedAt: new Date(nowMs).toISOString(),
    until: new Date(nowMs + WINDOW_MS).toISOString(),
    intervalMinutes: 10,
  };
}
function stopSession(session, nowMs) {
  const base = session && typeof session === "object" ? { ...session } : startSession(nowMs);
  base.until = new Date(nowMs).toISOString();
  return base;
}
function hasEverStartedSession(session) {
  return !!(session && session.startedAt);
}
function isSessionActive(session, nowMs) {
  if (!hasEverStartedSession(session) || !session.until) return false;
  return nowMs < Date.parse(session.until);
}
function pickRetryParticipants(participants, jobResults, confirmedKeys) {
  // bib 있고, jobResults에 유효 완주 없고, race_results 확정(완주/dns/dnf) 아님
}
function decideAutoScrapeTick(event, nowMs, kstHour, kstMinute) {
  const session = event && event.groupScrapeSession;
  if (isSessionActive(session, nowMs)) {
    if (event.groupScrapeStatus === "running") return "skip";
    return "session-retry";
  }
  if (hasEverStartedSession(session)) return "skip";
  if (kstHour !== 15 || kstMinute >= 10) return "skip";
  if (event.groupScrapeStatus === "done" || event.groupScrapeStatus === "running") return "skip";
  return "oneshot";
}
```

테스트 필수:

```javascript
it("active session retries even if groupScrapeStatus is done", () => {
  const session = startSession(0);
  assert.equal(
    decideAutoScrapeTick({ groupScrapeSession: session, groupScrapeStatus: "done" }, 60_000, 15, 0),
    "session-retry"
  );
});
it("stopped session never oneshots at 15:00", () => {
  const session = stopSession(startSession(0), 1);
  assert.equal(
    decideAutoScrapeTick({ groupScrapeSession: session, groupScrapeStatus: "done" }, 2, 15, 0),
    "skip"
  );
});
it("no session object oneshots at 15:00", () => {
  assert.equal(
    decideAutoScrapeTick({ groupScrapeStatus: "pending" }, 0, 15, 0),
    "oneshot"
  );
});
it("no session object skips outside 15:00", () => {
  assert.equal(
    decideAutoScrapeTick({ groupScrapeStatus: "pending" }, 0, 14, 0),
    "skip"
  );
});
it("running active session skips the tick", () => {
  const session = startSession(0);
  assert.equal(
    decideAutoScrapeTick({ groupScrapeSession: session, groupScrapeStatus: "running" }, 60_000, 10, 0),
    "skip"
  );
});
it("pickRetry skips finishers and confirmed DNS", () => {
  const retry = pickRetryParticipants(
    [
      { realName: "완주", bib: "1", distance: "half" },
      { realName: "DNS", bib: "2", distance: "half" },
      { realName: "미완", bib: "3", distance: "half" },
    ],
    [{ bib: "1", netTime: "1:40:00" }],
    new Set(["DNS_half"])
  );
  assert.deepEqual(retry.map((p) => p.bib), ["3"]);
});
```

`groupEventAutoScrape` 루프의 기존 `if (event.groupScrapeStatus === "done" || event.groupScrapeStatus === "running") continue;` 를 **삭제**하고 `decideAutoScrapeTick`만 쓴다. 그 가드를 남기면 첫 스크랩 이후 세션 재시도가 전부 skip이다. `session-retry` 전에 `groupScrapeJobId`로 `scrape_jobs.results`와 확정 `race_results` 키를 읽어 `pickRetryParticipants`에 넘긴다.

- scrape POST: **`stop: true`를 소스/참가자/`running`/배번0 검사보다 앞에 둔다.** 아니면 틱 도중에 종료하면 400. `groupScrapeSession = stopSession(...)` (객체 유지, `startedAt` 유지). 스크랩을 시작하지 않음.
- scrape POST 시작: 기존 스크랩 + `groupScrapeSession = startSession`. `running`이면 기존처럼 400 — **세션 문서는 건드리지 않음.** 시작 버튼이 `stop` 없이 다시 호출되면 **새 창**을 연다 (`startSession`). 종료는 반드시 `stop: true`.
- `update-bib` (Task 9에서 distance만 저장함): 저장 후 `isSessionActive(event.groupScrapeSession, Date.now())` && `groupScrapeStatus !== "running"`이면 그 참가자 1명으로 `triggerGroupScrape`. running이면 bib만 저장. 세션 없으면 소스에 안 침. `index.js`에서 `require("./lib/group-scrape-session")` 한 구현만 쓴다.
- `event-admin.html`: `scrapeGroupEvent()`는 start만 유지. **`id="scrape-stop-btn"`** 추가, `{ subAction: "scrape", ownerPw, canonicalEventId, stop: true }`. 체크리스트 7항과 연결. `group-detail.html`는 만지지 않아도 됨.
- `groupEventAutoScrape` schedule을 `"*/10 * * * *"` 로 변경 (`timeZone: "Asia/Seoul"` 유지). 루프에서 `decideAutoScrapeTick` 후 `session-retry`면 `pickRetryParticipants`로 `triggerGroupScrape`, `oneshot`이면 기존 풀 bib 대상.

테스트 grep: `event-admin.html`에 `scrape-stop-btn`과 `stop:\s*true`.

Commit `feat(scrape): 총무 세션 시작 후 미완주만 재시도`

---

### Task 12: `boarding.html` 리다이렉트

**Files:**
- Modify: `boarding.html` — 본문 UI 삭제, `eventId` 읽어 `event-home.html?eventId=&board=1`로 `location.replace`
- Rewrite: `scripts/test/event-boarding-shell.test.js` (리스트/실명/배너 테스트 삭제)
- `scripts/test/event-boarding-flow.test.js`가 옛 UI를 보면 홈 오버레이/리다이렉트에 맞게 축소하거나 skip

- [ ] **Step 1: New tests**

```javascript
it("redirects old QR to home board=1", () => {
  const html = read("boarding.html");
  assert.match(html, /event-home\.html/);
  assert.match(html, /board=1/);
  assert.doesNotMatch(html, /id="confirmRecordBanner"/);
  assert.doesNotMatch(html, /이어서 배번 입력/);
});
```

- [ ] **Step 2–4:** 최소 HTML + 스크립트. `event-boarding-flow.js`는 홈 오버레이가 대체하면 호출처 없을 수 있음. 홈에서 안 쓰면 테스트에서 참조 제거 후 파일은 남겨도 됨 (YAGNI: 홈에 필요한 순수 함수만 `event-home-action`으로).

- [ ] **Step 5: Commit** `feat(boarding): 옛 QR을 홈 탑승 랜딩으로`

---

### Task 13: 총무 미입력자 수동 기록

**Files:**
- Modify: `event-admin.html` 스크랩 패널
- Test: HTML grep `confirm-one` / `data-dnStatus` / `netTime`

지금 `gapRows`는 카운트만, `#bib-missing-list`는 배번 미입력이다. **확정 없는 참가자 행**을 스크랩 패널에 새로 그린다 (`gapStatus !== "ok"` 또는 확정 맵에 없는 사람).

`group-detail.html`과 같은 POST (신규 API 없음):

```javascript
{
  subAction: "confirm-one",
  canonicalEventId: eventId,
  confirmSource: "operator",
  participant: {
    realName: gap.realName,
    nickname: gap.nickname,
    distance: gap.distance,
    dnStatus: "DNS", // 또는 "DNF", 또는 netTime: "1:42:00"
  },
}
```

체크리스트 8항과 연결. Commit `feat(event-admin): 총무 수동 DNS/DNF/시각`

---

### Task 14: 카피·회귀 묶음

**Files:** 남은 「명단·결과」 (`assets/event-home-action.js`, mockup은 범위 밖이어도 회원 경로만)

- [ ] `rg '명단·결과' --glob '*.html' --glob 'assets/event-*.js'` 회원 파일 0건 (`event-home.html`, `event-roster.html`, `boarding.html`, `assets/event-home-action.js`, `assets/event-member-copy.js`, `assets/event-member-tabs.js`)
- [ ] `npm run test:event-home && npm run test:event-admin && npm run test:self-confirm && npm run test:public-roster && npm run test:group-scrape-bib`
- [ ] `bash scripts/pre-deploy-test.sh` — 실패하면 시나리오를 새 계약에 맞게 수정 (QR URL `event-home.html`+`board=1`, 탭, `enabled`/`openLeg`, 오너 전용 스크랩 단언이 있으면 총무 비번으로).

Commit `test: 홈·기록·버스 회귀를 새 IA에 맞춤`

---

## 구현 시 주의

- `firebase deploy` 하지 않음.
- `update-bib`에 스크랩을 넣어도 subAction 이름은 그대로.
- 배포 후 총무가 `openLeg`를 다시 켠다 (스펙 §13). 시드/에뮬 `enabled: true`만 있는 문서는 꺼짐. **대회 도중에 이 규칙이 포함된 배포를 하지 않는다.**
- 지인은 `self-confirm`/`update-bib` 403.
- `group-detail.html` 허브의 `boarding.html?leg=outbound` 링크는 리다이렉트로 동작하므로 필수는 아님. 손대면 Task 12에서 `board=1`로 바꿔도 된다.
- `groupEventAutoScrape` cron 변경은 Functions 배포 시 Cloud Scheduler 잡이 바뀐다. HTTP API는 그대로다.
