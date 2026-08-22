# 단체 대회 회원 홈 — 춘백식 IA (Phase 1)

날짜: 2026-08-18  
상태: **Phase 1 회원 홈 구현 · Phase 2 총무 패널 구현**  
관련: `_docs/superpowers/specs/2026-08-13-group-event-admin-design.md`, `chunbaek/index.html`, `chunbaek/admin.html`

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

## Phase 2 총무 (`event-admin.html`)

춘백 `admin.html`처럼 **한 번에 한 패널**. 기존 ①준비 ②버스 ③배번 ④스크랩 섹션을 감쌈.

- 사이드(모바일은 상단 가로) 메뉴: 준비 / 버스 / 배번 / 스크랩
- 기본 패널: `EventAdminPanels.resolveDefaultPanel` (버스 off→준비, 가는 편 미완→버스, 배번 미입력→배번, 그외 스크랩). `#bus` 등 해시가 있으면 그것 우선.
- 주경로에서 `boarding-admin` · `group.html` 링크 제거. 회원 앱은 사이드 `회원 앱 열기` (`event-home.html`)
- 신규 API 없음

