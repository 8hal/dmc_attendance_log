# 회원 당일 UX Implementation Plan

> **For agentic workers:** TDD. Inline execution in this session.

**Goal:** QR은 바로 탑승 확인, 홈은 지금 카드 하나(확정 우선), 오는 버스는 보조.

**Architecture:** 순수 함수를 `event-boarding-flow.js` / `event-home-action.js`에 두고 HTML은 호출만 한다. 신규 API 없음.

**Tech Stack:** static HTML, existing `race` actions (`bus-boarding`, `my-pending-result`, `self-confirm`)

---

### Task 1: boarding flow 순수 함수 + home secondary

**Files:**
- Create: `assets/event-boarding-flow.js`
- Modify: `assets/event-home-action.js`
- Test: `scripts/test/event-boarding-flow.test.js`, `scripts/test/event-home-action.test.js`

### Task 2: boarding.html · event-home.html · event-admin QR

**Files:**
- Modify: `boarding.html`, `event-home.html`, `event-admin.html`
- Test: `scripts/test/event-boarding-shell.test.js`
