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
