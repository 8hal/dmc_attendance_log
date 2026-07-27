// chunbaek/guide/guide-nav.js
"use strict";

const GUIDE_PAGES = [
  { file: "index.html", title: "읽는 법 · 세 구간", isHub: true },
  { file: "week.html", title: "우리 주가 돌아가는 방식" },
  { file: "long-run.html", title: "장거리" },
  { file: "quality.html", title: "품질주" },
  { file: "summer.html", title: "여름철" },
  { file: "pain.html", title: "통증·피로" },
  { file: "missed.html", title: "놓친 날·실패한 날" },
  { file: "taper-race.html", title: "마지막 구간·대회 주" },
];

function resolveGuideNav(currentFile) {
  const idx = GUIDE_PAGES.findIndex((p) => p.file === currentFile);
  if (idx < 0) throw new Error(`unknown guide page: ${currentFile}`);
  const cur = GUIDE_PAGES[idx];
  const topicTotal = GUIDE_PAGES.length - 1;

  if (cur.isHub) {
    return {
      isHub: true,
      positionLabel: null,
      prev: null,
      next: { href: GUIDE_PAGES[1].file, label: GUIDE_PAGES[1].title },
      tocHref: "index.html",
      page: cur,
    };
  }

  const prevPage = GUIDE_PAGES[idx - 1];
  const nextPage = GUIDE_PAGES[idx + 1] || null;
  return {
    isHub: false,
    positionLabel: `${idx} / ${topicTotal}`,
    prev: {
      href: prevPage.file,
      label: prevPage.isHub ? "목차" : prevPage.title,
    },
    next: nextPage
      ? { href: nextPage.file, label: nextPage.title }
      : null,
    tocHref: "index.html",
    page: cur,
  };
}

function applyGuideNav(doc = document) {
  const file = (doc.body && doc.body.dataset.guidePage) || "";
  const nav = resolveGuideNav(file);
  const pos = doc.querySelector("[data-guide-position]");
  if (pos) pos.textContent = nav.positionLabel || "";

  const bind = (sel, link) => {
    const el = doc.querySelector(sel);
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
  const toc = doc.querySelector("[data-guide-toc]");
  if (toc) toc.setAttribute("href", nav.tocHref);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { GUIDE_PAGES, resolveGuideNav, applyGuideNav };
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    if (document.body && document.body.dataset.guidePage) applyGuideNav();
  });
}
