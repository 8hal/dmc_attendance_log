# 팀 출석 도트 행 + 회원 바텀시트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 팀 출석 목록을 월간 정모 도트 행으로 바꾸고, 행 탭 시 회원 요약+선택 월 이력 바텀시트를 열며, 셸 리스트 아바타를 제거한다.

**Architecture:** 기존 `aggregateTeamMonth` + 정모일 `status` 조인을 유지한다. 순수 함수 `buildMeetingDots`로 도트 state를 만들고 UI만 교체한다. 바텀시트는 기존 `modal-backdrop`/`modal-sheet`를 재사용하고, 출석 데이터는 집계 행을 그대로 쓰며 PB만 `race?action=confirmed-races`를 선택적으로 붙인다.

**Tech Stack:** 정적 HTML/JS (`attendance-v2`), `assets/attendance-team-month.js`, `node --test`, Firebase Hosting (배포는 이 계획 밖)

**Spec:** `docs/superpowers/specs/2026-07-19-team-attendance-dots-sheet-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `assets/attendance-team-month.js` | `buildMeetingDots`, `memberMonthAttendRate`, (선택) 도트 라벨 헬퍼 export |
| `scripts/test/attendance-team-month.test.js` | 도트/출석률 단위 테스트 |
| `assets/attendance-shell.css` | `.attend-dots`, 상태별 도트, 시트 내부 레이아웃; `.member-avatar` 제거/미사용 |
| `attendance-v2.html` | `#teamMemberSheet` 마크업; 스크립트 캐시버스트 |
| `attendance-v2.js` | 팀 행 렌더(도트·무아바타·클릭), 시트 open/close, PB 로드 |
| `assets/attendance-today-roster.js` | `avatarCharFromNickname` 제거 |
| `scripts/test/attendance-today-roster.test.js` | 아바타 테스트 제거 |
| `attendance-v2-shell-mockup.html` | (선택, Task 마지막) 목업을 같은 UI로 맞춤 |

**아바타 예외:** 키오스크는 `member-avatar`를 쓰지 않음 → 변경 없음. 대상은 팀 출석 목록·오늘 출석 명단·목업 리스트만.

---

### Task 1: `buildMeetingDots` + 출석률 (TDD)

**Files:**
- Modify: `assets/attendance-team-month.js`
- Modify: `scripts/test/attendance-team-month.test.js`

- [ ] **Step 1: Write failing tests**

`scripts/test/attendance-team-month.test.js`에 import와 describe 추가:

```js
const {
  listRegularMeetingDateKeys,
  isRegularMeetingType,
  aggregateTeamMonth,
  buildMeetingDots,
  memberMonthAttendRate,
} = require(path.join(__dirname, "../../assets/attendance-team-month.js"));

describe("buildMeetingDots", () => {
  it("marks attended / missed / upcoming from todayKey", () => {
    const dots = buildMeetingDots({
      meetingDateKeys: ["2026/07/14", "2026/07/16", "2026/07/18"],
      attendedDateKeys: ["2026/07/14"],
      todayKey: "2026/07/16",
    });
    assert.deepEqual(dots.map((d) => d.state), ["attended", "upcoming", "upcoming"]);
    // 7/16 not attended but today → upcoming
    assert.equal(dots[1].dateKey, "2026/07/16");
  });

  it("marks past non-attended as missed", () => {
    const dots = buildMeetingDots({
      meetingDateKeys: ["2026/07/14", "2026/07/16"],
      attendedDateKeys: [],
      todayKey: "2026/07/17",
    });
    assert.deepEqual(dots.map((d) => d.state), ["missed", "missed"]);
  });

  it("normalizes dash attended keys", () => {
    const dots = buildMeetingDots({
      meetingDateKeys: ["2026/07/14"],
      attendedDateKeys: ["2026-07-14"],
      todayKey: "2026/07/20",
    });
    assert.equal(dots[0].state, "attended");
  });
});

describe("memberMonthAttendRate", () => {
  it("uses full meetingDateKeys as denominator", () => {
    assert.equal(memberMonthAttendRate(2, 13), 15); // Math.round(2/13*100)
    assert.equal(memberMonthAttendRate(0, 13), 0);
    assert.equal(memberMonthAttendRate(1, 0), 0);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
node --test scripts/test/attendance-team-month.test.js
```

Expected: FAIL (`buildMeetingDots` / `memberMonthAttendRate` not exported)

- [ ] **Step 3: Implement minimal helpers**

`assets/attendance-team-month.js` factory 내부에 추가 후 `return`에 export:

```js
function normalizeDateKey(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.replace(/-/g, "/");
  return "";
}

/**
 * @returns {{ dateKey: string, state: "attended"|"missed"|"upcoming" }[]}
 */
function buildMeetingDots(opts) {
  const meetingDateKeys = Array.isArray(opts && opts.meetingDateKeys)
    ? opts.meetingDateKeys
    : [];
  const attendedSet = {};
  (Array.isArray(opts && opts.attendedDateKeys) ? opts.attendedDateKeys : []).forEach(
    function (k) {
      const n = normalizeDateKey(k);
      if (n) attendedSet[n] = true;
    }
  );
  const todayKey = normalizeDateKey(opts && opts.todayKey) || "9999/99/99";
  return meetingDateKeys.map(function (raw) {
    const dateKey = normalizeDateKey(raw) || String(raw || "");
    if (attendedSet[dateKey]) return { dateKey: dateKey, state: "attended" };
    if (dateKey < todayKey) return { dateKey: dateKey, state: "missed" };
    return { dateKey: dateKey, state: "upcoming" };
  });
}

function memberMonthAttendRate(count, meetingDateCount) {
  const c = Number(count) || 0;
  const d = Number(meetingDateCount) || 0;
  if (d <= 0) return 0;
  return Math.round((c / d) * 100);
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
node --test scripts/test/attendance-team-month.test.js
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add assets/attendance-team-month.js scripts/test/attendance-team-month.test.js
git commit -m "feat(team-attend): add buildMeetingDots and attend rate helpers"
```

---

### Task 2: 도트 CSS + 팀 목록 렌더 (아바타 제거)

**Files:**
- Modify: `assets/attendance-shell.css`
- Modify: `attendance-v2.js` (`loadTeamAttendancePanel` 행 렌더 ~774–796)
- Modify: `attendance-v2.html` (shell.css / team-month.js `?v=` 캐시버스트)

- [ ] **Step 1: Add dot styles**

`assets/attendance-shell.css`에 추가 (`.member-dates` 근처):

```css
.attend-dots {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 6px;
}

.attend-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  flex-shrink: 0;
  box-sizing: border-box;
}

.attend-dot[data-state="attended"] {
  background: var(--dmc-green-9, #16a34a);
  border: 1px solid var(--dmc-green-9, #16a34a);
}

.attend-dot[data-state="missed"] {
  background: transparent;
  border: 1.5px solid var(--dmc-color-border, #cbd5e1);
}

.attend-dot[data-state="upcoming"] {
  background: var(--dmc-slate-4, #e2e8f0);
  border: 1px solid transparent;
  opacity: 0.55;
}

.member-row[role="button"] {
  cursor: pointer;
}
```

`.member-avatar` 규칙은 호출처 제거 후 Task 3에서 삭제해도 됨. 이 Task에서는 팀 행에서 아바타 마크업만 빼면 충분.

- [ ] **Step 2: Helper to render dots HTML inside `attendance-v2.js`**

`loadTeamAttendancePanel` 위에:

```js
function kstTodayDateKeySlashForTeam() {
  return new Date()
    .toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
    .replace(/-/g, "/");
}

function attendDotLabel(dateKey, state) {
  const short = formatShortAttendDate(dateKey);
  if (state === "attended") return short + " 출석";
  if (state === "missed") return short + " 미출석";
  return short + " 예정";
}

function renderAttendDotsHtml(meetingDateKeys, attendedDateKeys) {
  if (!teamMonthHelper || typeof teamMonthHelper.buildMeetingDots !== "function") {
    return "";
  }
  const dots = teamMonthHelper.buildMeetingDots({
    meetingDateKeys: meetingDateKeys,
    attendedDateKeys: attendedDateKeys,
    todayKey: kstTodayDateKeySlashForTeam(),
  });
  return (
    '<span class="attend-dots" role="img" aria-label="정모 출석 도트">' +
    dots
      .map(function (d) {
        const label = attendDotLabel(d.dateKey, d.state);
        return (
          '<span class="attend-dot" data-state="' +
          d.state +
          '" title="' +
          label +
          '" aria-label="' +
          label +
          '"></span>'
        );
      })
      .join("") +
    "</span>"
  );
}
```

(`formatShortAttendDate`가 이미 파일에 있음 — 없으면 `YYYY/MM/DD` → `M/D` 변환 추가.)

- [ ] **Step 3: Replace team row markup**

`loadTeamAttendancePanel`의 `listEl.innerHTML = agg.rows.map(...)` 를:

```js
listEl.innerHTML = agg.rows
  .map(function (row) {
    const nick = String(row.nickname || "").replace(/</g, "&lt;");
    const dots = renderAttendDotsHtml(dateKeys, row.dates || []);
    const mid = row.memberId ? String(row.memberId).replace(/"/g, "") : "";
    return (
      '<li class="member-row" role="button" tabindex="0" data-member-id="' +
      mid +
      '" data-nickname="' +
      nick.replace(/"/g, "&quot;") +
      '" data-team="' +
      String(row.team || "").replace(/"/g, "&quot;") +
      '" data-count="' +
      String(row.count) +
      '" data-dates="' +
      (row.dates || []).join(",") +
      '">' +
      '<div class="member-name">' +
      nick +
      dots +
      "</div>" +
      '<div class="member-count">' +
      row.count +
      "회</div></li>"
    );
  })
  .join("");
```

참고: `data-dates`에 콤마 구분 slash 키. 시트에서 파싱.

아직 클릭 핸들러는 Task 4에서 연결. 행에 `role="button"`만 준비.

- [ ] **Step 4: Bump cache query on `attendance-team-month.js` / shell.css in `attendance-v2.html`**

- [ ] **Step 5: Manual sanity (optional if emulator up)** — 팀 출석 탭에서 아바타 없고 도트 보이는지

- [ ] **Step 6: Commit**

```bash
git add assets/attendance-shell.css attendance-v2.js attendance-v2.html
git commit -m "feat(team-attend): render monthly meeting dots without avatars"
```

---

### Task 3: 오늘 출석 명단 아바타 제거

**Files:**
- Modify: `attendance-v2.js` (`renderTodayRosterList`)
- Modify: `assets/attendance-today-roster.js`
- Modify: `scripts/test/attendance-today-roster.test.js`
- Modify: `assets/attendance-shell.css` (`.member-avatar` 미사용이면 삭제)

- [ ] **Step 1: Update today roster markup** — `member-avatar` 블록과 `avatarCharFromNickname` 호출 삭제. 닉네임 + meta만.

```js
return (
  '<li class="member-row">' +
  '<div class="member-name">' +
  escapeHtml(nickname) +
  '<span class="member-dates">' +
  escapeHtml(meta) +
  "</span></div></li>"
);
```

- [ ] **Step 2: Remove `avatarCharFromNickname` from helper + its test**

- [ ] **Step 3: Remove `.member-avatar` CSS if unused** (`rg member-avatar` → attendance-v2 경로 0건)

- [ ] **Step 4: Run tests**

```bash
npm run test:attendance-shell
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add attendance-v2.js assets/attendance-today-roster.js scripts/test/attendance-today-roster.test.js assets/attendance-shell.css
git commit -m "fix(shell): remove list avatars from today roster"
```

---

### Task 4: 회원 바텀시트 마크업 + open/close + 출석 이력

**Files:**
- Modify: `attendance-v2.html` (`#sessionRosterModal` 근처에 시트 추가)
- Modify: `attendance-v2.js`
- Modify: `assets/attendance-shell.css` (시트 내부 스타일)

- [ ] **Step 1: Add sheet HTML**

```html
<div id="teamMemberSheet" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="teamMemberSheetTitle">
  <div class="modal-sheet team-member-sheet">
    <div class="session-roster-head">
      <h2 id="teamMemberSheetTitle">회원</h2>
      <button type="button" class="modal-close-button" id="teamMemberSheetCloseBtn">닫기</button>
    </div>
    <p id="teamMemberSheetMeta" class="team-member-sheet-meta"></p>
    <div id="teamMemberSheetPb" class="team-member-pb" hidden></div>
    <div id="teamMemberSheetBody" class="team-member-sheet-body"></div>
  </div>
</div>
```

- [ ] **Step 2: Keep last agg + members snapshot for sheet**

모듈 스코프:

```js
let teamAttendLastAgg = null;
// { monthKey, meetingDateKeys, rows, membersById: { [id]: { nickname, realName, team } } }
```

`loadTeamAttendancePanel` 성공 시:

```js
const membersById = {};
members.forEach(function (m) {
  if (m && m.id) {
    membersById[m.id] = {
      nickname: m.nickname || "",
      realName: m.realName || m.name || "",
      team: m.team || "",
    };
  }
});
teamAttendLastAgg = {
  monthKey: teamAttendMonthKey,
  meetingDateKeys: dateKeys,
  rows: agg.rows,
  membersById: membersById,
};
```

- [ ] **Step 3: open/close + fill body from row (PB stub only)**

```js
function closeTeamMemberSheet() {
  const el = document.getElementById("teamMemberSheet");
  if (el) el.classList.add("hidden");
}

/** Task 5에서 실제 구현. Task 4에서는 no-op로 두어 ReferenceError 방지. */
async function loadTeamMemberSheetPb(/* nickname, memberId */) {
  /* no-op until Task 5 */
}

function openTeamMemberSheetFromRow(rowEl) {
  const sheet = document.getElementById("teamMemberSheet");
  const title = document.getElementById("teamMemberSheetTitle");
  const meta = document.getElementById("teamMemberSheetMeta");
  const body = document.getElementById("teamMemberSheetBody");
  const pb = document.getElementById("teamMemberSheetPb");
  if (!sheet || !title || !body) return;

  const nickname = rowEl.getAttribute("data-nickname") || "";
  const team = rowEl.getAttribute("data-team") || "";
  const memberId = rowEl.getAttribute("data-member-id") || "";
  const count = Number(rowEl.getAttribute("data-count") || 0);
  const dates = String(rowEl.getAttribute("data-dates") || "")
    .split(",")
    .filter(Boolean);
  const meetingDateKeys =
    (teamAttendLastAgg && teamAttendLastAgg.meetingDateKeys) || [];
  const rate =
    teamMonthHelper && teamMonthHelper.memberMonthAttendRate
      ? teamMonthHelper.memberMonthAttendRate(count, meetingDateKeys.length)
      : 0;

  title.textContent = nickname || "회원";
  if (meta) {
    meta.textContent =
      teamLabel(team) +
      " · " +
      formatMonthLabel(teamAttendMonthKey || currentMonthKeyKst()) +
      " · " +
      count +
      "회 · 출석률 " +
      rate +
      "%";
  }
  if (pb) {
    pb.hidden = true;
    pb.innerHTML = "";
  }
  body.innerHTML =
    renderAttendDotsHtml(meetingDateKeys, dates) +
    '<ul class="team-member-date-list">' +
    (dates.length
      ? dates
          .map(function (dk) {
            return "<li>" + formatShortAttendDate(dk) + "</li>";
          })
          .join("")
      : '<li class="muted">이번 달 출석 없음</li>') +
    "</ul>";

  sheet.classList.remove("hidden");
  loadTeamMemberSheetPb(nickname, memberId).catch(function () {});
}
```

**이벤트는 `loadTeamAttendancePanel` 안이 아니라 파일 하단에서 한 번만** (월/필터 재로드 시 핸들러 중복 방지):

```js
const elTeamAttendList = document.getElementById("teamAttendList");
if (elTeamAttendList) {
  elTeamAttendList.addEventListener("click", function (e) {
    const row = e.target.closest(".member-row[data-nickname]");
    if (row) openTeamMemberSheetFromRow(row);
  });
  elTeamAttendList.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    const row = e.target.closest(".member-row[data-nickname]");
    if (!row) return;
    e.preventDefault();
    openTeamMemberSheetFromRow(row);
  });
}
const elTeamMemberSheet = document.getElementById("teamMemberSheet");
const elTeamMemberSheetClose = document.getElementById("teamMemberSheetCloseBtn");
if (elTeamMemberSheetClose) {
  elTeamMemberSheetClose.addEventListener("click", closeTeamMemberSheet);
}
if (elTeamMemberSheet) {
  elTeamMemberSheet.addEventListener("click", function (e) {
    if (e.target === elTeamMemberSheet) closeTeamMemberSheet();
  });
}
document.addEventListener("keydown", function (e) {
  if (e.key !== "Escape") return;
  const sheet = document.getElementById("teamMemberSheet");
  if (sheet && !sheet.classList.contains("hidden")) closeTeamMemberSheet();
});
```

- [ ] **Step 4: Minimal sheet CSS** for `.team-member-sheet-meta`, `.team-member-date-list`, `.team-member-pb`

- [ ] **Step 5: Commit**

```bash
git add attendance-v2.html attendance-v2.js assets/attendance-shell.css
git commit -m "feat(team-attend): member bottom sheet with month attendance"
```

---

### Task 5: 시트 PB 스트립 (confirmed-races)

**Files:**
- Modify: `attendance-v2.js` (`loadTeamMemberSheetPb` no-op → 실제 구현)
- Modify: `assets/attendance-shell.css` (컴팩트 pb-strip)

- [ ] **Step 1: Replace `loadTeamMemberSheetPb` with real fetch + flatten**

`my.html`의 `enrichResults`와 같이 **`races[].results[]`를 flat** 한 뒤 회원 실명으로 필터한다.  
실명 해석: `teamAttendLastAgg.membersById[memberId].realName` 우선, 없으면 `nickname`으로 `realName`/`nickname` 필드 비교.

```js
const PB_SLOT_DISTS = ["full", "half", "10K"];
const PB_DIST_LABELS = { full: "풀", half: "하프", "10K": "10K" };

function raceRecordTime(r) {
  return String((r && (r.record || r.netTime || r.gunTime || r.time)) || "").trim();
}

function timeToSeconds(t) {
  const parts = String(t || "")
    .split(":")
    .map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Infinity;
}

function flattenConfirmedRaceResults(races) {
  const all = [];
  (Array.isArray(races) ? races : []).forEach(function (race) {
    (Array.isArray(race && race.results) ? race.results : []).forEach(function (r) {
      all.push({
        realName: r.realName || "",
        nickname: r.nickname || "",
        distance: r.distance || "",
        record: raceRecordTime(r),
        raceName: (race && race.raceName) || r.raceName || "",
        raceDate: (race && race.raceDate) || r.raceDate || "",
      });
    });
  });
  return all;
}

function pickPbSlots(personRows) {
  const best = {};
  personRows.forEach(function (r) {
    const dist = r.distance;
    if (PB_SLOT_DISTS.indexOf(dist) < 0) return;
    const sec = timeToSeconds(r.record);
    if (!best[dist] || sec < timeToSeconds(best[dist].record)) best[dist] = r;
  });
  return best;
}

async function loadTeamMemberSheetPb(nickname, memberId) {
  const pbEl = document.getElementById("teamMemberSheetPb");
  if (!pbEl) return;
  pbEl.hidden = true;
  pbEl.innerHTML = "";

  let realName = "";
  const snap =
    teamAttendLastAgg &&
    memberId &&
    teamAttendLastAgg.membersById &&
    teamAttendLastAgg.membersById[memberId];
  if (snap) realName = snap.realName || "";

  try {
    const json = await fetch(RACE_LOG_API + "?action=confirmed-races").then(function (r) {
      return r.json();
    });
    if (!json || !json.ok) return;
    const flat = flattenConfirmedRaceResults(json.races || []);
    const nickLc = String(nickname || "").toLowerCase();
    const realLc = String(realName || "").toLowerCase();
    const mine = flat.filter(function (r) {
      const rn = String(r.realName || "").toLowerCase();
      const nn = String(r.nickname || "").toLowerCase();
      if (realLc && rn === realLc) return true;
      if (nickLc && (nn === nickLc || rn === nickLc)) return true;
      return false;
    });
    const slots = pickPbSlots(mine);
    const hasAny = PB_SLOT_DISTS.some(function (d) {
      return !!slots[d];
    });
    if (!hasAny) return;

    pbEl.innerHTML =
      '<div class="pb-strip">' +
      PB_SLOT_DISTS.map(function (dist) {
        const pb = slots[dist];
        const label = PB_DIST_LABELS[dist] || dist;
        if (!pb) {
          return (
            '<div class="pb-cell"><div class="pb-cell-dist">' +
            label +
            '</div><div class="pb-cell-time empty">-</div></div>'
          );
        }
        return (
          '<div class="pb-cell"><div class="pb-cell-dist">' +
          label +
          '</div><div class="pb-cell-time">' +
          String(pb.record).replace(/</g, "&lt;") +
          "</div></div>"
        );
      }).join("") +
      "</div>";
    pbEl.hidden = false;
  } catch (_) {
    /* keep hidden */
  }
}
```

- [ ] **Step 2: Compact CSS** for `.team-member-pb .pb-strip` / `.pb-cell` (3열, 작은 패딩, 셸 토큰)

- [ ] **Step 3: Smoke** — 에뮬/로컬에서 시트 열고 PB 유무 확인

- [ ] **Step 4: Commit**

```bash
git add attendance-v2.js assets/attendance-shell.css
git commit -m "feat(team-attend): optional PB strip on member sheet"
```

---

### Task 6: 목업 정렬 + 최종 검증

**Files:**
- Modify: `attendance-v2-shell-mockup.html` (선택이나 권장 — 스펙 “같은 방향”)
- Verify: 테스트 스위트

- [ ] **Step 1: Update mockup team list** — 아바타 제거, `member-dates` 텍스트 대신 정적 `.attend-dots` 예시 몇 행

- [ ] **Step 2: Run full shell tests**

```bash
npm run test:attendance-shell
```

Expected: PASS, including new dot tests

- [ ] **Step 3: Final commit if mockup changed**

```bash
git add attendance-v2-shell-mockup.html
git commit -m "docs(mockup): align team attendance rows with dots, no avatars"
```

- [ ] **Step 4: Push branch**

```bash
git push -u origin cursor/attendance-shell-redesign-spec-78e6
```

---

## Self-check vs spec

| Spec criterion | Task |
|----------------|------|
| 월간 화·목·토 도트 | 1–2 |
| attended/missed/upcoming | 1 |
| 아바타 제거 | 2–3 |
| 바텀시트 닉네임/팀/이력 | 4 |
| 출석률 = count / meetingDateKeys.length | 1, 4 |
| PB optional confirmed-races | 5 |
| 신규 API 없음 | 전 구간 |
| test:attendance-shell | 3, 6 |
| Success mini-cal 정렬 | **비범위** |

---

## Execution note

구현 시 `@.cursor/skills/test-driven-development/SKILL.md` 및 `@.cursor/skills/subagent-driven-development/SKILL.md` (또는 executing-plans)를 따른다. **`firebase deploy` 금지.**
