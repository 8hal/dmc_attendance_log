# 회원 프로필 수정 (나 탭) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로필 완료 회원이 **나 탭 → 프로필 수정**에서 목표 대회·풀 목표·PB·각오를 스스로 변경하고, 팀·홈에 반영되게 한다.

**Architecture:** `create-profile`과 **동일 검증·동일 Firestore 필드**를 쓰는 `update-profile` API를 추가한다. Bearer token으로 본인만 수정. FE는 온보딩 ③ 프로필 폼을 **편집 모드로 재사용**한다. **admin 수정·신규 API 승인 절차는 생략** (운영진 지시: `create-profile`의 수정 변형으로 취급).

**Tech Stack:** Firebase Functions (`chunbaek-handlers.js`), Hosting (`chunbaek/index.html`, `app.js`, `api.js`), 에뮬 검증 (`verify-chunbaek-emulator.js`)

**범위 밖:** `admin-update-profile`, 닉네임 변경, 프로필 리셋 UI

**참고 문서:**
- `_docs/development/api-patterns.md`
- `_docs/development/naming-conventions.md`
- `_docs/superpowers/specs/2026-07-12-chunbaek-season3-attendance-design.md` §7.4
- `_docs/superpowers/specs/2026-07-12-chunbaek-season3-confirmed-decisions.md` §3

---

## 수정 가능 필드 (확정)

| 필드 | 수정 | 검증 |
|------|------|------|
| `goalRace` | ✅ | `chuncheon` \| `jtbc` \| `other` |
| `goalRaceNote` | ✅ | `other`일 때만, 최대 80자. 다른 대회 선택 시 **삭제** |
| `goalMarathonNetTime` | ✅ | 7200~25200초 (2:00~7:00) |
| `existingPbNetTime` | ✅ | 선택. 비우면 `null`/삭제 |
| `resolutionText` | ✅ | 최대 200자, 빈 문자열 → `null` |
| `nickname` | ❌ | DMC members 고정 |

---

## 파일 맵

| 파일 | 역할 |
|------|------|
| `functions/lib/chunbaek-handlers.js` | `parseProfileBody`, `handleUpdateProfile`, 라우팅 |
| `chunbaek/index.html` | 나 탭 버튼 활성화, (선택) 편집용 제목 id |
| `chunbaek/js/app.js` | 폼 prefill, `onUpdateProfile`, 편집 진입/취소 |
| `chunbaek/js/api.js` | `update-profile` mock (preview) |
| `scripts/verify-chunbaek-emulator.js` | A11 update-profile 시나리오 |
| `_docs/testing/2026-07-12-chunbaek-season3-pre-departure-test-plan.md` | C12 옆 수동 TC 1줄 (선택) |

---

## API 설계: `update-profile`

```
POST /api/chunbaek?action=update-profile
Authorization: Bearer <token>
Body: {
  goalRace: "chuncheon" | "jtbc" | "other",
  goalRaceNote?: string | null,
  goalMarathonNetTime: number,
  existingPbNetTime?: number | null,
  resolutionText?: string | null
}
```

| 조건 | 응답 |
|------|------|
| token 없음/무효 | 401 |
| `profileComplete !== true` | 400 `profile not complete` |
| 검증 실패 | 400 (create-profile와 동일 메시지) |
| participant 아님 | 404 |
| 성공 | 200 — `memberProfilePayload` 동형 (`ok`, `nickname`, `goalRaceLabel`, `stats`, …) |

**`create-profile`과 차이:**

| | create-profile | update-profile |
|--|----------------|----------------|
| 인증 | 없음 (`memberId` body) | Bearer token |
| `profileComplete` | false여야 함 (409 if true) | true여야 함 |
| token 발급 | 새 session 발급 | 기존 token 유지 (재발급 없음) |
| `profileComplete` 필드 | `true`로 설정 | 변경 없음 (true 유지) |

---

### Task 1: 백엔드 — 공통 파싱 + `update-profile`

**Files:**
- Modify: `functions/lib/chunbaek-handlers.js`

- [ ] **Step 1: `parseProfileFields(body)` 추출**

`create-profile`의 검증 로직을 함수로 분리:

```javascript
function parseProfileFields(body) {
  const goalMarathonNetTime = Number(body.goalMarathonNetTime);
  const existingPbNetTime = parseOptionalSeconds(body.existingPbNetTime);
  const resolutionText = String(body.resolutionText || "").trim().slice(0, 200) || null;
  const goalRaceParsed = parseGoalRace(body);
  if (goalRaceParsed.error) return { error: goalRaceParsed.error };
  if (!Number.isFinite(goalMarathonNetTime)
    || goalMarathonNetTime < GOAL_MIN_SEC
    || goalMarathonNetTime > GOAL_MAX_SEC) {
    return { error: `goalMarathonNetTime must be ${GOAL_MIN_SEC}~${GOAL_MAX_SEC} seconds` };
  }
  return {
    goalMarathonNetTime,
    existingPbNetTime,
    resolutionText,
    goalRace: goalRaceParsed.goalRace,
    goalRaceNote: goalRaceParsed.goalRaceNote,
  };
}

function buildProfileUpdate(parsed) {
  const update = {
    "chunbaekS3.goalMarathonNetTime": parsed.goalMarathonNetTime,
    "chunbaekS3.goalRace": parsed.goalRace,
    "chunbaekS3.resolutionText": parsed.resolutionText,
  };
  if (parsed.goalRace === "other" && parsed.goalRaceNote) {
    update["chunbaekS3.goalRaceNote"] = parsed.goalRaceNote;
  } else {
    update["chunbaekS3.goalRaceNote"] = FieldValue.delete();
  }
  if (parsed.existingPbNetTime !== null) {
    update["chunbaekS3.existingPbNetTime"] = parsed.existingPbNetTime;
  } else {
    update["chunbaekS3.existingPbNetTime"] = FieldValue.delete();
  }
  return update;
}
```

- [ ] **Step 2: `handleCreateProfile`를 `parseProfileFields` 사용으로 리팩터** (동작 동일 유지)

- [ ] **Step 3: `handleUpdateProfile` 추가**

```javascript
async function handleUpdateProfile(req, res, db) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }
  const auth = await requireMember(req, res, db);
  if (!auth) return undefined;

  const parsed = parseProfileFields(req.body || {});
  if (parsed.error) {
    return res.status(400).json({ ok: false, error: parsed.error });
  }

  const member = await loadParticipantMember(db, auth.memberId);
  if (!member) {
    return res.status(404).json({ ok: false, error: "participant not found" });
  }
  if (!member.s3.profileComplete) {
    return res.status(400).json({ ok: false, error: "profile not complete" });
  }

  await member.ref.update(buildProfileUpdate(parsed));
  const { stats } = await loadMemberStatsContext(db, auth.memberId);
  const fresh = await loadParticipantMember(db, auth.memberId);
  return res.json(memberProfilePayload(
    auth.memberId,
    fresh.data,
    fresh.s3,
    stats,
  ));
}
```

- [ ] **Step 4: 라우터에 등록**

```javascript
if (action === "update-profile") {
  return handleUpdateProfile(req, res, db);
}
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(chunbaek): update-profile API — 회원 프로필 수정"
```

---

### Task 2: 에뮬 검증

**Files:**
- Modify: `scripts/verify-chunbaek-emulator.js`

- [ ] **Step 1: create-profile 직후 update-profile 호출 추가**

```javascript
const updated = await apiPost("update-profile", {
  goalMarathonNetTime: 15000,
  goalRace: "jtbc",
  resolutionText: "수정됨",
}, token);
assert.equal(updated.status, 200);
assert.equal(updated.data.ok, true);
assert.equal(updated.data.goalRace, "jtbc");
assert.equal(updated.data.goalMarathonNetTime, 15000);
assert.equal(updated.data.resolutionText, "수정됨");

const noToken = await apiPost("update-profile", { goalMarathonNetTime: 15000, goalRace: "jtbc" });
assert.equal(noToken.status, 401);
```

- [ ] **Step 2: 에뮬 실행**

```bash
cd functions && npm ci
firebase emulators:exec --only functions,firestore \
  "node ../scripts/seed-emulator-chunbaek.js && node ../scripts/verify-chunbaek-emulator.js"
```

Expected: `verify-chunbaek-emulator: OK`

- [ ] **Step 3: Commit**

---

### Task 3: 프론트엔드 — 나 탭 + 편집 플로우

**Files:**
- Modify: `chunbaek/index.html`
- Modify: `chunbaek/js/app.js`
- Modify: `chunbaek/js/api.js` (preview mock만)

- [ ] **Step 1: `index.html` 나 탭 버튼 활성화**

```html
<button type="button" class="btn btn-outline" id="btn-edit-profile">프로필 수정</button>
```

`view-profile` 섹션에 편집 모드용 요소 (기존 id 재사용):
- `profile-section-title` — 「프로필」/「프로필 수정」 토글
- `btn-create-profile` → 생성 시에만 보이거나, 편집 시 `btn-save-profile`로 라벨 변경

**권장:** 버튼 id `btn-profile-submit` 하나로 통일, `state.profileFormMode`에 따라 텍스트만 변경.

- [ ] **Step 2: `state.profileFormMode` — `'create' | 'edit'`**

`openProfileEdit()`:
1. `my-profile` 또는 `state.profile`에서 현재 값 로드
2. `goal-h/m/s`, `pb-h/m/s`, `goal-race` radio, `goal-race-note`, `resolution-text` prefill
3. `syncGoalRaceNote()`
4. `showView("profile")` — 하단 탭 숨김 유지 (온보딩과 동일)
5. 제목: 「프로필 수정」, 버튼: 「저장」

취소: `btn-profile-cancel` (ghost) → `showView("me")`

- [ ] **Step 3: 폼 값 읽기 공통화**

`readProfileFormFromDom()` — `onCreateProfile` / `onUpdateProfile` 공용 (기존 onCreateProfile 본문 추출).

- [ ] **Step 4: `onUpdateProfile`**

```javascript
async function onUpdateProfile() {
  if (state.isProcessing) return;
  state.isProcessing = true;
  try {
    const body = readProfileFormFromDom();
    if (body.error) { showToast(body.error, true); return; }
    const data = await apiPost("update-profile", body, true);
    state.profile = data;
    showToast("프로필이 저장되었습니다");
    showView("me");
    renderMe();
    paintStatsHeader(data); // 홈 헤더 동기화
  } catch (e) {
    showToast(e.message, true);
  } finally {
    state.isProcessing = false;
  }
}
```

`btn-profile-submit` 클릭 시 `state.profileFormMode === 'edit' ? onUpdateProfile() : onCreateProfile()`.

- [ ] **Step 5: `renderMe` 후 프로필 없으면 버튼 숨김**

`profileComplete` false면 `btn-edit-profile` disabled 또는 hidden.

- [ ] **Step 6: `api.js` preview mock**

`update-profile` → `MOCK.profile` merge 후 반환.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(chunbaek): 나 탭 프로필 수정 UI"
```

---

### Task 4: 수동 검증 + 배포

- [ ] **Step 1: 로컬/프로덕션 수동 TC**

| # | 동작 | 기대 |
|---|------|------|
| M1 | 나 탭 → 프로필 수정 | 온보딩과 동일 폼, 기존 값 채워짐 |
| M2 | 목표 대회 JTBC → 저장 | 나·팀 탭 `goalRaceLabel` 갱신 |
| M3 | 기타 → 춘천 변경 | `goalRaceNote` 사라짐 |
| M4 | PB 비우고 저장 | 나 탭 PB `—` |
| M5 | token 없이 API | 401 |

- [ ] **Step 2: 배포 (사용자 실행)**

```bash
nvm use 22
./node_modules/.bin/firebase deploy --only functions
./node_modules/.bin/firebase deploy --only hosting
```

Functions 먼저 (API), Hosting 나중.

- [ ] **Step 3: 일지 한 줄** — `_docs/log/YYYY-MM-DD.md` (선택)

---

## 리스크·주의

1. **팀 공개 목표** — `goalMarathonNetTime`·`goalRaceLabel`은 팀에 노출됨 (기존 정책 유지). 각오는 팀 미노출.
2. **동시 수정** — 마지막 저장 wins (MVP 허용).
3. **온보딩과 UI 공유** — `showView("profile")` 시 탭 바 숨김; 취소 시 `me`로 복귀 필수.
4. **`goalRaceNote` 삭제** — `other` 해제 시 Firestore 필드 delete (잔존 라벨 버그 방지).

---

## 완료 기준 (Definition of Done)

- [ ] `update-profile` 에뮬 테스트 통과
- [ ] 나 탭에서 수정 → 저장 → 나/팀/홈 반영
- [ ] `create-profile` 회귀 없음 (신규 가입 E2E)
- [ ] admin 수정 없음 (범위 밖)

---

## 실행 옵션

**Plan path:** `_docs/superpowers/plans/2026-07-12-chunbaek-member-update-profile.md`

1. **Subagent-Driven** — 태스크마다 서브에이전트 + 리뷰
2. **Inline Execution** — 이 세션에서 Task 1→4 순차 구현

구현 시작 시 `@executing-plans` 또는 `@subagent-driven-development` 스킬을 사용한다.
