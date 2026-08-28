# PRD: 단체 대회 회원 홈 — 프로필 + 버스

날짜: 2026-08-28  
상태: 초안 (브레인스토밍 합의)  
관련: `_docs/superpowers/specs/2026-08-18-group-event-member-home-chunbaek-ia.md`, `_docs/superpowers/specs/2026-08-23-event-member-day-ux-design.md`

이 문서는 2026-08-18·08-23의 **「홈 = 지금 할 일 하나」** 와 **편별 QR URL**을 회원 홈·버스 스위치 범위에서 대체한다. 대회 기록 탭 개편은 범위 밖이다.

---

## 1. 배경 및 문제

회원 홈(`event-home.html`)은 춘백식 **오늘 카드 하나**다. 배번·기록·버스가 한 슬롯을 돌아가며 쓰므로, 아침 탑승과 배번 입력을 동시에 끝낼 수 없다. 배번·기록은 한 사람의 대회 프로필이고, 버스는 총무가 편을 여는 별개 과업이다.

총무 버스 스위치는 지금 `busBoarding.enabled` 하나라 가는 편과 오는 편이 같이 열린다. 실제 운영은 한 번에 한 편만 연다. QR도 편마다 URL이 갈라져 있다 (`?leg=outbound` / `?leg=return`).

**핵심 고통:** 프로필(배번·기록)과 버스가 한 카드에서 섞이고, 버스 열림이 편과 맞지 않는다.

---

## 2. 목표 및 성공 기준

| 목표 | 성공 기준 |
|---|---|
| 홈이 두 덩어리 | 닉 선택 후 홈에 **프로필 카드 하나 + 버스 카드 하나**만 있다. 오늘 카드 하나에 과업이 교대되지 않는다. |
| 과업은 독립 | 배번이 없어도 가는 버스가 열려 있으면 탑승할 수 있다. 버스를 안 타도 배번·기록을 할 수 있다. |
| 프로필 상태 | 배번 없음 → 대기 → 미확정 → 확정이 카드 안에서만 바뀐다. 배번 입력에 `my-bib.html`로 보내지 않는다. |
| 버스는 편 스위치 | 총무가 가는/오는를 따로 켠다. 한 편을 켜면 다른 편은 꺼진다. 회원 홈·QR·`boarding.html`은 그 열린 편만 탑승한다. |
| QR은 하나 | 가는 편·오는 편이 **같은 QR·같은 링크**다. 총무가 연 편이 곧 그 스캔의 편이다. |

---

## 3. 범위

### In Scope

- `event-home.html` 홈 본문: 프로필 카드 + 버스 카드
- `assets/event-home-action.js` 상태 기계 (`resolveNextAction` 단일 오늘 카드를 프로필+버스 두 카드로 교체)
- `assets/event-member-tabs.js` 및 같은 탭을 쓰는 `event-roster.html` · `boarding.html`: **버스 탭 제거** (버스는 홈 카드). 나머지 탭 라벨(`명단`)은 유지. `대회 기록`으로 바꾸는 것은 범위 밖
- 총무 `event-admin.html` 버스 패널: 가는 편 / 오는 편 스위치, QR 하나
- `boarding.html`: 열린 편으로 탑승. `?leg=`가 있어도 **열린 편이 우선**
- 기존 API 확장만
  - `group-events` `update-bib`: `distance` 저장
  - `group-events` `self-confirm`: 요청 body `pbConfirmed`
  - `bus-boarding` `settings` / `status`: `openLeg`
  - `bus-boarding` `self-board`: `openLeg`와 같은 편만 허용
- `my-pending-result`로 배번·종목 저장 직후 기록 다시 찾기 (사이트 재스크랩 API 없음)

### Out of Scope

- 대회 기록 탭(`event-roster.html`) 개편 — 홈 다음
- 회원 한 명 단위 실시간 스크랩 API (소스 사이트 재수집)
- 확정된 기록을 회원이 취소
- `my-bib.html`을 홈 주경로로 유지
- 신규 `action` / `subAction` 추가
- 배번 스위치(총무가 배번 입력을 켜고 끄는 기능) — 배번은 비어 있으면 홈에서 바로 입력

---

## 4. 등장인물

| Actor | 화면 | 하는 일 |
|---|---|---|
| 회원 | `event-home.html`, `boarding.html` | 배번·종목, 기록 확정·PB, QR/홈에서 열린 편 탑승 |
| 총무 | `event-admin.html` | 가는/오는 탑승 스위치, QR 하나 게시, 명단 |
| 오너 | (이번 화면 없음) | 스크랩 트리거는 기존 총무/ops 경로 유지 |

---

## 5. 홈 뼈대

위부터 아래:

1. 대회 제목·날짜·장소, 선택한 닉
2. **프로필** 카드 — 배번·종목·기록 확인
3. **버스** 카드 — 지금 해당하는 한 편만
4. 하단 탭: `홈` | `명단`. 버스 탭은 없앤다. `명단` 화면 내용·이름(`대회 기록`)은 바꾸지 않음

두 카드는 동시에 보이고 서로 잠그지 않는다. 프로필은 홈에서 끝낸다. 버스 탑승 CTA만 `boarding.html`로 간다.

---

## 6. 프로필 카드

한 카드가 아래 네 상태만 오간다.

### 6.1 배번 없음

문구: 배번과 종목을 먼저 넣어 주세요.

입력: 배번 + 종목. 종목은 `10K` / `Half` / `Full` (저장 값 `10K` / `half` / `full`, `normalizeRaceDistance`). 둘 다 있어야 저장.

저장: `POST group-events` `update-bib`에 `distance`를 포함. `participants[].bib`, `participants[].distance`.

**배번만 있고 종목이 비어 있으면 6.1이다.** 배번을 채워 두고 종목을 고르게 한다. 6.2는 배번과 종목이 둘 다 있을 때만.

### 6.2 배번은 있는데 기록 없음

배번·종목은 **주요 정보로 크게** 보여 준다.

문구: 열심히 뛰고 오세요. 대회가 끝나면 여기서 기록을 확정할 수 있어요.

**수정** 버튼은 있다. 눈에 띄게 만들지 않는다. 누르면 배번·종목을 다시 넣고 저장한다. 저장 직후 `GET my-pending-result`로 다시 찾는다. 결과가 없으면 이 상태에 머문다.

### 6.3 기록 있음 · 미확정

넷타임·종목·배번을 보여 준다. 문구: 고생했어요. 이 기록이 맞나요?

- **맞아요** → PB 여부 선택 후 `self-confirm` (`pbConfirmed`). `race_results`에 저장, `confirmSource: "personal"`.
- **아니에요** → 같은 카드에서 배번·종목을 다시 넣고 저장. 직후 `my-pending-result`. 새 기록이 있으면 6.3, 없으면 6.2.

### 6.4 확정됨

문구: 끝. 동마클 대회 기록에 저장됐어요.

추가 CTA 없음. 회원이 확정을 되돌리지 않는다. 수정은 총무 경로.

### 6.5 기록 다시 찾기

배번·종목을 고치면 **그 자리에서** 다시 찾는다. 총무 스크랩을 기다리지 않는다는 뜻은, 이미 있는 `groupScrapeJobId` 결과에서 `matchResultByBib`로 찾는 것이다. 소스 사이트를 한 명만 다시 긁는 API는 만들지 않는다. 잡이 없거나 배번·종목이 안 맞으면 6.2.

---

## 7. 버스 카드 · 스위치 · QR

### 7.1 데이터

`busBoarding.openLeg`: `"outbound"` | `"return"` | `null`

- 한 편을 켜면 다른 편은 `null`이 아니라 **꺼짐**. `openLeg`는 값 하나이므로 동시에 두 편이 열리지 않는다.
- `enabled`는 호환용으로 `openLeg != null`과 항상 같게 유지한다. 기존 `enabled`만 보는 코드가 있어도 “아무 편도 안 열림 / 어떤 편이든 열림”은 깨지지 않는다. **어느 편인지는 `openLeg`만 본다.**

`bus-boarding` `settings`: `openLeg`를 받는다. `enabled: true`만 보내고 `openLeg`가 없으면 거절한다 (모호한 양편 열림 방지). `openLeg: null` 또는 `enabled: false`면 둘 다 꺼짐.

`status` 응답에 `openLeg`를 포함한다.

### 7.2 총무 (`event-admin.html`)

스위치 두 개: `가는 편 탑승` / `오는 편 탑승`. 한쪽을 켜면 다른쪽은 꺼진다. 둘 다 꺼도 된다.

QR·참가자 링크는 **하나**. `boarding.html?eventId={id}` (편 쿼리 없음). 오는 편 전용 QR/접힌 블록은 제거한다.

총무 명단에서 편별 탑승 체크(`admin-board`)는 지금처럼 스위치와 무관하게 할 수 있다. 스위치는 회원 홈 CTA와 QR/`self-board`용이다.

`boarding-admin.html`도 같은 `settings`를 쓰므로 **이 계획에서 편 스위치를 맞춘다.** `enabled: true`만 보내면 거절되므로 그대로 두면 버스 켜기가 깨진다. 회원 주경로는 `event-admin.html`이다.

### 7.3 회원 홈 버스 카드

본인 명단 행은 탑승이 꺼져 있어도 필요하다. 홈은 `group-events` `detail`의 `event.busBoarding.roster`에서 닉으로 찾는다. 공개 `bus-boarding` `status`가 꺼짐일 때 명단을 비우는 동작은 `boarding.html`용으로 유지해도 된다.

**열린 편이 이 사람에게 `required`가 아니면 탑승 CTA를 열지 않는다.** (`outbound_only`에게 오는 편 스위치, `return_only`에게 가는 편 스위치, 해당없음.)

| 조건 | 카드 |
|---|---|
| 명단에 없음 (`rideType` 해당없음·행 없음) | 버튼 없음. “이번 대회 버스 명단에 없습니다. 버스 탑승 예정이면 총무에게 문의하세요.” |
| 열린 편이 이 행에 해당 없음 | CTA 없음. 이미 탄 편이 있으면 그 **탑승 완료**. 아직 탈 편이 남아 있으면 그 편 카드(시간 아니면 비활성). 둘 다 아니면 명단 없음과 같은 문의 문구를 쓰지 않고, 완료/대기는 남은 필요 편만 보여 준다. |
| `return_only` | 처음부터 오는 편 카드. 오는 편이 꺼져 있으면 비활성 + “오는 버스 탑승 시간이 아닙니다.” |
| `outbound_only` | 처음부터 가는 편 카드. 타면 **가는 버스 탑승 완료**. 오는 편이 열려도 오는 편 CTA를 보여 주지 않는다. |
| `openLeg === null`, 가는 편 필요·미탑승 | `가는 버스 탑승` 비활성. “가는 버스 탑승 시간이 아닙니다.” |
| `openLeg === "outbound"`, 가는 편 필요·미탑승 | 버튼 활성 → `boarding.html?eventId=` (쿼리에 편을 넣지 않음) |
| 가는 편 탑승 완료, 오는 편 필요, `openLeg !== "return"` | **가는 버스 탑승 완료** |
| `openLeg === "return"`, 오는 편 필요 | 카드가 오는 편. 미탑승이면 활성, 탔으면 **오는 버스 탑승 완료** |

### 7.4 QR과 `boarding.html`

가는 편과 오는 편은 **같은 QR**을 쓴다.

1. 스캔 → `boarding.html?eventId=`
2. `status.openLeg`가 곧 이번 탑승 편이다. URL `?leg=`는 무시한다 (예전에 인쇄한 가는 편 QR도 오는 편을 연 뒤에는 오는 편으로 동작).
3. `openLeg === null` → 탑승 시간이 아님. 회원 셀프 보드는 거부 (`self-board`는 `openLeg === 요청 편`일 때만).
4. 닉 있음 → `openLeg`가 그 행에 `required`이면 확인 화면. 이미 탔으면 완료. **해당 없으면 확인 화면을 열지 않고** 홈으로 보낸다 (셀프 보드 실패를 보여 주지 않음). 닉 없음 → 기존처럼 목록. 목록에서도 열린 편이 `required`가 아닌 사람은 고를 수 없다.
5. 탑승 완료 후 홈으로. 배번 유도는 홈 프로필이 한다. boarding의 “이어서 배번 입력 → my-bib”는 홈으로 돌린다.

홈에서 탑승하기를 눌러도 같은 URL이다. 열린 편이 곧 그 버튼의 편이다.

---

## 8. API · 데이터 (신규 API 없음)

| 기존 | 변경 |
|---|---|
| `update-bib` | body에 `distance` 추가. 홈은 배번+종목 필수. `my-bib.html` 등 기존 호출은 `distance` 생략 가능 (배번만 갱신). |
| `my-pending-result` | 변경 없음. 홈이 배번 저장 후 다시 호출. |
| `self-confirm` | body `pbConfirmed` (boolean). `buildSelfConfirmRow` → `race_results.pbConfirmed`. |
| `bus-boarding` `settings` | `openLeg`. `enabled` 동기화. |
| `bus-boarding` `status` | `openLeg` 포함. |
| `bus-boarding` `self-board` | `openLeg === leg`가 아니면 403. |

`race_results`가 기록 SSOT. 회원 확정은 기존처럼 해당 `docId`만 upsert한다. 이벤트 전체 삭제 후 재저장(`bulk-confirm` 패턴)을 쓰지 않는다.

---

## 9. 오류 · 예외

- `update-bib` 배번 중복: 기존 메시지. 프로필은 저장 실패 토스트, 상태 유지.
- `self-confirm` 매칭 실패: 토스트 후 `my-pending-result` 재조회로 6.2/6.3 갱신.
- `self-board` 편 불일치·미열림: 토스트, 홈 버스 카드 다시 그림.
- 공개 버스 status 실패: 버스 카드는 명단 없음과 구분. detail roster가 있으면 그걸로 명단 여부 판단.
- 한글 IME: 배번 input에 기존 패턴(`compositionstart`/`end`).

---

## 10. 테스트

- 프로필 네 상태 + 6.2에서 배번·종목이 큰 정보인지, 수정 버튼이 있는지 (DOM 테스트).
- 배번 없이 가는 편 열림 → 버스 CTA 활성 (독립).
- 명단 없음 문구 vs 시간 아님 비활성 버튼.
- `openLeg` 상호 배타, `enabled` 동기화, `self-board`가 다른 편이면 거부.
- `?leg=outbound` QR이 `openLeg=return`일 때 오는 편으로 탑승.
- `outbound_only` + `openLeg=return` → 오는 편 CTA/확인 화면 없음. `return_only` + `openLeg=outbound`도 대칭.
- 배번만 있고 종목 없음 → 6.1 (6.2 아님).
- `update-bib` + 즉시 `my-pending-result` → pending이면 6.3, 없으면 6.2.
- `self-confirm` + `pbConfirmed: true`가 `race_results`에 반영.
- 기존 `pre-deploy-test.sh` 버스·self-confirm 회귀.

---

## 11. 파일

- `event-home.html`, `assets/event-home-action.js`, `assets/event-member-shell.css`
- `assets/event-member-tabs.js`, `event-roster.html` (버스 탭 제거, `명단` 유지)
- `event-admin.html` (스위치·QR)
- `boarding-admin.html` (같은 `settings` · 편 스위치)
- `boarding.html`, `assets/event-boarding-flow.js` (`openLeg` 우선, `?leg=` 무시)
- `functions/index.js`, `functions/lib/bus-boarding.js`, `functions/lib/self-confirm.js`
- `scripts/test/event-home-action.test.js` 및 bus-boarding / update-bib / self-confirm 테스트

---

## 12. 합의 로그

- 홈 접근: 섹션 두 개 (4장 동등·프로필만 크게 는 채택하지 않음).
- 배번과 버스는 독립. 잠그지 않음.
- 명단 없으면 버스 섹션은 두고 총무 문의 문구.
- 탑승 시간 아니면 버튼 비활성 + “가는/오는 버스 탑승 시간이 아닙니다.”
- 기록 아니면 같은 카드에서 배번·종목 재입력 후 즉시 다시 찾기.
- 대기 화면의 배번·종목은 크게, 수정 버튼은 필요하되 눈에 띄지 않게.
- 버스 스위치는 가는/오는를 나눈다.
- QR은 가는 편·오는 편 동일.
- 하단 버스 탭은 제거. `명단` 이름 변경은 홈 다음.
