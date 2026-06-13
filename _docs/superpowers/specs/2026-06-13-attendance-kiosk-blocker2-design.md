# 설계: 출석 키오스크 베타 블로커 2 (에러 복구 + 출석 명부 외)

> 작성일: 2026-06-13  
> 업데이트: 2026-06-13 — v5 UX 점검 (명부 외 CTA → 닉네임 목록 하단, 게살볶음밥 문구)  
> 상태: **UX 점검 후 개발** — `_docs/superpowers/specs/2026-06-13-attendance-kiosk-blocker2-ux-review.md`  
> 구현 플랜: `_docs/superpowers/plans/2026-06-13-attendance-kiosk-error-recovery.md` (v4)  
> URL: `attendance-v2.html?mode=kiosk&meetingDate=YYYY-MM-DD&meetingType=SAT`

---

## 1. 기획 원칙 (용어)

### 1.1 출석 명부 ≠ 정회원 명단

| 용어 | 의미 | 사용자에게 |
|------|------|------------|
| **출석 명부** | 현장 출석 키오스크에서 **고를 수 있는 명단** | 「출석 명부에서 찾기」 |
| **정회원 명단** | 클럽 회원 마스터 (`members` 등 운영 데이터) | **UI에 노출하지 않음** |
| **당일 출석 현황** | 이미 출석한 사람 목록 (`status`) | 「현재 출석 명단 보기」 |

키오스크 「닉네임/팀으로 찾기」는 **출석 명부**를 탐색하는 UX이다.  
현재 구현상 목록 소스는 `GET ?action=members`이지만, **기획·화면 문구는 전부 「출석 명부」**로 통일한다.

### 1.2 「출석 명부에 없는 경우」— UX 1종

사용자 유형(정회원·준회원·신규·방문자)을 **화면에서 나누지 않는다.**

- FE: **「출석 명부에 없는 경우」** 단일 플로우
- 운영: 처리 명부·스프레드시트 등에서 **정회원 / 준회원 / 신규** 구분 (본 설계 범위 밖)

기술적으로는 기존 **게스트 API** (`isGuest: true`, `team: GUEST`)를 사용하지만,  
사용자-facing 문구에는 **「게스트」를 쓰지 않는다** (API·Firestore 필드명은 레거시 유지).

### 1.3 채널

- **현장:** 키오스크 FE만 권장 (`mode=kiosk`)
- **백엔드:** 변경 없음

---

## 2. 배경·블로커

| ID | 문제 |
|----|------|
| **2a** | 구 `index.html` + 키오스크 병행 → `ALREADY_CHECKED_IN`, 스테일 roster |
| **2b** | 출석 명부에 없는 사람 출석 경로 없음 — 출석 의지는 높음 |

---

## 3. 키오스크 UX

### 3.1 홈 (`kioskHomePanel`)

**출석 명부에서 찾기 (2타일):**

- 닉네임 첫 글자로 찾기
- 팀으로 찾기

**보조:**

- 「당일 출석 현황 보기」— `status` 기반 목록
- `kioskPersonalLink` («개인 출석 화면»): **키오스크 모드에서 완전 숨김** (자봉 링크 없음)

**홈에는 명부 외 CTA 없음** (v5 — 탐색 맥락에서만 노출).

### 3.2 닉네임 목록 (`kioskMemberPanel`) — 명부 외 CTA 위치

첫 글자 또는 팀 선택 **후** 닉네임 그리드 화면.

| 영역 | 내용 |
|------|------|
| 그리드 | 출석 명부 닉네임 카드 (스크롤) |
| **패널 하단 (고정)** | CTA — 목록에 이름이 있든 없든 **항상** 표시 |

```
[ 명단에 없어요 — 여기서 출석 ]
```

- `kiosk-secondary-button`, 터치 ≥ 44px
- 그리드 **비었을 때** empty 문구: 「출석 명부에 해당 닉네임이 없습니다」+ 동일 하단 CTA

### 3.3 (구 §3.2) empty 그리드

§3.2와 통합 — empty는 그리드 내부 문구만, CTA는 패널 하단 고정.

### 3.4 모달 — 「출석 명부에 없는 경우」

기존 `#guestModal` DOM 재사용, 키오스크 진입 시:

| 항목 | 내용 |
|------|------|
| 제목 | **출석 명부에 없는 경우 출석** |
| 닉네임 | 필수 |
| 정모·날짜 | `kioskState` 고정, 입력 숨김 (화면에만 표시) |
| 안내 (단일) | 「출석 명부에 없는 경우입니다. 출석은 기록되며, 명부 반영은 운영진이 따로 합니다.」 |
| 운영 연락 | 「명부 수정이 필요하면 **게살볶음밥**에게 알려주세요.」 |

**API (변경 없음):**

```javascript
postCheckin({
  nickname,
  team: "GUEST",
  meetingType: kioskState.meetingType,
  meetingDate: kioskState.meetingDateKey,
  isGuest: true,
});
```

### 3.5 완료·에러

- 완료: `showKioskDone(nickname, "출석 완료")` → 3초 후 홈
- 월 통계 카드 없음 (`memberId` 없음)
- `reloadKioskRoster("not_on_roster_checkin")`
- POST 실패: §4 (2a)와 동일 — log → reload → 재판정

### 3.6 당일 출석 현황

- 「현재 출석 명단 보기」— `status` 기반 (정회원·명부 외 출석 모두 포함)

---

## 4. 에러 복구 (2a)

`postCheckin` 실패 시:

1. `logAttendanceEvent("attendance_checkin_error", …)`
2. `reloadKioskRoster(reason)`
3. `isKioskMemberDone` → 「이미 출석 완료」 또는 IT 안내

---

## 5. 개인 모드(v2) — 보조

문구만 정합:

- 검색: 「**출석 명부**에서 닉네임을 검색해 선택하세요」 (정회원 명단 ❌)
- 검색 0건: 「현장은 **키오스크 출석**을 이용해 주세요」
- 하단 버튼: 「**출석 명부에 없는 경우**」 (게스트로 출석 ❌) — 동일 `guestModal`, 개인 모드용 날짜/정모 입력 유지

---

## 6. 로깅 (`event_logs`)

| event | `mode` (명부 외 플로우) |
|-------|-------------------------|
| `attendance_checkin_error` | `not_on_roster` (키오스크·개인 명부 외 출석) |
| `attendance_roster_reload` | `kiosk` |

`data`에 `onRoster: false` 선택 필드 추가 가능 (집계용).

성공 로그는 YAGNI — 에러·reload만.

---

## 7. 성공 기준

| 기준 | 검증 |
|------|------|
| 명부 외 1종 UX로 출석 완료 | 체크리스트 #5 |
| UI에 「정회원 명단」「게스트」 노출 없음 | 문구 스윕 |
| `guestCount` 반영 | `sessionCount` |
| 2a 복구 | 체크리스트 #1–3 |

---

## 8. 범위 밖

- 출석 명부 데이터 소스를 `members` 이외로 분리 (별도 컬렉션) — **후속**; 현재는 FE 용어만 분리
- 운영 명부에서 정회원/준회원/신규 분류 UI
- `members` 자동 생성·게스트 행 마이그레이션

---

## 9. 승인 체크리스트

- [x] 출석 명부 ≠ 정회원 명단 (기획 원칙)
- [x] 명부 외 UX 1종 (유형 분기 없음)
- [ ] UX 점검 문서 승인 (`2026-06-13-attendance-kiosk-blocker2-ux-review.md`)
- [x] 명부 외 CTA → 닉네임 목록 하단 (홈 제거)
- [x] 모달 게살볶음밥 문구
- [x] `kioskPersonalLink` 완전 숨김
