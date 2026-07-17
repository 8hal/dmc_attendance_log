# DMC 출석·운영 어드민 허브 — 설계서

> 작성일: 2026-07-17  
> 상태: **초안 — 구현 계획 작성됨** (`_docs/superpowers/plans/2026-07-17-attendance-admin-hub.md`). 목업·디자인 컨펌 후 Admin-1a.  
> 관련: `_docs/superpowers/specs/2026-07-17-attendance-shell-redesign-design.md` (회원 앱 셸)  
> 선행 선례: `chunbaek/admin.html` (탭·훈련 입력), `admin.html` (회원 CRUD)

---

## 1. 배경

### 문제

| 현재 | 한계 |
|------|------|
| `admin.html` | **회원 관리만**. URL·북마크·`report`/`group` 링크의 “admin”이 곧 회원 CRUD |
| `ops.html` | 오너 전용 스크래핑·건전성 콘솔 — 정모 훈련 입력에 부적합 |
| `report` / `group` | 대회 기록 파이프라인 — 출석·정모와 도메인 분리 |
| `docs/MEETING_INFO.md` | 정모 기본 시간표만 문서. **당일 훈련 정보 UI 없음** |
| 출석 셸 목업 | 오늘 탭에 훈련 **표시**만 — 입력처 미정 |

회원 앱(출석 셸)과 운영 도구를 분리한 채, **출석·정모 운영**을 한 허브로 모을 필요가 있다.  
기존 회원 관리는 그 허브의 **하위 탭**으로 옮긴다.

### 목표

| 목표 | 성공 기준 |
|------|-----------|
| 출석 운영 허브 | 한 URL에서 회원·정모 훈련(및 확장 탭) 접근 |
| 북마크 호환 | 기존 `admin.html` 링크가 깨지지 않음 (리다이렉트) |
| 권한 일관 | 기존 `verify-admin`(운영자·오너) 재사용 |
| ops/report 비침습 | 대회·시스템 콘솔과 역할 혼선 없음 |

---

## 2. 제품 경계

```
회원 앱                          출석·클럽 운영 허브              대회·시스템
─────────────────                ───────────────────             ────────────
attendance-v2 (셸)               ★ NEW admin hub                 ops.html (오너)
history / index                  · 회원 관리 (舊 admin)          report.html
races / my (링크)                · 정모 훈련 입력                group.html
                                 · (이후) 출석 조회 등           chunbaek/admin (시즌 별도)
```

- **허브에 넣지 않음:** `ops`, `report`, `group`, 춘백 admin (제품·인증·데이터 모델이 다름)
- **허브에 넣음:** 클럽 출석/명단/정모 운영

---

## 3. 구현 접근 3안

### A. 신규 허브 + `admin.html` 리다이렉트 — **추천**

| | |
|---|---|
| **파일** | `attendance-admin.html` (또는 `club-admin.html`) 신규. 기존 `admin.html`은 `#members`로 302/메타 리다이렉트 |
| **장점** | “신규 어드민” 의도와 일치. 회원 관리 코드를 탭으로 이식하기 명확. URL로 제품 경계가 보임 |
| **단점** | `report`/`group`/`pamphlet` 링크 문구를 “출석 운영” 등으로 갱신 필요 |

### B. 기존 `admin.html`을 제자리 확장

| | |
|---|---|
| **파일** | `admin.html`에 상단 탭 추가, 회원 UI는 `#members` |
| **장점** | 링크 변경 최소 |
| **단점** | “회원 관리” 타이틀·북마크 의미 혼선. 파일이 더 비대해짐 |

### C. `admin/` SPA 폴더 (춘백 admin 구조 복제)

| | |
|---|---|
| **장점** | CSS/JS 분리 깔끔 |
| **단점** | Hosting 경로·배포·리다이렉트 공수↑. 1차에 과함 |

**권장: A.** 파일명 후보:

| 후보 | 평가 |
|------|------|
| `attendance-admin.html` | 출석 셸과 짝이 맞음 ✅ |
| `club-admin.html` | 범용이나 모호 |
| `admin-hub.html` | 임시 느낌 |

→ **`attendance-admin.html`** 사용. 문서·UI 표기는 **「동마클 출석 운영」**.

---

## 4. IA — 허브 탭 구조

### 4.1 Phase Admin-1 (MVP)

| 탭 | hash | 내용 | 출처 |
|----|------|------|------|
| **출석 관리** | `#attendance` | **당일** 명단·삭제 + **월 집계(출석왕)** + **기간 CSV** | §7.0 |
| **회원** | `#members` | 기존 `admin.html` CRUD 이식 (검색·추가·수정·숨김) | 현행 API 그대로 |
| **정모 훈련** | `#training` | 날짜+meetingType별 장소·시간·코스·메모 입력 | **신규** (API는 별도 justification) |

상단: 로고 + 「동마클 출석 운영」 + (선택) `report` / `ops` 외부 링크(오너만 ops).  
기본 진입 탭: **`#attendance`** (운영 허브의 주 업무). `#members`는 `admin.html` 리다이렉트 전용 진입.

**출석 관리 vs 회원 앱**

| | 출석 관리 탭 (운영) | 오늘·팀 출석 (회원 앱) |
|--|---------------------|-------------------------|
| 목적 | 운영진이 **임의 날짜** 출석 확인·점검 | 회원이 오늘 체크인 / 월간 팀 조회 |
| 권한 | verify-admin | 공개 |
| 보정(추가·삭제) | **운영진 삭제·추가** (Admin-1b+) | **개인 삭제** (출석 셸 — 본인 기록) |

### 4.2 Phase Admin-2 (이후)

| 탭/기능 | 용도 |
|---------|------|
| **설정** | MEETING_INFO 기본 시간표 오버라이드, 안내 문구 |

### 4.3 레이아웃 (PC 우선, 모바일 가능)

춘백 `admin.html`과 유사:

- 상단: 브랜드 + 탭 네비
- 본문: 활성 패널만 표시
- 인증: 기존 오버레이 1회 → `sessionStorage` (키는 허브 공용으로 통일, 예: `dmc_attendance_admin_auth`)

---

## 5. URL·마이그레이션

| 진입 | 동작 |
|------|------|
| `/attendance-admin.html` | 허브. 기본 탭 `#attendance` |
| `/attendance-admin.html#attendance` | 출석 관리 |
| `/attendance-admin.html#training` | 정모 훈련 탭 |
| `/attendance-admin.html#members` | 회원 관리 |
| `/admin.html` | **리다이렉트** → `/attendance-admin.html#members` |
| `/admin.html?...` | 쿼리 보존 후 허브로 |

**링크 갱신 대상:** `report.html`, `group.html`, `pamphlet.html`, `pamphlet-group-event.html`, 관련 테스트·문서.

**유지:** `ops.html` 경로·권한 변경 없음.

---

## 6. 인증·역할

| 역할 | 허브 접근 | 비고 |
|------|-----------|------|
| operator (`DMC_ADMIN_PW`) | ✅ 전 탭 | 자봉·운영진이 훈련 입력 |
| owner (`DMC_OWNER_PW`) | ✅ | ops 링크만 추가 노출 가능 |
| 비인증 | 오버레이만 | |

기존 `POST /race?action=verify-admin` 재사용. **신규 로그인 API 불필요.**

구 `admin.html`의 `dmc_admin_auth` → 허브 키로 이전. 구 키 읽으면 마이그레이션 후 삭제(호환 1회).

---

## 7. 탭별 상세

### 7.0 출석 관리 (`#attendance`)

**목적:** (1) 정모 **당일** 명단 점검·삭제 (2) **월/기간 집계**로 출석왕 시상 (3) **기간 CSV** 추출.

패널 안 **서브모드** (세그먼트 토글):

| 모드 | 용도 |
|------|------|
| **당일** | 날짜 + meetingType → 명단·인원·운영진 삭제/추가 |
| **월 집계** | `YYYY-MM` (+ 선택: 정모만 TUE/THU/SAT) → 회원별 출석 횟수 랭킹 (**출석왕**) |
| **CSV** | 시작일~종료일 (+ 유형 필터) → 행 단위 출석 내역 다운로드 |

#### 7.0.1 당일

| UI | 동작 |
|----|------|
| 날짜 · 유형 | `meetingDateKey`, `TUE`/`THU`/`SAT` |
| 요약 | 전체 · 정회원 · 게스트 (`sessionCount`) |
| 명단 | 닉네임 · 팀 · 시각 · 삭제 |
| API | 조회: 기존 `status` / `sessionCount`. 삭제: §7.3 |

#### 7.0.2 월 집계 · 출석왕

| UI | 동작 |
|----|------|
| 월 선택 | `YYYY-MM` |
| 필터 | 정모만(기본) / 전체 유형 |
| 테이블 | 순위 · 닉네임 · 팀 · 출석 횟수 · (선택) 출석일 목록 |
| 하이라이트 | 1~3위 또는 «출석왕» 배지 — **시상용** |
| 동률 | 동일 횟수는 공동 순위 (운영 규칙: 닉네임 가나다 또는 병기) |

**데이터:** Admin-1a는 클라이언트에서 해당 월 정모일 `status` 반복 조인 **가능하나 무거움**.  
권장: `admin-month-attendance` (또는 `month-leaderboard`) **집계 API** — justification 후.  
집계 키: `memberId` 우선, 없으면 `nicknameKey`. 게스트는 시상에서 제외 옵션(기본: 제외).

#### 7.0.3 기간 CSV

| UI | 동작 |
|----|------|
| 기간 | `from` ~ `to` (date) |
| 필터 | meetingType 다중 또는 정모만 |
| 버튼 | «CSV 다운로드» |
| 컬럼 (초안) | `meetingDate`, `meetingType`, `nickname`, `team`, `memberId`, `isGuest`, `time` |

**구현:** 브라우저에서 조회 결과를 Blob 생성 **또는** 서버 `admin-attendance-export`.  
대량 기간이면 서버 export 권장 (justification). Admin-1a 목업·소량: 클라이언트 CSV로 충분할 수 있음.

**Admin-1a:** 당일 조회 + (목업) 월 집계·CSV UI.  
**Delete-1 후:** 당일 삭제/추가.  
**집계/CSV API:** 별도 justification (월 집계·export가 무거우면).

### 7.1 회원 (`#members`)

- UI·동작: 현 `admin.html`과 **동등** (회귀 금지)
- API: `all-members`, `add-member`, `update-member`, `hide-member`
- 이식 방식: 마크업·스크립트를 허브 패널로 이동 (동작 복사 후 `admin.html`은 리다이렉트만)

### 7.2 정모 훈련 (`#training`)

**입력 단위:** `(meetingDateKey, meetingType)` where `meetingType ∈ {TUE, THU, SAT}`  
(공지 헤더 예: «목요일 정모» = `THU` + 해당 날짜)

**실무 공지 포맷 (2026-07-17 샘플 반영):**

| 공지 항목 | 필드 (가칭) | 예 |
|-----------|-------------|-----|
| 정모 제목 | `meetingType` (+ 라벨) | 목요일 정모 |
| **시간/장소** | `timePlace` 또는 `time` + `place` | `19:30` / `여울공원 운동장(트랙)` |
| **훈련 · 전** | `trainBefore` | 체조 및 스트레칭, 조깅 운동장 7바퀴 |
| **훈련 · 본** | `trainMain` | 300/100 인터벌 10개 & 보강훈련 |
| **훈련 · 후** | `trainAfter` | Cool 조깅 10분, 마무리 체조 및 스트레칭 |
| **급수 및 서포터즈** | `supporters` | 바우돌리노/보스톤 |
| **메모/안내** | `note` | 7월에는 갯수 좀 줄일테니 스피드좀 올려 주세요. |

회원 앱 오늘 탭은 위 구조를 **읽기 전용**으로 그대로 보여 준다 (표·섹션).  
단순 «코스 한 줄» 모델은 쓰지 않는다.

**UI 스케치 (운영 입력) — 카페 공지 import가 기본 (2026-07-17):**

실무에서 정모 훈련은 **네이버 카페 공지**로 먼저 올라가고, 운영 UI는 그걸 **가져와 파싱 → 검토·저장**하는 흐름이 본체다.  
수동 주간 보드는 **수정·보완용**이다.

| 단계 | 동작 |
|------|------|
| **1. 가져오기 (기본)** | 카페 글 URL 또는 `articleid` 입력 → «공지 가져오기» |
| **2. 파싱** | 본문에서 요일별(화/목/토) **시간/장소 · 전/본/후 · 서포터즈 · 메모** 추출 → 주간 보드에 채움 |
| **3. 검토** | 운영진이 필드 확인·수정 |
| **4. 저장** | 주간 일괄 저장 → 회원 앱 오늘 탭 표시 |

**카페 예시:**  
`https://cafe.naver.com/2008dmc` · `menuid=6` · `clubid=30619899` · `articleid=4853`  
(게시판: 공지/정모 관련 — 정확한 게시판명은 운영 확정)

**기술 제약 · 1차 결정 (2026-07-17 합의):**
- 동마클 카페는 **회원 전용**이라 비로그인 URL fetch만으로는 본문이 안 나올 수 있음.
- **1차 = A. 본문 붙여넣기 파싱** (쿠키 불필요, 사용자 합의).  
  카페에서 복사한 텍스트/HTML → 파서 → 주간 보드 프리필 → 검토 → 저장.
- **B. URL 자동 fetch**(세션/쿠키)는 이후 검토. 목업에 URL 필드는 남겨도 1차 구현은 비활성 또는 “준비 중”.
- **C. 모바일 공유 텍스트**는 선택(이후).
**주간 보드 (가져오기 후 / 수동 보완):**

| 패턴 | 동작 |
|------|------|
| **주간 보드** | 화·목·토 3열 동시 편집 · 일괄 저장 |
| **지난주 불러오기** | 카페 없이 전주 DB 값 복사 (보조) |
| **요일 기본 시간·장소** | MEETING_INFO / 마지막 저장값 — 파싱 누락 시 폴백 |

**회원 앱 소비:** `#today`가 `(date, type)`로 조회 → 공지 표 표시.**API:**  
- `meeting-training` get/save — 저장·회원앱 표시  
- `parse-cafe-training` (가칭) — URL 또는 pasted body → 주간 슬롯 JSON  
**구현 전 `new-api-validation` + justification + 사용자 승인 필수.**  
문서 키 예: `meeting_training/{dateKey}_{type}`.

**우선순위:** 카페 **가져오기·파싱 → 검토 → 저장** ≫ 수동 타이핑. 전주 복사는 보조.
### 7.3 출석 삭제 API (개인 + 운영진) — **필수**

현재 `POST /attendance`는 **등록만** 있고, HTTP **삭제 API는 없음** (스크립트만 존재).  
**개인 삭제**와 **운영진 삭제** 모두 제품 요구이므로 신규 API가 필요하다. (`new-api-validation` + justification + 승인)

| API (가칭) | 누가 | 인증 | 범위 |
|------------|------|------|------|
| `delete-attendance` (self) | 회원 앱 | 공개이되 **본인 기록만** | `memberId` 또는 (nicknameKey+meetingDate+meetingType)이 클라이언트 프로필과 일치. **당일(또는 최근 N시간)만** 허용 권장 |
| `admin-delete-attendance` | 출석 관리 탭 | `verify-admin` (pw/세션) | 임의 날짜·임의 행. 문서 `id` 또는 복합키. **감사 로그**(`event_logs`) 필수 |

**추가(운영진):** Admin-1b에서 누락분 등록은 기존 `POST /attendance` 재사용 가능. 감사·권한이 필요하면 이후 `admin-add-attendance`로 감싼다 (선택).

**개인 삭제 UX (출석 셸) — 2026-07-17 합의:**  
- **위치: «내 출석» 목록만** (오늘 탭 CTA를 취소로 바꾸지 않음 — 오탭 위험).  
- **당일 행에만** «출석 취소» **보조 버튼**(작은 outline). 지난 날은 버튼 숨김.  
- 탭 시 **confirm** 필수.  
- 오늘 탭: 출석 후 CTA는 «출석 완료»(비활성) 유지. 취소는 내 출석으로 안내해도 됨(선택).

**보안 메모 (2026-07-17 합의):** 회원 앱은 로그인 없이 localStorage 프로필이므로 self-delete는 **완전 방지 불가**. 완화: **당일만** 허용, rate limit, 서버에 **memberId 우선 매칭**, 감사 이벤트. 사용자는 이 전제에 동의함.

---

## 8. 출석 셸과의 관계

| | 출석 셸 | 출석 운영 허브 |
|--|---------|----------------|
| 사용자 | 회원·키오스크 | 운영자·오너 |
| 훈련 | 표시 | 입력 |
| 출석 삭제 | **개인 삭제** (self API) | **운영진 삭제** (admin API) |
| 일정 | Shell-1 목업→구현 | Admin-1과 병행 가능하되, **훈련 API 없으면 셸은 플레이스홀더/하드코드** |

권장 순서:

1. 허브 셸 + 출석 관리(**조회**) + 회원 탭 이식 + `admin.html` 리다이렉트 (**Admin-1a**)  
2. 삭제 API justification·승인 → **개인 + 운영진 삭제** 구현 (**Delete-1**, 셸·허브 동시)  
3. 훈련 탭 UI + API (**Admin-1b**)  
4. 출석 셸 오늘 탭 훈련 API 연동 (**Shell** 후속)  

---

## 9. 비범위

- `ops.html` / `report.html` 통합
- 춘백 admin 통합
- 회원 앱 더보기에 운영 허브 링크 노출 (1차 생략 권장)
- 출석 **수정**(팀·날짜 변경) — 삭제 후 재등록으로 대체 (별도 요청 시)
---

## 10. 리스크·완화

| 리스크 | 완화 |
|--------|------|
| `admin.html` 북마크 깨짐 | 즉시 리다이렉트 |
| 회원 CRUD 회귀 | Admin-1a에서 기존 TC·수동 시나리오 동일 통과 |
| 삭제 API 성급 추가 | Delete-1 게이트: justification + 승인. self/admin 분리 |
| self-delete 남용 | 당일 제한 · memberId 매칭 · event_logs |
| ops와 혼동 | UI 카피 «출석 운영» / ops는 «시스템·스크래핑» |

---

## 11. 확정 제안 (동의 시 잠금)

| # | 항목 | 제안 |
|---|------|------|
| 1 | 접근 | **A** — `attendance-admin.html` 신규 + `admin.html` → `#members` 리다이렉트 |
| 2 | Admin-1 탭 | **출석 관리**(조회+운영진 삭제) + **회원** + **정모 훈련** |
| 3 | 인증 | 기존 `verify-admin` (operator+owner) |
| 4 | ops/report | 허브 밖 유지 |
| 5 | 구현 순서 | 1a 조회+회원이식 → **Delete-1 (개인+운영진 삭제 API)** → 1b 훈련 → 셸 연동 |
| 6 | 훈련 API | 1b 전 별도 승인 |
| 7 | 출석 삭제 | **개인 + 운영진 모두 필수.** 개인 = **내 출석** 당일 행 보조 버튼+confirm (오늘 CTA 교체 금지). 당일·memberId 완화 (**합의됨**) |
| 8 | 훈련 입력 기본 | **카페 공지 본문 붙여넣기 파싱(A)** → 검토 → 저장. URL 자동 fetch는 이후 (**합의됨**) |

---

## 12. 관련 문서

- `_docs/superpowers/specs/2026-07-17-attendance-shell-redesign-design.md`
- `_docs/api/user-scenarios-api-map.md` (§5.1 회원 마스터)
- `docs/MEETING_INFO.md`
- `_docs/superpowers/specs/2026-07-12-chunbaek-season3-admin-api.md` (선례)
- `admin.html`, `chunbaek/admin.html`
