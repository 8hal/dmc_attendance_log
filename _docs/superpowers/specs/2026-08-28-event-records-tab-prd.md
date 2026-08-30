# PRD: 회원 탭 「명단」→「대회 기록」

날짜: 2026-08-28  
상태: 일부 대체됨 — 확정만·배번 숨김은 `_docs/superpowers/specs/2026-08-30-event-records-roster-board-prd.md`  
관련: `_docs/superpowers/specs/2026-08-28-event-home-profile-bus-prd.md`

회원에게 이 탭은 **누가 참가했는가**가 아니라 **동마클 기록이 얼마인가**다. 보이는 이름·목록·카피를 **대회 기록**으로 바꾼다. 총무 버스 명단(`event-admin` CSV·탑승 리스트)은 그대로 「명단」이다.

홈 PRD와 **한 구현·한 배포**다. 탭 바가 화면마다 다르면 안 된다.

---

## 1. 배경

지금 하단 탭은 `홈 | 버스 | 명단`이다. `event-roster.html` 제목은 「명단·결과」이고, 목록은 `participants` 전원이다. 기록 없는 사람도 「기록 없음」으로 나온다.

회원은 명단을 관리하지 않는다. 홈에서 확정한 뒤 **우리 기록이 올라왔는지**를 본다.

---

## 2. 목표

| 목표 | 성공 기준 |
|---|---|
| 이름 | 탭 라벨·페이지 제목이 **대회 기록**. 회원 카피에 「명단·결과」가 없다. 「버스 명단」은 홈 버스 카드에 남겨도 된다. |
| 목록 | **확정된** `race_results`만 (완주 시각, DNS, DNF). 미확정 참가자는 행이 없다. |
| 프라이버시 | 응답·화면에 실명·배번 없음. 닉·종목·기록·PB. |
| 홈과 연결 | 홈에서 확정하면 이 탭에 바로 있다. 내 행 「나」. |
| 지인 | 버스만 탄 지인은 없다. |
| 총무 | 버스 명단 카피는 바꾸지 않는다. |

---

## 3. 범위

### In Scope

- 탭 바: 버스 탭 제거, `data-tab="roster"` 라벨 **대회 기록** (아이콘 🏁). 파일명 `event-roster.html`·내부 `roster` 키는 유지
- 카피: `event-home.html`, `event-roster.html`, `boarding.html`(리다이렉트 전에 남는 셸), `assets/event-home-action.js`, `assets/event-member-copy.js`
- `GET group-events` `public-roster`: 확정+DNS/DNF만. `dnStatus` 필드. 미확정 행 제거
- 종목 칩: 목록에 **실제로 있는** 종목만. 표시 순은 `full` → `half` → `10K` → 나머지 canonical
- `scripts/test/public-roster.test.js` · 홈/탭 카피 테스트

### Out of Scope

- 파일 경로를 `event-records.html`로 바꾸기
- 총무 버스 명단·CSV 문구
- 이 탭에서 확정·수정·PB 토글 (홈 / `event-admin`)
- 오너/`ops.html`
- 신규 `action` / `subAction`
- 실시간 순위, 구간 기록, 실명 공개

---

## 4. 화면

위부터:

1. 대회 제목 (`memberEventTitle`). 폴백 문구 **대회 기록** (「명단·결과」 삭제)
2. 날짜
3. 요약: **기록 N명** (확정 수). 「참가 N명」을 앞에 두지 않음
4. 종목 칩 「전체」+ 나온 종목 · 닉 검색 · 정렬 (기록 빠른 순 / 닉 / 종목). 칩 순: `full` → `half` → `10K` → `5K` → `3K` → `30K` → `32K` → `ultra` (목록에 있는 것만)
5. 행: 닉, 종목 라벨, 시각 또는 `DNS`/`DNF`, PB면 배지, 나면 강조
6. 안내: 실명·배번은 공개되지 않습니다. 홈에서 확정한 기록만 모입니다.

빈 목록(필터 없음): **아직 확정된 기록이 없어요.** 홈에서 기록을 확인하면 여기에 올라갑니다.  
검색·칩 결과 0건: **해당하는 기록이 없어요.**

**기록 빠른 순:** 완주 시각 오름차순 → DNS/DNF → 닉.

탭: `홈` | `대회 기록`. 버스 탭 없음 (홈 PRD).

---

## 5. 바꿀 카피 (회원만)

| 위치 | 지금 | 후 |
|---|---|---|
| 탭 | 명단 | 대회 기록 |
| `event-roster.html` title/h1 폴백 | 명단·결과 | 대회 기록 |
| `event-home-action.js`에 남는 「명단·결과」 문자열 | 명단·결과 | 대회 기록 (홈 6.5 확정 카드는 CTA 없음 — 홈 PRD가 이김) |
| 닉 선택 서브 (`event-home`) | 참가자 명단에서… | 참가자에서 본인 닉네임을 선택하세요 |

총무 화면의 「버스 명단」「명단에서 제외」는 유지.

---

## 6. 데이터

기존 `public-roster`. 신규 API 없음.

- 입력은 지금처럼 `participants` + `race_results`(canonicalEventId)
- **출력 행은 확정만.** 완주 `status === "confirmed"`, 또는 DNS/DNF (`status`/`dnStatus`를 대소문자 무시하고 dns/dnf로 본 것). 응답 `dnStatus`는 `"DNS"` \| `"DNF"`로 고정.
- 행: `{ nickname, distance, netTime, pbConfirmed, hasResult: true, dnStatus }`
  - 완주: `dnStatus` null, `netTime` 시각
  - DNS/DNF: `netTime` null, `dnStatus` `"DNS"` \| `"DNF"`
- `distance`는 `race_results.distance` (canonical). 칩·정렬에 `unknown`이 있으면 칩에 넣지 않음
- `includePending` 쿼리 없음 (명단 보기 부활 금지)
- 지인은 `participants`에 없어 제외
- 실명·배번 필드 없음
- 홈 `self-confirm` 직후 재요청하면 보여야 함. 캐시 없음

`totalCount`는 확정 인원과 같게 두거나, 응답에서 참가 인원을 빼도 된다. UI는 **기록 N명**만 쓴다.

---

## 7. 오류

- `eventId` 없음 / 대회 없음: 기존과 같이 홈과 같은 톤의 오류
- 목록 0건은 오류가 아니라 빈 상태 문구

---

## 8. 테스트

- 탭 라벨 대회 기록 (`event-home`, `event-roster`)
- 회원 탭/제목에 「명단·결과」·탭 「명단」 없음. 홈 「버스 명단」 문구는 허용. 총무 버스 명단 유지
- `buildPublicRosterRows`가 미확정을 빼고 DNS/DNF를 넣음. `dnStatus` 있음
- 응답 키에 실명·배번 없음
- 지인만 버스에 있으면 0행
- 정렬: 빠른 기록 → DNS/DNF
- 종목 칩 순서 `full`, `half`, `10K` 우선
- `pre-deploy-test.sh` public-roster 회귀

---

## 9. 파일

- `event-roster.html`, `event-home.html` (탭)
- `assets/event-member-tabs.js`, `assets/event-member-copy.js`, `assets/event-home-action.js`
- `functions/lib/public-roster.js`, `functions/index.js` `public-roster` 주석
- `scripts/test/public-roster.test.js`, `scripts/test/event-home-action.test.js` (카피)
- `boarding.html` 탭이 리다이렉트 전에 남으면 라벨만 맞춤

---

## 10. 합의

- 회원 탭 이름 대회 기록. 명단은 총무 버스 쪽만
- 확정 기록만. 미확정 숨김
- 홈과 같은 배포
- 오너 없음
- 신규 API 없음
