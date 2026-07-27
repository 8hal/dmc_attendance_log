// chunbaek/guide/guide-nav.js
"use strict";

/** Single-page section order (SSOT). */
const GUIDE_SECTIONS = [
  { id: "intro-usage", title: "이 가이드의 사용법", isIntro: true },
  { id: "intro-diary", title: "일지 사례를 읽는 방법", isIntro: true },
  { id: "ch-1", title: "1. 이 가이드의 대상과 목표" },
  { id: "ch-2", title: "2. 시작 전 현재 상태 진단" },
  { id: "ch-3", title: "3. 나만의 훈련 페이스 정하기" },
  { id: "ch-4", title: "4. 100일 전체 훈련 구조" },
  { id: "ch-5", title: "5. 일주일 훈련 구성법" },
  { id: "ch-6", title: "6. 핵심 훈련 사용설명서" },
  { id: "ch-7", title: "7. 장거리 훈련을 완성하는 과정" },
  { id: "ch-8", title: "8. 여름철 100일 훈련 운영법" },
  { id: "ch-9", title: "9. 통증·피로·부상에 대응하는 법" },
  { id: "ch-10", title: "10. 실패한 훈련을 다루는 방법" },
  { id: "ch-11", title: "11. 체중과 영양 관리" },
  { id: "ch-12", title: "12. 기록과 컨디션을 해석하는 법" },
  { id: "ch-13", title: "13. 중간 점검 대회의 활용" },
  { id: "ch-14", title: "14. 마지막 3주와 테이퍼링" },
  { id: "ch-15", title: "15. 레이스 전략" },
  { id: "ch-16", title: "16. 대회 후 평가와 다음 목표" },
  { id: "app-a", title: "부록 A. 수준별 14주 예시" },
  { id: "app-b", title: "부록 B. 훈련 변경 의사결정표" },
  { id: "app-c", title: "부록 C. 주간 계획표" },
  { id: "checklist", title: "대회 준비 체크리스트" },
  { id: "refs", title: "참고 자료" },
];

/** @deprecated Use GUIDE_SECTIONS. Kept for older test names during transition. */
const GUIDE_PAGES = GUIDE_SECTIONS.map((s) => ({
  file: "index.html",
  title: s.title,
  isHub: !!s.isIntro,
  id: s.id,
}));

function resolveGuideNav(sectionId) {
  const idx = GUIDE_SECTIONS.findIndex((s) => s.id === sectionId);
  if (idx < 0) throw new Error(`unknown guide page: ${sectionId}`);
  const cur = GUIDE_SECTIONS[idx];
  const bodySections = GUIDE_SECTIONS.filter((s) => !s.isIntro);
  const bodyTotal = bodySections.length;

  const prevSec = idx > 0 ? GUIDE_SECTIONS[idx - 1] : null;
  const nextSec = GUIDE_SECTIONS[idx + 1] || null;

  if (cur.isIntro) {
    return {
      isHub: true,
      positionLabel: null,
      prev: prevSec
        ? { href: `#${prevSec.id}`, label: prevSec.title }
        : null,
      next: nextSec
        ? { href: `#${nextSec.id}`, label: nextSec.title }
        : null,
      tocHref: "#toc",
      page: cur,
    };
  }

  const bodyIndex = bodySections.findIndex((s) => s.id === sectionId) + 1;
  // First body chapter always links prev to TOC (not previous intro section).
  const prev =
    cur.id === "ch-1"
      ? { href: "#toc", label: "목차" }
      : { href: `#${prevSec.id}`, label: prevSec.title };

  return {
    isHub: false,
    positionLabel: `${bodyIndex} / ${bodyTotal}`,
    prev,
    next: nextSec ? { href: `#${nextSec.id}`, label: nextSec.title } : null,
    tocHref: "#toc",
    page: cur,
  };
}

function applyGuideNav(doc = document) {
  const sections = [...doc.querySelectorAll("[data-guide-section]")];
  sections.forEach((section) => {
    const id = section.getAttribute("data-guide-section");
    if (!id) return;
    let nav;
    try {
      nav = resolveGuideNav(id);
    } catch (_) {
      return;
    }
    // Skip any intro section (isIntro), not only a hard-coded id.
    if (nav.page.isIntro) return;

    const pos = section.querySelector("[data-guide-position]");
    if (pos) pos.textContent = nav.positionLabel || "";

    const bind = (sel, link) => {
      const el = section.querySelector(sel);
      if (!el) return;
      if (!link) {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      el.setAttribute("href", link.href);
      const label = el.querySelector("[data-guide-nav-label]");
      if (label) label.textContent = link.label;
    };

    bind("[data-guide-prev]", nav.prev);
    bind("[data-guide-next]", nav.next);
    section.querySelectorAll("[data-guide-toc]").forEach((toc) => {
      toc.setAttribute("href", nav.tocHref);
    });
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GUIDE_SECTIONS,
    GUIDE_PAGES,
    resolveGuideNav,
    applyGuideNav,
  };
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    if (document.body && document.body.dataset.guidePage === "index.html") {
      applyGuideNav();
    }
  });
}
