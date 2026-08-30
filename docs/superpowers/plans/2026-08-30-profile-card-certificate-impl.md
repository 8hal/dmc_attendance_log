# Profile Card Certificate (Design D) Implementation Plan

> **For agentic workers:** Inline execution (user approved implement-now). TDD required for helpers.

**Goal:** Replace Option A flat done-card with Design D white certificate panel inside green `is-done` shell.

**Architecture:** Pure helper `confirmCertificateView` builds the render model from `confirmResult` + identity opts. `event-home.html` paints `.result-cert` markup; CSS in `event-member-shell.css` uses DMC tokens only. No new HTTP API.

**Tech Stack:** Vanilla JS (`assets/event-home-badges.js`), static HTML/CSS, `node --test`.

---

### Task 1: `confirmCertificateView` + DNS status fix (TDD)

**Files:**
- Modify: `assets/event-home-badges.js`
- Test: `scripts/test/event-home-badges.test.js`

- [ ] RED: tests for `status`/`dnStatus` DNS, PB ignored on DNS, hero time, empty result
- [ ] GREEN: implement `confirmDnLabel` + `confirmCertificateView`; fix `confirmDoneSummary`
- [ ] Commit

### Task 2: Markup + CSS Design D

**Files:**
- Modify: `event-home.html` (`.result-cert` DOM + confirmed render)
- Modify: `assets/event-member-shell.css`
- Test: `scripts/test/event-home-done-record.test.js`

- [ ] RED: done-record smoke expects result-cert / danger / footer
- [ ] GREEN: wire DOM/CSS/JS
- [ ] `npm run test:event-home`
- [ ] Commit + push
