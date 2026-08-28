# PRD: 단체 대회 — 대회 기록 탭

날짜: 2026-08-28  
상태: 기획 리뷰 반영  
관련: `_docs/superpowers/specs/2026-08-28-event-home-profile-bus-prd.md`

회원에게 중요한 것은 **누가 참가 명단에 있는가**가 아니라 **동마클 기록이 얼마인가**다. 하단 탭과 화면 이름을 **대회 기록**으로 통일한다.

---

## 1. 목표

| 목표 | 성공 기준 |
|---|---|
| 이름 | 탭·페이지 제목·카피가 **대회 기록**. 「명단」이 회원 화면에 없다. |
| 내용 | **확정된** `race_results`만 보인다 (완주 시각, DNS, DNF). 기록 없는 참가자는 이 탭에 안 나온다. |
| 프라이버시 | 실명·배번 숫자 없음. 닉·종목·기록·PB. |
| 나와 홈 | 홈에서 확정하면 이 목록에 바로 있다. 내 행은 「나」. |
| 지인 | 버스만 탄 지인은 **안 나온다.** |

---

## 2. 범위

### In Scope

- `event-roster.html` 제목·탭·요약 문구
- `assets/event-member-tabs.js` `roster` 탭 라벨 **대회 기록** (아이콘 🏁 유지)
- `assets/event-member-copy.js` 회원용 「명단·결과」 문자열
- `public-roster`: 기본 목록을 **확정 행만**. DNS/DNF 포함 (`status` 또는 `dnStatus`)
- PB 표시는 회원 `pbConfirmed` (홈 확정이 이김)

### Out of Scope

- 총무용 참가자 명단 (`event-admin` 버스·배번 리스트)
- 실시간 순위 보드, 구간 기록
- 실명·배번 공개
- 이 탭에서 확정/수정 (확정은 홈, 총무 수정은 `event-admin`)

---

## 3. 화면

1. 대회 제목 · 날짜
2. 요약: `기록 N명` (확정 수). 「참가 N명」을 앞에 두지 않는다.
3. 종목 칩 (나온 기록 기준) · 닉 검색 · 정렬 (기록 빠른 순 / 닉 / 종목)
4. 행: 닉, 종목, 시각 또는 DNS/DNF, PB면 배지, 나면 강조. **기록 빠른 순**은 완주 시각 오름차순 뒤 DNS/DNF, 그다음 닉.
5. 안내: 실명·배번은 공개되지 않습니다. 홈에서 확정한 기록만 모입니다.

빈 목록: **아직 확정된 기록이 없어요.** 홈에서 기록을 확인하면 여기에 올라갑니다.

---

## 4. 데이터

기존 `GET group-events` `public-roster`.

- 지금은 `participants` 전원 + `hasResult`(`status === "confirmed"`만 true). **완주 확정과 DNS/DNF를 포함**하고 미확정은 뺀다.
- 행에 `dnStatus`: `null` | `DNS` | `DNF`. 완주면 `netTime`, DNS/DNF면 시각 자리에 그 라벨 (`status`가 `dns`/`dnf`인 기존 `confirm-one` 행을 떨어뜨리지 말 것).
- 쿼리 `includePending=1` 같은 분기는 만들지 않는다 (명단 보기 부활 금지).
- 지인은 `participants`에 없으므로 자연히 제외.

홈 `self-confirm` 직후 이 탭을 열면 보여야 한다. 캐시 없음.

---

## 5. 테스트

- 탭 문구 대회 기록 (`event-home`, `event-roster`, 리다이렉트된 boarding 셸이 있으면 동일)
- 미확정 참가자는 행에 없음
- 확정·DNS·DNF·PB·나
- 지인 닉이 버스에만 있으면 목록에 없음
- 프라이버시: 응답에 실명·배번 필드 없음
- `pre-deploy-test.sh` public-roster 회귀

---

## 6. 파일

- `event-roster.html`, `assets/event-member-tabs.js`, `assets/event-member-copy.js`
- `functions/lib/public-roster.js`, `functions/index.js` `public-roster`
- `scripts/test/public-roster.test.js`

홈 탭 바와 **같은 배포**가 아니면 한쪽만 「명단」으로 남는다. 홈 PRD와 한 구현 단위로 간다.
