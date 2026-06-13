# 설계: 출석 키오스크 베타 블로커 2 (에러 복구 + 명단 외 사용자)

> 작성일: 2026-06-13  
> 상태: **리뷰 대기** (사용자 승인 후 구현 플랜 실행)  
> 구현 플랜: `_docs/superpowers/plans/2026-06-13-attendance-kiosk-error-recovery.md` (v3)  
> 대상 URL: `attendance-v2.html?mode=kiosk&meetingDate=YYYY-MM-DD&meetingType=SAT`

---

## 1. 배경

베타 현장 키오스크에서 두 가지가 동시에 문제였다.

| 블로커 | 내용 |
|--------|------|
| **2a** | 구 `index.html`과 키오스크 동시 사용 시 `ALREADY_CHECKED_IN`·스테일 roster → 에러 UX |
| **2b** | `members` 명단에 없는 사람이 출석 불가 — 실제로는 **B·C** 유형이 많고 출석 의지가 높음 |

**제품 방향 (확정):**

- **백엔드 변경 없음** — 기존 게스트 API (`POST /attendance`, `isGuest: true`, `team: GUEST`)만 사용
- **FE만** — 키오스크를 **현장 출석 권장 채널**로 (개인 출석·QR 셀프서비스는 보조)

---

## 2. 등장인물·케이스

| 유형 | 설명 | 키오스크 UX |
|------|------|-------------|
| **B** | 신규·준회원 (명단 등록 전, 곧 정회원) | 게스트 출석 → 이후 `members` 등록은 운영 백오피스 |
| **C** | 이미 정회원인데 `members` 누락·닉 불일치 | **동일** 게스트 경로 + 「운영진에 명단 확인 요청」 안내 |
| A (방문 게스트) | 비회원 일회 방문 | B·C와 **같은 UI** (별도 분기 없음 — YAGNI) |

**데이터 정책 (기존 Phase 1 유지):**

- `isGuest: true` → 당일 **nicknameKey 중복 검사 제외** (같은 닉 재출석 가능)
- 정회원 월 **출석률·연속 정모 통계에 미포함**
- `sessionCount`의 `guestCount`에 반영
- `memberId` 없음 → SSOT는 출석 행 + 닉네임

---

## 3. UX 설계 (키오스크)

### 3.1 홈 화면 (`kioskHomePanel`)

기존 2타일 유지:

- 닉네임으로 찾기 (첫 글자)
- 팀으로 찾기

**추가 (3번째 액션):**

```
[ 명단에 없어요 — 여기서 출석 ]
  신규·준회원 또는 명단에 안 보이는 경우
```

- 스타일: `kiosk-secondary-button` 또는 3열 그리드의 보조 타일 (`--dmc-kiosk-*` 토큰)
- 탭 영역 ≥ 44px

**현장 유도:**

- `kioskPersonalLink` («개인 출석 화면») → **키오스크 모드에서 숨김** 또는 하단 작은 텍스트 링크만 (자봉·운영진용)
- 현장 사용자 메시지: 「출석은 이 화면에서만」

### 3.2 명단 그리드 빈 결과

첫 글자/팀 그리드에서 「조건에 맞는 닉네임이 없습니다」일 때:

- 같은 CTA: 「명단에 없어요 — 게스트로 출석」
- C용 한 줄: 「정회원인데 없다면 출석 후 운영진에게 알려주세요」

### 3.3 게스트 출석 모달 (키오스크 전용 진입)

기존 `#guestModal` **재사용**, 키오스크 진입 시:

| 필드 | 키오스크 |
|------|----------|
| 제목 | 「명단에 없는 경우 출석」 (「게스트」 단독 표기 지양 — B·C에게 부담 적게) |
| 닉네임 | 필수 입력 |
| 정모 유형·날짜 | `kioskState` 값으로 **고정** — 입력 숨김 또는 읽기 전용 표시 |
| 안내 문구 | 「정회원 통계에는 들어가지 않습니다. 명단 등록은 운영진이 따로 진행합니다.」 |
| C 추가 | 「이미 회원인데 명단에 없다면 게살볶음밥에게 알려주세요.」 |

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

### 3.4 출석 완료 (키오스크)

- 정회원과 동일: `showKioskDone(nickname, "출석 완료")` — **3초 후 홈 복귀**
- 게스트 통계 카드 **비표시** (기존 `resetKioskDoneStats` null 처리와 동일)
- 직후 `reloadKioskRoster("guest_checkin")` → 참여 인원·명단 갱신

### 3.5 에러 복구 (블로커 2a — 기존 v2 플랜)

`postCheckin` 실패 시:

1. `logAttendanceEvent("attendance_checkin_error", …)`
2. `reloadKioskRoster` (유사 에러 코드)
3. `isKioskMemberDone` 재판정 → 「이미 출석 완료」 또는 IT 안내

게스트 POST 실패 시에도 동일 재로드 (게스트는 dup skip이지만 네트워크·유효성 오류 가능).

---

## 4. 개인 모드(v2) — 보조

키오스크 권장이므로 **필수 변경 최소화:**

- 검색 0건 메시지에 「현장 태블릿 키오스크를 이용해 주세요」 한 줄 (키오스크 URL은 운영진이 QR/링크로 공유)
- 기존 「게스트로 출석」 모달 유지 (자봉이 개인 화면으로 우회할 때)

---

## 5. 로깅

게스트 키오스크 출석:

- 성공: (선택) `attendance_checkin_success` — 과다 로깅 방지 위해 **에러·reload만** 유지 가능 (YAGNI: 성공 로그 생략)
- 실패: `attendance_checkin_error`, `mode: "guest"`, `entrySource: "kiosk"`

---

## 6. 성공 기준

| 기준 | 측정 |
|------|------|
| B·C 사용자가 키오스크만으로 출석 완료 | 현장 시나리오 5·6 (플랜 체크리스트) |
| 명단 외 출석 후 `guestCount` 증가 | `sessionCount` API |
| 구 index + 키오스크 중복 시 에러 없이 완료 UX | 시나리오 1 |
| `event_logs`로 에러 추적 가능 | 시나리오 3 |

---

## 7. 범위 밖

- `members` 자동 생성·`add-member` API 연동
- 게스트 → 정회원 출석 행 마이그레이션
- QR / GitHub Pages 기본 URL 변경 (운영 안내로 키오스크 URL 공유)

---

## 8. 승인 체크리스트

- [ ] 홈 3번째 CTA 문구·운영진 알림 문구
- [ ] 개인 출석 링크 숨김 vs 작게 유지
- [ ] 구현 플랜 v3 태스크 순서
