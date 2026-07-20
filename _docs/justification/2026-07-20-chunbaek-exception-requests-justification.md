# 춘백 exception-requests API 추가 필요성

> 날짜: 2026-07-20  
> 관련: `_docs/superpowers/specs/2026-07-20-chunbaek-exception-request-design.md` §5.5  
> 게이트: `new-api-validation` — **사용자 승인 전 구현 금지**

---

## 1. 유사 API 전역 검색 (완료)

| 패턴 | 결과 |
|------|------|
| `exception` in `functions/lib/chunbaek-handlers.js` | `save-attendance`·`upload-attendance-photo`에서 기존 슬롯 `exception: true` 시 **403** (`error: "exception slot"`) |
| `exception` in `functions/lib/chunbaek-admin.js` | `admin-set-attendance`·`admin-grid`에서 슬롯 단건 `exception`/`exceptionNote` 설정·표시 |
| `admin-set-attendance` in `chunbaek/` | `chunbaek/js/admin.js` — 어드민 그리드 셀 모달에서 단건 호출 |
| `action.*chunbaek\|chunbaek.*action` in `functions/` | **매치 없음** (라우팅은 `exports.chunbaek` + `?action=` 쿼리) |
| `request-exception` / `my-exception` / `self-clear` / `exception-request` (전역) | **구현·호출처 없음** (스펙·계획 문서만) |
| `chunbaek_exception_requests` (전역) | **컬렉션·규칙 미구현** (스펙 §4.1 설계만) |

### 체크리스트

- [x] `admin-set-attendance`: 운영 수동 슬롯 예외 (단건)
- [x] `save-attendance`: exception 슬롯 403 차단
- [x] 회원이 기간 예외를 **요청·조회·취소·조기해제**할 API 없음 확인

---

## 2. 기존 API 목록 (춘백 `exports.chunbaek`)

### 회원 액션 (`functions/lib/chunbaek-handlers.js`)

| action | 용도 | exception 관련 |
|--------|------|----------------|
| `ping` | 헬스체크 | — |
| `members-roster` | 참가자 명단 | — |
| `create-profile` / `update-profile` / `link-device` / `my-profile` | 프로필 | — |
| `today-slot` | 오늘 슬롯 조회 | 응답에 `exception` 상태 표시 |
| **`save-attendance`** | 출석·미출석 저장 | **기존 `exception` 슬롯이면 403** |
| `upload-attendance-photo` | 출석 사진 업로드 | **기존 `exception` 슬롯이면 403** |
| `my-timeline` | 내 타임라인 | exception 슬롯 「예외」 배지 |
| `team-summary` / `team-member-attendance` | 팀 집계·멤버 상세 | exception 슬롯 집계 제외(표시) |

### 운영 액션 (`functions/lib/chunbaek-admin.js`)

| action | 용도 | exception 관련 |
|--------|------|----------------|
| `verify-admin` | 어드민 비밀번호 | — |
| `admin-grid` | 주간 그리드 | 셀 `exception`/`exceptionNote` 노출 |
| **`admin-set-attendance`** | **슬롯 단건 출석·예외 설정** | `exception: true` 시 `attended: false`, `updatedBy: "admin"` |
| `admin-week-slots` / `admin-save-week-slots` / `admin-import-slots` | 슬롯 일정 | — |
| `admin-set-participant` | 참가자 on/off | — |

---

## 3. 기존 API 사용처 (exception 경로)

### A. `admin-set-attendance`

- **백엔드:** `functions/lib/chunbaek-admin.js` → `handleAdminSetAttendance`
- **호출처:** `chunbaek/js/admin.js` (`setCellStatus`) — 그리드 셀 모달에서 attend / miss / exception 선택 시
- **인증:** `adminGate` (어드민 비밀번호)
- **용도:** 회원·슬롯 **1건**씩 `chunbaek_attendance`에 `exception`/`attended`/`exceptionNote` 직접 merge
- **특징:** 기간·사유·pending·승인 감사 없음. 운영이 단톡 알림 후 수동 입력하는 현행 병목

### B. `save-attendance`

- **백엔드:** `functions/lib/chunbaek-handlers.js` → `handleSaveAttendance`
- **호출처:** `chunbaek/js/app.js` — 오늘 출석 CTA, 타임라인 슬롯 출석/미출석
- **인증:** 회원 토큰 (`requireMemberAuth`)
- **용도:** 본인 슬롯 `attended`·`note`·`photoUrls` 저장
- **특징:** `existing?.exception` 이면 **403** — 회원이 예외를 켜거나 기간 예외를 신청할 수 없음

### C. `upload-attendance-photo`

- **백엔드:** 동일 파일 `handleUploadAttendancePhoto`
- **호출처:** `chunbaek/js/app.js` (사진 첨부 출석)
- **특징:** `save-attendance`와 동일하게 exception 슬롯 403

### D. 회원 기간 예외 워크플로 — **API 없음**

- 예외 **상신** (`pending` 문서 생성): 없음
- 내 상신 **조회**: 없음
- 승인 후 **조기 복귀**(오늘 이후 exception 해제): 없음  
  → 현재는 단톡 + 운영 `admin-set-attendance` 반복만 가능

---

## 4. 신규 API (5개)

| action | 누가 | 용도 | 호출처 (예정) |
|--------|------|------|----------------|
| `request-exception` | 회원 | 예외 상신 (`chunbaek_exception_requests` pending 생성) | `chunbaek/js/app.js` — 「나」탭 예외 요청 모달 |
| `my-exception-requests` | 회원 | 내 상신 목록·상태 조회 | `chunbaek/js/app.js` — 「나」탭 「내 요청」 |
| `self-clear-future-exceptions` | 회원 | 조기 복귀 — `date >= todayKst` exception 슬롯 즉시 해제 | `chunbaek/js/app.js` — 「조기 복귀」 확인 후 |
| `admin-list-exception-requests` | 운영 | pending/최근 예외 상신 목록 | `chunbaek/js/admin.js` — 예외 요청 패널 |
| `admin-review-exception-request` | 운영 | approve / reject + 승인 시 슬롯 일괄 적용 | `chunbaek/js/admin.js` — 승인·반려 버튼 |

**1차 비범위:** `cancel-exception-request` (회원 pending 취소) — 오버스펙. 잘못 올리면 운영 반려 후 재상신. pending 1건 규칙으로 대기 중 추가 상신 불가.

스펙: `_docs/superpowers/specs/2026-07-20-chunbaek-exception-request-design.md` §5.5

---

## 5. 신규 5개를 더 적게 합칠 수 없는 이유

| action | 분리 필요 이유 |
|--------|----------------|
| `request-exception` | **쓰기 + 검증**(7일 소급·14일 상한·pending 1건·시즌 경계). 슬롯은 승인 전 변경하지 않음. 조회·즉시 해제와 HTTP 의미·권한이 다름. |
| `my-exception-requests` | **읽기 전용** GET 성격. 「나」탭 목록·배지 갱신용. POST 상신/해제와 분리하지 않으면 캐시·mock·에러 처리가 `api-patterns.md`와 어긋남. |
| `self-clear-future-exceptions` | **승인 큐 없이** `chunbaek_attendance`에 즉시 write. 대상=`exception && date >= todayKst`. 상신 API와 합치면 “pending 생성 vs 즉시 해제”가 한 body로 섞여 운영 승인 우회 위험. |
| `admin-list-exception-requests` | 운영 **목록·뱃지** 전용 read. `adminGate` + `status` 필터. review write와 분리해 어드민 그리드 새로고침·preview mock을 단순화. |
| `admin-review-exception-request` | approve 시 다슬롯 일괄 적용·`skippedSlotIds`·`appliedSlotIds`·재리뷰 400. 반려는 슬롯 무변경. list와 합치면 멱등·감사·트랜잭션 경계가 불명확. |

**운영 단건 예외와의 관계:** 승인·조기 복귀 후에도 `admin-set-attendance`는 SSOT 수동 보정용으로 **유지** (스펙 §6.2).

---

## 6. 기존 API로 대체 불가

### `admin-set-attendance` 반복 호출로 기간 예외를 대체할 수 없는가?

- **단건 API** — 기간 N일이면 N회 호출·네트워크·부분 실패 시 슬롯 불일치
- **원자성 없음** — 중간 실패 시 일부만 exception
- **감사·상신 이력 없음** — `chunbaek_exception_requests`에 사유·기간·승인자 기록 불가
- **pending 1건·구간 겹침·7일·14일 검증 없음**
- **회원 호출 불가** — `adminGate` 전용 (`chunbaek/js/admin.js`만)

### `save-attendance`에 exception 플래그를 추가할 수 없는가?

- 현행 설계가 **명시적 403** — exception 슬롯은 출석 변경 불가 (스펙 §2 예외 의미 유지)
- 회원이 승인 없이 `exception: true`를 켜면 집계·출석 차단 정책 위반 (스펙 비목표: “승인 없이 회원이 예외를 켜기”)
- 출석 저장과 예외 상신은 검증·권한·Firestore 대상 컬렉션이 다름 (`chunbaek_attendance` vs `chunbaek_exception_requests`)

### 조기 복귀를 운영 review로만 처리할 수 없는가?

- 조기 복귀는 **이미 approved·적용된 슬롯**에 대한 즉시 해제 — pending 문서와 무관
- 스펙: 운영 승인 큐 없음 → 전용 `self-clear-future-exceptions` 필요

### 왜 `cancel-exception-request`는 빠졌나?

- 1차 YAGNI — 잘못 상신 시 운영 **반려**로 충분
- pending 1건이면 대기 중 재상신 불가 → 운영이 반려해야 다음 상신 가능 (의도된 단순화)

---

## 7. 결정

- ✅ **추가 필요** (스펙 2026-07-20 **디자인 승인됨** — cancel 제외 5 API — **사용자 API 승인 2026-07-20**)
- ⚠️ 대안: 단톡 + `admin-set-attendance` 반복은 운영 병목·감사 부재로 제품 목표(§1) 미충족

### 잠긴 제품 규칙 (스펙 합의)

- 상신 UI 주 진입: 「나」탭 (`#view-me`)
- 승인 전 슬롯 무변경 · 회원 pending 취소 **없음** (운영 반려)
- 승인 시 출석일(`attended: true`) 스킵 · 미출석 훈련일만 `exception`
- 조기 복귀: 오늘 이후 exception만 즉시 해제 · 과거 유지
- 신규 컬렉션: `chunbaek_exception_requests`

### 구현 시 참조 패턴

- 라우팅: `handleChunbaekRequest` + `handleAdminRequest` (`functions/lib/chunbaek-handlers.js`, `chunbaek-admin.js`)
- 슬롯 merge: `admin-set-attendance`의 `chunbaek_attendance` merge — 단, 승인/조기복귀는 **예외 필드만** 갱신해 `note`/`photo` 보존 (스펙 §5.2·§5.3)
- API 클라이언트: `chunbaek/js/api.js` (`apiPost` / `adminPost`)

---

## 승인

- ✅ **사용자 API 승인** (2026-07-20) — 5개, `cancel-exception-request` 제외
- 구현(Task 1+) 진행 가능
