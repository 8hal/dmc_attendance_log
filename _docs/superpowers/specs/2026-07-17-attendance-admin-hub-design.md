# DMC 출석·운영 어드민 허브 — 설계서

> 작성일: 2026-07-17  
> 상태: **초안 — 검토 대기**  
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
| **회원** | `#members` | 기존 `admin.html` CRUD 이식 (검색·추가·수정·숨김) | 현행 API 그대로 |
| **정모 훈련** | `#training` | 날짜+meetingType별 장소·시간·코스·메모 입력 | **신규** (API는 별도 justification) |

상단: 로고 + 「동마클 출석 운영」 + (선택) `report` / `ops` 외부 링크(오너만 ops).

### 4.2 Phase Admin-2 (이후, 본 스펙 비범위 가능)

| 탭 | 용도 |
|----|------|
| **당일 출석** | 날짜별 출석 현황 조회·(선택) 수동 보정 — 키오스크/오늘 탭과 중복 주의 |
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
| `/attendance-admin.html` | 허브. 기본 탭 `#members` 또는 마지막 탭 |
| `/attendance-admin.html#training` | 정모 훈련 탭 |
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

### 7.1 회원 (`#members`)

- UI·동작: 현 `admin.html`과 **동등** (회귀 금지)
- API: `all-members`, `add-member`, `update-member`, `hide-member`
- 이식 방식: 마크업·스크립트를 허브 패널로 이동 (동작 복사 후 `admin.html`은 리다이렉트만)

### 7.2 정모 훈련 (`#training`)

**입력 단위:** `(meetingDateKey, meetingType)` where `meetingType ∈ {TUE, THU, SAT, ETC?}`  
1차: 정모만 `TUE|THU|SAT` (출석 셸 스펙과 동일).

| 필드 | 예 |
|------|-----|
| 장소 | 동탄호수공원 만남장소 |
| 집결/출발 시간 | 06:30 / 07:00 |
| 코스 | 호수 둘레 10K · 이지 |
| 메모 | 우천 시 실내 트랙 |

**UI 스케치:**

1. 주간/월 네비 + 정모 날짜 칩 (화·목·토)
2. 선택 슬롯 폼 + 저장
3. (선택) 다음 정모 미리 채워 두기

**회원 앱 소비:** 출석 셸 `#today`가 같은 키로 조회 → 읽기 전용 표시.

**API:** `meeting-training` get/save 류 — **구현 전 `new-api-validation` + justification + 사용자 승인 필수.**  
MVP 한시: Firestore 문서 `meeting_training/{dateKey}_{type}` Admin SDK만 쓰는 스크립트는 지양(운영 UI가 목적).

선례: `chunbaek` `admin-week-slots` / `admin-save-week-slots` — **스키마·컬렉션은 분리.**

---

## 8. 출석 셸과의 관계

| | 출석 셸 | 출석 운영 허브 |
|--|---------|----------------|
| 사용자 | 회원·키오스크 | 운영자·오너 |
| 훈련 | 표시 | 입력 |
| 일정 | Shell-1 목업→구현 | Admin-1과 병행 가능하되, **훈련 API 없으면 셸은 플레이스홀더/하드코드** |

권장 순서:

1. 허브 셸 + 회원 탭 이식 + `admin.html` 리다이렉트 (**Admin-1a**, API 없음)  
2. 훈련 탭 UI + API justification·승인·구현 (**Admin-1b**)  
3. 출석 셸 오늘 탭이 API 연동 (**Shell** 쪽 후속)

---

## 9. 비범위

- `ops.html` / `report.html` 통합
- 춘백 admin 통합
- 출석 취소·수정 (기존 Phase 2 백로그)
- 회원 앱 더보기에 운영 허브 링크 노출 (원하면 비밀번호 뒤에만 — 1차 생략 권장)

---

## 10. 리스크·완화

| 리스크 | 완화 |
|--------|------|
| `admin.html` 북마크 깨짐 | 즉시 리다이렉트 |
| 회원 CRUD 회귀 | Admin-1a에서 기존 TC·수동 시나리오 동일 통과 |
| 훈련 API 성급 추가 | Admin-1b 게이트: justification 문서 + 승인 |
| ops와 혼동 | UI 카피 «출석 운영» / ops는 «시스템·스크래핑» |

---

## 11. 확정 제안 (동의 시 잠금)

| # | 항목 | 제안 |
|---|------|------|
| 1 | 접근 | **A** — `attendance-admin.html` 신규 + `admin.html` → `#members` 리다이렉트 |
| 2 | Admin-1 탭 | **회원** + **정모 훈련** |
| 3 | 인증 | 기존 `verify-admin` (operator+owner) |
| 4 | ops/report | 허브 밖 유지 |
| 5 | 구현 순서 | 1a 회원 이식 → 1b 훈련 API·탭 → 셸 연동 |
| 6 | 훈련 API | 1b 전 별도 승인 (본 설계는 UI·IA만 확정 가능) |

---

## 12. 관련 문서

- `_docs/superpowers/specs/2026-07-17-attendance-shell-redesign-design.md`
- `_docs/api/user-scenarios-api-map.md` (§5.1 회원 마스터)
- `docs/MEETING_INFO.md`
- `_docs/superpowers/specs/2026-07-12-chunbaek-season3-admin-api.md` (선례)
- `admin.html`, `chunbaek/admin.html`
