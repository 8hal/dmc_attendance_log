// chunbaek/guide/guide-nav.js
"use strict";

/** Single-page section order (SSOT). */
const GUIDE_SECTIONS = [
  { id: "intro", title: "이 가이드를 읽는 법", isIntro: true },
  { id: "week", title: "우리 주가 돌아가는 방식" },
  { id: "long-run", title: "장거리" },
  { id: "quality", title: "품질주" },
  { id: "summer", title: "여름철" },
  { id: "pain", title: "통증·피로" },
  { id: "missed", title: "놓친 날·실패한 날" },
  { id: "taper-race", title: "마지막 구간·대회 주" },
];

/** @deprecated Use GUIDE_SECTIONS. Kept for older test names during transition. */
const GUIDE_PAGES = GUIDE_SECTIONS.map((s) => ({
  file: s.isIntro ? "index.html" : `${s.id}.html`,
  title: s.title,
  isHub: !!s.isIntro,
  id: s.id,
}));

function resolveGuideNav(sectionId) {
  const idx = GUIDE_SECTIONS.findIndex((s) => s.id === sectionId);
  if (idx < 0) throw new Error(`unknown guide page: ${sectionId}`);
  const cur = GUIDE_SECTIONS[idx];
  const topicTotal = GUIDE_SECTIONS.length - 1;

  if (cur.isIntro) {
    return {
      isHub: true,
      positionLabel: null,
      prev: null,
      next: { href: `#${GUIDE_SECTIONS[1].id}`, label: GUIDE_SECTIONS[1].title },
      tocHref: "#toc",
      page: cur,
    };
  }

  const prev = GUIDE_SECTIONS[idx - 1];
  const next = GUIDE_SECTIONS[idx + 1] || null;
  return {
    isHub: false,
    positionLabel: `${idx} / ${topicTotal}`,
    prev: {
      href: prev.isIntro ? "#toc" : `#${prev.id}`,
      label: prev.isIntro ? "목차" : prev.title,
    },
    next: next ? { href: `#${next.id}`, label: next.title } : null,
    tocHref: "#toc",
    page: cur,
  };
}

function applyGuideNav(doc = document) {
  const sections = [...doc.querySelectorAll("[data-guide-section]")];
  sections.forEach((section) => {
    const id = section.getAttribute("data-guide-section");
    if (!id || id === "intro") return;
    let nav;
    try {
      nav = resolveGuideNav(id);
    } catch (_) {
      return;
    }
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
