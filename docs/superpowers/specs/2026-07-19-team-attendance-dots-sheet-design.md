# 팀 출석 도트 행 + 회원 바텀시트 디자인

날짜: 2026-07-19  
상태: 승인 대기 (브레인스토밍 합의 반영)  
관련 브랜치: `cursor/attendance-shell-redesign-spec-78e6`

## 목표

팀 출석 탭을 **사람 행 + 이번 달 정모일 가로 도트**로 바꿔, 월간 출석을 한눈에 “채우기”처럼 보이게 한다.  
행을 탭하면 **바텀시트**로 해당 회원 요약( my.html 상단 축소 )과 **이번 달 출석 이력**을 조회한다.  
출석 셸 리스트의 **아바타(이니셜 원)는 제거**한다.

## 비목표

- 신규 팀-월 전용 API
- 관리자형 멤버×날짜 매트릭스 / 주간 토글
- 시트에서 출석 등록·수정·취소
- `my.html` 본문(타임라인 등) 개편
- 출석 완료(`#viewSuccess`) 미니 달력을 내 출석 달력과 맞추는 작업 (후속)

## 합의된 선택

| 항목 | 선택 |
|------|------|
| 레이아웃 | C. 사람 행 + 날짜 도트 |
| 시간 축 | A. 이번 달 정모일(화·목·토)만 |
| 행 탭 | A. 바텀시트 (프로필 요약 + 이번 달 이력) |
| 구현 방식 | 1. 기존 행에서 날짜 텍스트만 도트로 교체 |
| 아바타 | 셸 리스트에서 전부 제거 |

## UI

### 팀 출석 목록

유지:

- 월 네비게이션, 팀 필터 칩, 요약 배너, 우측 **N회**, 정렬(횟수↓ → 닉네임)

변경:

- `7/3 · 7/5…` 텍스트 → 이번 달 정모일 가로 도트
- 아바타 열 제거 → **닉네임 + 도트 + N회**

도트 상태:

| state | 의미 | 시각 |
|-------|------|------|
| `attended` | 해당 정모 출석 | 채움 (셸 출석 그린 계열 권장) |
| `missed` | 이미 지난 정모, 미출석 | 빈 도트(외곽선) |
| `upcoming` | 아직 오지 않은 정모 | 흐림(muted) |

접근성: 각 도트에 `title` / `aria-label` (예: `7/14 출석`, `7/16 미출석`, `7/18 예정`).  
0회 회원도 명단에 포함(빈·예정 도트만 있는 행).

### 바텀시트

- 기존 `modal-backdrop` + `modal-sheet` 패턴 재사용 (세션 명단/게스트와 동일)
- 열기: 팀 출석 행 클릭/키보드 활성화
- 닫기: 닫기 버튼, 배경 탭, (가능하면) Escape

상단 (my.html 축소):

- 닉네임, 팀
- PB 3칸 스트립(풀/하프/10K) — 레이스 조회 성공 시에만. 실패·미매칭이면 스트립 숨김

본문:

- 같은 월 도트 줄 + 짧은 날짜 목록(또는 동등한 이력 리스트)
- 이번 달 횟수 · 정모 대비 출석률
- 조회 전용 (액션 버튼 없음)

### 아바타 제거 범위

- `attendance-v2` 팀 출석 목록, 오늘 출석 명단 등 `member-avatar`를 쓰는 리스트
- 관련 CSS (미사용 시 정리)
- `avatarCharFromNickname` 등 헬퍼는 호출처 없으면 제거 또는 테스트만 정리
- 목업(`attendance-v2-shell-mockup.html`)은 같은 방향으로 맞추되, 필수 배포 경로는 `attendance-v2` 우선

키오스크 등 별도 UX의 아바타가 핵심인 화면이 있으면 구현 계획에서 예외를 명시한다. 기본 방침은 **리스트형 회원 행에서 제거**.

## 데이터 · 로직

### 목록 (변경 최소)

기존과 동일:

1. `?action=members`
2. 월간 정모일마다 `?action=status&date=…` (청크 로딩 유지)
3. `assets/attendance-team-month.js` → `aggregateTeamMonth`  
   행 필드: `memberId`, `nickname`, `team`, `count`, `dates[]`

신규 API 없음.

### 도트 빌더 (순수 함수, 테스트 대상)

입력:

- `meetingDateKeys: string[]` — `listRegularMeetingDateKeys(monthKey)`
- `attendedDateKeys: string[]` — 멤버 `dates[]`
- `todayKey: string` — KST `YYYY/MM/DD` (또는 동등 정규화)

출력:

- `{ dateKey, state: "attended" | "missed" | "upcoming" }[]`

규칙:

- `attendedDateKeys`에 있으면 `attended`
- 없고 `dateKey < todayKey`이면 `missed`
- 없고 `dateKey >= todayKey`이면 `upcoming`  
  (당일 미출석도 `upcoming`으로 두어 “아직 기회 있음”으로 본다. 당일을 `missed`로 바꿀지는 구현 시 한 줄 상수로 고정 가능하나 기본은 `upcoming`.)

날짜 키는 기존 `normalize`/`slash` 규칙과 맞춘다.

### 바텀시트 데이터

- 출석 이력·도트·횟수·율: 목록 집계 결과로 즉시 렌더 (추가 status 호출 불필요)
- PB: 기존 레이스/my 조회 경로 재사용. 실패 시 상단 신원만 표시

## 파일 영향 (예상)

| 영역 | 파일 |
|------|------|
| UI | `attendance-v2.html`, `attendance-v2.js`, `assets/attendance-shell.css` |
| 헬퍼 | `assets/attendance-team-month.js` (도트 빌더 export) 및/또는 소형 전용 모듈 |
| 오늘 명단 | `assets/attendance-today-roster.js` / 렌더부 — 아바타 제거 |
| 테스트 | `scripts/test/attendance-team-month.test.js` (+ 도트 빌더 케이스), 오늘 명단 테스트 정리 |
| 목업 (선택) | `attendance-v2-shell-mockup.html` |

## 테스트 계획

- 도트 빌더: 출석/미출석/예정 혼합 월, 빈 attended, 오늘 경계
- `aggregateTeamMonth` 기존 케이스 회귀
- (가능하면) 행 마크업에 `member-avatar` 없음 — 단위/스냅샷 수준이면 충분

## 성공 기준

1. 팀 출석 행에서 이번 달 화·목·토 도트로 출석 여부가 보인다.
2. 행 탭 시 시트에 닉네임/팀 + 이번 달 이력이 보인다. PB는 있을 때만.
3. 해당 리스트에 아바타가 없다.
4. 기존 월 네비·팀 필터·요약·횟수 정렬이 유지된다.
5. `npm run test:attendance-shell` 통과.

## 후속 (이 스펙 밖)

- 출석 완료 화면 `mini-cal`을 내 출석 `cal-day` 디자인에 정렬
