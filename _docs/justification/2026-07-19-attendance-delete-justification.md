# 출석 삭제 API 추가 필요성 검증

> 날짜: 2026-07-19  
> 관련: `_docs/superpowers/specs/2026-07-17-attendance-admin-hub-design.md` §7.3  
> 게이트: `new-api-validation` — **사용자 승인 전 구현 금지**

---

## 1. 유사 API 전역 검색 (완료)

| 패턴 | 결과 |
|------|------|
| `delete.*attendance` / `attendance.*delete` | HTTP API **없음**. `scripts/delete-attendance-records.js` (Admin SDK 스크립트만) |
| `action.*delete` / `delete-record` | `POST /race?action=delete-record` — **race_results** 본인 삭제 (`my.html`) |
| `handlePost` attendance / `exports.attendance` | `functions/index.js` `handlePost` — **등록(POST)만**, 삭제 분기 없음 |
| `subAction.*delete` | `group-events` subAction=delete — **race_events** 문서 삭제 (대회) |
| `hide-member` | 회원 퇴회·익명화 (출석 문서 삭제가 아님) |

---

## 2. 기존 API 사용처

### A. `POST /race?action=delete-record`

- **호출처:** `my.html` (`deleteRecord`)
- **컬렉션:** `race_results`
- **인증/권한:** `docId` + `requesterName` === `memberRealName` (실명 프롬프트)
- **용도:** 개인 레이스 기록 삭제
- **특징:** 출석(`attendance`)과 무관

### B. `POST /race?action=group-events` + `subAction=delete`

- **호출처:** `group-detail.html`
- **컬렉션:** `race_events`
- **용도:** 단체 대회 이벤트 삭제
- **특징:** 출석과 무관

### C. `POST /race?action=hide-member`

- **호출처:** `admin.html` → `attendance-admin.html`, sync 스크립트
- **용도:** 회원 숨김·익명화 (+ attendance/race_results **필드 연동 갱신**)
- **특징:** 출석 **행 삭제**가 아님

### D. `scripts/delete-attendance-records.js`

- **호출처:** 운영자 로컬 (승인 후 수동)
- **컬렉션:** `attendance` (nicknameKey + meetingDateKey)
- **인증:** Admin SDK (서비스 계정)
- **용도:** 테스트/정정용 일괄 삭제
- **특징:** 회원 앱·운영 허브에서 호출 불가 · 감사 로그·활성 세션 게이트 없음

### E. `POST /attendance` (handlePost)

- **호출처:** `attendance-v2.js`, `index.html`, 키오스크
- **용도:** 출석 **등록만**
- **특징:** DELETE/취소 액션 없음 (2026-07-19 기준)

---

## 3. 신규 API 제안

| API (가칭) | 엔드포인트 | 누가 | 범위 |
|------------|------------|------|------|
| `delete-attendance` | `POST /attendance?action=delete-attendance` | 회원 앱 («내 출석») | **본인** + **활성 세션만** (`resolveDefaultMeeting`의 date+type) + `memberId` 우선 매칭 |
| `admin-delete-attendance` | `POST /attendance?action=admin-delete-attendance` | 출석 운영 허브 | `verify-admin` (`pw`) 후 임의 행. **event_logs** 감사 필수 |

### 호출처 (예정)

- Self: Shell-2 «내 출석» 활성 세션 행 «출석 취소» (오늘 탭 CTA 교체 금지)
- Admin: `attendance-admin.html` 당일 명단 «삭제» 버튼 (Admin-1a에서 disabled → 본 API 후 활성)

---

## 4. 기존 API로 대체 불가능한 이유

### 왜 `delete-record`를 재사용하지 않는가?

- 대상 컬렉션이 `race_results` vs `attendance`
- 권한 모델이 실명 프롬프트 vs memberId + 활성 세션 / verify-admin
- race API에 attendance 삭제를 넣으면 도메인 혼선

### 왜 스크립트만으로 충분하지 않은가?

- 회원 셀프 취소·운영진 당일 점검이 **제품 요구** (스펙 §7.3 합의)
- 스크립트는 배포·감사·권한·활성 세션 게이트를 UI에 제공할 수 없음

### 왜 attendance POST에 “취소 플래그”만 추가하지 않는가?

- 등록과 삭제 권한·검증·로깅이 다름 → action 분리로 실수·회귀 위험 감소
- self와 admin 경로를 한 body 플래그로 합치면 권한 우회 버그 위험

### 왜 HTTP DELETE 메서드만으로 충분한가?

- 기존 프로젝트는 action 쿼리 + POST JSON 패턴 (`api-patterns.md`)
- Cloud Functions CORS·클라이언트 일관성상 POST action이 기존 출석 API와 맞음

---

## 5. 신규 API 추가 결정 (승인 대기)

- ✅ **추가 필요:** `delete-attendance` + `admin-delete-attendance`
- ⚠️ 대안 없음 (스크립트·race delete-record로는 UX/권한 미충족)

### 잠긴 제품 규칙 (이미 스펙 합의)

- Self: **활성 세션(A안)** = `resolveDefaultMeeting()` `(meetingDateKey, meetingType)`만
- Self: «내 출석» 보조 버튼만 (오늘 CTA 교체 금지)
- Admin: 임의 날짜·행 + event_logs
- 로그인 없음 전제 → 완전 방지 불가, 완화: 활성 세션·memberId·rate limit·감사

---

## 6. 구현 시 참조 패턴

- Self 본인 확인 완화: `delete-record`의 requester 매칭 정신 → 출석에서는 **memberId** 우선 (스펙)
- Admin 인증: `verify-admin` `{ pw }` (`attendance-admin.js`와 동일)
- 감사: `event_logs` (키오스크 blocker2 `logAttendanceEvent` / server log 패턴)

---

## 승인

- ✅ **승인됨** (2026-07-19 사용자) — Delete-1 구현 진행
