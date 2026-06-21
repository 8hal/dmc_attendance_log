# 테스트 케이스: 출석 키오스크 베타 블로커 2

> 작성: 2026-06-13  
> 브랜치: `cursor/attendance-kiosk-blocker2-e814`  
> PR: https://github.com/8hal/dmc_attendance_log/pull/2  
> 관련: `_docs/handoff/2026-06-13-attendance-kiosk-blocker2.md`  
> 플랜 Task 6·8, `scripts/pre-deploy-test-runner.sh`

---

## 사전 준비

| 항목 | 명령 / 값 |
|------|-----------|
| 브랜치 | `git checkout cursor/attendance-kiosk-blocker2-e814` |
| 자동 테스트 | `bash scripts/pre-deploy-test.sh` |
| functions 의존성 | `cd functions && npm ci` |
| 메일 env | `functions/.env` — `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `ADMIN_EMAIL` |
| 키오스크 URL (prod) | `https://dmc-attendance.web.app/attendance-v2.html?mode=kiosk&meetingDate=YYYY-MM-DD&meetingType=SAT` |
| 로그 API | `https://race-nszximpvtq-du.a.run.app?action=event-logs&limit=30` |

---

## A. 수동 TC (Task 6) — 배포 후 브라우저·현장 검증

| TC | 시나리오 | 사전 조건 | 실행 | 기대 결과 | 통과 |
|----|----------|-----------|------|-----------|------|
| **TC-01** | 구 index → 키오스크 동일인 | 동일 회원·동일 모임일 | 1) `index.html` 출석<br>2) 키오스크에서 동일인 선택 | 「이미 출석 완료」 완료 UX, 콘솔 에러 없음 | [ ] |
| **TC-02** | 키오스크 연속 더블탭 | 미출석 회원 | 닉네임 카드 빠르게 2회 탭 | POST 1회만 (`isKioskProcessing`), 중복 기록 없음 | [ ] |
| **TC-03** | 중복 POST (서버 거부) | 이미 출석한 회원 | 키오스크에서 다시 탭 | `event_logs`: server `attendance_checkin_error` (`ALREADY_CHECKED_IN`) + client 1건 + `attendance_roster_reload` | [ ] |
| **TC-04** | 개인 v2 대시보드 중복 | 프로필 설정·이미 출석 | `attendance-v2.html`(키오스크 아님) 출석 버튼 | 에러 메시지 + client `attendance_checkin_error` (`mode: dashboard`) | [ ] |
| **TC-05** | 명부 외 (키오스크) | 명부에 없는 닉네임 | 닉/팀 찾기 → 하단 「명단에 없어요 — 여기서 출석」→ 모달 → 출석 | 「출석 완료」, `guestCount` +1, **ADMIN_EMAIL 수신**, `event_logs` `attendance_not_on_roster_email` | [ ] |
| **TC-06** | empty 그리드 → 하단 CTA | 해당 첫글자/팀 명부 0명 | 빈 그리드에서 하단 CTA | empty 문구 + TC-05와 동일 성공 | [ ] |
| **TC-07** | UI 용어 스윕 | 키오스크·개인 v2 전체 | 화면·모달·버튼 문구 확인 | 「**정회원 명단**」「**게스트**」 노출 없음 | [ ] |

### TC-03 / TC-05 로그 확인

- `GET ?action=event-logs&limit=30` (위 로그 API)
- 또는 `report.html` / Ops `event_logs` 조회

**기대 필드 요약**

| event | logSource | mode (예) |
|-------|-----------|-----------|
| `attendance_checkin_error` | `server` / `client` | `kiosk`, `not_on_roster`, `dashboard`, `legacy` |
| `attendance_roster_reload` | `client` | `kiosk` |
| `attendance_not_on_roster_email` | `server` | — (`data.emailSent: true`) |

---

## B. 자동 TC (`bash scripts/pre-deploy-test.sh`) — 50건

에뮬레이터(functions + hosting + firestore)에서 `scripts/pre-deploy-test-runner.sh` 실행.

**실행:** `bash scripts/pre-deploy-test.sh`  
**성공 기준:** 마지막 줄 `✅ 전체 통과 — 배포 가능`

### B-1. 블로커2 직접 관련 (4건)

| TC | assert 이름 | 검증 내용 |
|----|-------------|-----------|
| **TC-A01** | `attendance POST 중복 → ALREADY_CHECKED_IN` | 동일 회원·날짜(`2099/06/15`) 2회 POST → `error: ALREADY_CHECKED_IN` |
| **TC-A02** | `event-logs: attendance_checkin_error server` | 중복 시 server `logSource: server`, `error: ALREADY_CHECKED_IN` |
| **TC-A03** | `attendance-v2.js: roster 재로드` | 호스팅 JS에 `reloadKioskRoster` 존재 |
| **TC-A04** | `attendance-v2.js: 명부 외 CTA` | 호스팅 JS에 `kioskMemberNotOnRosterBtn` 존재 |

### B-2. API (17건)

| TC | assert | 기대 |
|----|--------|------|
| TC-A05 | `members: ok=true` | members API 정상 |
| TC-A06 | `members: count>0` | 시드 회원 ≥1 |
| TC-A07 | `confirmed-races: ok=true` | confirmed-races 정상 |
| TC-A08 | `confirmed-races: docId(행 있을 때)` | 결과 행에 docId |
| TC-A09 | `log: 정상 호출` | `action=log` POST 성공 |
| TC-A10 | `log: event 누락 → 400` | event 없으면 400 |
| TC-A11 | `delete-record: 없는 문서 → 404\|500` | 없는 docId |
| TC-A12 | `delete-record: requesterName 누락 → 400` | 필수 필드 검증 |
| TC-A13 | `unknown action → 400` | 잘못된 action |
| TC-A14 | `verify-admin: 잘못된 비밀번호 → 401` | 인증 실패 |
| TC-A15 | `verify-admin: 올바른 비밀번호 → ok` | 인증 성공 |
| TC-A16 | `event-logs: ok=true` | event-logs 조회 |
| TC-A17 | `data-integrity: ok=true` | data-integrity |
| TC-A18 | `member-stats: ok=true` | member-stats |
| TC-A19 | `member-stats: 필수 필드 포함` | totalMembers, confirmedMembers, postLaunchMembers, confirmSource, funnel |
| TC-A20 | `scrapeProxy: secret 없으면 403` | 프록시 보안 |
| TC-A21 | `scrapeProxy: 파라미터 누락 → 400` | 필수 파라미터 |

### B-3. 호스팅 정적 (29건)

| TC | assert | 대상 |
|----|--------|------|
| TC-A22~28 | my.html 7항 | BETA, logEvent, deleteRecord, _alreadyConfirmed, toggleDetail, calcPace, confirmSource |
| TC-A29~32 | races.html 4항 | BETA, calcPace, gender 우선순위, confirmSource |
| TC-A33~36 | report.html 4항 | BETA, verify-admin, 대회 예정 탭, KST |
| TC-A37 | admin.html | verify-admin |
| TC-A38 | index.html | my.html 링크 |
| TC-A39~42 | attendance-v2 4항 | attendance-v2.js 스크립트, showSuccessAfterCheckin, reloadKioskRoster, kioskMemberNotOnRosterBtn |
| TC-A43~44 | design-draft 2항 | DESIGN DRAFT, 베타 링크 |
| TC-A45~47 | ops.html 3항 | Ops Console, ops-scrape-health, systemHealth |
| TC-A48~50 | group.html 3항 | group-events, verify-admin, gap 탐지 |
| TC-A51 | race-distance-client.js | 32K 정규화 |
| TC-A52 | report.html | 비밀번호 평문 없음 |

### B-4. 자동 TC 실행 기록

| 일자 | 환경 | 결과 | 비고 |
|------|------|------|------|
| 2026-06-13 | 클라우드 VM 에뮬 | 50/50 통과 | firebase CLI 15.20.0, login 없이 실행 |

---

## C. 메일 TC

```bash
cd functions && node ../scripts/test-not-on-roster-email.js
```

| TC | 시나리오 | 사전 조건 | 기대 | 통과 |
|----|----------|-----------|------|------|
| **TC-M01** | SMTP 단독 테스트 | `functions/.env` 3변수 설정 | `[테스트] [DMC 출석] 출석 명부에 없는 경우 — 메일알림테스트` 수신 | [ ] |
| **TC-M02** | isGuest POST 후 메일 | functions 배포 완료 | TC-05와 함께 `attendance_not_on_roster_email` (`emailSent: true`) | [ ] |

---

## D. 배포 후 E2E (Task 8)

| 순서 | 작업 | 성공 기준 | 완료 |
|------|------|-----------|------|
| 1 | `cd functions && node ../scripts/backup-firestore.js` | 백업 폴더 생성 | [ ] |
| 2 | `firebase deploy --only functions` → `hosting` | 배포 오류 없음 | [ ] |
| 3 | TC-05 + TC-M02 | 메일 + event_logs | [ ] |
| 4 | TC-01~07 수동 전체 | 7/7 통과 | [ ] |
| 5 | `git tag -a v0.14.0 -m "출석 키오스크 에러 복구·명부 외·이메일"` | 태그 푸시 | [ ] |
| 6 | prod 데이터 정리 검토 | `2099/12/01` `메일알림테스트` isGuest 출석 삭제 여부 | [ ] |

---

## E. 미커버 / 후속 (코드 리뷰 Minor)

| 항목 | 설명 |
|------|------|
| isGuest POST 자동 assert | pre-deploy에 `attendance_not_on_roster_email` assert 없음 (Gmail env 의존) |
| 대시보드 중복 status refresh | TC-04는 client log만; 전체 status reload는 수동 확인 |
| status API `memberId`/`isGuest` | 키오스크 done 판정은 nickname fallback 사용 |

---

## F. 검증 결과 요약 (수동 기입)

```
검증일: __________
검증자: __________
배포 버전: v0.14.0 (예정)

자동 TC (50):  [ ] 통과  [ ] 실패
수동 TC (7):   ___ / 7
메일 TC (2):   ___ / 2
배포 E2E (6):  ___ / 6

특이사항:
```
