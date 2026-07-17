# DMC 출석 운영 어드민 허브 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `attendance-admin.html` 허브로 출석 관리·회원·정모 훈련 운영 UI를 제공하고, 기존 `admin.html`을 `#members`로 안전하게 이전한다.

**Architecture:** Approach A — 신규 `attendance-admin.html` + hash 탭(`#attendance` `#members` `#training`). 인증은 기존 `verify-admin`. `admin.html`은 리다이렉트만 남긴다. 삭제·훈련 API는 justification 게이트 후 별도 태스크.

**Tech Stack:** Vanilla HTML/CSS/JS, Firebase Hosting, `/race` `verify-admin` + `/attendance` GET/POST, Firestore.

**Spec:** `_docs/superpowers/specs/2026-07-17-attendance-admin-hub-design.md`  
**관련:** `_docs/superpowers/plans/2026-07-17-attendance-shell-redesign.md` (회원 앱 셸 · 개인 삭제)

**디자인 게이트:** Task 0(목업) 승인 전 Admin-1a 코드 착수 금지.

**본 계획 범위**

| Phase | 내용 | API |
|-------|------|-----|
| **Task 0** | 정적 목업 3탭 | 없음 |
| **Admin-1a** | 허브 + 출석 조회 + 회원 이식 + 리다이렉트 | 기존만 |
| **Delete-1** | 개인·운영진 삭제 | **신규** — justification 후 |
| **Admin-1b** | 정모 훈련 저장·회원앱 표시 | **신규** — justification 후 |

---

## File Structure

| 파일 | 책임 |
|------|------|
| `attendance-admin-mockup.html` | **Create** — 정적 목업 (auth + 3탭, 더미 데이터) |
| `attendance-admin.html` | **Create** — 실허브 셸·탭·인증 |
| `assets/attendance-admin.css` | **Create** — PC 우선 운영 UI |
| `attendance-admin.js` | **Create** — 라우터·auth·출석 조회·회원 패널 |
| `admin.html` | **Replace** → `#members` 리다이렉트 |
| `report.html` / `group.html` / `pamphlet*.html` | **Modify** — 링크·카피 «출석 운영» |
| `functions/index.js` | Delete-1 / Admin-1b 때만 수정 |
| `_docs/justification/…` | 신규 API 시 필수 |

**건드리지 않음 (본 계획 전반):** `ops.html`, `chunbaek/admin.html`, 대회 report 파이프라인 로직.

---

## Task 0: 어드민 허브 정적 목업 (디자인 컨펌용)

**Files:**
- Create: `attendance-admin-mockup.html`
- Reference: `chunbaek/admin.html`, `admin.html`, 설계서 §4·§7.2 공지 포맷

- [ ] **Step 1: 목업 HTML 작성**

PC 폭(~1100px) 기준. 포함 화면:

1. **비밀번호 오버레이** (더미 확인 → 셸 표시)
2. **상단바** — «동마클 출석 운영» + 탭: 출석 관리 | 회원 | 정모 훈련
3. **`#attendance`** — 날짜·유형(TUE/THU/SAT) 선택, 요약(N명), 명단 테이블, 행 «삭제» 버튼(목업 confirm만)
4. **`#members`** — 기존 회원 테이블 스케치(검색·추가 폼·숨김 토글 더미)
5. **`#training`** — 정모 칩 + 폼 필드:
   - 시간, 장소
   - 훈련 전 / 본 / 후
   - 급수·서포터즈
   - 메모  
   (실무 공지 샘플 데이터로 프리필)

미리보기 배너: `운영진 목업 · 가상 데이터`

- [ ] **Step 2: 로컬 확인**

```bash
# 기존 http.server 8765 재사용 가능
# http://127.0.0.1:8765/attendance-admin-mockup.html
```

Expected: 탭 전환, 훈련 폼이 공지 표와 대응, 출석 행 삭제 confirm 토스트.

- [ ] **Step 3: 커밋**

```bash
git add attendance-admin-mockup.html
git commit -m "docs(mockup): 출석 운영 어드민 허브 정적 목업"
```

- [ ] **Step 4: ⛔ 사용자 디자인 컨펌 대기**

승인 전 Task 1+ 금지.

---

## Task 1: Admin-1a — 허브 셸 + 인증 + 탭 라우터

**Files:**
- Create: `assets/attendance-admin.css`
- Create: `attendance-admin.html`
- Create: `attendance-admin.js` (골격)

- [ ] **Step 1: CSS — topbar, tabs, panels, table, auth**

춘백 admin 레이아웃 참고, DMC blue 토큰(`assets/design-tokens.css` link).

- [ ] **Step 2: HTML 셸**

```html
<link rel="stylesheet" href="assets/design-tokens.css" />
<link rel="stylesheet" href="assets/attendance-admin.css" />
<!-- auth overlay + shell: tabs attendance | members | training -->
<script src="attendance-admin.js" defer></script>
```

- [ ] **Step 3: JS — verify-admin + hash 라우터**

```javascript
// POST /race?action=verify-admin  body: { pw }  — admin.html과 동일 (password 아님)
// sessionStorage key: dmc_attendance_admin_auth
// showTab: attendance | members | training
// default hash: #attendance
```

기존 `admin.html`의 `tryAuth` / `API_BASE` 패턴 복사 (`api-patterns.md` 준수).

- [ ] **Step 4: 커밋**

```bash
git add assets/attendance-admin.css attendance-admin.html attendance-admin.js
git commit -m "feat(admin): attendance-admin hub shell and auth"
```

---

## Task 2: Admin-1a — 출석 관리 탭 (조회)

**Files:**
- Modify: `attendance-admin.js`
- Modify: `attendance-admin.html` (패널 마크업)

- [ ] **Step 1: 날짜·meetingType UI + loadRoster**

```javascript
// GET /attendance?action=status&date=YYYY/MM/DD
// GET /attendance?action=sessionCount&meetingDate=...&meetingType=TUE|THU|SAT
// Filter client-side by meetingType if status returns all types for the day
```

표시: 닉네임, 팀, 시각, (있으면) memberId.  
요약: `sessionCount`의 `memberCount` / `guestCount` (스펙 §7.0).  
삭제 버튼은 UI만 두고 **disabled** 또는 «Delete-1 후 활성» 툴팁 (Admin-1a에서는 동작 안 함).  
참고: Delete-1 justification에서 `status` 응답에 doc `id`가 없으면 **복합키 삭제** vs **status에 id 포함 확장** 중 하나를 명시할 것.

- [ ] **Step 2: 수동 스모크**

에뮬 또는 프로덕션 읽기: 알려진 정모일에 인원·명단 표시.

- [ ] **Step 3: 커밋**

```bash
git commit -m "feat(admin): attendance tab roster read-only"
```

---

## Task 3: Admin-1a — 회원 탭 이식 + admin.html 리다이렉트

**Files:**
- Modify: `attendance-admin.html` / `attendance-admin.js` — 기존 `admin.html` CRUD 이식
- Replace: `admin.html` → 리다이렉트
- Modify: `report.html`, `group.html`, `pamphlet.html`, `pamphlet-group-event.html` — 링크

- [ ] **Step 1: 회원 패널로 기존 로직 이전**

`all-members`, `add-member`, `update-member`, `hide-member` 동작 **동등** 유지.  
구 `dmc_admin_auth` 있으면 허브 키로 1회 마이그레이션.

- [ ] **Step 2: `admin.html` 리다이렉트**

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>출석 운영으로 이동</title>
  <script>
    location.replace(
      "attendance-admin.html" + (location.search || "") + "#members"
    );
  </script>
</head>
<body>
  <p><a href="attendance-admin.html#members">출석 운영 · 회원</a>으로 이동합니다.</p>
</body>
</html>
```

- [ ] **Step 3: 외부 링크 문구**

«회원 관리» → «출석 운영» 또는 «출석 운영 (회원)» + `attendance-admin.html#members`

- [ ] **Step 4: pre-deploy 테스트 갱신 (필수)**

`scripts/pre-deploy-test-runner.sh`(또는 동등)에서:

- `assert_contains "admin.html: verify-admin"` 류 검사 → **`attendance-admin.html`에 `verify-admin` 존재**로 변경
- `admin.html`은 리다이렉트/`attendance-admin` 링크만 검사

Admin-1a 직후 `bash scripts/pre-deploy-test.sh`가 깨지지 않게 할 것.

- [ ] **Step 5: 회귀 체크리스트**

- [ ] 회원 검색·추가·수정·숨김
- [ ] `admin.html` 북마크 → `#members`
- [ ] report/group에서 링크 진입
- [ ] pre-deploy-test 통과

- [ ] **Step 6: 커밋**

```bash
git commit -m "feat(admin): move members into hub; redirect admin.html"
```

---

## Task 4: Delete-1 — API justification (게이트)

**Files:**
- Create: `_docs/justification/YYYY-MM-DD-attendance-delete-justification.md`

- [ ] **Step 1: 전역 검색 (new-api-validation)**

최소 3패턴: `delete.*attendance`, `action.*delete`, `handlePost` attendance.

- [ ] **Step 2: justification 문서**

기존: POST 등록만, 스크립트 삭제만.  
신규:

| action | 용도 |
|--------|------|
| `delete-attendance` | 개인 — 당일 + memberId 매칭 |
| `admin-delete-attendance` | 운영 — verify-admin + event_logs |

- [ ] **Step 3: ⛔ 사용자 승인 대기**

승인 전 Task 5 금지.

---

## Task 5: Delete-1 — 구현 (승인 후)

**Files:**
- Modify: `functions/index.js` (`exports.attendance` GET/POST 분기 또는 action)
- Modify: `attendance-admin.js` — 운영진 삭제 버튼 활성
- Modify: 출석 셸 (`attendance-v2.js`) — 개인 «출석 취소» (셸 계획과 조율)
- Test: 에뮬 또는 `pre-deploy-test`에 스모크 추가

- [ ] **Step 1: 실패하는 테스트/스모크 시나리오 문서화**
- [ ] **Step 2: self-delete 구현** (당일·memberId)
- [ ] **Step 3: admin-delete 구현** (pw 검증·로그)
- [ ] **Step 4: UI 연결**
- [ ] **Step 5: pre-deploy-test / 수동 검증**
- [ ] **Step 6: 커밋**

```bash
git commit -m "feat(attendance): personal and admin delete-attendance APIs"
```

---

## Task 6: Admin-1b — 훈련 API justification (게이트)

**Files:**
- Create: `_docs/justification/YYYY-MM-DD-meeting-training-justification.md`

스키마 SSOT (설계서 §7.2):

`time`, `place`, `trainBefore`, `trainMain`, `trainAfter`, `supporters`, `note`  
키: `(meetingDateKey, meetingType)`

- [ ] **Step 1: 유사 API 전역 검색** (`chunbaek` week-slots 포함 — 대체 불가 이유 명시)
- [ ] **Step 2: justification + ⛔ 사용자 승인**

---

## Task 7: Admin-1b — 훈련 저장·허브 UI·셸 표시 (승인 후)

**Files:**
- Modify: `functions/index.js`
- Modify: `attendance-admin.js` — `#training` 저장/불러오기
- Modify: 출석 셸 오늘 탭 — 공지 표 연동

- [ ] **Step 1–5:** get/save API → 어드민 폼 → 셸 읽기 → 테스트 → 커밋

```bash
git commit -m "feat(attendance): meeting training get/save and today notice"
```

---

## Task 8: 검증·문서 마무리

- [ ] `bash scripts/pre-deploy-test.sh` (Delete/Training 병합 후)
- [ ] 설계서 상태 → 승인·구현 반영 노트
- [ ] PR 본문 체크리스트 업데이트
- [ ] **firebase deploy 실행하지 않음** — 사용자 안내만

---

## Out of Scope

- `ops` / `report` / `group` / 춘백 admin 통합
- 출석 필드 **수정**(삭제 후 재등록)
- Admin-2 설정 탭
- 회원 앱 더보기에 허브 링크

---

## Execution note

1. Task 0 목업 → 디자인 컨펌  
2. Admin-1a (Task 1–3)  
3. Delete-1 / Admin-1b는 **각각 승인 게이트**  
4. 출석 셸 개인 삭제는 Delete-1과 같은 API 묶음으로 구현
