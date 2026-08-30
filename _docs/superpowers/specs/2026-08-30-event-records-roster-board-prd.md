# PRD: 회원 「대회 기록」참가 전원 · 배번 · 수집/확정 상태

날짜: 2026-08-30  
상태: 초안  
관련: `_docs/superpowers/specs/2026-08-28-event-records-tab-prd.md`  
대체: 8/28 PRD의 **목록(확정만)**, **프라이버시(배번 숨김)**, **`includePending` 금지**, 빈 화면·안내 문구. 탭 이름 「대회 기록」·실명 비공개·지인 제외·이 탭에서 확정 없음은 유지.

회원 「대회 기록」탭이 확정 `race_results`만 보여 대회 전·스크레이프 직후에 비어 있다. 참가자 전원에 종목·배번·기록 상태(없음 / 수집·미확정 / 확정+PB)를 보여 현황판으로 쓴다.

---

## 1. 배경

지금 `event-roster.html`은 `GET group-events&subAction=public-roster`로 **확정(+DNS/DNF)만** 그린다. 응답에 실명·배번이 없고, 미확정 참가자는 행이 없다. 8/28 PRD가 그렇게 정했다.

단체 대회 스크레이프는 이미 배번만 쓴다 (`pickBibScrapeTargets` + `queryBy: "bib"`). 홈 `my-pending-result` / `self-confirm`도 `matchResultByBib`다. 스크레이퍼를 다시 짤 필요는 없다. 부족한 것은 **공개 목록이 잡의 미확정 행을 읽지 않는 것**이다.

배번은 개인정보가 아니다. 실명은 그대로 비공개다.

---

## 2. 목표

| 목표 | 성공 기준 |
|---|---|
| 전원 | 닉 있는 `participants`는 기록 없어도 행이 있다. 버스만 탄 지인은 없다. |
| 배번 | 전원 배번 공개. 없으면 「배번 미입력」. 응답에 `bib` 있음, `realName`/`memberId` 없음. |
| 상태 | `none` → 「기록 수집되지 않음」. `scraped` → 시각 + 「미확정」. `confirmed` → 시각 또는 DNS/DNF. PB는 확정이고 `pbConfirmed`일 때만. |
| 매칭 | 미확정은 **배번으로만** 잡 결과에 붙인다. 이름·동명이인으로 시각을 넣지 않는다. |
| 확정 | 홈/`self-confirm` 직후 이 탭에 확정으로 보인다. 이 탭에서 확정·수정·PB 토글 없음. |
| 이름 | 탭·제목은 「대회 기록」유지. 총무 버스 「명단」카피 유지. |

---

## 3. 범위

### In Scope

- `GET group-events` `subAction=public-roster` 계약 확장 (신규 `action`/`subAction` 없음)
- `functions/lib/public-roster.js` 행 조립: 참가 전원 + 배번 + `recordStatus`
- `functions/index.js` 핸들러: `groupScrapeJobId` → `scrape_jobs.results` 조회
- `event-roster.html` 행·요약·빈 화면·안내
- `scripts/test/public-roster.test.js`, `scripts/test/event-roster-shell.test.js`
- `scripts/qa-event-admin.sh` public-roster 단언 (`totalCount == confirmedCount`, 행에 bib 없음)

### Out of Scope

- 스크레이퍼 재작성, `queryBy: "name"` 경로 변경
- 신규 HTTP `action` / `subAction`
- 자동 PB 계산 (`my.html` `computePBs`). 쓰는 값은 수동 `pbConfirmed`만
- 이 탭에서 확정·수정·배번 입력·재스크레이프
- 실명 공개, `memberId` 공개
- `event-roster.html` 파일명 변경
- 총무 `event-admin` / `group-detail` / 버스 명단
- 실시간 순위, 구간 기록(`splits`)

---

## 4. 화면

위부터: 대회 제목 → 날짜 → 요약 → 종목 칩 · 닉 검색 · 정렬 → 행 → 안내. 탭 `홈 | 대회 기록`.

**요약:** `참가 N명 · 확정 M명` (N = `totalCount`, M = `confirmedCount`). 「기록 N명」삭제.

**행** (왼쪽 정체성 / 오른쪽 기록):

| `recordStatus` | 왼쪽 | 오른쪽 |
|---|---|---|
| 공통 | 닉 (본인 「나」). 아래 `하프 · 배번 4821`. 배번 없으면 `하프 · 배번 미입력`. 종목 없으면 배번만 | |
| `none` | | 흐린 「기록 수집되지 않음」. PB 없음 |
| `scraped` | | 시각 + 아래 「미확정」. PB 없음 |
| `confirmed` 완주 | | 시각. `pbConfirmed`면 초록 「PB」 |
| `confirmed` DNS/DNF | | `DNS` 또는 `DNF` |

본인 행 파란 테두리 유지. 행에 버튼·체크 없음.

**빈 화면:** 참가자 0명만 「아직 참가자가 없어요.」 칩·검색 0건은 「해당하는 참가자가 없어요.」 전원 미확정이어도 행을 둔다. 「아직 확정된 기록이 없어요」삭제.

**안내:** 「실명은 공개되지 않습니다. 수집된 기록은 홈에서 확인하기 전까지 미확정입니다.」

**칩:** 참가자 종목 (기록 없어도). 순 `full` → `half` → `10K` → 나머지. `unknown` 칩 없음.

**정렬 기본 `result`:** 확정 완주 시각 오름차순 → 미확정(시각 있는 것) 오름차순 → 확정 DNS/DNF → `none` → 닉. `nick` / `distance` 옵션 유지.

---

## 5. 바꿀 카피 (회원 탭만)

| 위치 | 지금 | 후 |
|---|---|---|
| 요약 | `기록 N명` | `참가 N명 · 확정 M명` |
| 빈 목록 | 아직 확정된 기록이 없어요 | 아직 참가자가 없어요 |
| 필터 0건 | 해당하는 기록이 없어요 | 해당하는 참가자가 없어요 |
| 안내 | 실명·배번은 공개되지 않습니다. 홈에서 확정한 기록만 모입니다 | 실명은 공개되지 않습니다. 수집된 기록은 홈에서 확인하기 전까지 미확정입니다 |

총무 「버스 명단」은 유지.

---

## 6. 데이터

기존 `public-roster`. 신규 API 없음.

### 입력

- `race_events.participants` (닉 있는 행만)
- `race_results` where `canonicalEventId` (확정 SSOT)
- `scrape_jobs/{groupScrapeJobId}.results` (있으면). 잡 없음·실패는 오류가 아님 → 비확정은 `none`

### 행 상태 (이 순서)

1. 기존 `findConfirmedForParticipant`로 확정 완주 또는 DNS/DNF가 있으면 `confirmed`. PB는 저장된 `pbConfirmed`만.
2. 아니면 참가자 `bib`가 있고 `matchResultByBib(job.results, bib, participant.distance)`가 있으면 `scraped`. 시각은 홈과 같이 net → finishTime → gun (`effectiveNetTimeForConfirm`). 이름만 같은 잡 행은 무시.
3. 그 외 `none`. 배번 없음 = 스크레이프 대상 아님 = 항상 `none`.

확정은 스크레이프가 아니라 SSOT 조회다. 확정 뒤 배번을 지워도 확정 행은 남는다. 같은 배번이 잡에 여러 개면 홈과 같이 첫 매칭.

### 행 JSON

```json
{
  "nickname": "게살볶음밥",
  "distance": "half",
  "bib": "4821",
  "recordStatus": "none",
  "netTime": null,
  "dnStatus": null,
  "pbConfirmed": false,
  "hasResult": false
}
```

| 필드 | 규칙 |
|---|---|
| `bib` | 문자열. 없으면 `""` |
| `recordStatus` | `"none"` \| `"scraped"` \| `"confirmed"` |
| `netTime` | `confirmed`/`scraped` 완주만. DNS/DNF·없음은 `null` |
| `dnStatus` | 확정 DNS/DNF만 `"DNS"` \| `"DNF"`. 그 외 `null` |
| `pbConfirmed` | 확정이고 플래그일 때만 `true`. `scraped`/`none`은 항상 `false` |
| `hasResult` | `recordStatus === "confirmed"` |
| `distance` | 참가자 종목. 비어 있고 확정/스크레이프에 있으면 그쪽 canonical |

응답에 `realName`, `memberId` 없음.

### 목록 메타

| 필드 | 의미 |
|---|---|
| `totalCount` | 닉 있는 참가 전원 (필터 전). 예전에는 확정 수와 같았음 |
| `confirmedCount` | `recordStatus === "confirmed"` |
| `distances` | 참가자 종목 전부 (`unknown` 제외) |

쿼리 `distance`, `q`, `sortBy` 유지. 닉 검색만 (배번 검색 없음).

---

## 7. 오류

- `eventId` 없음 / 대회 없음: 지금과 같은 톤. 화면 「대회를 찾을 수 없어요」
- 서버 오류: 「다시 시도」
- 잡 없음·스크레이프 실패·배번 미매칭: 오류 아님. `none`
- 이 탭에서 쓰기 API 없음

---

## 8. 테스트

- `buildPublicRosterRows`: 닉 있는 참가 전원. `bib` 있음. `realName` 없음
- 배번 없음 + 이름만 같은 잡 행 → `none`
- 배번 매칭 → `scraped`. 확정 있으면 `confirmed`가 이김
- DNS/DNF·`pbConfirmed`는 확정일 때만
- 정렬: 확정 시각 → 미확정 시각 → DNS/DNF → `none` → 닉
- `totalCount`와 `confirmedCount`가 다를 수 있음
- 화면: 요약 `참가 N명 · 확정 M명`. 빈/필터/안내 문구. 「기록 N명」·「배번은 공개되지 않습니다」없음
- `qa-event-admin.sh`: 전원 행, bib 허용, `realName` 없음
- `pre-deploy-test.sh` 회귀

---

## 9. 파일

- `functions/lib/public-roster.js`
- `functions/index.js` (`public-roster` 핸들러만. 스크레이프 트리거 변경 없음)
- `event-roster.html`
- `scripts/test/public-roster.test.js`
- `scripts/test/event-roster-shell.test.js`
- `scripts/qa-event-admin.sh`
- `_docs/superpowers/specs/2026-08-28-event-records-tab-prd.md` 상태만 「일부 대체」로 표시

---

## 10. 합의

- 기존 `public-roster` 확장. 신규 API 없음
- 스크레이프 재작성 없음 (이미 배번만)
- 배번 전원 공개. 실명 비공개
- PB는 수동 `pbConfirmed`만
- 이 탭은 읽기 전용
