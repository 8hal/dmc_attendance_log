# race_events / canonicalEventId — 신규 기능 개발 계획

> **상태:** 수립본 (2026-03-28). 팀장 리뷰 반영 수정.  
> **관련 문서:** [schema-roadmap.md](./schema-roadmap.md) · [canonical-events-design.md](./canonical-events-design.md) · [data-dictionary.md](./data-dictionary.md)

---

## 1. 목표

1. **동일 실제 대회**가 `source`/`sourceId`만 달라 `confirmed-races`·`races.html`에서 **카드가 둘 이상**으로 나오는 문제를 해소한다.
2. 목록·집계의 그룹 키를 **`canonicalEventId`**(= `race_events` 문서 id)로 통일한다. **동일 의미의 중복 id 필드**(예: `displayGroupId`와 `canonicalEventId` 동시 도입)는 두지 않는다. 표시용 이름은 `primaryName` 등 **의미가 다른 필드**로 둔다.
3. 기존 **「대회 직접 추가」(`create-job`)**·**수동/엑셀 확정** 경로까지 포함해, 새 데이터가 **같은 모델**을 타도록 한다.
4. (후속) **§4.5:** 운영 알림. **1차 범위(2026-03-28 결정):** **중복·겹쳐 보이는 `scrape_jobs`** 패턴이 탐지될 때만 `event_logs` 등으로 알린다. 광범위한 “미매핑 job 전부 알림”은 후속.

---

## 2. 원칙 (SSOT·용어)

| 층 | SSOT |
|----|------|
| 기록 행 | `race_results` |
| 통합 대회(논리 이벤트) | `race_events` |
| 수집 작업 | `scrape_jobs` (`canonicalJobId` = `{source}_{sourceId}`) |

- 위 표는 **질문(도메인)별 SSOT**를 뜻한다. “전 테이블에 동일 필드가 꽉 찬 단일 SSOT”와는 다르다. 외부 문헌과의 대응은 **§2.5 (참고)**.
- **`canonicalEventId`**: 전역 유일. `race_events` 문서 id와 동일하게 쓴다.
- **미매핑** 허용: `race_results`에 `canonicalEventId` 필드가 없어도, **`race_events.sourceMappings` 역조회**로 같은 논리 대회에 묶을 수 있다(시드·운영이 **행 백필 없이 매핑만** 넣는 경로). 역조회에도 없으면 기존 **`source_sourceId`** 로 그룹 (fallback).
- **데이터 쓰기**(백필·일괄 수정)는 **`data-write-safety`**: 영향 설명 → dry-run → **사용자 명시 동의** 후 실행.
- **배포:** AI는 `firebase deploy` 실행 안 함 — 사용자 직접, `pre-deploy-test.sh`·백업·커밋 루틴 준수.

### 2.1 `jobId`와 `canonicalEventId` 역할 분리 (필수)

| 필드 | 의미 | 변경 여부 |
|------|------|-----------|
| **`race_results.jobId`** | `scrape_jobs` 문서 id (= 기존 **`canonicalJobId`**, `{source}_{sourceId}` 또는 수동 시 `manual_${sourceId}`) | **유지**. 확정·삭제·카운트 로직이 이 값에 의존한다. |
| **`race_results.canonicalEventId`** | 논리 대회(`race_events` 문서 id). **목록 카드 병합·표시 정본**용 | 신규(옵션). |

- **`delete-record`**(`functions/index.js`): `jobId`로 `scrape_jobs.confirmedCount` 감소 → `jobId` 제거·재해석 금지.
- **`confirmed-races`**: 응답 카드 **`id`**만 `canonicalEventId` 또는 fallback으로 통일; 행 단위 **`jobId`는 그대로** 둔다(다운스트림 필요 시 results에 노출 가능, 기존과 동일).
- **`canonicalEventId` 없는 행**도 `jobId`는 기존 규칙대로 있어야 한다.

### 2.2 기존 스크립트와의 관계

- **`scripts/merge-duplicate-jobs.js`**: **스크랩 job 문서** 수준에서 중복 `scrape_jobs`를 정리하고 `race_results.jobId`를 한 job id로 모은다. **`race_events`와 레이어가 다름** — 이번 기능으로 대체하지 않는다. 운영 시 “job 병합 스크립트”와 “통합 대회(race_events)”를 혼동하지 않도록 문서·런북에 구분해 둔다.

### 2.3 `canonicalEventId` 발급 규칙 (문자·DOM) — **확정 (2026-03-28)**

- **형식:** `evt_{YYYY-MM-DD}_{ascii-slug}`  
  - `ascii-slug`: `primaryName`(또는 생성 시점의 대회명)에서 **`slugify`** — **허용 문자는 `[a-z0-9_-]` 만**. 공백·특수문자는 `_` 등으로 치환, 연속 구분자는 하나로 축약. 한글 등 비ASCII는 구현에서 **제거**하거나(1차) 추후 로마자 표기 테이블로 보강; slug가 비면 **`unnamed`** 등 고정 placeholder 사용.
- **전체 문자열 길이 상한:** **80자** (Firestore id·URL·디버깅 여유).
- **충돌:** 동일 `(eventDate, baseSlug)` 로 이미 `race_events` 문서가 있으면 slug 끝에 **`-2`, `-3`, …** 순번을 붙여 유일하게 한다.
- **구현:** `data-dictionary`에 본 절 요약 동일 기재 + `functions` 내 상수·`slugify`에 주석.
- **DOM:** 위 규칙이면 `races.html` / `my.html`의 `id="race-${…}"` 에 안전하다.

### 2.4 `sourceMappings` 유일성 (필수)

- `(source, sourceId)` 쌍은 **전역적으로 최대 하나의 `race_events` 문서**에만 속한다. 역색인 `(source, sourceId) → canonicalEventId`가 모호해지면 안 된다.
- **`create-job`(옵션 B)·시드 스크립트·향후 관리 API**에서 이미 다른 이벤트에 등록된 쌍을 또 넣으려 하면 **거절**한다(HTTP 409 또는 `{ ok: false, error }`).  
  - **이동**이 필요하면: 별도 “매핑 제거 → 추가” 운영 절차 또는 전용 스크립트(명시적 승인)로만 수행한다. 자동 덮어쓰기는 하지 않는다.

### 2.5 업계 대응 용어 (참고)

**질문별 SSOT·부분 커버 마스터·명시적 fallback**은 아래와 같이 다른 분야 용어와 대응할 수 있다. (구현 의무 아님, **팀·타팀 커뮤니케이션**용.)

| 이 문서의 개념 | 업계에서의 대응 |
|----------------|-----------------|
| 기록 / 통합 대회 / 수집 작업을 나눈 SSOT | DDD **바운디드 컨텍스트**별 모델이 각각의 진실; “전역 단일 테이블이 곧 유일한 SSOT”와는 다른 **일반적인** 설명 축 |
| `race_events` + `sourceMappings` + 소스 우선 규칙 | MDM **골든 레코드**·엔티티 해석: 다 소스를 한 비즈니스 엔티티로 병합, 속성별 신뢰 순위(**survivorship**) |
| `canonicalEventId` 없을 때 **`source_sourceId` fallback**으로 항상 그룹 결정 | Kimball **차원 모델**에서 팩트의 FK를 NULL로 두지 않고 **미매핑·기본 차원 행**으로 처리하는 관례와 **정신적으로 유사**(애매한 공백 대신 **결정적** 규칙) |

**외부 참고 링크**

- [Bounded contexts / integration — Software Architecture Guild](https://software-architecture-guild.com/guide/architecture/domains/integration-of-bounded-contexts/)
- [Context mapping — DevIQ](http://deviq.com/domain-driven-design/context-mapping/)
- [What is a golden record — Profisee](https://profisee.com/blog/what-is-a-golden-record)
- [Survivorship in MDM — Greenwolf Tech Labs](https://greenwolftechlabs.com/survivorship-in-mdm-creating-the-golden-record/)
- [Kimball — Dealing with nulls in the dimensional model](https://www.kimballgroup.com/2003/02/design-tip-43-dealing-with-nulls-in-the-dimensional-model/)
- [Kimball — Selecting default values for nulls](https://www.kimballgroup.com/2010/10/design-tip-128-selecting-default-values-for-nulls/)

> 웹 검색·요약 기준 2026-03-28. 링크 변경·이동 가능.

---

## 3. 스키마

### 3.1 `race_events` (신규 컬렉션)

| 필드 | 설명 |
|------|------|
| 문서 id | `canonicalEventId` (**§2.3**, 예: `evt_2026-03-15_seoul-donga`, 충돌 시 `…-2`) |
| `primaryName` | 카드·표시용 정본 대회명 |
| `eventDate` | `YYYY-MM-DD` |
| `sourceMappings` | `{ source, sourceId }[]` — 이 이벤트에 속하는 외부/수동 키 전부 (**§2.4 유일성**) |
| (선택) `aliases`, `location`, `notes`, `updatedAt` | |

### 3.2 `race_results` (확장)

- **`jobId`**: 기존과 동일(§2.1). 이번 작업에서 **제거하거나 `canonicalEventId`로 대체하지 않는다.**
- **`canonicalEventId`** (옵션, string): 있으면 `confirmed-races` 그룹핑 1순위.

### 3.3 `scrape_jobs` (확장, 선택)

- **`canonicalEventId`** (옵션): 조회 편의·운영 가시성.  
- **1차 스프린트:** 필드를 **쓰지 않는다**(`create-job`에서도 생략). 2차에서 `events` API·운영 가시성 필요 시 도입 검토.

### 3.4 `firestore.rules`

- `match /race_events/{docId}` — **read: true, write: false** (기존 패턴과 동일).

---

## 4. API / 백엔드 (`functions/index.js`)

### 4.1 `confirmed-races` (GET)

1. (캐시 가능) `race_events` 로드 → `(source, sourceId) → canonicalEventId` 역색인 (**§2.4**로 단일 후보만 존재).
2. 각 `race_results` 행:
   - **`canonicalEventId` 있음** → 그 id로 그룹.
   - **없음** → 역색인 매칭.
   - **없음** → `source_sourceId` (기존).
3. 응답 카드의 **`id`** = 위에서 정한 그룹 id (`canonicalEventId` 또는 fallback).
4. **카드 `name` / `date` (동일 그룹 내 행마다 `eventName`이 다를 수 있음):**
   - 그룹이 어떤 `race_events`에 매핑되면: **`primaryName`**, **`eventDate`** 만 사용한다(행의 `eventName`은 무시).
   - 매핑 없음(fallback `source_sourceId`만): **`groupMap`에 그룹을 처음 만들 때 넣은 행**의 `eventName` / `eventDate`를 유지한다(현 구현과 동일한 “대표 행” 패턴). 장기적으로는 행 백필·매핑으로 수렴시킨다.
5. 성능: 초기 전체 스캔 허용; 증가 시 캐시·인덱스 TODO 명시.

### 4.2 `create-job` (POST) — report「직접 추가」

**현재:** `manual_${Date.now()}` → `scrape_jobs` id `manual_${sourceId}`.

**변경 방향:**

1. **옵션 A (신규 대회):**  
   - `canonicalEventId` 발급 → **`race_events` 생성** (`primaryName`, `eventDate`, `sourceMappings`에 `{ manual, sourceId }`, **§2.4** 검증).  
   - **1차:** `scrape_jobs`에는 `canonicalEventId`를 넣지 않는다(§3.3).  
   - 응답에 `canonicalEventId` 반환 → 프론트가 이후 confirm에 넘김.
2. **옵션 B (기존 통합 대회에 붙이기):**  
   - 요청에 **`canonicalEventId`만** 넘기면 `race_events`의 `sourceMappings`에 `{ manual, 새 sourceId }` 추가 + `scrape_jobs` 생성 (**§2.4** 충돌 시 거절).  
   - UI에 **기존 대회 검색/선택**이 필요 (후속 태스크로 분리 가능).

**1차 스프린트:** 옵션 A만으로도 **신규 수동 대회는 처음부터 통합 id**를 갖게 할 수 있음. 옵션 B는 2차.

### 4.3 `confirm` (POST)

- 본문에 **`canonicalEventId` (옵션)** 허용 → `race_results`에 저장.
- `create-job` 응답에서 받은 id를 report 플로우가 그대로 전달하도록 `report.html` 수정.

### 4.4 엑셀·임포트 (`confirm_from_excel.js` 등)

- **“매칭”의 뜻:** 엑셀(또는 `race_records_from_excel.json`)의 **한 행**과, Firestore **`search_cache`** (`found: true`)에 들어 있는 **스크랩 후보 기록**을 짝짓는 것. 스크립트는 회원 실명(`memberRealName`)으로 캐시 항목을 모은 뒤, **대회 날짜가 같고** 완주 시간이 **±1초 이내**이면 같은 기록으로 본다 → 그때 그 캐시 항목에 붙은 `source`, `sourceId`, `eventName` 등이 “매칭된 타이밍 소스 정보”다. 짝을 못 찾으면 **매칭 실패**로 그 엑셀 행은 저장하지 않는다.
- **목표:** `manual` + 빈 `sourceId`로 인한 **`manual_unknown`** 그룹을 더 이상 늘리지 않기.  
- **현 코드 이슈 (반드시 정리):** 매칭 성공 분기에서 `source && sourceId`가 아니면 **`jobId: "manual"`** 단일값으로 여러 대회가 몰릴 수 있다.
- **1차 기본 정책 (팀 결정 2026-03-28):**
  1. **매칭 성공**이고 `source`·`sourceId`가 모두 비어 있지 않으면: **`jobId` = `${source}_${sourceId}`** (API `confirm`과 동일 규칙).  
  2. **매칭 성공**이지만 `source` 또는 `sourceId`가 비어 있으면: **해당 엑셀 행만 스킵**한다(저장 안 함). **배치 전체는 실패시키지 않는다.** dry-run·로그에 스킵 건수를 남긴다. 절대 `jobId: "manual"` 단일 버킷에 넣지 않는다.  
  3. **선택:** 임포트 입력(또는 매핑 파일)에 **`canonicalEventId`**가 있으면 `race_results`에 함께 저장.  
  4. 대량 백필·예외 처리는 **매핑 테이블 + 승인 + dry-run** (기존 원칙 유지).

### 4.5 운영 알림 (매핑 후보·job 품질)

**1차 범위 (2026-03-28 결정):** **중복·겹쳐 보이는 `scrape_jobs`** 가 탐지될 때만 알린다. 예: 동일 `(source, sourceId)`에 **문서 id가 여러 개**인 후보, 또는 `events` API의 기존 dedup 규칙과 어긋나 **운영자가 병합을 검토해야 하는 패턴**. **`event_logs`** 에 `type` 예: `duplicate_job_suspect`(가칭) + 관련 `jobId` 목록·근거.

**후속(광범위 알림·선택 자동):** 스크랩 후 **`race_events`에 없는 `(source, sourceId)`** 전부에 대해 후보 판별·`no_candidate` / `ambiguous` 알림 등을 넣을 수 있다. 다만 **잘못된 자동 `sourceMappings` 쓰기**는 §2.4·데이터 품질 리스크가 크므로, 아래 단계는 **알림·제안 중심**으로 두고 쓰기는 승인 후.

| 단계 | 동작 | `race_events` 쓰기 |
|------|------|-------------------|
| **A. 이미 매핑됨** | `(source, sourceId)` 가 `sourceMappings`에 존재 | 없음 (읽기만) |
| **B. 자동 확정(선택)** | 규칙이 **매우 보수적**일 때만 — 팀이 정한 **화이트리스트 규칙** | 가능(플래그·버전 관리) |
| **C. 후보 1건(중신뢰)** | 날짜+정규화 대회명 등으로 **단일** `race_events` 후보 | **자동 쓰기 금지** → **운영 승인 후** |
| **D. 후보 여러 건 / 없음** | 휴리스틱으로 0개 또는 2개 이상 | **쓰기 없음** → (후속에서) **운영 알림** |

**운영 알림 채널:** 기존과 같이 **`event_logs`** (`scrape_alert` 패턴 참고). (이메일·슬랙은 별도 연동.)

**트리거:** 스케줄·`scrape` 완료 후 등 — **멱등 키**로 중복 로그 방지.

**1차 스프린트와의 관계:** `race_events`·`confirmed-races`·수동 플로우 안정화 **다음** 또는 **같은 대 PR에서 여유 있을 때만** §4.5 1차(중복 job 의심) 구현.

---

## 5. 프론트엔드

| 파일 | 내용 |
|------|------|
| `report.html` | `create-job` 후 **`canonicalEventId` 보관**(state/`currentJob`); confirm body에 **`canonicalEventId` 포함**. 추후 **기존 대회 선택** UI(옵션 B). |
| `races.html` | `id="race-${esc(race.id)}"` — **`race.id`가 §2.3 규칙을 따르면** 별도 이스케이프 이슈 없음. 병합 후 카드 수·정렬·토글 동작 회귀 테스트. |
| `my.html` | 동일 API(`confirmed-races`) 사용 — `races.html`과 동일하게 **`race.id` 형식** 검증. |

---

## 6. 시드·마이그레이션 (프로덕션 쓰기)

- **동아 2026-03-15 예시:**  
  - `race_events` 1건 + `sourceMappings`에 `{ smartchip, 202650000006 }` (**§2.4** 준수).  
  - 효과: `race_results` 행에 `canonicalEventId`를 안 백필해도 **역조회로 카드 병합** 가능. 필요 시 운영 편의로 행에 `canonicalEventId`를 추가할 수 있음.  
  - 엑셀 `manual_unknown` 1건은 **사용자 승인 하에** `canonicalEventId` 백필·`source`/`sourceId` 정리·매핑 추가 중 택1.  
- **나머지 `manual_unknown`·다중 키 날짜:** 동일 패턴으로 **배치**, 항상 **dry-run + 동의**.

---

## 7. 검증

### 7.1 수용 기준 (AC) 체크리스트

배포·스테이징 검증 시 아래를 순서 없이 확인한다.

- [ ] 시드/백필 **전후** `race_results` **문서 수(행 수)** 가 의도대로 변하지 않았다(삭제·중복 생성 없음).
- [ ] 병합된 카드의 **`id`**는 항상 **§2.3** 패턴(`canonicalEventId` 또는 기존 `source_sourceId` fallback)이며, HTML `id`로 써도 깨지지 않는다.
- [ ] 응답에 **`races[].source` / `sourceId`**(또는 동등 메타)가 남아 있으면, **기존에 이 필드만 쓰는 클라이언트**가 깨지지 않는다(있으면 유지·문서화).
- [ ] `delete-record` 후 해당 회원 기준 **`scrape_jobs.confirmedCount`** 가 일관된다(§2.1 `jobId` 유지 전제).
- [ ] **§2.4:** 동일 `(source, sourceId)`를 두 이벤트에 넣는 쓰기가 **거절**된다(자동 테스트 또는 수동 재현).

### 7.2 자동·수동

- `bash scripts/pre-deploy-test.sh`  
  - 현재: `ok`, `results[].docId` 존재 여부 수준.  
  - **§8 항목 3 완료 직후:** 스테이징 또는 로컬에서 **스모크**(병합 1케이스·토글·통계) **필수**.  
  - **항목 10(선택):** 같은 스프린트 또는 **바로 다음 PR**에 `races[].id` 형식·병합 시나리오를 스크립트에 추가.
- 수동: 동아 등 시드 적용 후 **기대 카드 수**, **확정 행 수 불변**, `delete-record`·카운트(§7.1).
- **스모크 데이터 (2026-03-28):** `scripts/seed-race-events-fixture.js` — **에뮬레이터 전용**(`FIRESTORE_EMULATOR_HOST` 필수), `race_events` 1건 + `race_results` 2행(역조회 병합 확인). `--dry-run` 지원.

---

## 8. 작업 분해 (권장 순서)

### 팀 결정 로그 (2026-03-28)

| 항목 | 결정 |
|------|------|
| `canonicalEventId` | §2.3 확정 (`evt_{날짜}_{slug}`, 80자, `[a-z0-9_-]`, 충돌 시 `-2`…) |
| 첫 PR 범위 | **B:** `race_events` + rules + `confirmed-races` + `create-job` + `confirm` + `report.html` |
| 엑셀 매칭 성공인데 `source`/`sourceId` 비음 | **행 단위 스킵**, 배치 전체 실패 아님 (§4.4) |
| 스모크 시드 | **fixture 스크립트 권장** (§7.2) |
| §4.5 1차 | **중복·겹침 job 의심 시에만** 알림 |

**첫 PR(범위 B):** 아래 **1~6**을 동일 브랜치에서 묶는 것을 전제로 한다.

1. [ ] **§2.3** 구현 반영 → `data-dictionary` + 코드 상수·`slugify`.
2. [ ] `firestore.rules` + `race_events` / `race_results.canonicalEventId` 스키마 반영 (`data-dictionary` 갱신). **`jobId` 스키마 설명 유지.**
3. [ ] `confirmed-races` 그룹핑(§2.1·§4.1·§2.4) + **단위/로컬 검증**.
4. [ ] **필수 — 스모크(§7.2):** 병합 시나리오 1건·`races.html`/`my.html` 카드 토글·통계. 실패 시 다음 단계 진행 안 함.
5. [ ] `create-job` → `race_events` 생성(옵션 A, **§2.4** 검증) + 응답 `canonicalEventId` + `report.html` state·confirm 연동. **`scrape_jobs.canonicalEventId` 미기록(1차).**
6. [ ] `confirm` POST: **`canonicalEventId` 저장**, **`jobId` 기존 로직 유지.**
7. [ ] (승인 후) 백필: [`scripts/backfill-race-events-mapping.js`](../../scripts/backfill-race-events-mapping.js) + 설정 JSON(예: [`scripts/data/race-events-mapping.example.json`](../../scripts/data/race-events-mapping.example.json)). 주로 **`sourceMappings`**; `updateResultsCanonicalId`로 행 백필 선택; **`jobId` 불필요 변경 금지**.
8. [ ] (2차) `create-job` 옵션 B — 기존 `canonicalEventId`에 manual 소스 추가 + UI.
9. [ ] 엑셀: **§4.4 1차 정책** 적용(`jobId: "manual"` 제거, 빈 source/skip 정책) (**dry-run + 동의**).
10. [ ] (선택·바로 다음 PR 가능) `pre-deploy-test.sh`에 §7.1·병합 관련 단계 추가.
11. [ ] (권장·1차 소량 또는 2차) **§4.5:** **중복 job 의심** 탐지 시 `event_logs` 알림. 후속: 미매핑 전수·`no_candidate` / `ambiguous` 등(§4.5 표).

---

## 9. 의도적 비범위 (이번에 안 함)

- 외부 일정 SSOT(고러닝 등) **풀 자동 동기화**(§4.5의 **알림·제안**은 범위에 둘 수 있음).
- 권한자 전용 대회 편집 UI 전체 (콘솔/스크립트로 시작 가능).
- `race_results` 문서 id 재작성 (별 마이그레이션 과제).
- **`merge-duplicate-jobs.js`를 `race_events`로 흡수**하거나 대체하는 일 — 필요 시 별도 과제로 다룸.

---

## 10. 개정 이력

| 날짜 | 내용 |
|------|------|
| 2026-03-28 | 초안 — 대화 반영: 용어 통일, `create-job`·confirm·임포트·시드·검증 포함 |
| 2026-03-28 | 코드 리뷰 반영: §2.1 `jobId` 유지, §2.2 `merge-duplicate-jobs` 구분, §2.3 DOM 안전 id, §4.4 엑셀 `manual` 버킷, §5 `my.html`, §7·§8·§9 보강 |
| 2026-03-28 | 팀장 리뷰 반영: §1 목표 문구 명확화, §2 역조회·§2.4 매핑 유일성, §4.1 카드 name/date, §3.3·§4.2 1차 `scrape_jobs` 미확장, §4.4 엑셀 1차 기본 정책, §6 시드 설명, §7.1 AC·§7.2 스모크, §8 순서·항목 10 선택 |
| 2026-03-28 | 자동 매핑 후보 + 운영 알림: §1 목표 4, §4.5, §8 항목 11, §9 외부 SSOT 문구 정리 |
| 2026-03-28 | §2.5 업계 대응 용어(참고): DDD·MDM 골든 레코드·Kimball 차원 모델과의 대응 + 링크; §2 표 직후 §2.5 안내 문구 |
| 2026-03-28 | 팀 결정 반영: §2.3 확정, §4.4 매칭 정의·엑셀 스킵 정책, §4.5 1차=중복 job 알림만, §7.2 fixture 권장, §8 결정 로그·첫 PR 범위 B |
| 2026-03-28 | 구현 착수: `functions/lib/canonicalEventId.js`, `confirmed-races`/`create-job`/`confirm`/`report.html`, `firestore.rules` race_events, `data-dictionary`, `scripts/seed-race-events-fixture.js` |
