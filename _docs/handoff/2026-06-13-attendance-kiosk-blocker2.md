# 핸드오프: 출석 키오스크 베타 블로커 2

> 작성: 2026-06-13  
> 브랜치: `cursor/attendance-kiosk-blocker2-e814`  
> PR: https://github.com/8hal/dmc_attendance_log/pull/2 (draft)  
> **프로덕션 미배포** — 코드는 브랜치·PR에만 존재

---

## 1. 목표 (한 줄)

현장 **키오스크**로 출석 채널 고정 + **출석 명부에 없는 경우** 단일 UX + POST 실패·중복 시 **roster 재로드·event_logs** + **명부 외 출석 시 ADMIN_EMAIL 알림**.

---

## 2. 기획 확정 (v5 UX — 승인된 방향)

| 항목 | 결정 |
|------|------|
| 용어 | **출석 명부** ≠ 정회원 명단. UI에 「게스트」 없음 |
| 명부 외 UX | **1종** — 정회원/준회원/신규 FE 분기 없음 (`isGuest` API) |
| CTA 위치 | **닉네임 목록 화면 하단만** — 「명단에 없어요 — 여기서 출석」 |
| 홈 | 닉/팀 찾기 + **당일 출석 현황**만 (명부 외 CTA **없음**) |
| 개인 출석 | 키오스크 UI **비지원** — `attendance-v2.html` URL 직접 입력 |
| 모달 안내 | 게살볶음밥에게 알려주세요 (담당자명 유지) |
| 이메일 | `isGuest: true` POST 성공 → `ADMIN_EMAIL` (Gmail SMTP) |

**SSOT 문서**

- UX 점검: `_docs/superpowers/specs/2026-06-13-attendance-kiosk-blocker2-ux-review.md`
- 설계: `_docs/superpowers/specs/2026-06-13-attendance-kiosk-blocker2-design.md`
- 구현 플랜: `_docs/superpowers/plans/2026-06-13-attendance-kiosk-error-recovery.md`
- **테스트 케이스:** `_docs/testing/2026-06-13-attendance-kiosk-blocker2-test-cases.md`
- HTML 초안: `attendance-v2-kiosk-blocker2-draft.html`  
  - 미리보기: https://raw.githack.com/8hal/dmc_attendance_log/cursor/attendance-kiosk-blocker2-e814/attendance-v2-kiosk-blocker2-draft.html

---

## 3. 구현 상태 (브랜치에 완료)

### Frontend (`attendance-v2.js` / `.html`)

- [x] `logAttendanceEvent` + `RACE_LOG_API` (`race-nszximpvtq-du.a.run.app`)
- [x] `reloadKioskRoster`, `fetchKioskRoster` (`meetingType` 쿼리 제거)
- [x] `isKioskProcessing`, `handleKioskMemberCheckin` 에러 복구
- [x] `kioskMemberNotOnRosterBtn` + `openKioskNotOnRosterScreen` + `handleKioskNotOnRosterCheckin`
- [x] 개인 v2 용어·`not_on_roster` 로깅·검색 0건 키오스크 권장
- [x] `kioskPersonalLink` **삭제**
- [x] 홈 `kioskNotOnRosterBtn` **없음** (2026-06-13 확인) — 명부 외 CTA는 `kioskMemberNotOnRosterBtn`만 (`attendance-v2.html` member 패널 하단)

### Legacy

- [x] `index.html` — `ALREADY_CHECKED_IN` + GA + `event_logs`

### Backend (`functions/index.js`)

- [x] `logAttendanceServerEvent` — `attendance_checkin_error` (`logSource: server`)
- [x] `sendNotOnRosterAlertEmail` — `isGuest` 성공 시 `ADMIN_EMAIL` (비동기)
- [x] `event_logs`: `attendance_not_on_roster_email`

### 기타

- [x] `assets/design-tokens.css`, `manifest.attendance-kiosk.webmanifest`, `sw.js`
- [x] `scripts/pre-deploy-test-runner.sh` — attendance 중복 POST + server error log assert
- [x] `_docs/api/http-api-actions.md` — status·log·isGuest 메일

### AI 금지

- **`firebase deploy`는 AI가 실행하지 않음** — 사용자 로컬에서만

---

## 4. 프로덕션 vs 브랜치

| 항목 | 프로덕션 (2026-06-13 점검) | 브랜치 |
|------|---------------------------|--------|
| 키오스크 명부 외 UX | ❌ 없음 | ✅ |
| roster 재로드 SSOT | ❌ 낙관적 업데이트 | ✅ |
| event_logs 출석 | ❌ | ✅ |
| 명부 외 이메일 | ❌ (`event_logs` 없음 확인) | ✅ |
| `attendance-v2-kiosk-blocker2-draft.html` | ❌ Hosting 미배포 | ✅ Git only |

**프로덕션 테스트로 넣은 데이터 (정리 필요할 수 있음)**

- `2099/12/01` — `메일알림테스트` (`isGuest: true`) — 이메일 코드 미배포로 **메일 안 온 상태**

---

## 5. 배포 체크리스트 (다음 담당자)

```
배포 목표: 키오스크 명부 외 출석 + 에러 복구 + 명부 외 이메일
성공 기준: 키오스크 명부 외 플로우 완료, 중복 시 완료 UX, ADMIN_EMAIL 수신, pre-deploy 통과
실패 기준: pre-deploy 실패, 기존 confirm/출석 회귀
```

1. `git checkout cursor/attendance-kiosk-blocker2-e814` (또는 PR #2 merge)
2. `bash scripts/pre-deploy-test.sh` (JDK, `cd functions && npm ci` 전제)
3. `cd functions && node ../scripts/backup-firestore.js`
4. `functions/.env` 확인: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `ADMIN_EMAIL`
5. **메일 테스트 (배포 전/후)**  
   ```bash
   cd functions && node ../scripts/test-email.js
   cd functions && node ../scripts/test-not-on-roster-email.js
   ```
6. `firebase deploy --only functions` → `firebase deploy --only hosting`
7. 키오스크 스모크:  
   `https://dmc-attendance.web.app/attendance-v2.html?mode=kiosk&meetingDate=YYYY-MM-DD&meetingType=SAT`
8. 명부 외 출석 → 메일 + `event_logs` `attendance_not_on_roster_email`
9. `git tag` — 현재 최신 `v0.13.0`; 베타 이후 미태깅 → `v0.14.0` 검토

---

## 6. 수동 검증 체크리스트 (플랜 Task 6)

전체 TC(수동 7 + 자동 50 + 메일 2 + 배포 E2E):  
`_docs/testing/2026-06-13-attendance-kiosk-blocker2-test-cases.md`

| # | 시나리오 | 기대 |
|---|----------|------|
| 1 | 구 index → 키오스크 동일인 | 완료 UX, 에러 없음 |
| 2 | 키오스크 연속 더블탭 | 중복 POST 없음 |
| 3 | 중복 POST | server+client `attendance_checkin_error`, `attendance_roster_reload` |
| 4 | 개인 v2 대시보드 중복 | 메시지 + client log |
| 5 | 명부 외 (키오스크) | 완료, `guestCount` +1, **이메일** |
| 6 | 목록 empty → 하단 CTA | 동일 성공 |
| 7 | UI에 「정회원 명단」「게스트」 없음 | 스윕 |

---

## 7. API·로깅 요약

- **명부 탐색:** `GET ?action=members`
- **당일 roster SSOT:** `GET ?action=status&date=YYYY/MM/DD` (`meetingType` **무시**)
- **명부 외 출석:** `POST` + `isGuest: true`, `team: GUEST`
- **로그 URL:** `https://race-nszximpvtq-du.a.run.app?action=log` (cloudfunctions.net 금지)
- **mode:** 명부 외 → `not_on_roster`; 키오스크 → `kiosk`; 레거시 → `legacy`

---

## 8. 커밋 히스토리 (main 이후)

```
77e96627 docs: 키오스크 블로커2 세션 핸드오프
c3dc787f chore: 출석 명부 외 알림 메일 테스트 스크립트
4b3f3631 feat(api): 출석 명부 외(isGuest) 출석 시 ADMIN_EMAIL 알림
af5d0484 feat(attendance): 키오스크 블로커2 — 명부 외 UX, roster 재로드, event_logs
5f80b095 docs+ux: 키오스크에서 개인 출석 링크 제거
cb9e8bfd chore(draft): design-tokens for kiosk blocker2 HTML preview
998e67ac docs: 키오스크 블로커2 UX 점검 v5 + HTML 변경 초안
```

### 핵심 코드 위치 (빠른 점프)

| 역할 | 파일 | 앵커 |
|------|------|------|
| 클라이언트 로깅 | `attendance-v2.js` | `logAttendanceEvent`, `RACE_LOG_API` |
| roster SSOT | `attendance-v2.js` | `reloadKioskRoster`, `fetchKioskRoster` |
| 키오스크 정회원 출석 | `attendance-v2.js` | `handleKioskMemberCheckin` |
| 명부 외 모달·출석 | `attendance-v2.js` | `openKioskNotOnRosterModal`, `handleKioskNotOnRosterCheckin` |
| 명부 외 CTA HTML | `attendance-v2.html` | `#kioskMemberNotOnRosterBtn` |
| 서버 이메일 | `functions/index.js` | `sendNotOnRosterAlertEmail` |
| isGuest POST 분기 | `functions/index.js` | `handlePost` 내 `isGuest` |
| pre-deploy assert | `scripts/pre-deploy-test-runner.sh` | attendance 중복·`kioskMemberNotOnRosterBtn` |

---

## 9. 범위 밖 / 후속

- 출석 명부 데이터 소스를 `members`와 분리 (백엔드 컬렉션)
- 운영 명부에서 정회원/준회원/신규 분류 UI
- GitHub Pages QR → v2 URL (`8hal.github.io` 구버전)
- 게살볶음밥 4/23·4/24 테스트 출석 삭제 (`scripts/delete-attendance-records.js`, 사용자 승인 대기)
- 플랜 Task 7: 코드 리뷰 (default 모델) — **완료** (2026-06-13 클라우드 세션). Important 3건 수정 후 **배포 가능** 판정

---

## 12. 코드 리뷰 (Task 7) — 2026-06-13

**판정:** 배포 가능 (Important 수정 반영)

### 강점
- roster SSOT `reloadKioskRoster` + `isKioskProcessing` 이중탭 방지
- 서버 `logAttendanceServerEvent` + 클라이언트 `logAttendanceEvent` B안
- `sendNotOnRosterAlertEmail` HTML 이스케이프·비동기(fire-and-forget)
- pre-deploy 중복 POST + server `attendance_checkin_error` assert

### Important (수정 완료)
1. POST 성공 후 roster reload 실패를 check-in 실패로 오인 — `handleKioskMemberCheckin` / `handleKioskNotOnRosterCheckin` POST·reload 분리
2. 명부 외 `ALREADY_CHECKED_IN` 후 `alert` → `showKioskDone` (`isKioskNicknameOnRoster`)
3. `logAttendanceEvent` `page` — `isKioskMode()` 기준 (`not_on_roster` mode에서 attendance-v2로 잘못 기록되던 문제)

### Minor (후속 가능)
- status API에 `memberId`/`isGuest` 포함
- pre-deploy에 `isGuest` POST + `attendance_not_on_roster_email` assert
- 대시보드 중복 시 status 전체 refresh (현재 sessionCount만)

---

## 10. 클라우드 에이전트 제약 (이 세션에서 확인)

| 항목 | 상태 |
|------|------|
| `firebase` CLI | VM에 없음 → `pre-deploy-test.sh` 직접 실행 불가 |
| `functions/.env` | 없음 → 실메일·SMTP 테스트 불가 |
| prod API 호출 | 가능 — `2099/12/01` `메일알림테스트` `isGuest` 출석 **성공** (데이터만 생성) |
| prod 이메일 | **미발송** — `sendNotOnRosterAlertEmail` 코드 **미배포** |
| `firebase deploy` | **AI 금지** — 사용자 로컬만 |

---

## 11. 새 세션 시작 프롬프트 (복붙용)

```
출석 키오스크 베타 블로커 2 핸드오프.

브랜치: cursor/attendance-kiosk-blocker2-e814
PR: https://github.com/8hal/dmc_attendance_log/pull/2 (draft)
SSOT: _docs/handoff/2026-06-13-attendance-kiosk-blocker2.md

구현은 브랜치에 완료. 프로덕션 미배포.

다음 작업 (사용자 로컬):
1. bash scripts/pre-deploy-test.sh
2. functions/.env (GMAIL_USER, GMAIL_APP_PASSWORD, ADMIN_EMAIL)
3. node scripts/test-not-on-roster-email.js
4. firebase deploy --only functions → hosting
5. 키오스크 명부 외 E2E → 메일 + event_logs attendance_not_on_roster_email
6. 플랜 Task 6 체크리스트 7항 + Task 7 코드 리뷰
7. git tag v0.14.0 (현재 v0.13.0)

정리 대상: prod 2099/12/01 메일알림테스트 isGuest 출석 (배포 검증 후 삭제 검토)
AI는 firebase deploy 실행하지 않음.
```
