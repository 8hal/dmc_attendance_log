# HTTP API 행동 명세

세 가지 공개 HTTP 함수(`race`, `attendance`, `scrapeProxy`)를 **같은 표 형식**으로 다룬다.  
`/race` 절만 길게 보이는 이유는 **집중이 아니라**, 쿼리 `action` 분기가 24개나 되기 때문이다.  
`attendance`·`scrapeProxy`는 **구현상 연산 수가 적어 행 수만 적을 뿐**, “요약본”으로 의도적으로 줄인 것이 아니다.

| 참고 | 역할 |
|------|------|
| [user-scenarios-api-map.md](./user-scenarios-api-map.md) | 유저 시나리오·화면별로 **어떤 API가 쓰이는지** 매핑. |
| [openapi.yaml](./openapi.yaml) | URL·공통 스키마·`RaceAction` enum. `bash scripts/verify-api-spec-race-actions.sh`는 **`/race`의 `action` 문자열만** 코드와 동기화 검증. |
| `functions/index.js` | **구현 SSOT**. 문서와 다르면 코드 기준. |

**표 헤더 (전 구간 공통)**

| 열 | 의미 |
|----|------|
| 구분 | 호출을 가리키는 이름 (`action` 값, 또는 고정 연산명) |
| 메서드 | HTTP 메서드 |
| 쿼리 | URL 쿼리스트링. 없으면 `—` |
| 본문 | JSON·폼 등. 없으면 `—` |
| 하는 일 | 한두 문장으로 처리 내용 |
| 돌려주는 것 | 성공 시 응답 JSON 요약 (실패는 보통 `ok:false`, `error`) |

---

## `/race`

공통: 경로 `/race`. **`action` 생략** 시 `GET` → `events`, `POST` → `scrape`. 아래 표는 필요한 경우 `action=` 을 쿼리 열에 적는다.

| 구분 | 메서드 | 쿼리 | 본문 | 하는 일 | 돌려주는 것 |
|------|--------|------|------|---------|-------------|
| `confirmed-races` | GET | `action=confirmed-races`, `year`(선택·연도 필터) | — | 확정된 `race_results`를 대회 단위로 묶음 | `ok`, `races[]` |
| `events` | GET 권장 | `action=events` 또는 생략(GET) | — | `scrape_jobs` 조회·메타 보정·중복 제거·정렬 | `ok`, `jobs[]` |
| `discover` | GET | `action=discover` | — | 올해 대회 발견·2주 창 필터·기존 job·날짜 보강 | `ok`, `events[]` |
| `job` | GET | **`action=job`**, **`jobId` 필수** | — | `scrape_jobs` 단건. 확정 job이면 해당 대회 `race_results`로 `results` 채움 | `ok`, job 필드·`jobId`, 있으면 `canonicalEventId` |
| `members` | GET | `action=members` | — | 숨김 아닌 회원만 | `ok`, `members[]` |
| `add-member` | POST | `action=add-member` | **`nickname`**, **`realName`** 필수; `gender` 선택 | `members` 추가. 닉 중복이면 409 | `ok`, `id`, `nickname`, `realName` |
| `update-member` | POST | `action=update-member` | **`id`** 필수; `nickname`/`realName`/`gender`/`hidden` 선택 | 회원 수정. `gender` 변경 시 같은 실명 `race_results` 동기화 | `ok`, `id`, 반영 필드 |
| `hide-member` | POST | `action=hide-member` | **`id`** 필수 | `hidden: true` | `ok`, `id` |
| `all-members` | GET | `action=all-members` | — | 숨김 포함 전원 | `ok`, `members[]` |
| `discover-all` | GET | `action=discover-all`, `year`(선택·기본 올해) | — | 해당 연도 전체 발견·시스템 job 매핑 | `ok`, `events[]`, `total` |
| `suggestions` | GET | **`action=suggestions`**, **`member` 필수**(실명) | — | 검색 캐시·확정·PB 기반 제안·dimout | `ok`, `suggestions[]`, `memberGender`, `hasPB` |
| `search-member-events` | POST | `action=search-member-events` | **`realName`**, **`events[]`** 필수; `nickname`/`gender`/`filterGender`/`filterDistance` 선택 | job 문서 생성 후 **즉시** 응답, 이어서 소스별 검색·`search_cache` 갱신 | 우선 `ok`, `jobId` (이후 `member_search_jobs` 갱신) |
| `member-search-job` | GET | **`action=member-search-job`**, **`jobId` 필수** | — | `member_search_jobs` 단건 | `ok`, job 내용·`jobId` |
| `confirm` | POST | `action=confirm` | **`jobId`**, **`results[]`** 필수; `eventName`/`eventDate`/`source`/`sourceId`/`confirmSource`/`canonicalEventId` 선택 | `race_results` 일괄 저장·`scrape_jobs` 갱신 | `ok`, `savedCount` |
| `create-job` | POST | `action=create-job` | **`eventName`** 필수; `eventDate`/`location` 선택 | 수동 `race_events` + `scrape_jobs` 생성 | `ok`, `jobId`, `eventName`, `eventDate`, `canonicalEventId` |
| `delete-record` | POST | `action=delete-record` | **`docId`**, **`requesterName`** 필수 | 본인 기록만 삭제·job 카운트 감소 | `ok`, `deletedDocId` |
| `scrape` | POST | `action=scrape` 또는 생략(POST) | **`source`**, **`sourceId`** 필수; `eventName`/`eventDate`/`replaceJobId`/`resume`/`memberRealNames` 선택 | 대회 스크랩·job 갱신까지 **동기** 완료 | `ok`, `jobId`, `eventName`, `eventDate`, `foundCount`, `mergedResultCount`, `partialRescrape`, `failCount`, `failRate`, `status` |
| `ping-smartchip` | GET | `action=ping-smartchip` | — | SmartChip URL 연결·응답 샘플 점검 | `ok`, `testedAt`, `results[]` |
| `verify-admin` | POST | `action=verify-admin` | **`pw`** | 관리 비밀번호와 일치 여부 | 성공 `ok`; 아니면 401 |
| `event-logs` | GET | `action=event-logs`, `limit`(기본 100·최대 500) | — | `event_logs` 최신순 | `ok`, `logs[]` |
| `member-stats` | GET | `action=member-stats` | — | 확정 기록·로그·검색 캐시 기반 운영 집계 | `ok`, 멤버·퍼널·검색 커버리지 등 |
| `ops-scrape-preview` | GET | `action=ops-scrape-preview` | — | 주간 발견과 같은 창의 큐 미리보기(느릴 수 있음) | `ok`, `todayKst`, `nextBatch`, `racesHeldTodayKst` 등 |
| `data-integrity` | GET | `action=data-integrity` | — | 확정 job의 `confirmedCount`와 실제 `race_results` 건수 대조 | `ok`, `issues[]`, `totalJobs`, `totalResults` |
| `log` | POST | `action=log` | **`event`** 필수; `data` 선택 | 클라이언트 이벤트를 `event_logs`에 저장 | `ok` |

`events`: 코드상 **GET/POST 둘 다** 같은 분기로 들어갈 수 있음. 클라이언트는 **GET**만 쓰는 것을 권장.

---

## `/attendance`

이 함수의 **HTTP 연산은 아래 네 줄이 전부**다(추가 분기 없음).  
경로 `/attendance`. CORS·OPTIONS 지원. **GET**은 `action`으로 분기(생략 시 `status`). **POST**는 본문만(별도 `action` 없음).

| 구분 | 메서드 | 쿼리 | 본문 | 하는 일 | 돌려주는 것 |
|------|--------|------|------|---------|-------------|
| `nicknames` | GET | `action=nicknames`, `limit`(1~1000·기본 500) | — | 최근 출석에서 닉네임 추출·`TEST`로 시작하는 닉 제외·가나다순 | `ok`, `nicknames[]`, `count` |
| `status` | GET | `action=status` 또는 생략, `date`(YYYY/MM/DD·생략 시 KST 당일) | — | 해당일 출석 문서 전부 조회 | `ok`, `date`, `count`, `items[]`(닉네임·팀·모임유형·시간 등) |
| `history` | GET | **`action=history`**, **`nickname` 필수**, `month`(YYYY-MM·생략 시 KST 이번 달) | — | 닉네임+월별 출석·유형별 요약·가능 모임 수 대비 출석률 | `ok`, `nickname`, `month`, `count`, `items[]`, `summaryByType`, `totalPossible`, `attendanceRate` |
| 출석 저장 | POST | — | **`nickname`**, **`team`**(T1~T5·S), **`meetingType`**(ETC·TUE·THU·SAT), **`meetingDate`**(YYYY/MM/DD). JSON 또는 폼 | Firestore 저장·시트 백그라운드·같은 날 `status` 재조회 | `ok`, `written`(저장 요약), `status`(그날 전체 현황) |

`team`·`meetingType` 코드는 [openapi.yaml](./openapi.yaml) `AttendancePostBody` 와 동일.

---

## `/scrapeProxy`

이 함수의 **HTTP 연산은 아래 한 줄이 전부**다(추가 분기 없음).  
경로 `/scrapeProxy`. CORS 끔. **시크릿** 불일치 시 403.

| 구분 | 메서드 | 쿼리 | 본문 | 하는 일 | 돌려주는 것 |
|------|--------|------|------|---------|-------------|
| 회원 검색(프록시) | GET | **`secret`**, **`source`**, **`sourceId`**, **`name`** 필수 | — | Cloud IP로 `searchMember` 호출(smartchip이면 세션 사용) | `ok`, `results[]` |
