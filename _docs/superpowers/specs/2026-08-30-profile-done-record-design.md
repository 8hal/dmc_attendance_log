# 확정(done) 프로필 카드에 기록 요약 표시

**상태:** 권장안 채택 · 구현  
**범위:** `event-home.html` `#profileCard` 의 `confirmed` / `is-done` 상태만  
**신규 HTTP API:** 없음 (`my-pending-result` 의 `result` 재사용)

## 배경

확정 후 카드는 「끝. 동마클 대회 기록에 저장됐어요.」 문구만 보여 주고, 방금 저장한 종목·기록이 비어 보인다. `confirmResult` 는 이미 로드되어 있다.

## 옵션

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| **A (채택)** | 완료 문구 아래 `pending`과 동일 패턴으로 큰 기록 시간 + 종목(·PB/DNS/DNF) | 기존 DOM/CSS 재사용, API 없음, 구현 최소 | bib-face 재사용 없음 |
| B | 완료 문구 + `races.html` 링크 | 상세는 기록 페이지로 | 카드 안에서 기록이 안 보임 (요청 미충족) |
| C | done에서도 bib-face + 시간 오버레이 | 대기 카드와 시각 연속성 | 확정 후엔 배번보다 기록이 핵심 · 과설계 |

## 결정

**A.** 완료 카피 유지 + `#profileDisplay` 에 시간(`.profile-time`)과 부제(`.profile-sub`: 종목 · PB 또는 DNS/DNF).

데이터: `EventHomeBadges.confirmDisplayTime(confirmResult)` + `confirmResult.distance` / participant fallback + `pbConfirmed` / `dnStatus`.

## 비범위

- 신규 API / 배번 페이스 재사용 / races 딥링크 CTA
- `wait` / `pending` / `bib` / `manual` UI 변경
