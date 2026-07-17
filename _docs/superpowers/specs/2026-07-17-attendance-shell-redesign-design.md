# DMC 출석 v2 앱 셸 리뉴얼 — 설계서

> 작성일: 2026-07-17  
> 상태: **승인됨 (2026-07-17)** — 구현 계획 후 목업·디자인 컨펌 예정  
> 선행 문서: `2026-04-17-attendance-page-redesign-v2.md` (Phase 1 MVP, 기능 중심)  
> 참고 UI: 춘백 S3 (`chunbaek/`) — 앱 셸·토큰·탭 패턴  
> 범위: **출석 도메인 앱 셸** + 4탭 IA. 대회(races)·개인 레이스(my)는 **링크 진입** 유지.

---

## 1. 배경

### 현재 상태

| 구분 | 파일 | 한계 |
|------|------|------|
| 출석 v2 (베타) | `attendance-v2.html` + `attendance-v2.js` | 체크인 플로우만 존재. 탭·탐색 없음. HTML 내 ~1,200줄 인라인 CSS |
| 레거시 출석 | `index.html` | QR/메인 진입. 3단계 UX |
| 월간 기록 | `history.html` | 레거시 스타일. v2와 분리 |
| 대회 기록 | `races.html` | 별도 페이지 |
| 내 레이스 기록 | `my.html` | 별도 페이지 |
| 춘백 | `chunbaek/` | 앱 셸·토큰·탭 UX 완성. 출석과 별도 제품 |

출석 v2는 기능(MVP)은 갖췄으나 **정보 구조·시각 일관성·기능 발견성**이 부족하다.  
춘백 S3에서 검증된 **모바일 앱 셸**(brand-bar + main + tab-bar)을 DMC 출석에 적용해, 출석 관련 행동을 한곳에서 탐색 가능하게 한다.

### 이번 설계가 대체하는 것

- `2026-04-17-attendance-page-redesign-v2.md`의 **UI/IA 목표**를 앱 셸 관점으로 재정의한다.
- Phase 1에서 구현된 **체크인·키오스크·stats API**는 유지한다. 변경은 **셸·탭·스타일·신규 팀 출석 뷰** 중심.

---

## 2. 목표 및 성공 기준

| 목표 | 성공 기준 |
|------|-----------|
| 출석 앱 셸 통일 | 하단 4탭으로 오늘 체크인·내 출석·팀 출석·더보기 접근 (< 2탭) |
| 대회와 출석 분리 | 대회는 상단바 1곳. 하단 탭에 대회 혼재 없음 |
| 춘백급 모바일 UX | brand-bar + tab-bar + 토큰 기반 CSS. 인라인 CSS blob 제거 |
| 팀 출석 가시화 | 내 팀 기준 이번 달 정모 참석 현황 확인 가능 |
| 키오스크 접근 | 더보기 → 이용 안내 안에서 키오스크 모드 진입 (자봉·현장 태블릿). URL `?mode=kiosk` 북마크 유지 |

**실패 기준 (롤백):** 기존 체크인·키오스크 플로우 회귀, pre-deploy-test 실패, 정모일 현장 키오스크 사용 불가.

---

## 3. 정보 구조 (IA)

### 3.1 앱 셸 구조

```
┌─────────────────────────────────────┐
│ brand-bar          [대회 기록 →]   │  ← 상단: races.html 링크
├─────────────────────────────────────┤
│                                     │
│            main (활성 탭 뷰)         │
│                                     │
├─────────────────────────────────────┤
│  오늘 │ 내 출석 │ 팀 출석 │ 더보기  │  ← 하단 tab-bar (고정)
└─────────────────────────────────────┘
```

- **해시 라우팅:** `#today` | `#my-attendance` | `#team-attendance` | `#more` (춘백 `app.js` 패턴 준수)
- **모바일 우선:** `.app` max-width 480px, safe-area 대응
- **키오스크:** `?mode=kiosk` 시 **탭 바·brand-bar 숨김**, 기존 키오스크 UI 전체 화면 (현행 유지)

### 3.2 하단 탭 정의

| 탭 | ID | 목적 | 주요 콘텐츠 |
|----|-----|------|-------------|
| **오늘** | `today` | 오늘 출석 행동 | 첫 방문 검색/온보딩 또는 재방문 원클릭 대시보드, 출석 성공 화면 |
| **내 출석** | `my-attendance` | 개인 이력 조회 | 이번 달 출석 달력·통계·정모/기타 모임 구분 (현 `history` + v2 stats 통합) |
| **팀 출석** | `team-attendance` | 팀·클럽 참석 현황 | 팀 필터 + 전체 회원 확장, 월 선택, 정모 중심 참석자·횟수 |
| **더보기** | `more` | 부가 진입·설정 | 프로필, 내 기록(my), 이용 안내(키오스크는 안내 안) |

### 3.3 상단바 (brand-bar)

| 요소 | 동작 |
|------|------|
| 좌측: DMC 로고 + "동마클 출석" | 탭 `오늘`로 이동 |
| 우측: **대회 기록** 버튼 | `races.html`로 이동 (전체 페이지 네비게이션) |

> races를 상단에만 두는 이유: 출석(행동)과 대회(조회·탐색)의 **인지 부하 분리**. 더보기에 중복 배치하지 않는다.

### 3.4 더보기 메뉴

| 항목 | 동작 | 비고 |
|------|------|------|
| **프로필 카드** | 닉네임·팀 표시 | localStorage 프로필 SSOT |
| 프로필 수정 | 검색/팀 변경 플로우 | 기존 v2 모달·검색 재사용 |
| **내 기록** | `my.html` 이동 | 개인 레이스 기록 (대회 SSOT: race_results) |
| **이용 안내** | 시트/모달 | 베타 안내, 정모 규칙 요약. **키오스크 모드는 이 시트 안에만** (더보기 메인 목록에 두지 않음) |
| *(선택)* 동마클 홈 | `index.html` | Phase 1에서 생략 가능 |

**의도적으로 제외(더보기 메인):** races(상단 전용), history(내 출석 탭이 대체), 키오스크 단독 행(이용 안내 안), 레거시 전체 명단(팀 출석·키오스크가 대체).

---

## 4. 탭별 상세

### 4.1 오늘 (`#today`)

**현행 v2 개인 모드 이관.**

**기본 정모 (접속 요일 → 날짜·meetingType):** `docs/MEETING_INFO.md` / `attendance-v2.js` `resolveDefaultMeeting`과 **동일**.  
예: 월요일 → `SAT` + 2일 전(토), 금요일 → `THU` + 1일 전(목). URL `meetingDate`/`meetingType`이 있으면 그 값을 우선.

| 상태 | 화면 | 비고 |
|------|------|------|
| 프로필 없음 | 검색 + 환영 (B안) | members API 자동완성 |
| 프로필 있음 | 대시보드 (C안) | 원클릭 출석, 이번 달 요약 스니펫 |
| 출석 완료 | 성공 + 통계 | 기존 success 뷰 |

- 히어로 날짜·정모 라벨은 **위 기본 정모** 기준 (달력 “오늘”이 아니라 세션 날짜).
- 춘백 `today` 탭처럼 **큰 primary CTA**, 출석 완료 시 **attend 배지** 톤 적용.
- 토요일 춘백 안내 배너(기존) 유지.

### 4.2 내 출석 (`#my-attendance`)

**`history.html` 기능을 v2 셸 안으로 흡수 (UI만; API는 기존 `history`·`stats`).**

| 블록 | 내용 |
|------|------|
| 월 선택기 | 이전/다음 달 |
| 요약 카드 | 출석 횟수, 출석률, 연속 출석 (stats API) |
| 달력/목록 | 해당 월 출석일 (history API) |
| 모임 타입 | 정모·수요·토요 등 구분 표시 (1차: 모두 표시, 정모 강조) |
| **출석 취소** | **활성 세션 행에만** 보조 «출석 취소» + confirm. 오늘 탭 CTA를 취소로 바꾸지 않음. 비활성 세션은 버튼 숨김 |

**개인 출석 취소 «활성 세션» 정의 (A안 · 2026-07-17 합의):**

- **활성 세션** = 현재 KST 시각 기준 `resolveDefaultMeeting()`이 반환하는 `(meetingDateKey, meetingType)`.
- 달력 “오늘”과 다를 수 있음. 예: **월요일** → 토요 정모(2일 전)가 활성 → 그 행만 취소 가능.
- 화요일이 되면 활성은 화요 정모로 바뀌고, 토요 행의 취소 버튼은 사라짐.
- 서버 `delete-attendance`(self)도 **동일 조건**으로 거부. (`memberId` 매칭 + 활성 세션만)
- 상세 UX·API는 운영 허브 스펙 §7.3과 동일 SSOT.

- 프로필 없으면: "오늘 탭에서 프로필을 설정해 주세요" + CTA.

### 4.3 팀 출석 (`#team-attendance`)

**신규 뷰. 조회 전용 (체크인 아님).**

| 요소 | 스펙 |
|------|------|
| 기본 필터 | 저장된 **내 팀** |
| 확장 필터 | 다른 팀 선택 · **동마클 전체** |
| 기간 | **이번 달** 기본, 월 이동 |
| 모임 타입 | **정모 중심** (1차). 정모 = `meetingType` ∈ `{TUE, THU, SAT}` (`ETC` 제외). UI 라벨은 "화요일 정모" 등 기존 `meetingTypeLabel` 맵 사용 |
| 멤버 행 | 닉네임, 이번 달 정모 출석 횟수, 출석한 날짜(또는 회차) |
| 요약 | 팀원 수(`roster`) / 1회 이상 출석한 사람 수(`attended`) / **출석률 = attended ÷ roster** (멤버별 평균 아님) |

**데이터 소스 (구현 시 택1 — §7 참고):**

- 신규 API `team-month-attendance` (권장)
- 또는 클라이언트에서 월간 정모일 `status` 반복 조회 + members 조인 (MVP 한시적)

춘백 `team-summary`의 2열 스탯 카드·`.week-header` 섹션 헤더 패턴 참고.

### 4.4 더보기 (`#more`)

§3.4 표 준수. 리스트형 설정 화면 (춘백 `me` 탭 톤).

**키오스크 진입 UX:**

1. 더보기 → **이용 안내** 시트 열기
2. 시트 안 «키오스크 모드» 탭 (메인 더보기 목록에는 없음)
3. 확인 다이얼로그 ("공용 기기에서 사용합니다. 개인 프로필이 숨겨집니다.")
4. `location`을 `?mode=kiosk`로 전환 (또는 hash 유지 + query 추가)
5. 키오스크 종료: 기존 blocker2 패턴의 "종료" → `mode` 제거 후 `#more` 복귀

URL 북마크 `attendance-v2.html?mode=kiosk`는 계속 직접 진입 가능.

---

## 5. 시각 디자인 방향

### 5.1 춘백에서 가져올 패턴 (구조·UX)

| 패턴 | 춘백 | DMC 출석 적용 |
|------|------|----------------|
| 앱 셸 | `.app` + brand-bar + tab-bar | 동일 구조 |
| 토큰 계층 | brand → semantic → component | `assets/design-tokens.css` 확장 |
| 배경 | 조용한 `--surface-muted` | `--dmc-slate-2/3` 활용 |
| 상태 표현 | attend/today/miss 배지 | 출석 완료·오늘·미출석 |
| 섹션 | card 남발 대신 `.week-header`형 헤더 | 팀 출석·내 출석 섹션 |
| CTA | 큰 primary 버튼 | 오늘 탭 체크인 |

### 5.2 DMC 고유 유지

| 항목 | 결정 |
|------|------|
| 브랜드 색 | DMC blue (`--dmc-blue-*`) — 춘백 오렌지 복사 안 함 |
| 폰트 | 1차: system-ui 유지. 2차에서 display 폰트 검토 |
| 로고 | `assets/dmc_logo.png` |

### 5.3 CSS 구조 목표

```
assets/design-tokens.css      (기존 + shell/attend 시맨틱 토큰 추가)
assets/attendance-shell.css   (brand-bar, tab-bar, .app)
assets/attendance-views.css   (탭별 뷰 — 선택적 분리)
attendance-v2.html            (마크업만, 인라인 CSS 제거)
attendance-v2.js              (라우터 + 기존 로직)
```

---

## 6. 구현 접근 3안

### A. 셸 래핑 (점진 이관) — **추천**

| | |
|---|---|
| **내용** | `attendance-v2.html`에 brand-bar·tab-bar 추가. 기존 뷰를 `#today`에 넣고, 탭별로 점진 추가 |
| **장점** | 리스크 낮음. 체크인·키오스크 회귀 최소. 단계별 배포 가능 |
| **단점** | 한 파일에 라우터+뷰가 잠시 공존 |
| **1차 배포** | 셸 + 오늘 + 더보기(이용 안내→키오스크) |
| **2차** | 내 출석 |
| **3차** | 팀 출석 (+ API) |

### B. SPA 분리 (chunbaek/ 구조 복제)

| | |
|---|---|
| **내용** | `attendance/` 폴더에 `index.html`, `css/`, `js/app.js` 신규. v2는 리다이렉트 |
| **장점** | 춘백과 동일 아키텍처. 장기 유지보수 명확 |
| **단점** | URL·북마크·QR(`attendance-v2.html`) 마이그레이션 필요. 초기 공수 큼 |

### C. 단일 배포 + history/my 임베드

| | |
|---|---|
| **내용** | races/my/history를 iframe 또는 fetch+inject로 탭 안에 삽입 |
| **장점** | "한 앱에 다 있다" 느낌 |
| **단점** | 스타일 불일치, 이중 스크롤, 레거시 HTML 개편 필요. **비추천** |

**권장·확정: A → 안정화 후 필요 시 B로 폴더 이전.** (Approach A는 §10에서 잠금)

---

## 7. API·데이터

### 7.1 기존 API 재사용

| API | 탭 | 용도 |
|-----|-----|------|
| `POST /attendance` | 오늘 | 체크인 |
| `GET ?action=members` | 오늘 | 명단 검색 |
| `GET ?action=stats` | 오늘, 내 출석 | 개인 통계 |
| `GET ?action=history` | 내 출석 | 월간 이력 |
| `GET ?action=status` | 팀 출석 (임시) | 일별 출석자 |
| `GET ?action=sessionCount` | 오늘 | 정모 인원 |

### 7.2 신규 API 검토: `team-month-attendance`

| 필드 | 설명 |
|------|------|
| `team` | 팀명 또는 `__all__` (전체) |
| `month` | `YYYY-MM` |
| `meetingType` | 기본 정모 = `TUE`/`THU`/`SAT`만 집계 (`ETC` 제외). 쿼리 생략 시 정모 필터, 또는 `scope=regular` |

**응답 예:** `{ ok, team, month, members: [{ memberId, nickname, team, attendCount, dates: [] }], summary: { roster, attended, rate } }`  
`rate` = `attended / roster` (1회 이상 출석한 인원 비율).

> 신규 API 추가 시 `new-api-validation.mdc` 절차(전역 검색·justification·사용자 승인) 필수.

**대안 (MVP):** 해당 월 정모 `dateKey` 목록을 서버 설정 또는 클라이언트 규칙으로 알고, `status`를 날짜별 호출 후 members와 조인. **정모 일수 × API 호출**이므로 2차에서 전용 API로 교체.

---

## 8. 배포·마이그레이션 단계

| 단계 | 범위 | 레거시 |
|------|------|--------|
| **Phase Shell-1** | 셸 + 오늘 + 더보기(이용 안내→키오스크) + 상단 races. **4탭 UI는 표시**하되 `내 출석`·`팀 출석`은 "준비 중" 스텁 | `index.html` QR 유지. v2 베타 배너 제거 |
| **Phase Shell-2** | 내 출석 탭 (`history` 대체 UI) | `history.html`에 "v2로 이동" 배너 |
| **Phase Shell-3** | 팀 출석 탭 + API | `index` 전체 명단 링크 축소 |
| **Phase Shell-4** (선택) | `index.html` → v2 리다이렉트 | QR URL 변경 공지 |

키오스크 URL `attendance-v2.html?mode=kiosk` **북마크 호환 유지** (리다이렉트 또는 동일 파일).

---

## 9. 비범위 (Out of Scope)

- `races.html` / `my.html` UI 리뉴얼 (링크만)
- 춘백 앱(`chunbaek/`) 변경
- 출석 **수정**(필드 변경) — 삭제 후 재등록으로 대체. **삭제는 in-scope** (개인 + 운영진, admin-hub 설계 §7.3)
- 카카오 알림·QR 출석
- PWA manifest 통합 (키오스크 manifest는 기존 유지)

---

## 10. 확정 결정 (구 미결 — 2026-07-17 동의)

| # | 항목 | 결정 |
|---|------|------|
| 1 | 레거시 `index.html` 컷오버 | **Shell-4**에서만. 운영진 공지 후 QR/URL 변경 |
| 2 | 팀 출석 모임 타입 | **Shell-3: 정모만** = `TUE`/`THU`/`SAT`. `ETC` 제외. 다른 타입 필터는 이후 단계 |
| 3 | `team-month-attendance` API | Shell-3 전 `new-api-validation` justification + 사용자 승인. 그 전 MVP는 `status` 반복 조인 가능 |
| 4 | display 폰트 | **1차(Shell-1~3) 생략** — system-ui 유지 |
| 5 | 더보기 «동마클 홈» | **1차 생략** |
| 6 | 구현 접근 | **Approach A (셸 래핑 점진 이관)** — B/C 비채택 |
| 7 | 디자인 게이트 | 구현 계획 작성 후 **목업 → 디자인 컨펌** 다음에 Shell-1 코드 착수 |
| 8 | 개인 출석 취소 창 | **A — 활성 세션** = `resolveDefaultMeeting` `(date, type)`만. 달력 당일 아님. (월→토요 취소 가능) |

**Shell-1 구현 노트 (2026-07-17):** `attendance-v2.html`/`.js`에 brand-bar·4탭·더보기(이용 안내→키오스크)·`kioskWrap` 적용. 내 출석·팀 출석은 stub. 배포는 사용자 재확인 후.

---

## 11. 검증

- `bash scripts/pre-deploy-test.sh` 전체 통과
- 수동: 오늘 체크인, 내 출석 월 이동, 팀 필터(내 팀/전체), 더보기→이용 안내→키오스크→종료, 상단→races
- 정모일 키오스크 현장 시나리오 (blocker2 회귀 없음)

---

## 12. 관련 문서

- `_docs/design/chunbaek-design-tokens.md`
- `_docs/superpowers/specs/2026-07-12-chunbaek-season3-fe-tech-spec.md`
- `_docs/superpowers/specs/2026-04-17-attendance-page-redesign-v2.md`
- `_docs/superpowers/specs/2026-06-13-attendance-kiosk-blocker2-design.md`
- `_docs/pm-briefing-attendance-v2-beta.md`
