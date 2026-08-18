# 단체 대회 회원 홈 — 춘백식 IA (Phase 1)

날짜: 2026-08-18  
상태: **구현 중 (회원 홈 우선)**  
관련: `_docs/superpowers/specs/2026-08-13-group-event-admin-design.md`, `chunbaek/index.html`

## 목표

춘백처럼 **홈에서 지금 할 일 하나**만 보이게 한다. 탭(홈|버스|명단)은 둘러보기용.

## 회원 홈 (`event-home.html`)

1. **닉 선택** — participants 명단, localStorage 동기화 (`EventMemberProfile.syncNicknames`)
2. **오늘 카드** — `EventHomeAction.resolveNextAction` 우선순위:
   - 가는 버스 → 배번 → 컨펌 대기 → 오는 버스 → 완료 / 기록 준비 중
3. **하단 탭** — `EventMemberTabs` 공통 (홈|버스|명단)
4. 배번·컨펌은 별도 런처가 아니라 **홈 CTA**

## 공유 자산

- `assets/event-home-action.js` — 상태 기계
- `assets/event-member-shell.css` — 탭·today 카드
- `assets/event-member-tabs.js` — 탭 href/active

## Phase 2 (후속)

- `event-admin` 춘백 운영진식 사이드 패널 (한 번에 한 단계)
- 구 링크(`boarding-admin` 등) 주경로에서 제거
