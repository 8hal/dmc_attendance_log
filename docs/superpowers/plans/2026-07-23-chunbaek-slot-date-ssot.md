# 춘백 슬롯 dayIndex↔date SSOT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dayIndex(+config.startDate)를 SSOT로 두고, admin/import가 date를 오염시키지 못하게 하며, 읽기 경로와 감사로 재발을 막는다.

**Architecture:** `chunbaek-stats.js`에 파생 헬퍼·effective season bounds를 두고, admin 쓰기에서 date/week를 서버가 통제한다. 런타임은 파생 date를 우선해 오염된 denormalized 필드를 무시한다. verify 스크립트가 불일치를 탐지한다.

**Tech Stack:** Node.js Cloud Functions (`functions/lib/chunbaek-*.js`), `node --test` / 기존 `scripts/verify-chunbaek-stats.js`, Firestore Admin 스크립트

**Spec:** `docs/superpowers/specs/2026-07-23-chunbaek-slot-date-ssot-design.md`

---

## File map

| File | Role |
|---|---|
| `functions/lib/chunbaek-stats.js` | derive helpers, resolveSlotDate, season bounds consumers |
| `functions/lib/chunbaek-admin.js` | save-week / import write paths |
| `functions/lib/chunbaek-handlers.js` | attendance guards using season start |
| `scripts/test/chunbaek-slot-date-ssot.test.js` | unit tests for derive + payload |
| `scripts/verify-chunbaek-slot-dates.js` | production/emulator audit |
| `scripts/fix-chunbaek-slot-dates.js` | already exists on fix branch — ensure on main or re-add |

---

### Task 1: 파생 헬퍼 + 단위 테스트 (TDD)

**Files:**
- Create: `scripts/test/chunbaek-slot-date-ssot.test.js`
- Modify: `functions/lib/chunbaek-stats.js`
- Modify: `functions/lib/chunbaek-stats.js` module.exports

- [ ] **Step 1: Write failing tests**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  deriveSeasonDate,
  deriveSeasonWeek,
  deriveSlotDate,
  effectiveSeasonStart,
  effectiveSeasonEnd,
  todaySlotPayload,
  addDaysIso,
} = require("../../functions/lib/chunbaek-stats");

const config = {
  startDate: "2026-07-20",
  endDate: "2026-10-27",
  betaWeekStartDate: "2026-07-13",
  betaWeekEndDate: "2026-07-19",
};

test("deriveSeasonDate: dayIndex 1 and 100", () => {
  assert.equal(deriveSeasonDate(config, 1), "2026-07-20");
  assert.equal(deriveSeasonDate(config, 100), "2026-10-27");
});

test("deriveSeasonWeek: ceil(dayIndex/7)", () => {
  assert.equal(deriveSeasonWeek(1), 1);
  assert.equal(deriveSeasonWeek(7), 1);
  assert.equal(deriveSeasonWeek(8), 2);
});

test("deriveSlotDate prefers derived over polluted stored date", () => {
  const slot = { dayIndex: 1, week: 1, date: "2026-07-27" };
  assert.equal(deriveSlotDate(slot, config, [slot]), "2026-07-20");
});

test("todaySlotPayload ignores polluted dayIndex1 date for beforeSeason", () => {
  const slots = [
    { id: "1", dayIndex: 1, week: 1, date: "2026-07-27", isProgramOff: false },
    { id: "4", dayIndex: 4, week: 1, date: "2026-07-23", isProgramOff: false },
  ];
  const payload = todaySlotPayload(slots, {}, "2026-07-23", config);
  assert.equal(payload.beforeSeason, false);
  assert.equal(payload.startDate, "2026-07-20");
});
```

- [ ] **Step 2: Run tests — expect FAIL (exports missing)**

```bash
node --test scripts/test/chunbaek-slot-date-ssot.test.js
```

Expected: FAIL — `deriveSeasonDate` undefined / not exported

- [ ] **Step 3: Implement helpers in `chunbaek-stats.js`**

```js
function deriveSeasonDate(config, dayIndex) {
  const start = config?.startDate;
  const di = Number(dayIndex);
  if (!start || !Number.isFinite(di) || di < 1 || di > 100) return null;
  return addDaysIso(start, di - 1);
}

function deriveSeasonWeek(dayIndex) {
  const di = Number(dayIndex);
  if (!Number.isFinite(di) || di < 1) return null;
  return Math.ceil(di / 7);
}

function effectiveSeasonStart(config, slots = []) {
  if (config?.startDate) return config.startDate;
  return seasonBounds(seasonSlotsOnly(slots)).startDate;
}

function effectiveSeasonEnd(config, slots = []) {
  if (config?.endDate) return config.endDate;
  const start = effectiveSeasonStart(config, slots);
  if (start) return addDaysIso(start, 99);
  return seasonBounds(seasonSlotsOnly(slots)).endDate;
}

function deriveSlotDate(slot, config = {}, slots = []) {
  const di = slot?.dayIndex ?? Number(slot?.id);
  if (isBetaSlot(slot) && Number.isFinite(di) && di >= BETA_DAY_INDEX_BASE) {
    const bounds = betaWeekBounds(config, slots);
    if (bounds) {
      const offset = di - BETA_DAY_INDEX_BASE;
      if (offset >= 0 && offset < BETA_DAY_COUNT) {
        return addDaysIso(bounds.startDate, offset);
      }
    }
  }
  if (Number.isFinite(di) && di >= 1 && di <= 100) {
    const derived = deriveSeasonDate(config, di);
    if (derived) return derived;
  }
  return normalizeSlotDate(slot?.date) || "";
}
```

- [ ] **Step 4: Point `resolveSlotDate` at `deriveSlotDate` (keep signature)**

```js
function resolveSlotDate(slot, config = {}, slots = [], today = "") {
  const derived = deriveSlotDate(slot, config, slots);
  if (derived) return derived;
  if (today && isDateInBetaWeek(config, slots, today)) return today;
  return "";
}
```

- [ ] **Step 5: Export new helpers; run tests**

```bash
node --test scripts/test/chunbaek-slot-date-ssot.test.js
```

Expected: `todaySlotPayload` test may still FAIL until Task 2 — if so, temporarily skip that one case with `test.skip` OR implement Task 2 next before commit.

- [ ] **Step 6: Commit**

```bash
git add functions/lib/chunbaek-stats.js scripts/test/chunbaek-slot-date-ssot.test.js
git commit -m "feat(chunbaek): dayIndex→date 파생 헬퍼 + 단위 테스트"
```

---

### Task 2: 읽기 경로 — season bounds / todaySlot / findTodaySlot

**Files:**
- Modify: `functions/lib/chunbaek-stats.js` (`todaySlotPayload`, `findTodaySlot`, `statsSlotsForToday`, `buildTimelineWeeks`, `defaultWeekForAdmin`)
- Modify: `functions/lib/chunbaek-handlers.js` (attendance seasonStart guards ~630, ~793)
- Test: `scripts/test/chunbaek-slot-date-ssot.test.js`

- [ ] **Step 1: Extend tests for findTodaySlot with polluted dates**

```js
test("findTodaySlot uses dayIndex derivation when stored dates wrong", () => {
  const { findTodaySlot } = require("../../functions/lib/chunbaek-stats");
  const slots = [
    { id: "4", dayIndex: 4, week: 1, date: "2099-01-01", isProgramOff: false },
  ];
  const hit = findTodaySlot(slots, "2026-07-23", config);
  assert.ok(hit);
  assert.equal(hit.dayIndex, 4);
});
```

- [ ] **Step 2: Update `todaySlotPayload` to use effectiveSeasonStart/End**

In `todaySlotPayload`:

```js
const startDate = effectiveSeasonStart(config, slots);
const endDate = effectiveSeasonEnd(config, slots);
const meta = {
  startDate,
  endDate,
  betaWeekStartDate: betaBounds?.startDate || null,
  betaWeekEndDate: betaBounds?.endDate || null,
  photoRequired: !!config.photoRequired,
};
// beforeSeason / afterSeason compare today to startDate/endDate above
```

Remove reliance on `seasonBounds(seasonOnly).startDate` for the before/after gate.

- [ ] **Step 3: Update `findTodaySlot`**

```js
function findTodaySlot(slots, today, config = {}) {
  const byDate = slots.find((s) => normalizeSlotDate(s.date) === today);
  if (byDate) return byDate;
  // season: derive dayIndex from start
  const start = effectiveSeasonStart(config, slots);
  if (start && today >= start) {
    const [sy, sm, sd] = start.split("-").map(Number);
    const [ty, tm, td] = today.split("-").map(Number);
    const offset = Math.round(
      (Date.UTC(ty, tm - 1, td) - Date.UTC(sy, sm - 1, sd)) / MS_PER_DAY,
    );
    if (offset >= 0 && offset < 100) {
      const di = offset + 1;
      const hit = slots.find((s) => (s.dayIndex ?? Number(s.id)) === di);
      if (hit) return hit;
    }
  }
  const betaIdx = betaDayIndexForDate(config, slots, today);
  if (betaIdx != null) {
    return slots.find((s) => (s.dayIndex ?? Number(s.id)) === betaIdx) || null;
  }
  return null;
}
```

Note: prefer derived match even when `byDate` hits a wrong slot — safer order:

1. Compute expected dayIndex from today + start  
2. If that slot exists, return it  
3. Else fall back to `byDate` / beta  

Use this safer order in implementation.

- [ ] **Step 4: Replace `seasonBounds(...).startDate` in handlers/stats with `effectiveSeasonStart`**

Locations (grep):
- `chunbaek-stats.js`: `statsSlotsForToday`, `defaultWeekForAdmin`, `buildTimelineWeeks`
- `chunbaek-handlers.js`: save-attendance / photo guards

- [ ] **Step 5: Run tests**

```bash
node --test scripts/test/chunbaek-slot-date-ssot.test.js
node scripts/verify-chunbaek-stats.js
```

Expected: PASS (or emulator-free unit parts PASS)

- [ ] **Step 6: Commit**

```bash
git add functions/lib/chunbaek-stats.js functions/lib/chunbaek-handlers.js scripts/test/chunbaek-slot-date-ssot.test.js
git commit -m "fix(chunbaek): 시즌 경계·오늘 슬롯을 config/dayIndex 기준으로"
```

---

### Task 3: admin-save-week-slots — date 덮어쓰기 금지

**Files:**
- Modify: `functions/lib/chunbaek-admin.js`:`handleAdminSaveWeekSlots`
- Test: extend `scripts/test/chunbaek-slot-date-ssot.test.js` with pure helper if extracted; otherwise document emulator check in Task 5

- [ ] **Step 1: Extract small pure helper (optional but preferred)**

```js
// in chunbaek-admin.js or stats
function slotWriteFieldsFromRow({ existing, dayIndex, week, row, config, slots }) {
  const isProgramOff = !!row.isProgramOff;
  const trainingTitle = ...;
  const trainingContent = ...;
  const base = {
    dayIndex,
    trainingTitle: isProgramOff ? (trainingTitle || "휴무") : trainingTitle,
    trainingContent: isProgramOff ? "" : trainingContent,
    isProgramOff,
  };
  if (existing) {
    return base; // no date/week
  }
  return {
    ...base,
    date: deriveSlotDate({ dayIndex, week }, config, slots),
    week: week === 0 ? 0 : deriveSeasonWeek(dayIndex),
  };
}
```

- [ ] **Step 2: Change `batch.set` in `handleAdminSaveWeekSlots`**

```js
const existing = slots.find((s) => (s.dayIndex ?? Number(s.id)) === dayIndex);
const patch = slotWriteFieldsFromRow({ existing, dayIndex, week, row, config, slots });
batch.set(docRef, { ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
```

Do **not** write `date: date` from `row.date`.

- [ ] **Step 3: Unit-test helper**

```js
test("slotWriteFieldsFromRow keeps date off existing docs", () => {
  const patch = slotWriteFieldsFromRow({
    existing: { dayIndex: 1, date: "2026-07-20", week: 1 },
    dayIndex: 1,
    week: 1,
    row: { trainingTitle: "X", trainingContent: "Y", isProgramOff: false, date: "2026-07-27" },
    config,
    slots: [],
  });
  assert.equal(patch.date, undefined);
  assert.equal(patch.trainingTitle, "X");
});
```

Export helper from admin module **or** put helper in stats and import from admin.

- [ ] **Step 4: Commit**

```bash
git add functions/lib/chunbaek-admin.js functions/lib/chunbaek-stats.js scripts/test/chunbaek-slot-date-ssot.test.js
git commit -m "fix(chunbaek): admin 훈련 저장 시 date/week 덮어쓰기 금지"
```

---

### Task 4: admin-import-slots — date/week 교정

**Files:**
- Modify: `functions/lib/chunbaek-admin.js`:`handleAdminImportSlots`

- [ ] **Step 1: After validateImportRow, normalize date/week**

```js
const di = Number(row.dayIndex);
const week = Number(row.week);
let date = row.date;
let weekOut = week;
const warnings = []; // accumulate per-row

if (week === 0 || di >= 901) {
  // beta: derive from beta bounds / startDate-7
  const expected = deriveSlotDate({ dayIndex: di, week: 0 }, {
    startDate: /* from season config load — need config in import */,
    betaWeekStartDate: ...,
  }, []);
  ...
} else {
  // import currently has no config load — ADD loadSeasonConfig(db)
  const expectedDate = deriveSeasonDate(config, di);
  const expectedWeek = deriveSeasonWeek(di);
  if (expectedDate && date !== expectedDate) {
    warnings.push({ dayIndex: di, field: "date", from: date, to: expectedDate });
    date = expectedDate;
  }
  if (expectedWeek && weekOut !== expectedWeek) {
    warnings.push({ dayIndex: di, field: "week", from: weekOut, to: expectedWeek });
    weekOut = expectedWeek;
  }
}
```

- [ ] **Step 2: `loadSeasonConfig(db)` at start of import handler**

- [ ] **Step 3: Return warnings in response (already has warnings array)

- [ ] **Step 4: Commit**

```bash
git add functions/lib/chunbaek-admin.js
git commit -m "fix(chunbaek): import 시 dayIndex 기준 date/week 교정"
```

---

### Task 5: 감사 스크립트 verify-chunbaek-slot-dates

**Files:**
- Create: `scripts/verify-chunbaek-slot-dates.js`
- Ensure: `scripts/fix-chunbaek-slot-dates.js` exists on branch (cherry-pick from `cursor/fix-chunbaek-slot-dates-d878` if missing)

- [ ] **Step 1: Implement verify script**

Behavior:
- Load config + all season slots
- Compare stored date/week vs `deriveSeasonDate` / `deriveSeasonWeek`
- Print table of mismatches
- `process.exit(mismatches ? 1 : 0)`
- Support `--emulator`

- [ ] **Step 2: Dry-run locally against production (human)**

```bash
node scripts/verify-chunbaek-slot-dates.js
```

Expected after prior fix: `불일치 0건`

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-chunbaek-slot-dates.js scripts/fix-chunbaek-slot-dates.js
git commit -m "chore(chunbaek): 슬롯 date/week 불일치 감사 스크립트"
```

---

### Task 6: 회귀 확인 + 문서 링크

**Files:**
- Modify: `docs/superpowers/specs/2026-07-23-chunbaek-slot-date-ssot-design.md` (상태 → 구현 중/완료)
- Optional: `_docs/superpowers/specs/2026-07-12-chunbaek-season3-admin-api.md`에 “date는 서버 파생” 한 줄

- [ ] **Step 1: Run unit tests**

```bash
node --test scripts/test/chunbaek-slot-date-ssot.test.js
node --test scripts/test/chunbaek-*.test.js
```

- [ ] **Step 2: Run stats verify**

```bash
node scripts/verify-chunbaek-stats.js
```

- [ ] **Step 3: (Optional emulator) admin save does not change date**

Seed emulator → pollute slot 1 date → admin-save-week-slots → read slot 1 date unchanged → today-slot not beforeSeason

- [ ] **Step 4: Commit docs**

```bash
git add docs/superpowers/specs/2026-07-23-chunbaek-slot-date-ssot-design.md
git commit -m "docs(chunbaek): slot date SSOT 설계 상태 갱신"
```

---

## Deployment note

- Deploy **`functions:chunbaek` only** after Tasks 1–4.
- Hosting optional.
- Do **not** have the agent run `firebase deploy`; human runs Actions / CLI per project rules.

## Success checklist

- [ ] Polluted dayIndex1 date → home not before-season
- [ ] Admin training save → date/week unchanged
- [ ] Import wrong date → corrected + warning
- [ ] verify script exit 0 on prod
- [ ] Existing chunbaek tests green
