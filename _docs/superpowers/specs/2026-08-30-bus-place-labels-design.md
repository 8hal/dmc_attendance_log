# 버스 카드 출발지·도착지 라벨 (총무 입력)

## 문제

회원 `event-home` 버스 카드가 `동탄 → 제23회 철원DMZ국제평화마라톤 · 탑승 완료`처럼 긴 대회명을 쓴다. 총무가 짧은 장소명을 넣으면 `동탄 → 철원`으로 보이게 한다.

## 결정

- **신규 HTTP action/subAction 없음.** 기존 `action=bus-boarding` `subAction=settings`에 optional 필드만 추가.
- 저장 위치: `race_events.busBoarding.placeClub`, `busBoarding.placeVenue` (문자열, trim, 최대 40자).
- 기본값/미설정:
  - `placeClub` 비어 있으면 `동탄`
  - `placeVenue` 비어 있으면 기존 `busDestinationLabel` (location / memberEventTitle / `대회`)
- 경로 제목:
  - outbound: `{placeClub} → {placeVenue}`
  - return: `{placeVenue} → {placeClub}`
  - done이면 ` · 탑승 완료` 유지
- **openLeg 탑승 규칙 변경 없음.** 장소 저장 시 현재 `openLeg`를 함께 보내 편 상태를 유지한다. 편 토글 요청에는 place 필드를 넣지 않아 기존 값을 덮어쓰지 않는다.

## UI

- `event-admin.html` 준비(prep) 패널: 클럽/대회 장소 입력 2칸 + 「장소 저장」.
- status 응답에 `placeClub` / `placeVenue` 포함 → 입력칸 채움.
- `event-home`·탑승 완료 오버레이: `busClubLabel` + `busDestinationLabel`(venue 우선) → `busRouteTitle`.

## 비목표

- 편별 별도 라벨(가는/오는 각각 다른 from/to) — 필요 시 후속.
- CSV 탑승 여부 파서의 동탄/철원 하드코딩 변경 — 이번 범위 밖.
