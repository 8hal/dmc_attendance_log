# 춘백 시즌3 100일 출석 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `dmc-attendance` 프로젝트에 `/chunbaek/` 웹앱과 `/api/chunbaek` API를 추가해, 40명 참가자가 100슬롯 출석·온보딩·팀 집계·운영진 PC 그리드를 사용할 수 있게 한다.

**Architecture:** DMC `race` API와 동일하게 Hosting rewrite + `exports.chunbaek` 단일 HTTP 함수. 비즈니스 로직은 `functions/lib/chunbaek-*.js`로 분리해 `index.js` 비대화를 막는다. 회원 신원은 `chunbaek_sessions` opaque token, 데이터는 기존 `members` + `chunbaekS3` 중첩 필드와 `chunbaek_*` 컬렉션. 프론트는 Vanilla JS SPA (`chunbaek/index.html` + 공유 `js/`·`css/`).

**Tech Stack:** Vanilla HTML/CSS/JS, Firebase Hosting, Cloud Functions v2 (Node.js), Firestore Admin SDK, `firebase emulators:exec` 통합 검증

**References:**
- **확정 사항 요약:** `_docs/superpowers/specs/2026-07-12-chunbaek-season3-confirmed-decisions.md`
- PRD: `_docs/superpowers/specs/2026-07-12-chunbaek-season3-attendance-design.md`
- 리뷰: `_docs/superpowers/reviews/2026-07-12-chunbaek-season3-spec-review.md`
- API 패턴: `_docs/development/api-patterns.md`
- 명명 규칙: `_docs/development/naming-conventions.md`
- 배포 전 테스트: `.cursor/skills/pre-deploy-test/SKILL.md`
- Firestore 수정(시드): `.cursor/skills/firestore-data-modification/SKILL.md`

**구현 전 필독:** `api-patterns.md`, `naming-conventions.md`, `common-mistakes.md`

**Important 결정 (리뷰 I1·I2 — 구현 계획에서 확정):**

| 항목 | MVP 기본값 |
|------|-----------|
| I1 주당 훈련일 &lt; 3 | `admin-import-slots` 시 주차별 경고 배열 반환. `weeklyTarget = min(3, 해당주 훈련일 수)` 자동 적용 |
| I2 과거 출석 소급 | **해당 주 일요일 23:59 KST**까지 회원 `save-attendance` 허용. 이후는 `admin-set-attendance`만 |

---

## File Structure

### Backend (신규·수정)

| 파일 | 책임 |
|------|------|
| `functions/index.js` | `exports.chunbaek` 등록, CORS·action 라우팅 |
| `functions/lib/chunbaek-auth.js` | token 발급·검증·revoke |
| `functions/lib/chunbaek-stats.js` | 주·월·시즌 집계, 주 3회 달성 |
| `functions/lib/chunbaek-handlers.js` | action별 핸들러 (members-roster, save-attendance, …) |
| `firebase.json` | `/api/chunbaek` rewrite 추가 |
| `firestore.rules` | `chunbaek_*` 컬렉션 read-only (쓰기는 Functions만) |

### Scripts (신규·수정)

| 파일 | 책임 |
|------|------|
| `scripts/seed-emulator-chunbaek.js` | 에뮬용 participant·slots·season_config 시드 |
| `scripts/seed-chunbaek-participants.js` | 프로덕션 참가자 `chunbaekS3.participant` 설정 (운영진 실행) |
| `scripts/verify-chunbaek-emulator.js` | chunbaek API 통합 테스트 (curl 대체 node) |
| `scripts/pre-deploy-test-runner.sh` | chunbaek smoke test 추가 |
| `scripts/samples/chunbaek-slots-week1.csv` | 1주치 샘플 슬롯 (집계 시뮬용) |

### Frontend (신규)

| 파일 | 책임 |
|------|------|
| `chunbaek/index.html` | SPA 셸: 온보딩 5단계 + 하단 탭 4개 |
| `chunbaek/admin.html` | 운영진 PC 그리드 (verify-admin) |
| `chunbaek/css/chunbaek.css` | 춘백 전용 스타일 (모바일 우선) |
| `chunbaek/js/api.js` | `API_BASE`, `fetchWithToken`, 오류 처리 |
| `chunbaek/js/app.js` | 라우팅·온보딩·탭 전환 |
| `chunbaek/js/views-today.js` | 오늘 탭 |
| `chunbaek/js/views-timeline.js` | 내 100일 탭 |
| `chunbaek/js/views-team.js` | 팀 탭 |
| `chunbaek/js/views-me.js` | 나 탭 |
| `chunbaek/js/admin.js` | admin.html 전용 |

> PRD는 `onboarding.html` 등 분리 URL을 예시로 두었으나, MVP는 **단일 SPA + hash 라우팅** (`#/pick`, `#/profile`)으로 구현해 공유 상태·API 코드 중복을 줄인다.

---

## Milestone Overview

| Milestone | 산출물 | 검증 |
|-----------|--------|------|
| M1 | 인프라 + API 스켈레톤 + auth | curl members-roster, create-profile → token |
| M2 | 출석·집계 API | save-attendance, team-summary 수치 일치 |
| M3 | Admin API + import | admin-grid, CSV import |
| M4 | 회원 SPA (온보딩 + 4탭) | 에뮬 브라우저 수동 |
| M5 | admin.html + pre-deploy | `bash scripts/pre-deploy-test.sh` 통과 |

---

## Task 1: 인프라 스켈레톤

**Files:**
- Modify: `firebase.json`
- Modify: `functions/index.js` (파일 끝 근처)
- Modify: `firestore.rules`
- Create: `functions/lib/chunbaek-handlers.js` (스텁)

- [ ] **Step 1: firebase.json rewrite 추가**

`hosting.rewrites` 배열에 `race` 항목 바로 아래 추가:

```json
{
  "source": "/api/chunbaek",
  "function": { "functionId": "chunbaek", "region": "asia-northeast3" }
}
```

- [ ] **Step 2: firestore.rules에 chunbaek 컬렉션 추가**

```javascript
match /chunbaek_slots/{docId} {
  allow read: if true;
  allow write: if false;
}
match /chunbaek_attendance/{docId} {
  allow read: if true;
  allow write: if false;
}
match /chunbaek_sessions/{docId} {
  allow read: if false;
  allow write: if false;
}
match /chunbaek_season_config/{docId} {
  allow read: if true;
  allow write: if false;
}
```

- [ ] **Step 3: chunbaek HTTP 함수 스켈레톤**

`functions/index.js` 하단에 추가 (`race` export 패턴 복제):

```javascript
const chunbaekHandlers = require("./lib/chunbaek-handlers");

exports.chunbaek = onRequest(
  { cors: true, timeoutSeconds: 120, memory: "256MiB", region: "asia-northeast3" },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.status(204).send("");
    try {
      const action = req.query.action || "";
      return await chunbaekHandlers.handleChunbaekRequest(req, res, { db, action });
    } catch (e) {
      console.error("[chunbaek]", e);
      return res.status(500).json({ ok: false, error: e.message || "server error" });
    }
  }
);
```

- [ ] **Step 4: handlers 스텁**

`functions/lib/chunbaek-handlers.js`:

```javascript
async function handleChunbaekRequest(req, res, { db, action }) {
  if (action === "ping") {
    return res.json({ ok: true, service: "chunbaek" });
  }
  return res.status(400).json({ ok: false, error: `unknown action: ${action}` });
}
module.exports = { handleChunbaekRequest };
```

- [ ] **Step 5: 에뮬에서 ping 확인**

```bash
cd functions && npm ci
firebase emulators:exec --only functions,firestore --project dmc-attendance \
  'curl -s "http://127.0.0.1:5001/dmc-attendance/asia-northeast3/chunbaek?action=ping"'
```

Expected: `{"ok":true,"service":"chunbaek"}`

- [ ] **Step 6: Commit**

```bash
git add firebase.json firestore.rules functions/index.js functions/lib/chunbaek-handlers.js
git commit -m "feat(chunbaek): API 스켈레톤 및 firebase rewrite"
```

---

## Task 2: Session Token (C1)

**Files:**
- Create: `functions/lib/chunbaek-auth.js`
- Modify: `functions/lib/chunbaek-handlers.js`

- [ ] **Step 1: chunbaek-auth.js 구현**

```javascript
const crypto = require("crypto");
const { FieldValue } = require("firebase-admin/firestore");

const TOKEN_TTL_DAYS = 120; // 100일 시즌 + 시즌 전·후 여유

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function extractToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return (req.query.token || "").trim();
}

async function issueSession(db, memberId) {
  const token = generateToken();
  const now = Date.now();
  const expiresAt = new Date(now + TOKEN_TTL_DAYS * 86400000);
  await db.collection("chunbaek_sessions").doc(token).set({
    token,
    memberId,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    revoked: false,
  });
  return { token, expiresAt: expiresAt.toISOString() };
}

async function resolveMemberFromToken(db, req) {
  const token = extractToken(req);
  if (!token) return { error: "token required", status: 401 };
  const snap = await db.collection("chunbaek_sessions").doc(token).get();
  if (!snap.exists) return { error: "invalid token", status: 401 };
  const d = snap.data();
  if (d.revoked) return { error: "token revoked", status: 401 };
  if (d.expiresAt?.toDate && d.expiresAt.toDate() < new Date()) {
    return { error: "token expired", status: 401 };
  }
  return { memberId: d.memberId, token };
}

module.exports = { issueSession, resolveMemberFromToken, extractToken };
```

- [ ] **Step 2: requireAuth 헬퍼를 handlers에 추가**

회원 전용 action 앞에서 `resolveMemberFromToken` 호출, 실패 시 `res.status(status).json({ ok: false, error })`.

- [ ] **Step 3: verify-chunbaek-emulator.js에 token 테스트 추가** (Task 9에서 완성, 여기서 스텁 파일 생성)

- [ ] **Step 4: Commit**

```bash
git add functions/lib/chunbaek-auth.js functions/lib/chunbaek-handlers.js
git commit -m "feat(chunbaek): session token 발급·검증"
```

---

## Task 3: 온보딩 API (members-roster, create-profile, link-device, my-profile)

**Files:**
- Modify: `functions/lib/chunbaek-handlers.js`

- [ ] **Step 1: members-roster (GET, 인증 없음)**

```javascript
// participant === true && hidden !== true
const snap = await db.collection("members").get();
const roster = [];
snap.forEach((doc) => {
  const d = doc.data();
  if (d.hidden) return;
  const s3 = d.chunbaekS3 || {};
  if (!s3.participant) return;
  roster.push({
    memberId: doc.id,
    nickname: d.nickname || "",
    profileComplete: !!s3.profileComplete,
  });
});
roster.sort((a, b) => a.nickname.localeCompare(b.nickname, "ko"));
return res.json({ ok: true, members: roster });
```

- [ ] **Step 2: create-profile (POST)**

검증 순서:
1. `memberId`, `goalMarathonNetTime` (number, 7200~25200초) 필수
2. member 존재 + `chunbaekS3.participant`
3. 트랜잭션: `profileComplete`가 이미 true면 409
4. `chunbaekS3` 업데이트 + `issueSession`

응답: `{ ok: true, token, memberId, nickname, profileComplete: true }`

- [ ] **Step 3: link-device (POST)**

1. `memberId` 필수
2. `profileComplete === true` 아니면 400
3. `issueSession` → token 반환

- [ ] **Step 4: my-profile (GET, token)**

token → member 조회 + 집계 요약 (Task 4 stats 연동 전에는 placeholder 0):

```javascript
{
  ok: true,
  memberId, nickname,
  goalMarathonNetTime, existingPbNetTime,
  profileComplete: true,
  stats: { seasonAttendCount: 0, seasonAttendRate: 0, seasonDayIndex: 0, weekAttendCount: 0, weekTarget: 3 }
}
```

- [ ] **Step 5: 에뮬 시드 + 수동 테스트** (Task 7 시드 후)

```bash
# roster
curl -s "http://127.0.0.1:5001/.../chunbaek?action=members-roster"
# create-profile
curl -s -X POST ".../chunbaek?action=create-profile" -H "Content-Type: application/json" \
  -d '{"memberId":"chunbaek_seed_b","goalMarathonNetTime":16200}'
# my-profile with token
curl -s ".../chunbaek?action=my-profile&token=TOKEN"
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(chunbaek): 온보딩 API (roster, create-profile, link-device, my-profile)"
```

---

## Task 4: 집계 로직 (chunbaek-stats.js)

**Files:**
- Create: `functions/lib/chunbaek-stats.js`
- Modify: `functions/lib/chunbaek-handlers.js` (my-profile에 연동)

- [ ] **Step 1: 슬롯·출석 로드 헬퍼**

```javascript
async function loadSeasonConfig(db) {
  const snap = await db.collection("chunbaek_season_config").doc("chunbaek-s3").get();
  return snap.exists ? snap.data() : { weeklyTarget: 3 };
}

async function loadAllSlots(db) {
  const snap = await db.collection("chunbaek_slots").orderBy("dayIndex").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function loadMemberAttendance(db, memberId) {
  const snap = await db.collection("chunbaek_attendance").where("memberId", "==", memberId).get();
  const map = {};
  snap.forEach((d) => { map[d.data().slotId] = d.data(); });
  return map;
}
```

- [ ] **Step 2: computeMemberStats 구현**

PRD §3.3 규칙:
- `seasonDayIndex`: 오늘 날짜 기준 `dayIndex` (슬롯 date ≤ today)
- `seasonAttendCount`: 훈련일 + attended true
- `seasonAttendRate`: 분모 = 훈련일 & !exception, 분자 = attended
- `weekAttendCount` / `weekTargetMet`: 현재 주차, `weeklyTarget = min(config.weeklyTarget, countableSlots)`

- [ ] **Step 3: unit-style 검증 스크립트**

`scripts/verify-chunbaek-stats.js` — 메모리 내 mock slots+attendance로 기대값 assert (Firestore 불필요).

- [ ] **Step 4: my-profile에 stats 연동**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(chunbaek): 주·시즌 출석 집계 로직"
```

---

## Task 5: 출석 API (today-slot, save-attendance, my-timeline, team-summary)

**Files:**
- Modify: `functions/lib/chunbaek-handlers.js`
- Modify: `functions/lib/chunbaek-stats.js`

- [ ] **Step 1: today-slot (GET, token)**

오늘 KST 날짜에 매칭되는 slot 반환 (`todayKstDate()` — `new Date(Date.now() + 9*3600000).toISOString().slice(0,10)`). 없으면 시즌 전/후 메시지 플래그.

- [ ] **Step 2: save-attendance (POST, token)**

body: `{ slotId, attended, note?, photoUrl? }`

검증:
- slot 존재, `!isProgramOff`
- I2: slot.date가 속한 주의 **일요일 23:59:59 KST** 이전만 회원 저장 허용

```javascript
// functions/lib/chunbaek-stats.js — KST 주간 마감 (UTC+9, 일요일 23:59:59)
function weekSundayDeadlineKst(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utcMs = Date.UTC(y, m - 1, d);
  const kst = new Date(utcMs + 9 * 3600000);
  const dow = kst.getUTCDay(); // 0=일
  const daysToSun = (7 - dow) % 7;
  const sun = new Date(kst);
  sun.setUTCDate(sun.getUTCDate() + daysToSun);
  sun.setUTCHours(23, 59, 59, 999);
  return new Date(sun.getTime() - 9 * 3600000); // UTC instant
}
// now > weekSundayDeadlineKst(slot.date) → 403 (회원), admin만 허용
```
- `photoRequired` 시 photoUrl 필수
- upsert `chunbaek_attendance/{memberId}_{slotId}`

```javascript
await db.collection("chunbaek_attendance").doc(`${memberId}_${slotId}`).set({
  memberId, slotId,
  attended: !!attended,
  exception: false,
  note: note || "",
  photoUrl: photoUrl || "",
  updatedAt: FieldValue.serverTimestamp(),
  updatedBy: "member",
}, { merge: true });
```

- [ ] **Step 3: my-timeline (GET, token)**

주차별 슬롯 + 본인 출석 상태 배열 반환.

- [ ] **Step 4: team-summary (GET, token)**

participant 전원 + `goalMarathonNetTime` + 주간/시즌 stats (PB 제외).

- [ ] **Step 5: isProcessing 패턴** — 프론트용, 백엔드는 멱등 upsert로 충분

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(chunbaek): 출석·타임라인·팀 API"
```

---

## Task 6: 운영진 API (verify-admin, admin-grid, admin-set-attendance, admin-import-slots)

**Files:**
- Modify: `functions/lib/chunbaek-handlers.js`

- [ ] **Step 1: verify-admin (POST)**

DMC `race` API와 동일 비밀번호 (`DMC_ADMIN_PW`). 응답 `{ ok: true, role }`.

Admin 후속 요청: body에 `adminPw` 포함 (프론트 `sessionStorage.chunbaekAdminPw` — `group.html` 패턴).

- [ ] **Step 2: admin-grid (GET)**

query: `week`, `adminPw`

participant 목록 × 해당 주 slots 그리드 (출석/예외/미출석/사진 URL).

- [ ] **Step 3: admin-set-attendance (POST)**

body: `{ memberId, slotId, attended?, exception?, exceptionNote?, adminPw }`

`exception: true` → `attended: false`, `updatedBy: "admin"`, `exceptionSetBy: "admin"` (MVP — 운영진 단일 계정; 추후 operator id로 확장).

Admin 인증: 요청 body에 `adminPw` 필수. 프론트는 `sessionStorage.chunbaekAdminPw`에 비밀번호 저장 후 매 요청에 포함 (`group.html`과 동일 패턴).

- [ ] **Step 4: admin-import-slots (POST)**

body: `{ rows: [...], adminPw }` 또는 CSV text

각 row: `dayIndex, date, week, trainingLabel, isProgramOff`

I1: import 후 주차별 `trainingDayCount < 3` 경고 배열 `warnings` 반환.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(chunbaek): 운영진 admin API"
```

---

## Task 7: 에뮬 시드·샘플 데이터

**Files:**
- Create: `scripts/seed-emulator-chunbaek.js`
- Create: `scripts/samples/chunbaek-slots-week1.csv`
- Modify: `scripts/seed-emulator-pre-deploy.js` (chunbaek 시드 호출 추가)

- [ ] **Step 1: 샘플 CSV 7일치**

```csv
dayIndex,date,week,trainingLabel,isProgramOff
1,2026-04-01,1,5km 이지런,false
2,2026-04-02,1,인터벌,false
3,2026-04-03,1,휴무,true
4,2026-04-04,1,장거리,false
5,2026-04-05,1,이지런,false
6,2026-04-06,1,동마클 토요일,false
7,2026-04-07,1,인터벌,false
```

- [ ] **Step 2: seed-emulator-chunbaek.js**

생성 데이터:
- `members/chunbaek_seed_a`, `chunbaek_seed_b` — `chunbaekS3.participant: true`
- `chunbaek_season_config/chunbaek-s3`
- `chunbaek_slots/1` ~ `7` (샘플)
- seed_a: `profileComplete: true` (재로그인 테스트)
- seed_b: `profileComplete: false` (신규 가입 테스트)

- [ ] **Step 3: pre-deploy 시드 체인**

`scripts/seed-emulator-pre-deploy.js` 마지막에:

```javascript
require("child_process").execSync("node scripts/seed-emulator-chunbaek.js", { stdio: "inherit" });
```

- [ ] **Step 4: seed-chunbaek-participants.js (프로덕션용 스텁)**

`.cursor/skills/firestore-data-modification/SKILL.md` 절차 따름. CSV 입력 → `members` doc id 목록에 `chunbaekS3.participant: true` merge.

- [ ] **Step 5: Commit**

```bash
git add scripts/
git commit -m "chore(chunbaek): 에뮬 시드 및 샘플 슬롯 CSV"
```

---

## Task 8: 프론트엔드 공통 (api.js, CSS, SPA 셸)

**Files:**
- Create: `chunbaek/css/chunbaek.css`
- Create: `chunbaek/js/api.js`
- Create: `chunbaek/index.html`
- Create: `chunbaek/js/app.js`

- [ ] **Step 1: api.js**

`_docs/development/api-patterns.md` 준수:

```javascript
const IS_LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const API_BASE = IS_LOCAL
  ? `http://${location.hostname}:5001/dmc-attendance/asia-northeast3/chunbaek`
  : "/api/chunbaek";

const TOKEN_KEY = "chunbaekSessionToken";

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function apiGet(action, params = {}, needToken = false) {
  const qs = new URLSearchParams({ action, ...params });
  if (needToken) qs.set("token", getToken());
  const res = await fetch(`${API_BASE}?${qs}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "오류");
  return data;
}

async function apiPost(action, body, needToken = false) {
  const headers = { "Content-Type": "application/json" };
  if (needToken && getToken()) headers.Authorization = `Bearer ${getToken()}`;
  const res = await fetch(`${API_BASE}?action=${action}`, {
    method: "POST", headers, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "오류");
  return data;
}
```

- [ ] **Step 2: app.js 라우팅**

접속 시:
1. token 있음 → `my-profile` → `profileComplete` ? 메인 탭 : `#/profile`
2. token 없음 → `#/welcome`

Hash: `#/welcome`, `#/pick`, `#/profile`, `#/guide`, `#/today`, `#/timeline`, `#/team`, `#/me`

- [ ] **Step 3: index.html 셸**

- 온보딩 5 view container (display none/block)
- 하단 탭 4개 (`profileComplete` 후 표시)
- toast 영역
- `isProcessing` 플래그로 출석 버튼 중복 방지

- [ ] **Step 4: chunbaek.css**

모바일 우선, PRD §7.1 와이어 라벨: `42일차 / 100일`, `출석 N회 · 출석률 N%`

- [ ] **Step 5: 에뮬 브라우저 확인**

`http://127.0.0.1:5000/chunbaek/` 로드, 콘솔 오류 없음

- [ ] **Step 6: Commit**

```bash
git add chunbaek/
git commit -m "feat(chunbaek): SPA 셸 및 API 클라이언트"
```

---

## Task 9: 프론트엔드 — 온보딩 + 오늘 탭

**Files:**
- Modify: `chunbaek/js/app.js`
- Create: `chunbaek/js/views-today.js`

- [ ] **Step 1: 온보딩 ①~⑤ 구현**

- ②: `members-roster` 로드, 검색 필터, 가입됨 배지
- ③: 시·분 입력 → 초 변환, `create-profile`
- ④: 정적 가이드 카드
- 재로그인: `link-device` 후 ③④ 스킵

한글 IME: 해당 없음 (시·분은 `type="number"`)

- [ ] **Step 2: views-today.js**

- `today-slot` 로드
- 프로그램 휴무일 / 시즌 외 안내
- `[출석하기]` → `save-attendance` → 토스트 + stats 갱신
- 이번 주 N/3 표시

- [ ] **Step 3: 「다른 사람으로」**

`setToken(null)` → `#/welcome`

- [ ] **Step 4: 수동 E2E (에뮬)**

1. seed_b 신규 가입 → 출석
2. seed_a 재로그인 → 오늘 바로 진입

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(chunbaek): 온보딩 및 오늘 탭"
```

---

## Task 10: 프론트엔드 — 내 100일 · 팀 · 나 탭

**Files:**
- Create: `chunbaek/js/views-timeline.js`
- Create: `chunbaek/js/views-team.js`
- Create: `chunbaek/js/views-me.js`
- Modify: `chunbaek/js/app.js`

- [ ] **Step 1: views-timeline.js**

- `my-timeline` 주차별 접이 UI
- 미출석 슬롯 탭 → 출석 폼 (오늘과 동일 API)
- 주간/월간/시즌 서브탭 (집계는 API stats 활용)

- [ ] **Step 2: views-team.js**

- `team-summary` — 목표 공개, PB 미표시
- 주차 선택 (선택)

- [ ] **Step 3: views-me.js**

- 프로필·PB(본인)·출석 요약
- `[프로필 수정]` — MVP는 비활성 + "운영진에게 문의" 안내 (목표 변경은 admin)

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(chunbaek): 타임라인·팀·나 탭"
```

---

## Task 11: admin.html (운영진 PC)

**Files:**
- Create: `chunbaek/admin.html`
- Create: `chunbaek/js/admin.js`

- [ ] **Step 1: verify-admin 게이트**

`group.html` 패턴: 비밀번호 입력 → `sessionStorage.chunbaekAdminPw = pw` (매 admin API body에 `adminPw` 포함)

- [ ] **Step 2: 주차별 그리드**

- `admin-grid` 로드
- 셀 클릭 → 출석/미출석/예외 모달
- `admin-set-attendance` POST
- CSV import UI → `admin-import-slots`

- [ ] **Step 3: PC 레이아웃**

가로 스크롤 그리드, 미출석·주3회 미달 하이라이트

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(chunbaek): 운영진 admin 화면"
```

---

## Task 12: 통합 검증 + pre-deploy

**Files:**
- Create: `scripts/verify-chunbaek-emulator.js`
- Modify: `scripts/pre-deploy-test-runner.sh`

- [ ] **Step 1: verify-chunbaek-emulator.js**

에뮬에서 순서:
1. `members-roster` count ≥ 2
2. `create-profile` → token
3. `save-attendance` slotId=1
4. `my-profile` stats.seasonAttendCount === 1
5. token 없이 `my-profile` → 401

- [ ] **Step 2: pre-deploy-test-runner.sh 추가**

```bash
CHUNBAEK_API="http://127.0.0.1:5001/dmc-attendance/asia-northeast3/chunbaek"
# ping, members-roster, create-profile smoke
```

Hosting:

```bash
status=$(curl -s -o /dev/null -w "%{http_code}" "$HOST/chunbaek/")
assert "hosting: /chunbaek/" "200" "$status"
```

- [ ] **Step 3: 전체 pre-deploy 실행**

```bash
bash scripts/pre-deploy-test.sh
```

Expected: `✅ 전체 통과 — 배포 가능`

- [ ] **Step 4: PRD §14 갱신** — 구현 계획 링크 추가

- [ ] **Step 5: Commit**

```bash
git commit -m "test(chunbaek): 에뮬 검증 및 pre-deploy smoke"
```

---

## Task 13 (선택): 사진 업로드

MVP 출석·집계가 끝난 뒤 추가.

**Files:**
- Modify: `functions/lib/chunbaek-handlers.js`
- Modify: `chunbaek/js/views-today.js`

- [ ] **Step 1: upload-attendance-photo (POST, token)**

클라이언트 JPEG base64 → Admin SDK `bucket().file(...).save()` → `photoUrl` 반환

- [ ] **Step 2: 클라이언트 리사이즈**

canvas long edge 1200px → base64 POST

- [ ] **Step 3: photoRequired 검증 연동**

---

## 배포 체크리스트 (AI는 deploy 실행 금지)

`.cursor/skills/firebase-deploy/SKILL.md` 참조. 사용자 실행:

1. `bash scripts/pre-deploy-test.sh` 통과
2. `cd functions && node ../scripts/backup-firestore.js`
3. `git status` 깨끗한지 확인
4. `firebase deploy --only functions` (chunbaek 함수 포함)
5. `firebase deploy --only hosting`
6. `https://dmc-attendance.web.app/chunbaek/` 시크릿 모드 검증
7. 참가 40명 `seed-chunbaek-participants.js` 적용 (API 스킬 권장)
8. `git tag` (MINOR: 신기능)

---

## Firestore 인덱스 (필요 시)

콘솔에서 복합 쿼리 오류 발생 시 생성:

| Collection | Fields |
|------------|--------|
| `chunbaek_attendance` | `memberId` ASC, `slotId` ASC |
| `chunbaek_slots` | `week` ASC, `dayIndex` ASC |
| `chunbaek_slots` | `date` ASC |

단일 필드 쿼리만 사용하면 MVP에서 인덱스 없이 동작 가능 (전량 로드 후 메모리 필터).

---

## 위험·완화

| 위험 | 완화 |
|------|------|
| `index.js` 비대화 | lib 모듈 분리 (Task 1~6) |
| 명단 선택 대리 | session token (C1) + 운영 주간 감사 |
| 주당 훈련일 &lt; 3 | import 경고 + effective weeklyTarget |
| Hosting 미커밋 배포 | pre-deploy 전 `git status` 확인 (pre-deploy-checklist) |

---

## 완료 기준 (PRD §2)

- [ ] 참가자 10초 이내 오늘 출석 (에뮬 E2E)
- [ ] 오늘 화면 일차 vs 출석 횟수 라벨 분리
- [ ] 주 3회 자동 계산 (예외·프로그램 휴무 반영)
- [ ] admin PC 그리드에서 예외·대리 출석
- [ ] `pre-deploy-test.sh` 통과
- [ ] 브라우저 콘솔 오류 없음
