# 유저 시나리오 ↔ API 매핑 (역할 규정)

**목적:** 제품 관점에서 **역할(role)** 을 세 가지로 **규정**하고, 역할마다 “무엇을 할 때 어떤 API가 쓰이는지” 정리한다.  
상세 request/response는 [http-api-actions.md](./http-api-actions.md) · [openapi.yaml](./openapi.yaml).

**페이지·화면에 관한 규칙**

- 이 문서에 이름이 나오는 `*.html` 은 **저장소 루트에 실제로 있는 파일만** 쓴다. **없는 페이지를 가정하거나 만들어 내지 않는다.**
- 아래 표에 나오는 파일(7개)이 **이 매핑 문서가 다루는 전부**다. `pamphlet*.html`, `cardnews.html` 등 다른 정적 페이지가 있어도, 여기에는 **`?action=` / `race`·`attendance` 호출을 코드로 확인한 경우만** 포함한다(현재는 7개뿐).

| 검증된 파일 (루트) | 비고 |
|-------------------|------|
| `index.html`, `history.html` | `/attendance` |
| `my.html`, `races.html`, `report.html`, `ops.html`, `admin.html` | `/race` (`ops`·`admin` 은 시스템 관리자 영역) |

---

## 1. 역할 규정 (3단계)

동아리 서비스에서 말하는 **사용자 role**은 아래 세 가지로 둔다. (이전 문서의 A~E는 **§7 매핑**에 대응시켜 두었다.)

| Role ID | 이름 | 정의 (책임) | 대표 화면 |
|---------|------|-------------|-----------|
| `member` | **회원** | 출석 설문·**본인** 마라톤 기록 조회·검색·확정·삭제까지. **회원 마스터나 스크랩 파이프라인은 건드리지 않는다.** | `index.html`, `history.html`, `my.html`, `races.html` |
| `staff` | **운영진** | 대회 발견·스크랩 job·수동 대회 생성·**운영 관점 확정**까지(`report.html`). **로그·정합성·통계·스크랩 큐 콘솔은 시스템 관리자 영역.** | `report.html` |
| `sysadmin` | **시스템 관리자** | (1) `members` **마스터**(전체 조회·추가·수정·숨김)·(2) **Ops 콘솔** — 이벤트 로그·정합성·퍼널 통계·주간 스크랩 큐 미리보기(`ops.html`). **`ops.html` 은 원래 시스템 관리자용으로 기획된 화면이다.** | `admin.html`, `ops.html` |

**구분 원칙 (한 줄)**

- **회원** = 소비자·본인 데이터.
- **운영진** = **대회/스크랩/확정** 같은 **현장 운영** (`report`).
- **시스템 관리자** = **회원 마스터** + **망 관측·정합성·스케줄 점검** (`admin` + `ops`).

같은 사람이 실제로는 회원이면서 운영진일 수 있다. 문서상으로는 **당시 수행하는 행위**에 따라 위 셋 중 하나로만 보면 된다.

---

## 2. 기술적 구현과의 차이 (규정 vs 코드)

규정은 **책임** 기준이고, **서버에 role 클레임(JWT 등)이 붙어 있지는 않다**(2026-03 기준).

| 항목 | 현재 처리 방식 |
|------|----------------|
| **회원 UI** | 공개 URL. `verify-admin` 없음. |
| **운영진·report** | `POST /race?action=verify-admin` (예: env `DMC_ADMIN_PW`). |
| **시스템 관리자·admin** | 동일한 `verify-admin` API. **이후 호출만** `all-members` / `add-member` 등으로 갈린다. |
| **시스템 관리자·ops** | 화면 단에는 **로그인 UI 없이** 민감 **GET**(로그·통계·정합성)만 호출. **의도는 sysadmin 전용 콘솔**이며, 실제로는 **URL 비공개·접근 통제**에 의존(코드만으로는 report·admin과 동일 수준의 `verify-admin`은 없음). |

즉 **역할 분리는 운영 정책 + 비밀번호/URL 공유 범위**로 맞추고, 나중에 비번을 나누거나 토큰에 role을 넣으면 이 규정 표를 그대로 이식하면 된다.

---

## 3. 회원 (`member`) — 시나리오 ↔ API

| 시나리오 | API | 화면 |
|---------|-----|------|
| 닉네임 자동완성 | `GET /attendance?action=nicknames` | `index.html` |
| 일별 출석 현황 | `GET /attendance?action=status` + `date` | `index.html` |
| 출석 제출 | `POST /attendance` | `index.html` |
| 월간 출석 이력 | `GET /attendance?action=history` + `nickname`, `month` | `history.html` |
| 회원 목록에서 본인 선택 | `GET /race?action=members` | `my.html`, `races.html` |
| 확정 기록 카드 | `GET /race?action=confirmed-races` | `my.html`, `races.html` |
| 미확정 제안 | `GET /race?action=suggestions` + `member` | 동일 |
| 연도별 대회 목록 | `GET /race?action=discover-all` + `year` | 동일 |
| 역검색 시작 | `POST /race?action=search-member-events` | 동일 |
| 검색 job 폴링 | `GET /race?action=member-search-job` + `jobId` | 동일 |
| 확정 저장 | `POST /race?action=confirm` | 동일 |
| 본인 기록 삭제 | `POST /race?action=delete-record` | `my.html` |
| 클라이언트 이벤트 로깅 | `POST /race?action=log` | `my.html`, `races.html` |

---

## 4. 운영진 (`staff`) — 시나리오 ↔ API

| 시나리오 | API | 화면 |
|---------|-----|------|
| report 진입 비번 검증 | `POST /race?action=verify-admin` | `report.html` |
| 최근 발견 대회 | `GET /race?action=discover` | `report.html` |
| job 목록 | `GET /race?action=events` | `report.html` |
| 전원 스크랩 | `POST /race?action=scrape` | `report.html` |
| 수동 대회 job 생성 | `POST /race?action=create-job` | `report.html` |
| job 상세 | `GET /race?action=job` + `jobId` | `report.html` |
| 스크랩 결과 확정 | `POST /race?action=confirm` | `report.html` |
| 스크랩 대상·선택용 회원 목록 | `GET /race?action=members` | `report.html` |

---

## 5. 시스템 관리자 (`sysadmin`) — 시나리오 ↔ API

### 5.1 회원 마스터 (`admin.html`)

| 시나리오 | API |
|---------|-----|
| admin 진입 비번 검증 | `POST /race?action=verify-admin` |
| 숨김 포함 전체 회원 | `GET /race?action=all-members` |
| 회원 추가 | `POST /race?action=add-member` |
| 회원 수정 | `POST /race?action=update-member` |
| 회원 숨김 | `POST /race?action=hide-member` |

회원 UI의 `GET /race?action=members` 는 **숨김 제외**다. **`all-members` 는 시스템 관리자 전용**이라고 보면 된다.

### 5.2 Ops 콘솔 (`ops.html`)

| 시나리오 | API |
|---------|-----|
| 이벤트 로그 | `GET /race?action=event-logs` |
| 기록 정합성 이슈 | `GET /race?action=data-integrity` |
| 멤버·퍼널 통계 | `GET /race?action=member-stats` |
| 주간 스크랩 큐 미리보기 | `GET /race?action=ops-scrape-preview` |

---

## 6. 부록: 화면 ↔ 규정 역할 ↔ `race` action

| 화면 | 규정 역할 | `race` actions (발주 순서 무관) |
|------|-----------|--------------------------------|
| `index.html` | 회원 | — |
| `history.html` | 회원 | — |
| `my.html` | 회원 | `log`, `members`, `confirmed-races`, `suggestions`, `discover-all`, `search-member-events`, `member-search-job`, `confirm`, `delete-record` |
| `races.html` | 회원 | 위와 동일 계열 (`log` 포함) |
| `report.html` | 운영진 | `verify-admin`, `discover`, `events`, `scrape`, `create-job`, `members`, `job`, `confirm` |
| `ops.html` | 시스템 관리자 | `event-logs`, `data-integrity`, `member-stats`, `ops-scrape-preview` |
| `admin.html` | 시스템 관리자 | `verify-admin`, `all-members`, `add-member`, `update-member`, `hide-member` |

`attendance` 는 **`index.html`**, **`history.html`** 만 사용 → **회원** 전용.

---

## 7. 부록: 이전 절 번호와의 대응

| 이전(문서 초안) | 규정 역할 |
|----------------|-----------|
| A 출석-only · B 기록 서비스 | → **회원** (`member`) |
| C 스크랩 report | → **운영진** (`staff`) |
| D Ops · E admin | → **시스템 관리자** (`sysadmin`) |

---

## 8. 부록: 화면에 거의 없는 API

| API | 비고 |
|-----|------|
| `GET /race?action=ping-smartchip` | 수동 점검 |
| `GET /scrapeProxy` | 개발/우회 |
| 배포 전 스크립트 | `log`, `delete-record`, `verify-admin` 등 스모크 |

---

## 문서 유지

- 인력·권한 정책이 바뀌면 **§1 규정 표**를 먼저 고친다.
- 새 HTML이 생기면 **§6**에 행을 추가한다.
- API 시그니처는 **http-api-actions.md** 에 맞춘다.
