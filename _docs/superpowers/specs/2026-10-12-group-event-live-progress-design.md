# 단체 대회 풀코스 실시간 진행 — 설계

날짜: 2026-10-12  
상태: **브레인스토밍 합의** (1차 = 위치 확인. 응원 핀·시간표는 다음)  
2026-10-14: 응원 보기 권한을 닉 필수에서 `public-roster`와 같은 링크 공개로 변경  
관련:
- `_docs/knowledge/data-dictionary.md` (`race_events.participants`, 단체 스크랩)
- `_docs/superpowers/specs/2026-08-02-group-event-day-ux-design.md` (당일 홈·버스)
- `_docs/superpowers/specs/2026-04-18-self-service-bib-input-design.md` (`update-bib`, `my-bib.html`)
- `_docs/superpowers/specs/2026-08-30-event-records-roster-board-prd.md` (공개 기록판, 실명 없음)
- `BACKLOG.md` — 구간 기록(splits) 파이프라인 공백

---

## 1. 배경 및 문제

단체 대회 풀코스 러너가 여러 명일 때, 응원·보급하는 동료가 **지금 코스 어디쯤인지**를 한 화면에서 보고 싶다.

기록 사이트(스마트칩, SPCT, 오마이레이스 등) 공식 실시간 API는 쓰기 어렵다. 비공식 HTML을 1–2분마다 전 배번 폴링하면 차단 위험이 있다. 지금 단체 스크랩은 **10분** 주기이고, `splits`는 파서 일부에만 있으며 `scrapeEvent`가 잡에 넣지 않는다.

1차 목표는 지도·핀이 아니라 **조별 출발 + 목표 완주(또는 페이스)로 추정 위치를 여럿이 한꺼번에 보는 것**이다. 칩 구간이 잡에 있으면 그 지점 이후만 보정한다.

---

## 2. 1차 목표 / 비목표

**목표**

- 버스 탑승 **전**에도 배번·종목·(풀코스) 조·목표를 넣는 전용 페이지
- 총무가 조(이름 + 출발 시각)를 등록하고, 풀코스 러너가 자기 조를 고른다
- 회원 홈에 **응원** 탭. 자동으로 홈을 바꾸지 않는다
- 풀코스 전원을 코스(5 km 지그재그)·순위 표·개인 상세 세 뷰로 본다
- 추정 위치의 기준 시각은 **그 러너의 조 출발**이다. 클럽 공통 출발은 쓰지 않는다
- 응원 **보기**는 대회 기록(`public-roster`)과 같다. `eventId` 링크만 있으면 닉 없이 연다. 가족·지인 포함

**비목표 (1차에서 하지 않음)**

- 사용자가 찍는 응원 핀, 핀별 ETA, “방금 통과” 목격
- 실제 지도·코스 GPX
- 기록 사이트 공식 API, 스크랩 주기 단축, 푸시
- 실명 노출 (닉·배번·추정 위치만)
- 신규 HTTP `action` (기존 `group-events` `subAction`만)
- 홈 탭 자동 전환, 러너 Garmin/폰 GPS

다음(명시적 후속): 응원 핀 + 30/38 km 통과 시각표.

---

## 3. 사용자 시나리오

역할:

| 역할 | 하는 일 |
|------|---------|
| 총무 | 조 목록만 등록. 점·ETA를 수동으로 넣지 않음 |
| 풀코스 러너 | 배번·조·목표 필수. 있어야 점·표·상세에 등장 |
| 하프·10K 등 | 배번·종목만. 응원 탭은 보고, 점·표·상세에는 없음 |
| 링크를 연 사람 (닉 없는 가족·지인 포함) | 응원 코스·순위·상세 **보기**. 쓰기(배번·조)는 참가자 닉 필요 |

**S1. 대회 전 배번.** 총무가 조를 넣는다 (예: A 08:00, B 08:20). 회원은 카톡으로 새 입력 페이지를 연다. 닉 → 종목 → 배번. 풀코스면 조 + 목표 페이스 **또는** 목표 완주(한쪽만, 서버는 완주 초로 저장). 하나라도 없으면 응원 보드에 안 오른다. `my-bib.html`은 이 페이지로 리다이렉트한다.

**S2. 새벽 버스.** 홈은 지금과 같다 (버스·기록 대기·확정). 출발이 지나도 탭을 바꾸지 않는다.

**S3. 경기 중 응원.** `event-home.html?eventId=`의 응원 탭(또는 `tab=cheer`). 닉 없이 `코스 | 순위`. 코스에 풀코스 점이 모두 보인다. 순위에 추정 km·조 출발 후 경과·평균 페이스. 닉을 누르면 상세(목표·배번·칩 구간). 실명 없음. 홈 탭으로 가면 그때 닉을 고른다.

**S4. 칩.** 10분 스크랩에 구간이 있으면 그 사람만 그 km 이후를 고친다. 실패해도 보드는 목표 페이스로 유지한다.

**S5. 빈 상태.** 조 없음 → 점 없음, 안내. 풀코스 완비 0명 → 코스만. 자기 조 출발 전 → 그 사람 0 km.

---

## 4. 화면

### 4.1 회원 홈 `event-home.html`

탭: `홈 | 대회 기록 | 응원`.

- 홈: 기존 (버스, 프로필 대기·확정). 배번 CTA·인라인 `submitUpdateBib`는 **저장하지 않고** `event-bib.html`로만 보낸다. 풀코스 필수 필드를 홈에서 빼 먹으면 `update-bib`가 400이 된다.
- 대회 기록: 기존 roster (`public-roster`, 닉 불필요)
- 응원: **닉 없이** 보드. 출발 전에도 열림. 자동 활성화 없음. `?tab=cheer`면 응원부터 보여 닉 선택을 막지 않는다. 홈 탭만 닉 선택

응원 탭 안:

1. **코스** — 0–42.195 km를 5 km 지그재그(뱀). 한 줄 5 km. **짝수 줄(0, 2, …)은 왼쪽→오른쪽**, 홀수 줄은 오른쪽→왼쪽. 마지막 줄만 40→42.195. 고정 눈금: 5, 10, 15, 20, 25, 30, 35, **38**, 40, 42.2. 사용자 핀 없음. 풀코스 점 전부. 점을 누르면 그 러너 상세. 같은 ~0.4 km 안은 숫자 묶음이고, 누르면 닉 목록 후 상세.
2. **순위** — 추정 거리 내림차순. 열: 닉, 조, 추정 km, 조 출발 후 경과, 평균 페이스, 칩 보정 여부. 핀 ETA 열 없음.
3. **상세** — 순위(또는 코스 점)에서 닉을 눌렀을 때. 탭이 아님. 뒤로 = 순위. 2번 필드 + 목표 완주/페이스 + 조 출발 + 배번 + 칩 `splits`. 실명 없음.

하프·10K는 1·2·3에 등장하지 않는다.

### 4.2 새 입력 페이지 `event-bib.html`

유일한 배번 입력처.

- 쿼리: `?eventId=`
- 조 목록은 기존 `GET group-events` `detail`(또는 홈이 쓰는 같은 대회 GET)에 `waves`를 실어 온다. 별도 읽기 API 없음
- 흐름: 닉(참가자 exact) → 종목 → 배번. `distance === "full"`이면 조 select + 목표 완주 **또는** km 페이스 (UI는 둘 중 하나, 저장은 `goalFinishSec`)
- `my-bib.html?eventId=` → `event-bib.html?eventId=` (호스팅 redirect 또는 페이지 최상단 location replace. 쿼리 유지)

### 4.3 총무 `event-admin.html`

조 편집 UI (준비 패널 또는 배번 패널 인접). `waves[]` 전체 교체. 이름 + 출발 시각(대회일 KST). 빈 목록 허용.

---

## 5. 데이터

컬렉션은 `race_events` / 기존 `scrape_jobs`만. 새 컬렉션 없음.

### 5.1 `race_events.waves[]`

| 필드 | 형 | 의미 |
|------|----|------|
| `id` | string | 문서 내 안정 id (총무 저장 시 생성, 재저장 시 같은 조는 유지) |
| `name` | string | 표시 (예: `A조`) |
| `startAt` | string | `YYYY-MM-DDTHH:mm:ss+09:00` — 그 조 총성. `eventDate`와 날짜가 같아야 함 |

### 5.2 `participants[]` 추가 필드

기존: `memberId`, `realName`, `nickname`, `bib?`, `distance?`.

| 필드 | 형 | 의미 |
|------|----|------|
| `waveId` | string \| 생략 | `waves[].id`. 풀코스 보드 입장에 필수 |
| `goalFinishSec` | number \| 생략 | 목표 넷 완주 초. 페이스 입력도 이 값으로만 저장. `goalFinishSec = round(FULL_KM * paceSecPerKm)` (`FULL_KM = 42.195`). 목표 페이스(초/km)는 `goalFinishSec / FULL_KM` |

풀코스가 보드에 올라가려면 `bib`, `distance === "full"`, `waveId`(존재하는 조), `goalFinishSec`가 모두 있어야 한다.

하프 등이 `waveId`/`goalFinishSec`를 내면 400.

### 5.3 칩 구간

확정 `race_results`와 분리. 당일 `groupScrapeJobId` → `scrape_jobs.results[]`에 `splits: { label, time }[]`를 **있으면** 넣는다 (`scrapeEvent`가 버리던 필드 유지).

라벨→km: 라벨을 소문자·공백 제거한 뒤 **숫자 km는 긴 값부터** 매칭한다 (`42` → `40` → `38` → `35` → `30` → `25` → `21.1` → `15` → `10` → `5`). `15`/`25`/`35`가 `5`로 떨어지지 않게 한다. 토큰 `half`/`하프` → 21.0975, `finish`/`완주` → 42.195. 그 외는 버린다.

| 인식 (우선) | km |
|------|-----|
| `42`, `finish`, `완주` | 42.195 |
| `40` | 40 |
| `38` | 38 |
| `35` | 35 |
| `30` | 30 |
| `25` | 25 |
| `21.1`, `half`, `하프` | 21.0975 |
| `15` | 15 |
| `10`, `10k` | 10 |
| `5`, `5k`, `5km` | 5 |

매핑 불가면 그 split은 버린다. 스마트칩/오마이레이스 파서가 빈 `splits`여도 1차는 목표 페이스만으로 보드가 성립한다. 파서 보강은 이 스펙의 **필수 구현이 아니다** (잡에 필드만 통과).

`time`과 잡 `netTime`은 기존 기록 파서와 같이 `HH:MM:SS` / `H:MM:SS` → 초. 불가하면 그 항목 스킵. 보드 러너와 잡 행은 `my-pending-result`와 같이 **배번 + 종목** (`matchResultByBib`). 실명 매칭 금지.

---

## 6. 위치 계산

상수: `FULL_KM = 42.195`. 서버가 숫자를 주고 클라이언트는 그린다. `now`는 서버 응답의 `nowMs`.

러너별 입력: `startMs` (`wave.startAt`), `goalFinishSec`, `nowMs`, 선택 `lastSplit { km, elapsedSec }` (매핑된 split 중 km 최대). 잡에 유효 완주 `netTime`이 있으면 `lastSplit = { km: 42.195, elapsedSec: netTime }`.

1. `elapsedSec = floor((nowMs - startMs) / 1000)`. `elapsedSec < 0`이면 거리 0, 경과 0, 페이스 = 목표 페이스 (`goalFinishSec / FULL_KM`).
2. 목표 페이스 `goalPace = goalFinishSec / FULL_KM` (초/km).
3. 칩 없음: `km = min(FULL_KM, elapsedSec / goalPace)`.
4. 칩 있음: `km = min(FULL_KM, lastSplit.km + max(0, elapsedSec - lastSplit.elapsedSec) / goalPace)`. (1차 보정 페이스는 목표 페이스. 구간 페이스로 바꾸지 않음.)
5. `elapsedSec >= 0`이고 `km > 0`이면 `avgPace = elapsedSec / km`, 아니면 `avgPace = goalPace`. `km`가 `FULL_KM`이면 완주로 보고 `elapsedSec`·`avgPace`를 더 이상 늘리지 않는다. 잡 `netTime`이 있으면 그 초를 경과·페이스 분모로 쓴다.
6. 순위 정렬: `km` 내림차순, 동률이면 `nickname` 오름차순.
7. 칩 뱃지: `lastSplit`이 있으면 true.

상세의 표시용 목표 페이스 = `goalFinishSec / FULL_KM`.

---

## 7. API (`action=group-events`)

신규 HTTP `action` 이름은 없다. `waves` / `cheer-board` / `cheer-runner`는 기존 `group-events`의 `subAction`이다. 구현 전에 `_docs/justification/`에 한 장 쓰고 (기존 `update-bib`·`public-roster`·`my-pending-result`로 대체 불가 이유) 사용자 확인을 받는다. `.cursor/rules/new-api-validation.mdc` 절차.

### 7.1 `POST` `update-bib` 확장

기존: `eventId`, `nickname`, `bib`, 선택 `distance`. 참가자 exact, 배번 중복 거부.

추가 본문: `waveId`, `goalFinishSec` 또는 `goalPaceSecPerKm` (하나만 있으면 됨. 둘 다 있으면 `goalFinishSec` 우선).

`distance === "full"` (또는 저장 후 canonical이 full)이고 `waveId`나 `goal*` 중 하나라도 보냈으면:

- `waveId`가 `waves`에 있어야 함
- 목표: `goalFinishSec`이 3600–36000 (1–10시간). 페이스만 오면 `goalFinishSec = round(FULL_KM * goalPaceSecPerKm)` 후 같은 범위
- 아니면 400

2026-10-21: 풀코스인데 `waveId`·`goal*`를 **하나도** 안 보내면 배번·종목만 저장하고 기존 `waveId`·`goalFinishSec`는 그대로 둔다. Functions를 Hosting보다 먼저 배포하는 동안과 캐시된 옛 `my-bib.html`·홈이 배번만 보내기 때문이다. `event-bib.html`은 풀코스면 항상 둘 다 보내므로 거기서는 계속 거절된다.

`distance`가 full이 아니면 `waveId`/`goal*`를 보내지 않아야 한다. 보내면 400. 저장 후 canonical이 full이 아니면 기존 `waveId`·`goalFinishSec`를 지운다.

응답: 기존처럼 `{ ok, message }`.

### 7.2 `POST` `waves`

본문: `canonicalEventId` 또는 `eventId` (구현은 `event-admin` 스크랩과 같이 `canonicalEventId` + `ownerPw`), `ownerPw`, `waves: { id?, name, startAt }[]`.

권한: `canWriteGroupEvents(ownerPw)` (오너·총무).

`name` trim 필수. `startAt` 파싱 가능해야 하고 **날짜가 `eventDate`와 같아야** 한다. `id` 없으면 서버가 생성. 클라이언트가 기존 조를 유지하려면 받은 `id`를 다시 보낸다. 배열 전체 교체. 사라진 `id`를 가리키는 `participants[].waveId`는 보드에서 빠진다 (orphan, 마이그레이션 없음).

기존 `GET` `detail`(및 홈이 대회를 불러오는 GET) 응답에 `waves[]`를 포함한다. 실명은 지금처럼 총무 `detail`에만 두고, 회원 경로에는 넣지 않는다.

### 7.3 `GET` `cheer-board`

쿼리: `eventId`만. `public-roster`와 같이 닉·비번 없음. 없는 `eventId`는 404. 실명 필드 없음.

응답 개요:

```
{
  ok: true,
  nowMs,
  waves: [{ id, name, startAt }],
  runners: [{
    nickname, bib, waveId, waveName, startAt,
    goalFinishSec, km, elapsedSec, avgPaceSecPerKm,
    chip: boolean
  }]
}
```

`runners`는 보드 입장 조건을 만족한 풀코스만.

### 7.4 `GET` `cheer-runner`

쿼리: `eventId`, `runnerNickname`. 보기 권한은 `cheer-board`와 같음 (닉 없음). 대상이 보드 러너가 아니면 404.

응답: `cheer-board` 러너 한 줄 + `splits: { label, time, km? }[]` (원본 label/time, 매핑되면 `km`).

### 7.5 클라이언트 갱신

응원 탭이 보일 때 `cheer-board`를 **30초**마다 (기존 `my-pending-result`와 같음). 백그라운드 탭은 폴링 중지.

---

## 8. 오류 · 빈 화면

| 상태 | UI |
|------|-----|
| 닉 없음 (응원 탭) | 보드 그대로. 홈으로 갈 때만 닉 선택 |
| 조 0개 | “총무가 조 출발을 등록하면 점이 생깁니다.” |
| 보드 러너 0명 | 지그재그+눈금. 표: “배번·조·목표를 넣은 풀코스가 없습니다.” |
| 조 출발 전 | 그 러너 km=0, elapsed=0 |
| 스크랩 실패·splits 없음 | 목표 페이스. 칩 뱃지 없음 |
| 배번 중복 | 기존 `update-bib` 메시지 |
| 풀코스 필수 누락 | 저장 거절 |
| 핀 API | 없음 |

한글 IME: 배번·목표 입력은 기존 bib 패턴 (`compositionstart`/`end`).

---

## 9. 테스트

단위 (`scripts/test/`, 기존 `event-home-*.test.js`와 같이 `node --test`):

- 계산: 출발 전, 목표만, 칩 마지막 구간 이후, 완주 클램프, 평균 페이스
- 지그재그: 0 / 5 / 30 / 38 / 42.195가 올바른 줄·방향
- 보드 필터: 풀코스 완비만, 실명 스트립
- `cheer-board` / `cheer-runner`: `eventId`만으로 200, `nickname` 쿼리 없어도 됨, 실명 키 없음
- `update-bib`: 풀 필수, 하프+wave 400, 목표 범위
- split 라벨 매핑 / 무시

회귀: 기존 홈·버스·대회 기록 단위 테스트 통과.

에뮬 스모크: 조 2 + 풀 2(조·목표 다름) + 하프 1 → 보드 2명. 닉 없이 `cheer-board` 200. `my-bib.html?eventId=`가 `event-bib`로 이동.

---

## 10. 구현 경계

| 넣을 것 | 넣지 말 것 |
|---------|------------|
| `event-bib.html`, `my-bib` 리다이렉트 | 핀, 지도, 새 `action` |
| `waves`, `cheer-board`, `cheer-runner`, `update-bib` 확장 | `groupEventAutoScrape` 주기 변경 |
| `scrapeEvent`가 `splits`를 잡에 유지 | 스마트칩 구간 복호화 필수화 |
| `event-home` 응원 탭 3뷰 (닉 없이 보기) | 홈 우선순위/자동 탭 변경, 응원 GET에 닉 게이트 |
| `event-admin` 조 편집 | `race_results`에 splits 확정 저장 (별 백로그) |

구현 시 `_docs/knowledge/data-dictionary.md`에 `waves`, `waveId`, `goalFinishSec`를 추가한다.

---

## 11. 합의 로그 (브레인스토밍)

- 데이터: 목표 페이스/완주 + 있으면 칩 보정. 목격 없음
- 조: 총무가 만들고 러너가 고름
- 목표: 러너 필수. 없으면 그 사람 보드 제외. 클럽 기본 페이스 없음
- 배번: 새 페이지 단일 경로, `my-bib` 리다이렉트. 버스 전 입력
- 핀: 1차 제거. 고정 눈금만
- 접근: 보기는 대회 기록과 같이 `eventId` 링크 공개. 닉 없는 가족 가능. 쓰기는 참가자 닉 (`update-bib`)
- IA: 응원 탭 상시. 자동 전환 없음
- 뷰: 지그재그 전원 + 순위 표 + 상세
- 지도 없음
