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
