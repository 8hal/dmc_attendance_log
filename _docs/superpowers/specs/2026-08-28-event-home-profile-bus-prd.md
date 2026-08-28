# PRD: 단체 대회 회원 홈 — 프로필 + 버스

날짜: 2026-08-28  
상태: 기획 리뷰 반영  
관련: `_docs/superpowers/specs/2026-08-28-event-records-tab-prd.md`, `_docs/superpowers/specs/2026-08-18-group-event-member-home-chunbaek-ia.md`, `_docs/superpowers/specs/2026-08-23-event-member-day-ux-design.md`

이 문서는 2026-08-18·08-23의 **「홈 = 지금 할 일 하나」** 와 **편별 QR · `boarding.html` 주경로**를 대체한다. 대회 기록 탭은 짝 문서.

---

## 1. 배경 및 문제

회원 홈은 춘백식 **오늘 카드 하나**다. 배번·기록·버스가 한 슬롯을 돌아가며 쓰므로, 아침 탑승과 배번 입력을 동시에 끝낼 수 없다.

버스 스위치는 `busBoarding.enabled` 하나라 가는 편과 오는 편이 같이 열린다. QR은 편마다 URL이 다르고, 탑승은 `boarding.html`에서 편 탭을 고른다.

**핵심 고통:** 프로필과 버스가 섞이고, 탑승 열림·QR이 편과 맞지 않는다.

---

## 2. 목표 및 성공 기준

| 목표 | 성공 기준 |
|---|---|
| 홈이 두 덩어리 | 닉 선택 후 **프로필 카드 + 버스 카드**. 과업이 한 카드에서 교대되지 않는다. |
| 과업은 독립 | 배번 없어도 가는 편이 열려 있으면 탑승 가능. 버스를 안 타도 배번·기록 가능. |
| 프로필 상태 | 배번·종목 → 대기 → 확인·PB·수동입력 → 확정이 카드 안에서만 바뀐다. |
| 버스는 편 스위치 | 총무가 가는/오는를 따로 켠다. 한 편을 켜면 다른 편은 꺼진다. |
| QR은 하나 | 같은 링크. 저장된 닉이 있으면 **홈에 탑승 완료로 랜딩**. `boarding.html` 회원 화면은 없앤다. |
| 스크랩 세션 | 총무가 대회 시간에 맞춰 **시작**. 이후 미완주만 간격 재시도. 창이 끝나면 멈춘다. |
| 탭 | `홈` \| `대회 기록`. 버스 탭·「명단」 라벨 없음. |

당일 결과(배포 후 철원에서 봄): 가는 편 셀프 탑승 비율, 출발 전 배번+종목 입력 비율, 스크랩 세션 중 회원 확정 비율, “기록 안 떠요” 총무 문의.

---

## 3. 범위

### In Scope

- `event-home.html` 프로필 + 버스. QR·탑승하기는 홈에서 `self-board` 후 탑승 완료 연출
- `boarding.html` 회원 UI 제거. 옛 URL은 홈으로 리다이렉트
- `event-admin.html` 편 스위치, QR 하나, **당일 체크리스트**, 기록 소스 저장, 스크랩 세션 시작/종료, 미입력자 수동 기록. 전부 **총무 비밀번호**. 오너/`ops.html` 없음
- `assets/event-member-tabs.js` 등: 버스 탭 제거, 라벨 **대회 기록**
- API는 기존 확장 (신규 `action`/`subAction` 없음)
  - `update-bib`: `distance` + (세션 중이면) 해당 배번 즉시 스크랩
  - `self-confirm`: `pbConfirmed`, 수동 `netTime` / `dnStatus`
  - `bus-boarding` `settings`/`status`/`self-board`: `openLeg`
  - `group-events` `scrape`: 세션 시작·종료. 재시도는 스케줄러가 기존 `scrape`/`triggerGroupScrape` 재호출
- `confirm-one`은 총무 수동 입력에 재사용 (새 확정 API 없음)

### Out of Scope

- 확정된 기록을 회원이 취소
- `my-bib.html`을 홈 주경로로 유지
- 신규 `action` / `subAction`
- 배번 입력을 총무가 켜고 끄는 스위치
- 종목 칩을 대회마다 다르게 설정하는 관리 UI (다음 대회에 코드로 추가)
- 스크랩 간격·창 길이를 총무가 숫자로 조절하는 UI (상수)
- 오너 작업, `ops.html` 당일 사용. 소스·스크랩·수동 기록은 `event-admin`만

---

## 4. 등장인물

| Actor | 화면 | 하는 일 |
|---|---|---|
| 회원 (`participants`) | 홈, 대회 기록 | 배번·종목, 기록 확정·PB·수동, QR/홈 탑승 |
| 지인 (버스 명단 `isGuest`) | 홈 버스만 | 탑승만. 프로필 기록 없음. 대회 기록 탭에 안 나옴 |
| 총무 | `event-admin.html` | 기록 소스, 편 스위치, QR, 체크리스트, 스크랩 세션, 미입력자 수동 기록 |
| 오너 | 없음 | **이번 대회에서 할 일 없음.** 예전에 오너/`ops.html`이 하던 소스 매핑·스크랩은 전부 총무 화면 |

총무는 이미 쓰는 관리자 비밀번호로 소스 저장과 스크랩을 한다. `ops.html`을 열지 않는다. 화면의 오너 전용 잠금(`owner-writable` 배너로 소스·스크랩을 막는 것)은 없앤다. API `source`/`scrape`는 총무 비번으로 이미 허용되므로 신규 API 없음.

---

## 5. 홈 뼈대

1. 대회 제목·날짜·장소, 선택한 닉
2. **프로필** — 회원만. 지인은 “지인 탑승은 대회 기록에 남지 않아요” 한 줄
3. **버스** — 지금 편 하나
4. 탭 `홈` | `대회 기록`

두 카드는 동시에 보이고 서로 잠그지 않는다.

---

## 6. 프로필 카드 (회원만)

### 6.1 배번 또는 종목 없음

문구: **배번과 종목을 넣어 주세요.** (‘먼저’ 금지)

입력: 배번 + 종목. 종목은 **`race_results.distance` canonical**만 저장한다 (`functions/lib/raceDistance.js` `RACE_DISTANCE_CANONICAL`). `normalizeRaceDistance`를 거친 값.

1차 선택: `10K` / `half` / `full` (표시는 기존 `EventMemberCopy.memberDistanceLabel`).  
**기타**는 `unknown`을 쓰지 않는다. 펼치면 나머지 canonical: `5K` / `3K` / `30K` / `32K` / `ultra`.

`unknown`·빈 값은 저장하지 않는다. 고르지 않으면 6.1에 남는다. 철원 주경로는 앞의 세 종목이다.

`participants[].distance`와 확정 시 `race_results.distance`가 같은 enum이다.

둘 다 있어야 저장. 배번만 있고 종목이 비면 이 상태(배번 채운 채 종목만 고름).

`POST update-bib`에 `distance` 포함.

### 6.2 배번·종목 있음, 확정할 기록 없음

배번·종목은 **크게**. **수정**은 작은 버튼.

문구: **기록이 올라오면 여기서 확인해요.** 총무가 대회 시간에 맞춰 스크랩을 시작하면, 아직 완주 기록이 없는 사람만 주기적으로 다시 찾습니다.

수정 저장 후: 스크랩 세션이 켜져 있으면 그 배번을 **즉시 한 번 스크랩**하고 `my-pending-result`. 세션이 꺼져 있으면 스크랩하지 않고 이 문구에 머문다.

작은 **직접 입력** → 6.4. 스크랩이 한 번도 안 떠도 완주·DNS·DNF를 넣을 수 있다. 안 넣으면 총무 `confirm-one`.

### 6.3 기록 있음 · 미확정 (스크랩 매칭)

넷타임·종목·배번. 문구: 고생했어요. 이 기록이 맞나요?

- **이번이 PB예요** 체크. 기본 꺼짐. 모르면 안 누름. **회원 값이 스크래퍼·총무 PB보다 이김.**
- **맞아요** → `self-confirm` (`pbConfirmed`)
- **아니에요** → 같은 카드에서 배번·종목 수정 폼. 저장하면 즉시 스크랩(세션 중) → 새 매칭이면 6.3, 없으면 **6.2**. 자동으로 6.4로 가지 않는다.
- 작은 **직접 입력** → 6.4

### 6.4 수동 기록

6.2 또는 6.3의 **직접 입력**을 누른 화면.

- 완주 시각 (시:분:초)
- 또는 **DNS** / **DNF** (기존 `confirm-one`과 같은 `dnStatus`)

저장은 `self-confirm` 확장. 완주 시각을 넣으면 6.3과 같이 **이번이 PB예요**를 고를 수 있다. DNS/DNF는 PB 없음. `source: manual`에 해당하는 행으로 `race_results` upsert. `confirmSource: "personal"`.

회원이 안 하면 총무가 `event-admin`에서 `confirm-one`으로 같은 세 가지를 넣는다.

### 6.5 확정됨

문구: **끝. 동마클 대회 기록에 저장됐어요.**  
추가 CTA 없음. 취소는 회원 없음. 대회 기록 탭에 바로 보인다.

---

## 7. 버스 · QR · 탑승 완료

### 7.1 `openLeg`

`busBoarding.openLeg`: `"outbound"` | `"return"` | `null`  
한 번에 한 편만. `enabled === (openLeg != null)`.

`settings`는 `openLeg` 필수. `enabled: true`만 보내면 거절.

**옛 문서 (`enabled: true`, `openLeg` 없음):** 읽기에서는 **꺼진 것으로 본다.** 배포 직후 총무가 지금 필요한 편을 켠다. 대회 도중 이 규칙을 포함한 배포를 하지 않는다. (설명은 아래 「배포와 enabled」.)

`self-board`는 `openLeg === leg`이고 그 편이 `required`일 때만.

`admin-board`는 스위치와 무관 (총무가 명단에서 대신 체크).

### 7.2 총무 스위치 · QR

스위치 두 개. 한쪽을 켜면 다른쪽은 꺼짐.

QR·링크 **하나**: `event-home.html?eventId={id}&board=1`  
오는 편 전용 QR 제거.

`boarding-admin.html`도 같은 `settings`를 맞춰야 버스 켜기가 안 깨진다.

### 7.3 회원 홈 버스 카드

본인 행은 `detail`의 `busBoarding.roster`에서 찾는다 (탑승 꺼져 있어도).

**열린 편이 `required`가 아니면 탑승 CTA 없음.**

| 조건 | 카드 |
|---|---|
| 명단 없음 | “이번 대회 버스 명단에 없습니다. 버스 탑승 예정이면 총무에게 문의하세요.” |
| `outbound_only` | 가는 편만. 타면 가는 탑승 완료. 오는 편 스위치여도 오는 CTA 없음 |
| `return_only` | 오는 편만. 꺼져 있으면 비활성 + “오는 버스 탑승 시간이 아닙니다.” |
| `openLeg === null`, 가는 편 필요·미탑승 | 가는 버스 탑승 비활성. “가는 버스 탑승 시간이 아닙니다.” |
| `openLeg === "outbound"`, 필요·미탑승 | **탑승하기** — 페이지 이동 없이 `self-board` |
| 가는 편 완료, 오는 편 필요, `openLeg !== "return"` | 가는 버스 탑승 완료 |
| `openLeg === "return"`, 오는 편 필요 | 오는 편 카드. 미탑승이면 탑승하기, 탔으면 오는 탑승 완료 |
| 지인 | 위 버스 규칙만. 프로필 확정 없음 |

### 7.4 QR · `boarding.html` 제거

저장된 닉(출석·버스·배번 로컬 닉) = 이 서비스의 “로그인”.

1. QR (`&board=1`) + 닉 있음 + 열린 편이 그 행에 필요 → `self-board` 후 **홈**. 이미 탔으면 보드를 다시 하지 않고 홈.
2. 닉 없음 → 홈에서 닉 선택 (버스 명단, 열린 편 `required`만). 선택 후 1과 같음.
3. 열린 편 없음 → 홈. 버스 카드는 시간 아님. 보드하지 않음.
4. 열린 편이 해당 없음 → 홈. 확인 화면·에러 없이 버스 카드만 (완료 또는 해당 없음).

**탑승이 이 순간 성공했을 때만** 화면 한가득 **탑승 완료** (가는/오는 구별). 2초 안팎 보여 주고 사라지면, 버스 카드가 완료 상태로 남아 있다. 이미 탄 채로 QR을 다시 찍으면 큰 연출 없이 완료 카드만.

홈의 **탑승하기**도 같다: `self-board` → 큰 탑승 완료 → 사라짐 → 완료 카드.

`boarding.html` 본문(편 탭, 명단, 확인 스크린)은 없앤다. `boarding.html?eventId=` 북마크·옛 QR은 `event-home.html?eventId=&board=1`로 보낸다.

### 7.5 총무 당일 체크리스트

`event-admin` 상단(또는 버스·스크랩 패널)에 고정. 완료는 스위치/세션 상태로 표시.

1. **기록 소스 저장** — `event-admin`에서 source + sourceId. `ops.html` 아님. 스크랩 시작 전에 끝낸다.
2. **가는 편 탑승 켜기** — 동탄 집합 직전. QR은 이 링크 하나.
3. **가는 편 끄기** — 출발 후. 안 끈 채 오는 편을 켜면 가는 편은 자동으로 꺼진다.
4. **오는 편 켜기** — 복귀 탑승 직전.
5. **오는 편 끄기** — 복귀 후.
6. **스크랩 시작** — 선두 기록이 올라오기 시작할 때. 누른 뒤엔 미완주만 자동 재시도.
7. **스크랩 종료** — 창이 끝나기 전에 그만둘 때. 안 누르면 기본 창이 끝나면 멈춘다.
8. **안 뜬 기록** — 회원 미입력이면 여기서 DNS/DNF/시각 입력.

힌트 한 줄: 배포 직후에는 편 스위치를 다시 확인하세요.

---

## 8. 스크랩 세션

총무가 결과를 “가져오는” 게 아니다. **대회 시간에 맞춰 `event-admin`에서 스크랩을 시작**한다. 소스 저장도 같은 화면, 같은 총무 비밀번호다.

시작 (`POST scrape`, 기존): 배번 있는 참가자 조회. `groupScrapeSession = { startedAt, until, intervalMinutes }`. 기본 **간격 10분**, **창 6시간** (상수, UI 없음).

재시도: 스케줄러가 세션이 살아있는 대회만. 대상은 배번 있고, **유효 완주 기록(넷/피니시)이 잡에 없는** 사람. 이미 `race_results` 확정(완주·DNS·DNF)은 제외. 직전 잡이 `groupScrapeStatus === "running"`이면 **이 틱은 건너뛴다** (400으로 세션을 죽이지 않음). 끝난 다음 틱에 다시 미완주만 돌린다.

종료: `until` 경과, 또는 총무가 스크랩 종료 (`scrape`에 `stop: true` 등 기존 액션 확장).

회원 `update-bib` 직후 즉시 스크랩: **세션이 켜져 있을 때만** 그 닉 1명. 세션 없으면 소스에 치지 않음.

`groupEventAutoScrape` 15:00 원샷과 겹치면, 당일 세션이 있는 대회는 세션이 우선. 세션 없는 당일 대회만 기존 15:00을 탄다.

---

## 9. API · 데이터 (신규 subAction 없음)

| 기존 | 변경 |
|---|---|
| `update-bib` | `distance`는 canonical만 (`unknown`·빈 값 거절). 세션 중이면 해당 배번 즉시 스크랩 후 클라이언트가 `my-pending-result` |
| `my-pending-result` | 변경 없음 |
| `self-confirm` | `pbConfirmed`. 수동이면 `netTime` 또는 `dnStatus: DNS\|DNF`. 매칭 행 없이 수동 upsert 허용 |
| `confirm-one` | 총무 수동. 변경 없이 UI를 `event-admin`에 연결 |
| `scrape` / `source` | 세션 start/stop. 재시도는 미완주만. **총무 비번.** 오너만 되게 잠그지 않음 |
| `bus-boarding` settings/status/self-board | `openLeg` |

`race_results` SSOT. 회원·총무 확정은 그 `docId`만 upsert. `bulk-confirm` 전체 삭제 금지.

지인은 `participants`에 넣지 않고, `self-confirm`/`update-bib` 대상이 아니다.

---

## 10. 오류

- 배번 중복: 기존 토스트
- 즉시 스크랩/매칭 실패: **6.2에 머문다.** 6.4를 자동으로 열지 않음
- `self-board` 미열림: 토스트, 카드 갱신. 큰 탑승 완료 없음
- 한글 IME: 배번·시각 input

---

## 11. 테스트

- 프로필 6.1~6.5, 6.2 배번·종목 크게, 수정 작게, 6.1에 ‘먼저’ 없음
- 종목 저장 값이 `10K`\|`half`\|`full`\|`5K`\|`3K`\|`30K`\|`32K`\|`ultra`. 기타 → `unknown` 금지
- 배번 없이 가는 편 열림 → 탑승하기 활성
- 지인: 버스만, `self-confirm` 거부, 대회 기록 없음
- `openLeg` 상호 배타, 옛 `enabled`만 있으면 꺼짐
- QR `board=1` + 닉 → 홈 + 첫 탑승만 큰 완료 연출
- `boarding.html?eventId=` → 홈 `&board=1`
- 세션 중 `update-bib` → 그 배번 스크랩. 세션 꺼짐 → 스크랩 없음
- 6.3 아니에요 → 6.2 (6.4 자동 아님). 직접 입력만 6.4
- 재시도가 완주 있는 사람을 다시 안 침. `running`이면 그 틱 스킵
- `self-confirm` PB / DNS / DNF / 수동 시각
- 탭 라벨 대회 기록, 버스 탭 없음
- `pre-deploy-test.sh` 회귀

---

## 12. 파일

- `event-home.html`, `assets/event-home-action.js`, `assets/event-home-badges.js`, `assets/event-member-shell.css`, `assets/event-member-copy.js`
- `assets/event-member-tabs.js`, `event-roster.html` (짝 PRD)
- `event-admin.html` (스위치, QR, 체크리스트, **소스·스크랩 총무 권한**, 수동 기록)
- `boarding-admin.html` (`openLeg`)
- `boarding.html` (리다이렉트만), `assets/event-boarding-flow.js` (홈 탑승 연출로 흡수 또는 삭제)
- `functions/index.js`, `functions/lib/bus-boarding.js`, `functions/lib/self-confirm.js`, 스크랩 세션 스케줄러 (`groupEventAutoScrape` 또는 동일 패턴)

---

## 13. 배포와 `enabled` (마이그레이션)

지금 프로덕션 문서는 대략 `{ enabled: true, roster, legs }`. **어느 편을 열었는지는 없다.**

새 코드는 회원 탑승을 `openLeg`로만 본다. `enabled: true`인데 `openLeg`가 없으면:

- 홈 탑승하기는 꺼진 것과 같다
- QR을 찍어도 보드되지 않는다
- 총무 화면은 두 스위치가 모두 꺼진 것처럼 보인다

그래서 배포 **직후** 총무가 **지금 필요한 편 하나**를 켜야 한다. 켜는 순간 `openLeg`가 생기고 이전과 같이 탑승이 된다.

**대회 도중 배포하면** 그 몇 분 동안 전원이 못 탄다. 철원은 **출발 전, 총무가 옆에 있을 때** 배포하고 **가는 편 탑승**을 다시 켠다.

가는 편으로 추측해 자동 열지 않는 이유: 오는 편 시간에 배포하면 가는 편이 다시 열린다.

---

## 14. 합의 로그

- 섹션 두 개, 독립
- 6.1 문구에 ‘먼저’ 없음
- 종목 1차 3개 + 기타는 나머지 canonical. **`unknown` 저장 금지.** `race_results.distance`와 동일 enum
- 대기 카피: 총무가 스크랩 **시작**. 미완주만 간격 재시도, 창 끝나면 중단
- 회원 배번 수정 시 세션 중이면 즉시 스크랩
- 재시도 실패 → 회원 수동 (시각/DNS/DNF). 미입력 시 총무
- PB UI, 회원 확정 우선
- 버스 스위치 편별. QR 하나. `boarding.html` 회원 UI 삭제. 탑승 성공 시 큰 완료 후 사라짐
- 지인은 기록 없음
- 탭 이름 대회 기록 (짝 PRD)
- 총무 당일 체크리스트
- 옛 `enabled`만 있으면 꺼짐으로 읽음
- **오너 할 일 없음.** 소스 매핑·스크랩은 총무 `event-admin`. `ops.html` 당일 불필요
