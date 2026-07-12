# 춘백 시즌3 — 운영자(Admin) API 스펙

> **작성일:** 2026-07-12  
> **상태:** 확정 대기 — 구현(Task 6) 전 SSOT  
> **베이스 URL:** `/api/chunbaek?action=<action>` (Cloud Function `chunbaek`)

---

## 관련 문서

| 문서 | 역할 |
|------|------|
| [PRD](./2026-07-12-chunbaek-season3-attendance-design.md) §7.5, §8.3~8.5, §16.6~16.7 | 제품 요구·운영 시나리오 |
| [확정 사항](./2026-07-12-chunbaek-season3-confirmed-decisions.md) | 정책 요약 |
| [구현 계획](../plans/2026-07-12-chunbaek-season3-mvp-impl.md) Task 6, 11 | 구현 체크리스트 |
| [회원 API 핸들러](../../../functions/lib/chunbaek-handlers.js) | 기존 패턴·데이터 모델 |

---

## 1. 범위

### 1.1 MVP 필수 (Task 6)

| action | 메서드 | 용도 |
|--------|--------|------|
| `verify-admin` | POST | 운영진 비밀번호 검증 (화면 게이트) |
| `admin-grid` | GET | 주차별 **출석** 그리드 |
| `admin-set-attendance` | POST | 출석·미출석·예외·대리 입력 |
| `admin-week-slots` | GET | 주차별 **훈련** 슬롯 조회 (훈련 입력 화면) |
| `admin-save-week-slots` | POST | 주차별 **훈련** 내용 저장 |
| `admin-import-slots` | POST | 100슬롯 일괄 import (시즌 골격·초기 데이터용, 선택) |

> **실운영 메인:** 훈련표는 보통 **주차별로 공개**된다. 운영진은 `admin-week-slots` → 편집 → `admin-save-week-slots` 흐름이 기본이다. `admin-import-slots`는 시즌 시작 전 100일 골격을 한 번에 넣을 때만 쓴다.

### 1.2 MVP 확장 (권장 — PRD §16.6 운영 시나리오)

| action | 메서드 | 용도 |
|--------|--------|------|
| `admin-set-participant` | POST | 참가자 추가·제외 (`participant` 플래그) |
| `admin-reset-profile` | POST | 프로필 초기화 + 세션 revoke (잘못된 가입·닉네임 오선택) |
| `admin-update-profile` | POST | 목표·PB·각오 수정 (회원 앱 수정 비활성) |

> **제안:** 위 3개는 Firestore 직접 수정 없이 운영 가능하게 하려면 MVP에 포함하는 것이 좋다. 시즌 전 participant 시드는 스크립트로도 가능하나, **시즌 중 추가·제외·프로필 수정**은 admin API가 필요하다.

### 1.3 Phase 2 (이번 스펙에서 제외)

| action | 사유 |
|--------|------|
| `admin-season-config` | 시즌 시작 전 1회 — MVP는 `seed` 스크립트·Firestore 직접 설정 |
| `admin-export-grid` | 그리드 CSV 다운로드 — UI에서 클라이언트 생성으로 대체 가능 |
| `admin-revoke-sessions` (단독) | `admin-reset-profile`에 포함 |

---

## 2. 공통 규칙

### 2.1 엔드포인트

```
GET  /api/chunbaek?action=<action>&...
POST /api/chunbaek?action=<action>
Content-Type: application/json
```

에뮬레이터:

```
http://localhost:5001/dmc-attendance/asia-northeast3/chunbaek?action=...
```

### 2.2 응답 형식

성공:

```json
{ "ok": true, ... }
```

실패:

```json
{ "ok": false, "error": "<machine-readable code or message>" }
```

| HTTP | 의미 | 예시 `error` |
|------|------|----------------|
| 400 | 잘못된 요청 | `memberId required`, `invalid slot state` |
| 401 | 인증 실패 | `invalid password`, `adminPw required` |
| 403 | 권한·정책 거부 | (admin API에서는 거의 없음) |
| 404 | 리소스 없음 | `participant not found`, `slot not found` |
| 405 | 메서드 불일치 | `GET only`, `POST only` |
| 409 | 충돌 | `slots already exist` (import 시) |
| 500 | 서버 오류 | `server error` |

### 2.3 운영진 인증

DMC `race` API `verify-admin`과 **동일 비밀번호**를 사용한다.

| 환경변수 | role (verify-admin 응답) |
|----------|---------------------------|
| `DMC_OWNER_PW` | `owner` |
| `DMC_ADMIN_PW` (기본값 `dmc2008`) | `operator` |

**MVP:** 춘백 admin은 `owner`·`operator` **구분 없이** 동일 권한. role은 UI 표시·로그용만.

#### 2.3.1 `verify-admin` (화면 게이트)

회원 API와 달리 **서버 세션 토큰을 발급하지 않는다.** 프론트가 비밀번호를 `sessionStorage`에 보관하고, 이후 admin API마다 전달한다 (`ops.html`의 `ownerPw` 패턴).

```
POST ?action=verify-admin
Body: { "pw": "<비밀번호>" }

200: { "ok": true, "role": "owner" | "operator" }
401: { "ok": false, "error": "invalid password" }
```

프론트 (`chunbaek/admin.html`):

```javascript
sessionStorage.setItem("chunbaekAdminPw", pw);
// 이후 모든 admin API에 adminPw 포함
```

#### 2.3.2 Admin API 인증 (매 요청)

| 메서드 | `adminPw` 위치 |
|--------|----------------|
| GET | query: `?adminPw=...` |
| POST | body: `{ "adminPw": "...", ... }` |

서버 헬퍼 (구현 시):

```javascript
function requireAdmin(req) {
  const adminPw = req.method === "GET"
    ? req.query.adminPw
    : (req.body || {}).adminPw;
  const ownerPw = process.env.DMC_OWNER_PW;
  const expected = process.env.DMC_ADMIN_PW || "dmc2008";
  if (ownerPw && adminPw === ownerPw) return { ok: true, role: "owner" };
  if (adminPw === expected) return { ok: true, role: "operator" };
  return { ok: false, status: 401, error: "invalid password" };
}
```

`adminPw` 누락 → `401` + `adminPw required`.

---

## 3. API 상세

### 3.1 `admin-grid` — 주차별 출석 그리드

**용도:** PRD §7.5 운영 PC 화면. 참가자 × 해당 주 슬롯 매트릭스.

```
GET ?action=admin-grid&week=7&adminPw=...
```

| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `week` | ○ | 주차 번호 (정수, ≥1) |
| `adminPw` | ○ | 운영진 비밀번호 |

**응답 200:**

```json
{
  "ok": true,
  "week": 7,
  "range": "4/7 ~ 4/13",
  "seasonDayIndex": 42,
  "participantCount": 38,
  "weekSummary": {
    "trainingDayCount": 5,
    "weeklyTarget": 3,
    "underTargetCount": 4
  },
  "slots": [
    {
      "slotId": 36,
      "dayIndex": 36,
      "date": "2026-04-07",
      "trainingLabel": "5km 인터벌",
      "isProgramOff": false
    },
    {
      "slotId": 37,
      "dayIndex": 37,
      "date": "2026-04-08",
      "trainingLabel": "휴무",
      "isProgramOff": true
    }
  ],
  "members": [
    {
      "memberId": "abc123",
      "nickname": "김러너",
      "profileComplete": true,
      "weekAttendCount": 2,
      "weekTarget": 3,
      "weekTargetMet": false,
      "cells": [
        {
          "slotId": 36,
          "status": "attend",
          "attended": true,
          "exception": false,
          "exceptionNote": "",
          "photoUrl": "https://...",
          "note": "",
          "updatedBy": "member"
        },
        {
          "slotId": 37,
          "status": "off",
          "attended": false,
          "exception": false,
          "exceptionNote": "",
          "photoUrl": "",
          "note": "",
          "updatedBy": null
        }
      ]
    }
  ]
}
```

#### 3.1.1 셀 `status` 값

회원 타임라인(`chunbaek-stats.slotStatus`)과 동일 + admin 전용:

| status | 조건 | 그리드 표시 |
|--------|------|-------------|
| `off` | `slot.isProgramOff === true` | `—` (편집 불가) |
| `exception` | `attendance.exception === true` | `예외` |
| `attend` | `attendance.attended === true` | `✓` (+ 📷 if photoUrl) |
| `miss` | 훈련일, 과거, 미출석 | `—` (빨간 하이라이트 후보) |
| `today` | 훈련일, 오늘, 미출석 | `—` |
| `future` | 훈련일, 미래 | `·` (편집 가능 — 대리 출석 허용 여부는 정책 참고) |

#### 3.1.2 `weekSummary.underTargetCount`

해당 주 기준 `weekTargetMet === false` 인 **profileComplete 참가자** 수. 패널티 후보 필터용.

#### 3.1.3 `week` 생략 시

`week` 미지정 → **오늘 KST 기준 현재 주차** 반환 (구현 편의).

---

### 3.2 `admin-set-attendance` — 출석·예외·대리 입력

**용도:** PRD §8.3 예외 처리, §8.4 대리 출석. **주차 마감(I2) 이후에도** 운영진은 수정 가능 (회원 `save-attendance`는 403).

```
POST ?action=admin-set-attendance
Body: {
  "adminPw": "...",
  "memberId": "abc123",
  "slotId": 36,
  "attended": true,
  "exception": false,
  "exceptionNote": "",
  "note": "",
  "photoUrl": ""
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `memberId` | ○ | `members` 문서 ID |
| `slotId` | ○ | `dayIndex` 또는 `chunbaek_slots` 문서 ID |
| `attended` | △ | `exception: false`일 때 의미 있음 |
| `exception` | △ | `true`이면 예외 처리 |
| `exceptionNote` | △ | `exception: true`일 때 권장 (최대 200자) |
| `note` | × | 회원 메모 (최대 500자) |
| `photoUrl` | × | 최대 2000자 |

#### 3.2.1 상태 전이 규칙

| 동작 | `attended` | `exception` | `updatedBy` | 비고 |
|------|------------|-------------|-------------|------|
| **출석** | `true` | `false` | `"admin"` | 대리 출석 |
| **미출석** | `false` | `false` | `"admin"` | 출석 취소 |
| **예외** | `false` | `true` | `"admin"` | 주간 집계 분모·분자 제외 |
| **예외 해제** | `false` | `false` | `"admin"` | 다시 미출석 상태 |

- `exception: true`이면 서버가 **`attended: false`로 강제** (회원 API와 동일).
- `isProgramOff: true` 슬롯 → `400` + `program off day`.
- `participant` 아님 또는 `hidden` → `404`.
- 문서 ID: `{memberId}_{slotId}` 멱등 upsert (`chunbaek_attendance`).

**응답 200:**

```json
{
  "ok": true,
  "memberId": "abc123",
  "slotId": 36,
  "attended": true,
  "exception": false,
  "weekAttendCount": 3,
  "weekTarget": 3,
  "weekTargetMet": true
}
```

`weekAttendCount` 등은 저장 직후 해당 회원 기준 재계산 값 (UI 갱신용).

---

### 3.3 `admin-week-slots` — 주차별 훈련 슬롯 조회

**용도:** PRD §7.5 **슬롯 편집** 탭. 해당 주의 일별 훈련 계획을 보고·입력 폼에 채운다. (출석 그리드와 **별도** — 훈련 라벨 편집 전용)

```
GET ?action=admin-week-slots&week=7&adminPw=...
```

| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `week` | △ | 주차 번호. 생략 시 오늘 KST 기준 **현재 주** |
| `adminPw` | ○ | 운영진 비밀번호 |

**응답 200:**

```json
{
  "ok": true,
  "week": 7,
  "range": "4/7 ~ 4/13",
  "summary": {
    "slotCount": 7,
    "filledCount": 5,
    "trainingDayCount": 4,
    "weeklyTarget": 3,
    "warning": null
  },
  "slots": [
    {
      "slotId": 36,
      "dayIndex": 36,
      "date": "2026-04-07",
      "week": 7,
      "trainingLabel": "5km 인터벌 + 코어 20분",
      "trainingType": "interval",
      "isProgramOff": false,
      "hasAttendance": true
    },
    {
      "slotId": 37,
      "dayIndex": 37,
      "date": "2026-04-08",
      "week": 7,
      "trainingLabel": "",
      "trainingType": null,
      "isProgramOff": false,
      "hasAttendance": false
    },
    {
      "slotId": 38,
      "dayIndex": 38,
      "date": "2026-04-09",
      "week": 7,
      "trainingLabel": "휴무",
      "trainingType": "off",
      "isProgramOff": true,
      "hasAttendance": false
    }
  ]
}
```

#### 3.3.1 필드 설명

| 필드 | 설명 |
|------|------|
| `filledCount` | `trainingLabel`이 비어 있지 않거나 `isProgramOff: true`인 슬롯 수 (입력 완료로 간주) |
| `trainingDayCount` | `!isProgramOff` 슬롯 수 (I1 주간 목표 cap 계산용) |
| `warning` | `trainingDayCount < 3` 이면 문자열, 아니면 `null` |
| `hasAttendance` | 해당 슬롯에 `chunbaek_attendance` 1건이라도 있으면 `true` — 라벨 수정 시 UI 경고용 |

#### 3.3.2 해당 주 슬롯이 아직 없을 때

`chunbaek_slots`에 해당 `week` 문서가 없으면:

- `chunbaek_season_config`의 `startDate`·기존 슬롯 날짜 범위로 **그 주의 달력 7일**을 계산해 **빈 행**을 반환한다 (`dayIndex`·`slotId` 없음, `trainingLabel: ""`).
- 프론트는 빈 행에 `dayIndex`·날짜를 표시하고, `admin-save-week-slots` 저장 시 **신규 슬롯 생성(upsert)**.

> 시즌 골격을 미리 import해 두면 `dayIndex`·`slotId`가 채워진 상태로 반환된다 (권장).

---

### 3.4 `admin-save-week-slots` — 주차별 훈련 저장

**용도:** 매주(또는 해당 주 시작 전) 훈련 내용 입력·수정. **실운영에서 가장 자주 쓰는 API.**

```
POST ?action=admin-save-week-slots
Body: {
  "adminPw": "...",
  "week": 7,
  "rows": [
    {
      "dayIndex": 36,
      "date": "2026-04-07",
      "trainingLabel": "5km 인터벌 + 코어 20분",
      "isProgramOff": false,
      "trainingType": "interval"
    },
    {
      "dayIndex": 37,
      "date": "2026-04-08",
      "trainingLabel": "휴무",
      "isProgramOff": true,
      "trainingType": "off"
    }
  ]
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `week` | ○ | 저장 대상 주차 (본문 `rows[].week`와 불일치 시 400) |
| `rows` | ○ | 1~7건 (해당 주 일수). 빈 배열 불가 |
| `rows[].dayIndex` | △ | 있으면 문서 ID `String(dayIndex)` 사용. 없으면 서버가 시즌 내 다음 번호 할당 |
| `rows[].date` | ○ | `YYYY-MM-DD` |
| `rows[].trainingLabel` | △ | `isProgramOff: true`이면 `"휴무"` 등 짧은 라벨 권장. 훈련일이면 1~200자 **필수** |
| `rows[].isProgramOff` | ○ | boolean |
| `rows[].trainingType` | × | `interval` \| `long` \| `dawn` \| `dongmak_sat` \| `off` \| `easy` |

#### 3.4.1 저장 규칙

- `dayIndex`별 **upsert** (`chunbaek_slots/{dayIndex}`).
- `week`·`date`는 요청 값으로 덮어씀 (주차 재배치는 운영진 책임).
- `isProgramOff: true`이면 `trainingType` 기본 `"off"`.
- 이미 `chunbaek_attendance`가 있는 슬롯의 `isProgramOff`를 `true`로 바꾸려 하면 → `409` + `attendance exists` (출석 데이터와 충돌).
- `trainingLabel`만 변경하는 것은 **항상 허용** (`hasAttendance` 있어도 OK).

#### 3.4.2 I1 경고

저장 후 해당 주 `trainingDayCount` 재계산. `< 3`이면 `warnings` 배열에 포함.

**응답 200:**

```json
{
  "ok": true,
  "week": 7,
  "saved": 7,
  "trainingDayCount": 5,
  "warnings": []
}
```

---

### 3.5 `admin-import-slots` — 100슬롯 일괄 import (부트스트랩)

**용도:** 시즌 **시작 전** 100일 날짜·주차 골격을 한 번에 등록. 훈련 라벨은 비워 두거나 임시 값으로 넣고, **시즌 중에는 §3.3~3.4 주차별 입력**으로 갱신한다.

```
POST ?action=admin-import-slots
Body: {
  "adminPw": "...",
  "mode": "replace",
  "rows": [
    {
      "dayIndex": 1,
      "date": "2026-04-01",
      "week": 1,
      "trainingLabel": "5km 이지런",
      "isProgramOff": false,
      "trainingType": "easy"
    }
  ]
}
```

또는 CSV 텍스트:

```json
{
  "adminPw": "...",
  "mode": "replace",
  "csv": "dayIndex,date,week,trainingLabel,isProgramOff\n1,2026-04-01,1,5km 이지런,false\n"
}
```

`rows`와 `csv` 동시 제공 시 **`rows` 우선**.

#### 3.5.1 Row 스키마

| 필드 | 필수 | 검증 |
|------|------|------|
| `dayIndex` | ○ | 1~100 정수, import 내 유일 |
| `date` | ○ | `YYYY-MM-DD`, KST 달력일 |
| `week` | ○ | 정수 ≥1 |
| `trainingLabel` | ○ | 1~200자 |
| `isProgramOff` | ○ | boolean (`"true"`/`"false"` CSV 파싱) |
| `trainingType` | × | `interval` \| `long` \| `dawn` \| `dongmak_sat` \| `off` \| `easy` |

Firestore 문서 ID: `String(dayIndex)` (예: `chunbaek_slots/42`).

#### 3.5.2 `mode`

| mode | 동작 |
|------|------|
| `replace` (기본) | 기존 `chunbaek_slots` **전체 삭제** 후 import (시즌 시작 전) |
| `merge` | `dayIndex`별 upsert만 (부분 수정 — Phase 2 UI용, MVP 구현 가능) |

`replace` + 기존 `chunbaek_attendance` 존재 시:

- **경고만 반환** (`warnings`에 `attendanceExists: true`) — 삭제는 하지 않음 (출석 데이터 보호).
- 운영진이 의도적 재시작이면 별도 스크립트로 attendance 정리 후 import.

#### 3.5.3 I1 — 주차별 훈련일 경고

import 후 주차별 `trainingDayCount`(=`!isProgramOff` 슬롯 수) 계산:

```json
{
  "ok": true,
  "imported": 100,
  "warnings": [
    { "week": 3, "trainingDayCount": 2, "message": "훈련일 2일 — 주 3회 목표 불가 (자동 cap=min(3,2))" }
  ]
}
```

`trainingDayCount < 3` 인 주차만 `warnings`에 포함.

**응답 200 (요약):**

```json
{
  "ok": true,
  "imported": 100,
  "mode": "replace",
  "dateRange": { "start": "2026-04-01", "end": "2026-07-08" },
  "warnings": []
}
```

---

### 3.6 `admin-set-participant` — 참가자 추가·제외 (MVP 확장)

**용도:** [확정 §3.1](./2026-07-12-chunbaek-season3-confirmed-decisions.md) 시즌 중 합류·제외.

```
POST ?action=admin-set-participant
Body: {
  "adminPw": "...",
  "memberId": "abc123",
  "participant": true
}
```

| `participant` | 서버 동작 |
|---------------|-----------|
| `true` | `chunbaekS3.participant: true` merge. 신규면 `profileComplete: false` 기본 |
| `false` | `chunbaekS3.participant: false` — 명단·회원 API 접근 차단. **기존 출석·프로필 데이터는 삭제하지 않음** (감사·복구용) |

- `members` 문서 없음 → `404`.
- `hidden: true` 회원에 `participant: true` → `400` + `hidden member`.

**응답 200:**

```json
{
  "ok": true,
  "memberId": "abc123",
  "nickname": "김러너",
  "participant": true,
  "profileComplete": false
}
```

---

### 3.7 `admin-reset-profile` — 프로필 초기화 (MVP 확장)

**용도:** PRD §16.6 — 잘못된 닉네임 선택·재가입 유도.

```
POST ?action=admin-reset-profile
Body: {
  "adminPw": "...",
  "memberId": "abc123",
  "revokeSessions": true
}
```

**서버 동작:**

1. `chunbaekS3.profileComplete` → `false`
2. `goalMarathonNetTime`, `existingPbNetTime`, `resolutionText` → `FieldValue.delete()` (또는 `null`)
3. `revokeSessions: true`(기본) → 해당 `memberId`의 `chunbaek_sessions` 전부 `revoked: true`

**출석 데이터(`chunbaek_attendance`)는 유지** — 시즌 중 닉네임 오선택만 수정할 때 출석 이력 보존. 전면 초기화가 필요하면 별도 스크립트.

**응답 200:**

```json
{
  "ok": true,
  "memberId": "abc123",
  "profileComplete": false,
  "sessionsRevoked": 2
}
```

---

### 3.8 `admin-update-profile` — 프로필 필드 수정 (MVP 확장)

**용도:** PRD §16.6 — 목표·PB 수정 (회원 앱 MVP는 수정 비활성).

```
POST ?action=admin-update-profile
Body: {
  "adminPw": "...",
  "memberId": "abc123",
  "goalMarathonNetTime": 16200,
  "existingPbNetTime": null,
  "resolutionText": "4:30 도전!"
}
```

- 전달된 필드만 merge (부분 업데이트).
- `goalMarathonNetTime` 검증: 회원 `create-profile`와 동일 (`7200`~`25200` 초).
- `resolutionText`: 최대 200자.
- `profileComplete: false` 회원 → `400` + `profile not complete` (신규 가입은 본인 `create-profile` 사용).

**응답 200:**

```json
{
  "ok": true,
  "memberId": "abc123",
  "goalMarathonNetTime": 16200,
  "existingPbNetTime": null,
  "resolutionText": "4:30 도전!"
}
```

---

## 4. 데이터·집계 연동

### 4.1 Admin 수정이 집계에 미치는 영향

| 필드 | 주간/시즌 집계 |
|------|----------------|
| `attended: true`, `exception: false` | 분자 +1 (훈련일·과거·오늘) |
| `exception: true` | 분모·분자 모두 제외 |
| `isProgramOff` 슬롯 | 애초에 집계 제외 |

집계 로직 SSOT: `functions/lib/chunbaek-stats.js` (`computeMemberStats`, `computeWeekStats`).

### 4.2 회원 vs 운영진 수정 권한

| 상황 | 회원 `save-attendance` | `admin-set-attendance` |
|------|------------------------|-------------------------|
| 해당 주 일요일 23:59 KST 이전 | ○ | ○ |
| 주차 마감 이후 | ✗ (403) | ○ |
| `exception` 설정 | ✗ | ○ |
| `isProgramOff` 슬롯 | ✗ | ✗ |

---

## 5. 프론트엔드 계약 (`chunbaek/admin.html`)

### 5.1 인증 플로우

```
1. admin.html 로드 → 비밀번호 오버레이
2. POST verify-admin { pw }
3. 성공 → sessionStorage.chunbaekAdminPw = pw
4. admin-grid 등 호출 시 adminPw 포함
```

### 5.2 api.js 확장 (Task 11)

```javascript
function getAdminPw() {
  return sessionStorage.getItem("chunbaekAdminPw") || "";
}

async function adminGet(action, params = {}) {
  const qs = new URLSearchParams({ action, adminPw: getAdminPw(), ...params });
  const res = await fetch(`${API_BASE}?${qs}`);
  return res.json();
}

async function adminPost(action, body = {}) {
  const res = await fetch(`${API_BASE}?action=${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adminPw: getAdminPw(), ...body }),
  });
  return res.json();
}
```

### 5.3 admin.html 탭 구조 (PRD §7.5)

| 좌측 메뉴 | 화면 | API |
|-----------|------|-----|
| **출석 그리드** | 참가자 × 슬롯 매트릭스 | `admin-grid` |
| **훈련 입력** | 주차별 일일 훈련 라벨 편집 | `admin-week-slots` → `admin-save-week-slots` |
| **일괄 import** | 100일 CSV 업로드 (시즌 초기 1회) | `admin-import-slots` |
| 시즌 설정 | (MVP) Firestore·스크립트 | — |

**훈련 입력 화면 (와이어):**

```
┌─────────────────────────────────────┐
│  7주차  4/7 ~ 4/13    [저장]        │
│  입력 5/7일 · 훈련일 4일 (목표 3회)  │
├────────┬──────────────────┬────────┤
│ 36일차 │ 4/7 (월)         │ [휴무] │
│        │ 5km 인터벌+코어  │        │
├────────┼──────────────────┼────────┤
│ 37일차 │ 4/8 (화)         │ [휴무] │
│        │ (비어 있음)      │        │
└────────┴──────────────────┴────────┘
```

### 5.4 UI ↔ API 매핑

| UI 동작 | API |
|---------|-----|
| 출석 탭 — 주차 선택 | `admin-grid?week=N` |
| 셀 → 출석 | `admin-set-attendance { attended: true, exception: false }` |
| 셀 → 미출석 | `admin-set-attendance { attended: false, exception: false }` |
| 셀 → 예외 | `admin-set-attendance { exception: true, exceptionNote }` |
| 훈련 탭 — 주차 로드 | `admin-week-slots?week=N` |
| 훈련 탭 — [저장] | `admin-save-week-slots { week, rows }` |
| 일괄 import | `admin-import-slots { rows \| csv }` |
| 참가자 추가 | `admin-set-participant { participant: true }` |
| 프로필 초기화 | `admin-reset-profile` |
| 목표 수정 | `admin-update-profile` |

### 5.5 운영 시나리오 — 주차별 훈련 공개

1. **시즌 시작 전 (선택):** `admin-import-slots`로 100일 **날짜·주차 골격**만 import (`trainingLabel` 빈 값 가능).
2. **매주:** 운영진이 **훈련 입력** 탭 → 다음 주(또는 이번 주) 선택.
3. 일별 `trainingLabel`·휴무 체크 후 **[저장]** → `admin-save-week-slots`.
4. 회원 앱 **홈·내 100일**에 해당 주 훈련 내용 즉시 반영 (`today-slot`, `my-timeline`).

---

## 6. 보안·운영

| 항목 | 정책 |
|------|------|
| Admin URL | `/chunbaek/admin.html` — 단톡에 **공개하지 않음** |
| 비밀번호 | `DMC_ADMIN_PW` / `DMC_OWNER_PW` 공유 (DMC report·admin과 동일) |
| HTTPS | 프로덕션 Hosting 기본 |
| 감사 | `chunbaek_attendance.updatedBy === "admin"` 으로 운영진 수정 구분 |
| Rate limit | MVP 없음 (40명·운영진 1~2명) |

---

## 7. 검증 시나리오 (Task 6·12)

### 7.1 인증

1. `verify-admin` 잘못된 pw → 401  
2. `verify-admin` 올바른 pw → `{ ok: true, role }`  
3. `admin-grid` without `adminPw` → 401  
4. `admin-grid` wrong `adminPw` → 401  

### 7.2 그리드·출석

1. seed 후 `admin-grid?week=1` → slots·members·cells 구조  
2. `admin-set-attendance` 출석 → 셀 `status: attend`  
3. `admin-set-attendance` 예외 → `weekAttendCount`에서 제외  
4. 회원 주차 마감 후 `save-attendance` → 403, `admin-set-attendance` → 200  

### 7.3 주차별 훈련 입력

1. `admin-week-slots?week=1` → 해당 주 slots 배열  
2. `admin-save-week-slots` 7행 저장 → `saved: 7`, 회원 `today-slot`에 `trainingLabel` 반영  
3. `trainingDayCount: 2` 주 저장 시 `warnings` 포함  
4. 출석 있는 슬롯 `isProgramOff: true` 변경 시도 → 409  

### 7.4 일괄 import (부트스트랩)

1. 7행 샘플 CSV `replace` → `imported: 7`  
2. `trainingDayCount: 2` 주차 포함 시 `warnings` 배열  

### 7.5 확장 API (포함 시)

1. `admin-set-participant` → roster에 반영  
2. `admin-reset-profile` → `profileComplete: false`, token 무효  
3. `admin-update-profile` → goal 변경 후 `team-summary` 반영  

---

## 8. 구현 메모

| 파일 | 변경 |
|------|------|
| `functions/lib/chunbaek-handlers.js` | admin 핸들러 + `requireAdmin` |
| `functions/lib/chunbaek-auth.js` | `revokeSessionsForMember(db, memberId)` (reset용) |
| `scripts/verify-chunbaek-emulator.js` | admin smoke 추가 |
| `scripts/pre-deploy-test-runner.sh` | verify-admin + admin-grid smoke |

**신규 API:** 본 문서가 justification 역할. 사용자 승인 후 Task 6 구현.

---

## 9. 확정 체크리스트 (사용자 확인용)

- [ ] **MVP 필수 6개** — `verify-admin`, `admin-grid`, `admin-set-attendance`, **`admin-week-slots`**, **`admin-save-week-slots`**, `admin-import-slots`(부트스트랩) OK?
- [ ] **훈련 입력 = 주차별**이 메인, 일괄 import는 시즌 골격용 — OK?
- [ ] **MVP 확장 3개** (`admin-set-participant`, `admin-reset-profile`, `admin-update-profile`) — 포함할까요?
- [ ] **인증:** 매 요청 `adminPw` — OK?
- [ ] **미래 슬롯 대리 출석** 허용 — OK?

---

## 10. 변경 이력

| 일자 | 변경 |
|------|------|
| 2026-07-12 | 초안 작성 — Task 6 구현 전 SSOT |
| 2026-07-12 | 주차별 훈련 API 추가 (`admin-week-slots`, `admin-save-week-slots`) |
