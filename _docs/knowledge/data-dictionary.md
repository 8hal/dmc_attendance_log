# 데이터 사전

> 시스템에서 사용하는 주요 필드 값의 정의. AI가 틀린 말 하지 않도록 여기를 참조할 것.

---

## race_results.source

외부 기록 수집 출처. 현재 5개.

| source | 사이트 | URL | 비고 |
|--------|--------|-----|------|
| `smartchip` | 스마트칩 | smartchip.co.kr | 국내 최다 대회 커버 |
| `myresult` | 마이리절트 | myresult.co.kr | API 제공, 페이지네이션 주의 |
| `spct` | SPCT | time.spct.kr | |
| `marazone` | 마라존 | marazone.com | |
| `manual` | 수동 입력 | — | 엑셀 임포트 또는 사용자 직접 입력 |

**새 source 추가 시:** `functions/lib/scraper.js`에 검색/파싱 함수 추가 필요.

---

## race_results.status

| 값 | 의미 |
|----|------|
| `confirmed` | 회원이 확인한 기록 |
| `auto` | 스크래퍼 자동 매칭 (동명이인 아님) |
| `ambiguous` | 스크래퍼 매칭했으나 동명이인 가능성 |

---

## scrape_jobs.status

| 값 | 의미 |
|----|------|
| `pending` | 수집 대기 |
| `complete` | 스크랩 완료, 미확인 |
| `confirmed` | 회원 확인 완료 |
| `failed` | 수집 실패 |

---

## members.gender

| 값 | 의미 |
|----|------|
| `M` | 남성 |
| `F` | 여성 |
| `""` (빈 값) | 미등록 |

**주의:** `race_results.gender`는 스크래퍼 추론값이므로 오류 가능. `members.gender`가 신뢰할 수 있는 값.

---

## canonicalJobId 규칙

```
{source}_{sourceId}
```

예: `smartchip_202650000006`, `myresult_132`

같은 대회에 여러 scrape_jobs가 생길 수 있음 (과거 버그). canonical ID를 가진 job이 정본.

---

## race_results.canonicalEventId

| 값 | 의미 |
|----|------|
| (없음) | `race_events.sourceMappings` 역조회 또는 `source_sourceId` fallback으로 그룹 |
| string | `race_events` 문서 id와 동일. `confirmed-races` 카드 그룹 1순위 |

---

## canonicalEventId (`race_events` 문서 id)

통합 대회(논리 이벤트) 식별자. **형식 (확정):** `evt_{YYYY-MM-DD}_{ascii-slug}` 전체 ≤80자, 문자 `[a-z0-9_-]`만, 동일 날짜·slug 충돌 시 `-2`, `-3` 접미. 구현: `functions/lib/canonicalEventId.js`.

---

## race_results.confirmSource

확정 행위자. **누가** 확정했는지를 나타낸다. 어떤 방식(수동/자동/스크립트)인지는 `race_results.source`로 알 수 있다.

| 값 | 의미 |
|----|------|
| `personal` | 회원 본인이 확정 (직접 검색 또는 시스템 제안 수락 등 방식 무관) |
| `operator` | 운영자가 확정 (report.html, 엑셀 임포트, 현장 입력 등 방식 무관) |

**두 필드 조합 예시:**

| source | confirmSource | 의미 |
|--------|---------------|------|
| `smartchip` | `operator` | 운영자가 스마트칩 데이터로 확정 |
| `manual` | `operator` | 운영자가 기록 사이트 없이 수동 입력 |
| `smartchip` | `personal` | 회원이 직접 검색 후 확정 |
| `smartchip` | `personal` | 회원이 시스템 제안 수락으로 확정 |

**UX 경로 분석** (어떤 방식으로 확정했는지)은 `event_logs`에서 추적한다. `confirmSource`는 행위자만 담는다.

**주의:** `(없음)` 122건은 confirmSource 필드 도입 이전(2026-03-23 이전) 데이터로 추적 불가. 정상으로 취급.

---

## race_events (컬렉션)

| 필드 | 의미 |
|------|------|
| `primaryName` | 카드·표시용 정본 대회명 |
| `eventDate` | `YYYY-MM-DD` |
| `sourceMappings` | `{ source, sourceId }[]` — 동일 `(source, sourceId)` 쌍은 전역에서 한 문서에만 |
| `createdAt` | ISO 문자열 등 |
| `isGroupEvent` | `boolean` — 단체 대회 여부. 필드 없음이면 일반 대회로 취급 |
| `participants` | 배열. 요소: `{ memberId, realName, nickname, bib?, distance? }` — 참가자 목록. `bib`는 셀프 입력(`update-bib`) 후 스크랩·self-confirm 키 |
| `groupSource` | `object` 또는 `null` — 단체 기록 소스(오너 입력). `{ source: string, sourceId: string }`. `source`는 `race_results.source`와 동일 범주(`smartchip`, `myresult`, `spct`, `marazone`, `ohmyrace`, `manual` 중 하나) |
| `groupScrapeStatus` | 문자열 — 단체용 스크랩 상태. 아래 표 참조 |
| `groupScrapeJobId` | `string` 또는 `null` — 스크랩 완료 후 대응 `scrape_jobs` 문서 ID |
| `groupScrapeTriggeredAt` | `string` 또는 `null` — 스크랩 트리거 시각, ISO KST |
| `promotedAt` | ISO KST 문자열 — 단체 대회로 승격된 시각 |
| `gorunningId` | 문자열 — 고러닝 예정 대회 ID |
| `busBoarding` | `object` 또는 생략 — 단체 대회 **버스 탑승** 모듈(optional). 버스 없는 대회는 필드 생략 또는 `enabled: false`. `participants[]`와 분리(배번·결과 vs 탑승 체크). 상세는 아래 |

### 배번 스크랩 · self-confirm (단체 대회)

철원 베타 이후 단체 결과 경로 (`event-admin` / 회원 홈).

| 단계 | 동작 |
|------|------|
| 배번 입력 | `POST group-events` `update-bib` — `participants[].bib`만 갱신 (공개, nickname exact) |
| 스크랩 | `POST group-events` `scrape` — **`bib`가 있는 참가자만** 조회 (`pickBibScrapeTargets`). 무배번은 미참가로 간주·제외. 배번 모드 소스: `smartchip`, `ohmyrace`, `spct` |
| 대기 조회 | `GET group-events&subAction=my-pending-result&eventId=&nickname=` — `state`: `none` \| `pending` \| `confirmed` |
| 참가자 컨펌 | `POST group-events` `self-confirm` `{ eventId, nickname }` — scrape job에서 **본인 bib** 행만 `race_results`에 upsert. `confirmSource: "personal"`. 이벤트 전체 bulk delete 금지 |
| 공개 명단·결과 | `GET group-events&subAction=public-roster&eventId=` — 닉·종목·기록·PB만. **실명·배번 미포함**. 선택: `distance`, `q`, `sortBy` |

**SSOT:** 스크랩만으로는 `race_results`에 쓰지 않음. 컨펌 후 `status: confirmed` (+ `confirmSource: personal`)가 대회기록에 반영된다. 총무 `bulk-confirm` / 갭 UI는 주경로가 아님.

### race_events.busBoarding

스펙: `_docs/superpowers/specs/2026-08-02-group-event-day-ux-design.md` §4.1.

| 필드 | 의미 |
|------|------|
| `enabled` | `boolean` — 참가자 셀프체크·공개 탑승 화면 활성 여부 |
| `legs` | `("outbound" \| "return")[]` — 운영 구간. 예: `["outbound","return"]` (가는/오는) |
| `importMeta` | `{ importedAt, rowCount, sourceLabel }` — 최근 CSV import 메타. `importedAt`: Timestamp\|null, `rowCount`: number, `sourceLabel`: string\|null (예: `"철원설문_0809.csv"`) |
| `roster` | 배열 — 탑승 명단. 지인(`isGuest`) 가능. `participants[]`와 별도 |

#### `busBoarding.roster[]` 요소

| 필드 | 의미 |
|------|------|
| `rosterId` | 문서 내 고유키 (uuid 등) |
| `nickname` | 표시·셀프체크 키 |
| `realName` | 실명 |
| `memberId` | `string` \| `null` — 정회원이면 `members` id, 지인이면 null |
| `isGuest` | `boolean` — 지인 여부 |
| `rideType` | `"roundtrip"` \| `"outbound_only"` \| `"return_only"` — 설문 왕복/편도. → `legs.*.required` 매핑 |
| `note` | `string` \| `null` — **비고. 총무(admin) API 응답에만 포함**, 참가자 공개 GET에는 미포함 |
| `legs.outbound` / `legs.return` | `{ required, boarded, boardedAt, boardedBy }` — `required`/`boarded`: boolean; `boardedAt`: Timestamp\|null; `boardedBy`: `"self"` \| `"admin"` \| null |

**`rideType` → `legs.*.required`:** `roundtrip` → outbound+return true; `outbound_only` → outbound만; `return_only` → return만. 개별 이동은 import 대상 아님.

**`participants[]`와의 관계:** 배번·결과 확정은 `participants`, 버스 탑승은 `busBoarding.roster`. 지인은 roster에만 가능.

### race_events.groupScrapeStatus

| 값 | 의미 |
|----|------|
| `pending` | 스크랩 대기 |
| `running` | 스크랩 진행 중 |
| `done` | 스크랩 완료 |
| `failed` | 스크랩 실패 |
