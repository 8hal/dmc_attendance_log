# 응원 보드 subAction 추가 필요성

## 기존 API

1. `update-bib` — 배번·종목만 저장. 조 출발·목표 완주 필드가 없다.
2. `public-roster` — 확정/스크랩 기록 표. 추정 km·경과·조 출발을 계산하지 않는다.
3. `my-pending-result` — 닉 1명의 완주 대기. 전원 위치와 무관하고, 보기 권한도 닉이 필요하다.
4. `detail` — 총무용 실명 포함 갭. 공개 응원 화면의 응답으로 쓰면 실명이 나간다.

## 추가한 subAction

- `waves` — 총무가 조 이름·출발 시각을 저장
- `cheer-board` — `eventId`만으로 풀코스 추정 위치 목록 (실명 없음)
- `cheer-runner` — 그 중 1명의 목표·칩 구간
- `update-bib` 확장 — 풀코스 조·목표. 새 action 이름은 없음

## 기존 API로 대체하지 않는 이유

- 위치는 조 출발과 목표 완주의 계산 결과라 기록 명단과 필드가 다르다.
- `detail`을 공개하면 실명이 포함된다.
- `my-pending-result`를 인원수만큼 호출하면 닉이 필요하고, 하프까지 섞이며, 칩 이후 추정 km가 없다.

스펙: `_docs/superpowers/specs/2026-10-12-group-event-live-progress-design.md`
